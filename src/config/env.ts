import "dotenv/config";
import { z } from "zod";

function isLocalUrl(value?: string) {
  if (!value) return true;
  try {
    const host = new URL(value).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

function publicUrl(value: unknown, fallback: string) {
  if (typeof value === "string" && value.length > 0 && !isLocalUrl(value)) {
    return value;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return fallback;
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.preprocess(
    (value) => (value === "" || value === undefined ? 3001 : value),
    z.coerce.number().int().positive().default(3001),
  ),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().optional().default(""),
  SUPABASE_JWKS_URL: z.string().url(),
  APP_URL: z.preprocess(
    (value) => publicUrl(value, "http://localhost:3001"),
    z.string().url(),
  ),
  FRONTEND_URL: z.preprocess((value) => {
    if (typeof value === "string" && value.length > 0 && !isLocalUrl(value)) {
      return value;
    }
    if (process.env.VERCEL) return "https://mythh.in";
    return undefined;
  }, z.string().url().optional()),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }

  return parsed.data;
}

export const env = loadEnv();
