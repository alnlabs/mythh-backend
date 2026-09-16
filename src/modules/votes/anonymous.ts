import { randomUUID } from "node:crypto";

import { serializeCookieHeader } from "@supabase/ssr";

import { isProductionRuntime } from "../auth/auth.utils.js";
import { isUuid } from "./vote.logic.js";

export const ANONYMOUS_COOKIE = "mythh_anonymous_id";

function readCookie(header: string | undefined, name: string) {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return rest.join("=");
      }
    }
  }
  return "";
}

export function readAnonymousId(req: { get(name: string): string | undefined }) {
  const value = readCookie(req.get("cookie"), ANONYMOUS_COOKIE);
  return isUuid(value) ? value : null;
}

export function anonymousCookieHeader(id: string) {
  return serializeCookieHeader(ANONYMOUS_COOKIE, id, {
    path: "/",
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: isProductionRuntime() ? "none" : "lax",
    maxAge: 60 * 60 * 24 * 400,
  });
}

export function ensureAnonymousId(
  req: { get(name: string): string | undefined },
  res: { appendHeader(name: string, value: string): void },
) {
  const existing = readAnonymousId(req);
  if (existing) {
    res.appendHeader("Set-Cookie", anonymousCookieHeader(existing));
    return existing;
  }

  const next = randomUUID();
  res.appendHeader("Set-Cookie", anonymousCookieHeader(next));
  return next;
}
