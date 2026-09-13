import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { app } = await import("../src/app.js");
    app(req, res);
  } catch (error) {
    if (res.headersSent) return;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        message: error instanceof Error ? error.message : "Boot failed",
      }),
    );
  }
}
