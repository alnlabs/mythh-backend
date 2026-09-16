import { serializeCookieHeader } from "@supabase/ssr";

const PRODUCTION_APP = "https://api.mythh.in";
const PRODUCTION_FRONTEND = "https://mythh.in";
const OAUTH_NEXT_COOKIE = "mythh_oauth_next";
const OAUTH_ORIGIN_COOKIE = "mythh_oauth_origin";

type RequestQuery = { origin?: unknown; next?: unknown };

function isLocalHost(value?: string | null) {
  if (!value) return true;
  try {
    const host = new URL(value.includes("://") ? value : `https://${value}`).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

export function isProductionRuntime() {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

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

export function allowedFrontendOrigin(value?: string | null) {
  if (!value) return null;
  try {
    const origin = new URL(value).origin;
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return isProductionRuntime() ? null : origin;
    }
    if (host.endsWith(".vercel.app")) return origin;
    if (host === "mythh.in" || host === "www.mythh.in") return origin;
    return null;
  } catch {
    return null;
  }
}

export function appUrlFromRequest(
  req: { get(name: string): string | undefined; protocol: string },
  fallback: string,
) {
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  const proto = (req.get("x-forwarded-proto") ?? req.protocol ?? "https").split(",")[0]?.trim() || "https";
  if (host && !isLocalHost(`https://${host}`)) {
    const protocol = proto === "http" ? "https" : proto;
    return `${protocol}://${host}`;
  }
  if (host && !isProductionRuntime()) return `${proto}://${host}`;
  if (!isLocalHost(fallback)) return fallback;
  if (isProductionRuntime()) return PRODUCTION_APP;
  return fallback;
}

export function frontendUrlFromRequest(
  req: { get(name: string): string | undefined; query: RequestQuery },
  fallback?: string,
) {
  const cookieOrigin = readCookie(req.get("cookie"), OAUTH_ORIGIN_COOKIE);
  const queryOrigin = typeof req.query.origin === "string" ? req.query.origin : "";
  const referer = req.get("referer");
  for (const candidate of [cookieOrigin, queryOrigin, referer, fallback]) {
    const allowed = allowedFrontendOrigin(candidate);
    if (allowed) return allowed;
  }
  if (isProductionRuntime()) return PRODUCTION_FRONTEND;
  return fallback ?? "http://localhost:3000";
}

export function oauthStateCookies(
  req: { get(name: string): string | undefined; protocol: string },
  nextPath: string,
  origin: string,
) {
  const secure = isProductionRuntime() || !isLocalHost(appUrlFromRequest(req, PRODUCTION_APP));
  const options = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    maxAge: 600,
  };
  return [
    serializeCookieHeader(OAUTH_NEXT_COOKIE, nextPath, options),
    serializeCookieHeader(OAUTH_ORIGIN_COOKIE, origin, options),
  ];
}

export function clearOauthStateCookies() {
  const options = { path: "/", maxAge: 0 };
  return [
    serializeCookieHeader(OAUTH_NEXT_COOKIE, "", options),
    serializeCookieHeader(OAUTH_ORIGIN_COOKIE, "", options),
  ];
}

export function oauthNextFromRequest(req: {
  get(name: string): string | undefined;
  query: RequestQuery;
}) {
  return safeNextPath(readCookie(req.get("cookie"), OAUTH_NEXT_COOKIE) || req.query.next);
}

export function isOauthCancel(error: string | null) {
  if (!error) return false;
  const value = error.toLowerCase();
  return (
    value === "access_denied" ||
    value === "user_cancelled" ||
    value === "user_canceled" ||
    value.includes("cancel")
  );
}

export function frontendAuthRedirect(
  frontendUrl: string | undefined,
  nextPath: string,
  status: "cancelled" | "error",
) {
  const origin =
    allowedFrontendOrigin(frontendUrl) ??
    (isProductionRuntime() ? PRODUCTION_FRONTEND : frontendUrl);
  if (!origin) return null;
  const destination = new URL(nextPath, origin);
  destination.searchParams.set("auth", status);
  return destination.toString();
}

export function safeNextPath(value: unknown, fallback = "/"): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return fallback;
  }

  return value;
}

export function publicUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}) {
  return {
    id: user.id,
    email: user.email ?? null,
    name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null,
    avatarUrl:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : null,
    providers: Array.isArray(user.app_metadata?.providers)
      ? user.app_metadata.providers
      : [],
  };
}
