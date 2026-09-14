function isLocalHost(value?: string | null) {
  if (!value) return true;
  try {
    const host = new URL(value.includes("://") ? value : `https://${value}`).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

export function appUrlFromRequest(
  req: { get(name: string): string | undefined; protocol: string },
  fallback: string,
) {
  if (!isLocalHost(fallback)) return fallback;
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  if (host && !isLocalHost(`https://${host}`)) return `${proto}://${host}`;
  return fallback;
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
  if (!frontendUrl) return null;
  const destination = new URL(nextPath, frontendUrl);
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
