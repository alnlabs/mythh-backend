import { Router } from "express";
import { z } from "zod";

import { createAnonClient } from "../../database/client.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireSupabaseAuth } from "../../middleware/supabase.js";
import {
  createComment,
  createMyth,
  createReport,
  getMyth,
  listApprovedMyths,
  listMythComments,
  listMythSources,
  upsertVote,
} from "./myth.service.js";

export const mythRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
});

const createMythSchema = z.object({
  title: z.string().trim().min(8).max(200),
  explanation: z.string().trim().min(20).max(5000),
  categoryId: z.string().uuid(),
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

const voteSchema = z.object({
  value: z.enum(["TRUE", "FALSE"]),
});

const commentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

const reportSchema = z.object({
  reason: z.string().trim().min(4).max(1000),
});

mythRouter.get("/myths", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const myths = await listApprovedMyths(createAnonClient(), {
      limit: query.limit,
      ...(query.category ? { categorySlug: query.category } : {}),
      ...(query.q ? { q: query.q } : {}),
    });
    res.json({ myths });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/search", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    if (!query.q) {
      throw new HttpError(400, "Search query is required", "MISSING_SEARCH_QUERY");
    }

    const myths = await listApprovedMyths(createAnonClient(), {
      limit: query.limit,
      q: query.q,
    });
    res.json({ myths });
  } catch (error) {
    next(error);
  }
});

mythRouter.get("/myths/:idOrSlug", async (req, res, next) => {
  try {
    const myth = await getMyth(createAnonClient(), String(req.params.idOrSlug ?? ""));
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
  requireSupabaseAuth("user"),
  async (req, res, next) => {
    try {
      if (!req.supabase || !req.supabaseAuth?.userClaims?.id) {
        throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
      }

      const body = voteSchema.parse(req.body);
      const idOrSlug = String(req.params.idOrSlug ?? "");
      const myth = await getMyth(req.supabase, idOrSlug);
      const vote = await upsertVote(
        req.supabase,
        req.supabaseAuth.userClaims.id,
        myth.id,
        body.value,
      );
      res.json({ vote });
    } catch (error) {
      next(error);
    }
  },
);

mythRouter.post(
  "/myths/:idOrSlug/comments",
  requireSupabaseAuth("user"),
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
