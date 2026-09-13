import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "HTTP_ERROR",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    message: "Not found",
    code: "NOT_FOUND",
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: error.issues[0]?.message ?? "Invalid request",
      code: "VALIDATION_ERROR",
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    message: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}
