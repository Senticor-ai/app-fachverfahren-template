// static.test — VERTRAG der Static-/SPA-Auslieferung, geschrieben VOR dem Umbau auf
// @fastify/static (Issue #11, Phase B): Cache-Politik, SPA-Fallback, HEAD, 405,
// Traversal-Abwehr, Dotfile-Verzeichnisse (.well-known), /internal-Isolation und
// Metrics-Routen-Labels. Bewusst tolerant formuliert, wo sich Implementierungen
// legitim unterscheiden dürfen (Traversal: 403 ODER 404 ODER SPA — nie der Inhalt;
// Content-Types per Regex) — die Suite muss VOR und NACH dem Swap grün sein.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { readRuntimeConfig, type RuntimeConfig } from "./config.js";
import { RuntimeMetrics } from "./metrics.js";
import { buildPublicServer } from "./servers.js";
import { cachePolicy } from "./static.js";

// Bewusstes Fixture: der Marker beweist, dass Traversal-Pfade NIE Inhalte außerhalb
// des staticDir ausliefern. Kein echtes Geheimnis.
const SECRET = "streng-geheim-nicht-ausliefern"; // pragma: allowlist-secret

let tmpRoot: string;
let staticDir: string;
let config: RuntimeConfig;
let metrics: RuntimeMetrics;
let app: FastifyInstance;

beforeAll(async () => {
  tmpRoot = join(
    tmpdir(),
    `static-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  staticDir = join(tmpRoot, "dist");
  await mkdir(join(staticDir, "assets"), { recursive: true });
  await mkdir(join(staticDir, ".well-known"), { recursive: true });
  await writeFile(
    join(staticDir, "index.html"),
    '<!doctype html><div id="root"></div>',
  );
  await writeFile(join(staticDir, "assets/index-12345678.js"), "export {};");
  await writeFile(join(staticDir, "assets/kurz-1234.js"), "export {};");
  await writeFile(
    join(staticDir, ".well-known/security.txt"),
    "Contact: mailto:security@example.org\n",
  );
  // Marker AUSSERHALB des staticDir: darf über keinen Pfad ausgeliefert werden.
  await writeFile(join(tmpRoot, "geheim.txt"), SECRET);
  config = readRuntimeConfig({ STATIC_DIR: staticDir });
  metrics = new RuntimeMetrics();
  app = buildPublicServer({
    config,
    metrics,
    state: { startupComplete: true, shuttingDown: false },
  });
});

afterAll(async () => {
  await app.close();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("Static-Delivery-Vertrag", () => {
  it("liefert / als HTML mit no-store", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(String(response.headers["content-type"])).toMatch(/text\/html/i);
    expect(response.body).toContain('id="root"');
  });

  it("liefert /index.html mit no-store", async () => {
    const response = await app.inject({ method: "GET", url: "/index.html" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("liefert content-gehashte Assets immutable", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/assets/index-12345678.js",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(String(response.headers["content-type"])).toMatch(/javascript/i);
  });

  it("liefert Assets mit zu kurzem Hash no-store (kein Immutable-Fehlgriff)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/assets/kurz-1234.js",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("beantwortet fehlende Dateien MIT Extension als 404-JSON, nie als SPA", async () => {
    const response = await app.inject({ method: "GET", url: "/fehlt.js" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ status: "not-found" });
  });

  it("fällt für extensionslose Pfade auf das SPA-Index zurück (no-store)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/irgendwo/tief",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toContain('id="root"');
  });

  it("beantwortet HEAD ohne Body, mit denselben Cache-Headern", async () => {
    const root = await app.inject({ method: "HEAD", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.headers["cache-control"]).toBe("no-store");
    expect(root.body).toBe("");

    const asset = await app.inject({
      method: "HEAD",
      url: "/assets/index-12345678.js",
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(asset.body).toBe("");

    const spa = await app.inject({ method: "HEAD", url: "/irgendwo/tief" });
    expect(spa.statusCode).toBe(200);
    expect(spa.headers["cache-control"]).toBe("no-store");
    expect(spa.body).toBe("");
  });

  it("weist Nicht-GET/HEAD auf unbekannten Pfaden mit 405 + Allow ab", async () => {
    const response = await app.inject({ method: "POST", url: "/" });
    expect(response.statusCode).toBe(405);
    expect(response.headers["allow"]).toBe("GET, HEAD");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("liefert NIE Dateien außerhalb des staticDir aus (Traversal)", async () => {
    for (const url of [
      "/../geheim.txt",
      "/%2e%2e/geheim.txt",
      "/assets/../../geheim.txt",
      "/assets/%2e%2e/%2e%2e/geheim.txt",
      "/..%2fgeheim.txt",
    ]) {
      const response = await app.inject({ method: "GET", url });
      // Implementierungen dürfen 200 (SPA), 403 oder 404 antworten — nie 5xx,
      // nie den Inhalt der Datei außerhalb des Wurzelverzeichnisses.
      expect([200, 403, 404], `${url} → ${response.statusCode}`).toContain(
        response.statusCode,
      );
      expect(response.body, `${url} liefert das Geheimnis aus`).not.toContain(
        SECRET,
      );
    }
  });

  it("liefert Dotfile-Verzeichnisse wie /.well-known aus (Delivery-Vertrag)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/.well-known/security.txt",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("security@example.org");
  });

  it("hält /internal/* auf dem public Port bei 404 — nie SPA-Fallback", async () => {
    for (const url of ["/internal/metrics", "/internal/openapi.json"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ status: "not-found" });
      expect(response.body).not.toContain('id="root"');
    }
  });

  it("beschriftet Metrics-Routen als /assets/* bzw. spa — nicht als Wildcard", async () => {
    await app.inject({ method: "GET", url: "/assets/index-12345678.js" });
    await app.inject({ method: "GET", url: "/buerger" });
    const rendered = metrics.render(config.buildInfo);
    expect(rendered).toContain('route="/assets/*"');
    expect(rendered).toContain('route="spa"');
    expect(rendered).not.toContain('route="/*"');
  });
});

describe("cachePolicy", () => {
  it("no-store für Wurzeldokumente, immutable nur für gehashte Assets", () => {
    for (const pathname of [
      "/",
      "/index.html",
      "/runtime-config.json",
      "/service-worker.js",
      "/manifest.webmanifest",
      "/assets/kurz-1234.js",
    ]) {
      expect(cachePolicy(pathname), pathname).toBe("no-store");
    }
    for (const pathname of [
      "/assets/index-12345678.js",
      "/assets/styles-abcdefgh.css",
      "/assets/font-ABCDEFGH123.woff2",
    ]) {
      expect(cachePolicy(pathname), pathname).toBe(
        "public, max-age=31536000, immutable",
      );
    }
  });
});
