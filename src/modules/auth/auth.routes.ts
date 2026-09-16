import { Router } from "express";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { MythhClient } from "../../database/client.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireSupabaseAuth } from "../../middleware/supabase.js";
import { listMyMyths, claimAnonymousVotes } from "../myths/myth.service.js";
import { readAnonymousId } from "../votes/anonymous.js";
import { createAuthClient } from "./auth.client.js";
import {
  appUrlFromRequest,
  clearOauthStateCookies,
  frontendAuthRedirect,
  frontendUrlFromRequest,
  isOauthCancel,
  oauthNextFromRequest,
  oauthStateCookies,
  publicUser,
  safeNextPath,
} from "./auth.utils.js";

const profileSelect =
  "id, email, display_name, avatar_url, role, status, country_code, default_category_id, default_category:categories!default_category_id(id, name, slug)";

const updateProfileSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
  defaultCategoryId: z.string().uuid().nullable().optional(),
});

function presentProfile(row: Record<string, unknown> | null) {
  if (!row) return null;
  const category = row.default_category;
  const unwrapped = Array.isArray(category) ? category[0] : category;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    role: row.role,
    status: row.status,
    country_code: row.country_code ?? null,
    default_category_id: row.default_category_id ?? null,
    default_category: unwrapped ?? null,
  };
}

export const authRouter = Router();

authRouter.get("/auth/google", async (req, res, next) => {
  try {
    const supabase = createAuthClient(req, res);
    const nextPath = safeNextPath(req.query.next);
    const frontendUrl = frontendUrlFromRequest(req, env.FRONTEND_URL);
    const redirectTo = new URL("/api/v1/auth/callback", appUrlFromRequest(req, env.APP_URL)).toString();

    for (const cookie of oauthStateCookies(req, nextPath, frontendUrl)) {
      res.appendHeader("Set-Cookie", cookie);
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error || !data.url) {
      throw new HttpError(
        502,
        error?.message ?? "Unable to start Google sign-in",
        "GOOGLE_AUTH_START_FAILED",
      );
    }

    if (req.query.format === "json") {
      res.json({ url: data.url });
      return;
    }

    res.redirect(303, data.url);
  } catch (error) {
    next(error);
  }
});

authRouter.get("/auth/callback", async (req, res, next) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const oauthError =
      typeof req.query.error === "string" ? req.query.error : null;
    const nextPath = oauthNextFromRequest(req);
    const frontendUrl = frontendUrlFromRequest(req, env.FRONTEND_URL);

    for (const cookie of clearOauthStateCookies()) {
      res.appendHeader("Set-Cookie", cookie);
    }

    if (oauthError) {
      const cancelled = isOauthCancel(oauthError);
      const redirect = frontendAuthRedirect(
        frontendUrl,
        nextPath,
        cancelled ? "cancelled" : "error",
      );
      if (redirect) {
        res.redirect(303, redirect);
        return;
      }

      throw new HttpError(
        401,
        typeof req.query.error_description === "string"
          ? req.query.error_description
          : oauthError,
        cancelled ? "GOOGLE_AUTH_CANCELLED" : "GOOGLE_AUTH_DENIED",
      );
    }

    if (!code) {
      const redirect = frontendAuthRedirect(frontendUrl, nextPath, "cancelled");
      if (redirect) {
        res.redirect(303, redirect);
        return;
      }
      throw new HttpError(400, "Missing OAuth code", "MISSING_OAUTH_CODE");
    }

    const supabase = createAuthClient(req, res);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session || !data.user) {
      const redirect = frontendAuthRedirect(frontendUrl, nextPath, "error");
      if (redirect) {
        res.redirect(303, redirect);
        return;
      }
      throw new HttpError(
        401,
        error?.message ?? "Google sign-in failed",
        "GOOGLE_AUTH_EXCHANGE_FAILED",
      );
    }

    await claimAnonymousVotes(supabase as unknown as MythhClient, readAnonymousId(req)).catch(
      () => 0,
    );

    if (frontendUrl) {
      const destination = new URL(nextPath, frontendUrl);
      res.redirect(303, destination.toString());
      return;
    }

    res.json({
      user: publicUser(data.user),
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
        expiresIn: data.session.expires_in,
        tokenType: data.session.token_type,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/logout", async (req, res, next) => {
  try {
    const supabase = createAuthClient(req, res);
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new HttpError(400, error.message, "LOGOUT_FAILED");
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireSupabaseAuth("user"), async (req, res, next) => {
  try {
    const auth = req.supabaseAuth;
    let profile = null;

    if (req.supabase && auth?.userClaims?.id) {
      await req.supabase.rpc("claim_first_admin");
      await req.supabase.rpc("apply_admin_allowlist");

      const { data } = await req.supabase
        .from("profiles")
        .select(profileSelect)
        .eq("id", auth.userClaims.id)
        .maybeSingle();
      profile = presentProfile(data as Record<string, unknown> | null);
    }

    res.json({
      authMode: auth?.authMode,
      user: auth?.userClaims ?? null,
      profile,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.patch("/me", requireSupabaseAuth("user"), async (req, res, next) => {
  try {
    const userId = req.supabaseAuth?.userClaims?.id;
    if (!req.supabase || !userId) {
      throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    }

    const body = updateProfileSchema.parse(req.body);
    const patch: {
      country_code?: string | null;
      default_category_id?: string | null;
    } = {};

    if (body.countryCode !== undefined) {
      patch.country_code = body.countryCode;
    }
    if (body.defaultCategoryId !== undefined) {
      patch.default_category_id = body.defaultCategoryId;
    }

    if (Object.keys(patch).length === 0) {
      throw new HttpError(400, "Nothing to update", "EMPTY_PROFILE_UPDATE");
    }

    const { data, error } = await req.supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select(profileSelect)
      .single();

    if (error || !data) {
      throw new HttpError(400, error?.message ?? "Could not update profile", "PROFILE_UPDATE_FAILED");
    }

    res.json({ profile: presentProfile(data as Record<string, unknown>) });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me/myths", requireSupabaseAuth("user"), async (req, res, next) => {
  try {
    const userId = req.supabaseAuth?.userClaims?.id;
    if (!req.supabase || !userId) {
      throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
    }

    const myths = await listMyMyths(req.supabase, userId);
    res.json({ myths });
  } catch (error) {
    next(error);
  }
});
