// servers.test — Regressions-Netz der Runtime-Extraktion: die Testkörper stammen aus
// apps/*/server/index.test.ts und sichern Cache-/Security-Header, die public/internal-
// Trennung und den Readiness-Kipppunkt beim Shutdown. Dazu: Verträge der Registrar-Nähte.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeConfig } from "./config.js";
import { buildInternalServer, buildPublicServer } from "./servers.js";

describe("app runtime servers", () => {
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
      expect(root.headers["content-security-policy"]).toContain(
        "style-src-elem 'self' 'unsafe-inline'",
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

  it("registriert App-Routen über die Naht — mit Security-Headern und Kontext", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
      registerRoutes: (instance, context) => {
        instance.get("/hallo", async (_request, reply) =>
          reply.send({
            applicationId: (
              context.config.publicRuntimeConfig["application"] as {
                applicationId: string;
              }
            ).applicationId,
          }),
        );
      },
    });
    try {
      const response = await app.inject({ method: "GET", url: "/hallo" });
      expect(response.statusCode).toBe(200);
      expect(response.json().applicationId).toBe("app");
      expect(response.headers["content-security-policy"]).toContain(
        "default-src 'self'",
      );
      expect(response.headers["x-request-id"]).toBeTruthy();
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("registriert interne Zusatz-Routen über die Naht des internen Servers", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const app = buildInternalServer({
      config,
      registerRoutes: (instance) => {
        instance.get("/internal/zusatz", async (_request, reply) =>
          reply.send({ status: "ok" }),
        );
      },
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/internal/zusatz",
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });
});

async function createStaticDir(): Promise<string> {
  const dir = join(
    tmpdir(),
    `app-runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(
    join(dir, "index.html"),
    '<!doctype html><div id="root"></div>',
  );
  await writeFile(join(dir, "assets/index-12345678.js"), "export {};");
  return dir;
}
