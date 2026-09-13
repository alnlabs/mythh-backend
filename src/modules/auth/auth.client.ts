import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import type { Request, Response } from "express";

import { env } from "../../config/env.js";

export function createAuthClient(req: Request, res: Response) {
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: {
      path: "/",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? "");
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          res.appendHeader(
            "Set-Cookie",
            serializeCookieHeader(name, value, options),
          );
        }

        for (const [key, value] of Object.entries(headers)) {
          res.setHeader(key, value);
        }
      },
    },
  });
}
