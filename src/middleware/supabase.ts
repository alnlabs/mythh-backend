import type { AuthModeWithKey } from "@supabase/server";
import { createContextClient, verifyCredentials } from "@supabase/server/core";
import type { NextFunction, Request, Response } from "express";

import type { Database } from "../database/types.js";
import { createAuthClient } from "../modules/auth/auth.client.js";

type SupabaseAuthMode = AuthModeWithKey | AuthModeWithKey[];

async function resolveAccessToken(
  req: Request,
  res: Response,
): Promise<string | null> {
  const header = req.get("authorization");

  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || null;
  }

  const supabase = createAuthClient(req, res);
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function requireSupabaseAuth(auth: SupabaseAuthMode = "user") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = await resolveAccessToken(req, res);
      const { data, error } = await verifyCredentials(
        { token, apikey: null },
        { auth },
      );

      if (error || !data) {
        res.status(error?.status ?? 401).json({
          message: error?.message ?? "Invalid credentials",
          code: error?.code ?? "INVALID_CREDENTIALS",
        });
        return;
      }

      req.supabaseAuth = data;
      req.supabase = createContextClient<Database>({
        auth: {
          token: data.token,
          ...(data.keyName ? { keyName: data.keyName } : {}),
        },
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
