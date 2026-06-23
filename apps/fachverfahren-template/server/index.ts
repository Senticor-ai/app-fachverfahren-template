import { buildApp, resolveStaticDir } from "./app.js";

const port = Number(process.env["PORT"] ?? 8080);
const host = process.env["HOST"] ?? "0.0.0.0";
const startedAt = Date.now();

const app = await buildApp({
  staticDir: resolveStaticDir(),
  startedAt,
});

const shutdown = async (signal: string) => {
  if (app.shuttingDown) return;
  app.shuttingDown = true;
  app.log.info({ signal }, "starting graceful shutdown");
  await app.close();
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

await app.listen({ host, port });
