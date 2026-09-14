import { resolveEnv } from "@supabase/server/core";
import { Router } from "express";

import { env } from "../../config/env.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "mythh-backend",
    time: new Date().toISOString(),
    appUrl: env.APP_URL,
    frontendUrl: env.FRONTEND_URL ?? null,
  });
});

healthRouter.get("/ready", (_req, res) => {
  const { data, error } = resolveEnv();
  const hasSecretKey = Boolean(env.SUPABASE_SECRET_KEY);

  if (error || !data) {
    res.status(503).json({
      status: "not_ready",
      supabase: {
        url: false,
        publishableKey: false,
        secretKey: hasSecretKey,
        jwks: false,
      },
      message: error?.message ?? "Supabase environment is incomplete",
    });
    return;
  }

  res.json({
    status: "ok",
    supabase: {
      url: Boolean(data.url),
      publishableKey: Object.keys(data.publishableKeys).length > 0,
      secretKey: hasSecretKey,
      jwks: data.jwks !== null,
    },
  });
});
