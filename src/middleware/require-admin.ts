import type { NextFunction, Request, Response } from "express";

import { HttpError } from "./error-handler.js";
import { requireSupabaseAuth } from "./supabase.js";

export function requireAdmin() {
  return [
    requireSupabaseAuth("user"),
    async (req: Request, _res: Response, next: NextFunction) => {
      try {
        if (!req.supabase || !req.supabaseAuth?.userClaims?.id) {
          throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
        }

        await req.supabase.rpc("claim_first_admin");
        await req.supabase.rpc("apply_admin_allowlist");

        const { data, error } = await req.supabase
          .from("profiles")
          .select("*")
          .eq("id", req.supabaseAuth.userClaims.id)
          .maybeSingle();

        if (error || !data) {
          throw new HttpError(403, "Profile not found", "PROFILE_NOT_FOUND");
        }

        if (data.status !== "ACTIVE") {
          throw new HttpError(403, "Account is suspended", "ACCOUNT_SUSPENDED");
        }

        if (data.role !== "ADMIN") {
          throw new HttpError(403, "Admin access required", "ADMIN_REQUIRED");
        }

        req.profile = data;
        next();
      } catch (error) {
        next(error);
      }
    },
  ];
}
