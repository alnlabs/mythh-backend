import cors from "cors";
import express from "express";
import helmetImport from "helmet";

import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { apiRouter } from "./routes/index.js";

function helmetMiddleware() {
  const candidate =
    typeof helmetImport === "function"
      ? helmetImport
      : (helmetImport as { default?: unknown }).default;
  if (typeof candidate !== "function") {
    throw new Error("helmet export is not callable");
  }
  return (candidate as () => express.RequestHandler)();
}

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;

  const listed = (env.FRONTEND_URL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (listed.includes(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && url.hostname.endsWith(".vercel.app")) return true;
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  } catch {
    return false;
  }

  return listed.length === 0;
}

export const app = express();

app.disable("x-powered-by");
app.use(helmetMiddleware());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api/v1", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
