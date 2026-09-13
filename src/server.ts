import { app } from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
  console.log(`MYTHH API listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
