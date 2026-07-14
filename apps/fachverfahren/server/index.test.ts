// index.test — KOMPOSITIONS-Test der dünnen App-Runtime: beweist, dass die Wrapper die
// Paket-Runtime (@senticor/app-runtime-fastify) korrekt verdrahten (Header via Hooks,
// public/internal-Trennung) UND dass die App-Routen über die registerRoutes-Naht
// tatsächlich registriert werden. Das vollständige Runtime-Verhalten sichern die
// Paket-Tests (packages/app-runtime-fastify/src/servers.test.ts).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInternalServer,
  buildPublicServer,
  readRuntimeConfig,
} from "./index.js";

describe("fachverfahren runtime composition", () => {
  it("verdrahtet die Paket-Runtime: Header, App-Identität, public/internal-Trennung", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({
      STATIC_DIR: staticDir,
      NODE_ENV: "production",
      APP_ENABLE_SERVICE_WORKER: "false",
    });
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
    });
    const internalApp = buildInternalServer({ config });
    try {
      const root = await app.inject({ method: "GET", url: "/" });
      expect(root.statusCode).toBe(200);
      expect(root.headers["cache-control"]).toBe("no-store");
      expect(root.headers["content-security-policy"]).toContain(
        "style-src-elem 'self' 'unsafe-inline'",
      );

      const runtimeConfig = await app.inject({
        method: "GET",
        url: "/runtime-config.json",
      });
      expect(runtimeConfig.json().application.applicationId).toBe(
        "fachverfahren",
      );

      const publicMetrics = await app.inject({
        method: "GET",
        url: "/internal/metrics",
      });
      expect(publicMetrics.statusCode).toBe(404);

      const internalMetrics = await internalApp.inject({
        method: "GET",
        url: "/internal/metrics",
      });
      expect(internalMetrics.statusCode).toBe(200);
      expect(internalMetrics.body).toContain("app_build_info");
    } finally {
      await app.close();
      await internalApp.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("registriert die App-Routen über die Naht (401 statt SPA-Fallback)", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
    });
    try {
      const boards = await app.inject({ method: "GET", url: "/api/v1/boards" });
      expect(boards.statusCode).toBe(401);
      expect(boards.json()).toEqual({ error: "authentication required" });

      const status = await app.inject({ method: "GET", url: "/auth/status" });
      expect(status.statusCode).toBe(200);
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });
});

async function createStaticDir(): Promise<string> {
  const dir = join(tmpdir(), `fachverfahren-runtime-${Date.now()}`);
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(
    join(dir, "index.html"),
    '<!doctype html><div id="root"></div>',
  );
  await writeFile(join(dir, "assets/index-12345678.js"), "export {};");
  return dir;
}
