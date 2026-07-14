// index.test — Kompositionsvertrag der dünnen App-Runtime über das Runtime-Paket.
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
  it("parst DEMO_MODE mit der gemeinsamen strikten Boolean-Grammatik", () => {
    expect(readRuntimeConfig({ DEMO_MODE: "true" }).demoMode).toBe(true);
    expect(readRuntimeConfig({}).demoMode).toBe(false);
    expect(() => readRuntimeConfig({ DEMO_MODE: "sometimes" })).toThrow(
      "invalid boolean value: sometimes",
    );
  });

  it("verdrahtet Header, App-Identität, Demo-Feature und Port-Trennung", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({
      STATIC_DIR: staticDir,
      NODE_ENV: "production",
      APP_ENABLE_SERVICE_WORKER: "false",
      DEMO_MODE: "true",
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
      expect(runtimeConfig.statusCode).toBe(200);
      expect(runtimeConfig.headers["cache-control"]).toBe("no-store");
      expect(runtimeConfig.json()).toMatchObject({
        application: { applicationId: "fachverfahren" },
        delivery: { serviceWorkerEnabled: false },
        features: { demoMode: true },
      });

      expect(
        (await app.inject({ method: "GET", url: "/internal/metrics" }))
          .statusCode,
      ).toBe(404);
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

  it("registriert die App-Routen über die Naht", async () => {
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
      expect(status.json().demoMode).toBe(false);
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
