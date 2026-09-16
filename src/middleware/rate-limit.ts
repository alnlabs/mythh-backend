import type { NextFunction, Request, Response } from "express";

import { HttpError } from "./error-handler.js";
import { readAnonymousId } from "../modules/votes/anonymous.js";

type Bucket = { count: number; resetAt: number };

const hits = new Map<string, Bucket>();

function prune(now: number) {
  if (hits.size < 2000) return;
  for (const [key, bucket] of hits) {
    if (bucket.resetAt <= now) hits.delete(key);
  }
}

export function rateLimit({
  windowMs,
  max,
  name,
}: {
  windowMs: number;
  max: number;
  name: string;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    prune(now);
    const identity =
      req.supabaseAuth?.userClaims?.id ||
      readAnonymousId(req) ||
      req.ip ||
      "unknown";
    const key = `${name}:${identity}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      next(new HttpError(429, "Too many requests. Try again shortly.", "RATE_LIMITED"));
      return;
    }

    next();
  };
}
