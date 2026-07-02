import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInternalServer,
  buildPublicServer,
  readRuntimeConfig,
} from "./index.js";

describe("fachverfahren runtime", () => {
  it("sets redeploy-safe cache and security headers", async () => {
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
    try {
      const root = await app.inject({ method: "GET", url: "/" });
      expect(root.statusCode).toBe(200);
      expect(root.headers["cache-control"]).toBe("no-store");
      expect(root.headers["content-security-policy"]).toContain(
        "object-src 'none'",
      );
      expect(root.headers["strict-transport-security"]).toContain(
        "max-age=31536000",
      );
      expect(root.headers["x-content-type-options"]).toBe("nosniff");
      expect(root.headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(root.headers["permissions-policy"]).toContain("camera=()");

      const asset = await app.inject({
        method: "GET",
        url: "/assets/index-12345678.js",
      });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );

      const runtimeConfig = await app.inject({
        method: "GET",
        url: "/runtime-config.json",
      });
      expect(runtimeConfig.statusCode).toBe(200);
      expect(runtimeConfig.headers["cache-control"]).toBe("no-store");
      expect(runtimeConfig.json().delivery.serviceWorkerEnabled).toBe(false);
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("keeps internal endpoints off the public app port", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const publicApp = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
    });
    const internalApp = buildInternalServer({ config });
    try {
      const publicMetrics = await publicApp.inject({
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

      const buildInfo = await internalApp.inject({
        method: "GET",
        url: "/internal/build-info",
      });
      expect(buildInfo.statusCode).toBe(200);
      expect(buildInfo.json().config.serviceWorkerEnabled).toBe(false);
    } finally {
      await publicApp.close();
      await internalApp.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("marks readiness false during shutdown", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const state = { startupComplete: true, shuttingDown: false };
    const app = buildPublicServer({ config, state });
    try {
      const ready = await app.inject({ method: "GET", url: "/readyz" });
      expect(ready.statusCode).toBe(200);
      state.shuttingDown = true;
      const shuttingDown = await app.inject({
        method: "GET",
        url: "/readyz",
      });
      expect(shuttingDown.statusCode).toBe(503);
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
