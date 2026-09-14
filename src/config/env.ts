import "dotenv/config";
import { z } from "zod";

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
    (value) => {
      if (typeof value === "string" && value.length > 0) return value;
      if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
      return "http://localhost:3001";
    },
    z.string().url(),
  ),
  FRONTEND_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
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
