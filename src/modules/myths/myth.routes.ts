import { Router, type Request } from "express";
import { z } from "zod";

import { createAnonClient } from "../../database/client.js";
import { HttpError } from "../../middleware/error-handler.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { optionalSupabaseAuth, requireSupabaseAuth } from "../../middleware/supabase.js";
import { ensureAnonymousId, readAnonymousId, attachAnonymousId } from "../votes/anonymous.js";
import { parseVoteValue } from "../votes/vote.logic.js";
import {
  castVote,
  createComment,
  createMyth,
  createReport,
  getMyth,
  listApprovedMyths,
  listMythComments,
  listMythSources,
  pickApprovedMythSlug,
} from "./myth.service.js";

export const mythRouter = Router();

function voteIdentity(req: Request, res?: { appendHeader(name: string, value: string): void; setHeader(name: string, value: string): void }) {
  const anonymousId = readAnonymousId(req);
  if (anonymousId && res) attachAnonymousId(res, anonymousId);
  return {
    userId: req.supabaseAuth?.userClaims?.id ?? null,
    anonymousId,
  };
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(20),
  category: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});

const createMythSchema = z.object({
  title: z.string().trim().min(8).max(200),
  explanation: z.string().trim().min(20).max(5000),
  categoryId: z.string().uuid(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  verdict: z.enum(["TRUE", "FALSE", "PARTIALLY_TRUE", "UNCERTAIN"]).optional(),
  sources: z
    .array(
      z.object({
        title: z.string().trim().max(200).optional(),
        url: z.string().url(),
      }),
    )
    .max(10)
    .optional(),
});

const commentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

const reportSchema = z.object({
  reason: z.string().trim().min(4).max(1000),
});

mythRouter.get("/myths", optionalSupabaseAuth(), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const myths = await listApprovedMyths(req.supabase ?? createAnonClient(), {
      limit: query.limit,
      ...(query.category ? { categorySlug: query.category } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.country ? { country: query.country } : {}),
    }, voteIdentity(req, res));
    res.json({ myths });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/search", optionalSupabaseAuth(), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    if (!query.q) {
      throw new HttpError(400, "Search query is required", "MISSING_SEARCH_QUERY");
    }

    const myths = await listApprovedMyths(req.supabase ?? createAnonClient(), {
      limit: query.limit,
      q: query.q,
    }, voteIdentity(req, res));
    res.json({ myths });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/myths/random", optionalSupabaseAuth(), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const slug = await pickApprovedMythSlug(req.supabase ?? createAnonClient(), {
      ...(query.category ? { categorySlug: query.category } : {}),
      ...(query.country ? { country: query.country } : {}),
    });
    if (!slug) {
      throw new HttpError(404, "Myth not found", "MYTH_NOT_FOUND");
    }
    res.json({ slug });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/myths/:idOrSlug", optionalSupabaseAuth(), async (req, res, next) => {
  try {
    const myth = await getMyth(
      req.supabase ?? createAnonClient(),
      String(req.params.idOrSlug ?? ""),
      voteIdentity(req, res),
    );
    res.json({ myth });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/myths/:idOrSlug/comments", async (req, res, next) => {
  try {
    const myth = await getMyth(createAnonClient(), String(req.params.idOrSlug ?? ""));
    const comments = await listMythComments(createAnonClient(), myth.id);
    res.json({ comments });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/myths/:idOrSlug/sources", async (req, res, next) => {
  try {
    const myth = await getMyth(createAnonClient(), String(req.params.idOrSlug ?? ""));
    const sources = await listMythSources(createAnonClient(), myth.id);
    res.json({ sources });
  } catch (error) {
    next(error);
  }
});

mythRouter.post("/myths", requireSupabaseAuth("user"), async (req, res, next) => {
  try {
    if (!req.supabase) {
      throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    }

    const body = createMythSchema.parse(req.body);
    const myth = await createMyth(req.supabase, {
      title: body.title,
      explanation: body.explanation,
      categoryId: body.categoryId,
      countryCode: body.countryCode ?? null,
      ...(body.verdict ? { verdict: body.verdict } : {}),
      ...(body.sources
        ? {
            sources: body.sources.map((source) => ({
              url: source.url,
              ...(source.title ? { title: source.title } : {}),
            })),
          }
        : {}),
    });
    res.status(201).json({ myth });
  } catch (error) {
    next(error);
  }
});

mythRouter.post(
  "/myths/:idOrSlug/votes",
  optionalSupabaseAuth(),
  rateLimit({ name: "vote", windowMs: 60_000, max: 40 }),
  async (req, res, next) => {
    try {
      const selected = parseVoteValue(req.body?.value);
      if (!selected) {
        throw new HttpError(400, "selectedAnswer must be TRUE or FALSE", "INVALID_ANSWER");
      }

      const idOrSlug = String(req.params.idOrSlug ?? "");
      const client = req.supabase ?? createAnonClient();
      const myth = await getMyth(client, idOrSlug);
      const userId = req.supabaseAuth?.userClaims?.id ?? null;
      const anonymousId = userId ? readAnonymousId(req) : ensureAnonymousId(req, res);
      const result = await castVote(client, myth.id, selected, userId ? null : anonymousId);
      const nextMyth = await getMyth(client, myth.id, {
        userId,
        anonymousId: userId ? null : anonymousId,
      });

      res.status(result.alreadyAnswered ? 409 : 200).json({
        ...result,
        myth: nextMyth,
      });
    } catch (error) {
      next(error);
    }
  },
);

mythRouter.post(
  "/myths/:idOrSlug/comments",
  requireSupabaseAuth("user"),
  rateLimit({ name: "comment", windowMs: 60_000, max: 20 }),
  async (req, res, next) => {
    try {
      if (!req.supabase) {
        throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
      }

      const body = commentSchema.parse(req.body);
      const idOrSlug = String(req.params.idOrSlug ?? "");
      const myth = await getMyth(req.supabase, idOrSlug);
      const comment = await createComment(req.supabase, myth.id, body.content);
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  },
);

mythRouter.post(
  "/myths/:idOrSlug/reports",
  requireSupabaseAuth("user"),
  async (req, res, next) => {
    try {
      if (!req.supabase) {
        throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
      }

      const body = reportSchema.parse(req.body);
      const myth = await getMyth(req.supabase, String(req.params.idOrSlug ?? ""));
      const report = await createReport(req.supabase, {
        target: "MYTH",
        mythId: myth.id,
        reason: body.reason,
      });
      res.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  },
);

mythRouter.post(
  "/myths/:idOrSlug/comments/:commentId/reports",
  requireSupabaseAuth("user"),
  async (req, res, next) => {
    try {
      if (!req.supabase) {
        throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
      }

      const body = reportSchema.parse(req.body);
      const myth = await getMyth(req.supabase, String(req.params.idOrSlug ?? ""));
      const report = await createReport(req.supabase, {
        target: "COMMENT",
        mythId: myth.id,
        commentId: String(req.params.commentId ?? ""),
        reason: body.reason,
      });
      res.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  },
);
