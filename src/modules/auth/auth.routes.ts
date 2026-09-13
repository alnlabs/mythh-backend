import { Router } from "express";

import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/error-handler.js";
import { requireSupabaseAuth } from "../../middleware/supabase.js";
import { listMyMyths } from "../myths/myth.service.js";
import { createAuthClient } from "./auth.client.js";
import {
  frontendAuthRedirect,
  isOauthCancel,
  publicUser,
  safeNextPath,
} from "./auth.utils.js";

export const authRouter = Router();

authRouter.get("/auth/google", async (req, res, next) => {
  try {
    const supabase = createAuthClient(req, res);
    const nextPath = safeNextPath(req.query.next);
    const redirectTo = new URL("/api/v1/auth/callback", env.APP_URL);
    redirectTo.searchParams.set("next", nextPath);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
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
    const nextPath = safeNextPath(req.query.next);

    if (oauthError) {
      const cancelled = isOauthCancel(oauthError);
      const redirect = frontendAuthRedirect(
        env.FRONTEND_URL,
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
      const redirect = frontendAuthRedirect(env.FRONTEND_URL, nextPath, "cancelled");
      if (redirect) {
        res.redirect(303, redirect);
        return;
      }
      throw new HttpError(400, "Missing OAuth code", "MISSING_OAUTH_CODE");
    }

    const supabase = createAuthClient(req, res);
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.session || !data.user) {
      const redirect = frontendAuthRedirect(env.FRONTEND_URL, nextPath, "error");
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

    if (env.FRONTEND_URL) {
      const destination = new URL(nextPath, env.FRONTEND_URL);
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
        .select("id, email, display_name, avatar_url, role, status")
        .eq("id", auth.userClaims.id)
        .maybeSingle();
      profile = data;
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
