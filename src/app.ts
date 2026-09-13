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

export const app = express();

app.disable("x-powered-by");
app.use(helmetMiddleware());
app.use(
  cors({
    origin: env.FRONTEND_URL ?? true,
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api/v1", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
