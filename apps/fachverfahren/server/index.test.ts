import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  assertHeaderAuthAllowed,
  buildDomainApiFromEnv,
  buildInternalServer,
  buildPublicServer,
  readRuntimeConfig,
} from "./index.js";

/** Minimal-Vertrag (id + StatusMachine) für die Auth-Bootstrap-Tests. */
async function writeContract(): Promise<{ path: string; dir: string }> {
  const dir = join(tmpdir(), `fv-contract-${Date.now()}-${randomSuffix()}`);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "leistung.contract.json");
  await writeFile(
    path,
    JSON.stringify({
      id: "leistung-test",
      statusMachine: {
        initial: "eingegangen",
        states: [
          { key: "eingegangen" },
          { key: "entschieden", terminal: true },
        ],
        transitions: [
          { from: "eingegangen", to: "entschieden", rollen: ["sb"] },
        ],
      },
    }),
  );
  return { path, dir };
}

let suffix = 0;
function randomSuffix(): string {
  return String(suffix++);
}

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

  it("exposes the outbox backlog gauge on /internal/metrics when a backlog source is present (#10)", async () => {
    const config = readRuntimeConfig({ STATIC_DIR: tmpdir() });
    const app = buildInternalServer({
      config,
      backlog: async () => ({ due: 5, claimable: 3, scheduled: 1 }),
    });
    try {
      const res = await app.inject({ method: "GET", url: "/internal/metrics" });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("app_build_info"); // Basis-Metriken bleiben
      expect(res.body).toContain('app_automation_backlog{state="due"} 5');
      expect(res.body).toContain('app_automation_backlog{state="claimable"} 3');
      expect(res.body).toContain('app_automation_backlog{state="scheduled"} 1');
    } finally {
      await app.close();
    }
  });

  it("keeps /internal/metrics serving base metrics when the backlog source throws (#10)", async () => {
    const config = readRuntimeConfig({ STATIC_DIR: tmpdir() });
    const app = buildInternalServer({
      config,
      backlog: async () => {
        throw new Error("db down");
      },
    });
    try {
      const res = await app.inject({ method: "GET", url: "/internal/metrics" });
      // Der Rückstau ist Bonus — ein DB-Fehler darf den Scrape nicht kippen: 200 + Basis-Metriken, Gauge fehlt schlicht.
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("app_build_info");
      expect(res.body).not.toContain("app_automation_backlog");
    } finally {
      await app.close();
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

  it("marks readiness false when the data store is unreachable (fail-soft probe)", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const caseStore = new InMemoryCaseStore();
    // Simuliere einen toten Pool: ping wirft.
    caseStore.ping = async () => {
      throw new Error("pool down");
    };
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
      domainApi: {
        caseStore,
        catalog: { transitionsFor: () => [] },
        resolveSession: () => undefined,
      },
    });
    try {
      const res = await app.inject({ method: "GET", url: "/readyz" });
      expect(res.statusCode).toBe(503);
      expect(res.json().upstreamFailures.join(" ")).toContain("caseStore");
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("rate-limits /api/* per key and answers 429 as problem+json", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({
      STATIC_DIR: staticDir,
      APP_RATELIMIT_MAX: "2",
    });
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
      domainApi: {
        caseStore: new InMemoryCaseStore(),
        catalog: { transitionsFor: () => [] },
        resolveSession: () => undefined,
      },
    });
    try {
      const hdr = { "x-actor-id": "sb.limit" };
      const first = await app.inject({
        method: "GET",
        url: "/api/cases",
        headers: hdr,
      });
      const second = await app.inject({
        method: "GET",
        url: "/api/cases",
        headers: hdr,
      });
      const third = await app.inject({
        method: "GET",
        url: "/api/cases",
        headers: hdr,
      });
      expect(first.statusCode).not.toBe(429);
      expect(second.statusCode).not.toBe(429);
      expect(third.statusCode).toBe(429);
      expect(third.headers["content-type"]).toContain(
        "application/problem+json",
      );
      expect(third.headers["retry-after"]).toBeDefined();
      expect(third.json().status).toBe(429);
      // Statische Assets bleiben unlimitiert.
      const asset = await app.inject({ method: "GET", url: "/", headers: hdr });
      expect(asset.statusCode).toBe(200);
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("echoes the incoming x-request-id as the correlation id (genReqId)", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
    });
    try {
      const withId = await app.inject({
        method: "GET",
        url: "/livez",
        headers: { "x-request-id": "korr-abc-123" },
      });
      expect(withId.headers["x-request-id"]).toBe("korr-abc-123");
      const withoutId = await app.inject({ method: "GET", url: "/livez" });
      expect(String(withoutId.headers["x-request-id"] ?? "")).not.toBe("");
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("serves unplanned errors as sanitized RFC-9457 problem+json", async () => {
    const staticDir = await createStaticDir();
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const app = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
      domainApi: {
        caseStore: new InMemoryCaseStore(),
        catalog: { transitionsFor: () => [] },
        resolveSession: () => ({
          actorId: "sb.a",
          tenantId: "t1",
          authorityId: "b1",
          jurisdictionId: "de",
          permissions: [],
        }),
      },
    });
    try {
      // Fehlerhaftes JSON → Fastify-Body-Parser wirft 400 VOR dem Handler → zentrale Fehlerbehandlung.
      const res = await app.inject({
        method: "POST",
        url: "/api/cases/abc/transitions",
        headers: { "content-type": "application/json" },
        payload: "{ das ist kein json",
      });
      expect(res.statusCode).toBe(400);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      const body = res.json();
      expect(body.status).toBe(400);
      expect(typeof body.title).toBe("string");
      expect(body.instance).toBe(res.headers["x-request-id"]);
    } finally {
      await app.close();
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  it("refuses to bootstrap header-auth in production (full-bypass guard, HTTP-Pfad)", () => {
    // Der Guard lebt auf dem HTTP-Bootstrap-Pfad (startRuntime), NICHT in buildDomainApiFromEnv — so triggert der reine
    // Automations-Worker (der die Deps ohne HTTP nutzt) ihn nicht. Hier direkt die Guard-Funktion:
    // PRODUCTION ohne ausdrückliches dev-header → verboten (ungeprüfte x-*-Header = Voll-Bypass).
    expect(() =>
      assertHeaderAuthAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/PRODUCTION/);
    // Mit ausdrücklichem Bekenntnis dev-header → erlaubt.
    expect(() =>
      assertHeaderAuthAllowed({
        NODE_ENV: "production",
        APP_AUTH_MODE: "dev-header",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
    // Nicht-PRODUCTION → erlaubt (DEV/Test).
    expect(() =>
      assertHeaderAuthAllowed({} as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("buildDomainApiFromEnv baut die Deps unabhängig von der HTTP-Auth-Policy (Worker-Pfad)", async () => {
    // Ein reiner Worker baut die Deps in PRODUCTION AUCH ohne dev-header — die HTTP-Header-Auth-Sperre ist NICHT hier.
    const { path, dir } = await writeContract();
    try {
      await expect(
        buildDomainApiFromEnv({
          NODE_ENV: "production",
          APP_LEISTUNG_CONTRACT: path,
        } as NodeJS.ProcessEnv),
      ).resolves.toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("baut den Katalog aus MEHREREN Verfahren (komma-separierte Contracts) — je procedureId isoliert", async () => {
    const dir = join(tmpdir(), `fv-multi-${Date.now()}-${randomSuffix()}`);
    await mkdir(dir, { recursive: true });
    const pA = join(dir, "a.contract.json");
    const pB = join(dir, "b.contract.json");
    await writeFile(
      pA,
      JSON.stringify({
        id: "verfahren-a",
        statusMachine: {
          initial: "eingegangen",
          states: [{ key: "eingegangen" }, { key: "a-final", terminal: true }],
          transitions: [{ from: "eingegangen", to: "a-final", rollen: ["sb"] }],
        },
      }),
    );
    await writeFile(
      pB,
      JSON.stringify({
        id: "verfahren-b",
        statusMachine: {
          initial: "neu",
          states: [{ key: "neu" }, { key: "b-final", terminal: true }],
          transitions: [
            { from: "neu", to: "b-final", rollen: ["sb"], vierAugen: true },
          ],
        },
      }),
    );
    try {
      const deps = await buildDomainApiFromEnv({
        APP_LEISTUNG_CONTRACT: `${pA},${pB}`,
      } as NodeJS.ProcessEnv);
      expect(deps).toBeDefined();
      // Beide Verfahren im Katalog, je isoliert nach procedureId.
      const tA = deps!.catalog.transitionsFor("verfahren-a", "1");
      const tB = deps!.catalog.transitionsFor("verfahren-b", "1");
      expect(tA.map((t) => t.action)).toEqual(["a-final"]);
      expect(tB.map((t) => t.action)).toEqual(["b-final"]);
      // Vier-Augen nur bei Verfahren B (keine Vermischung).
      expect(tA[0]?.requiresFourEyes).toBeUndefined();
      expect(tB[0]?.requiresFourEyes).toBe(true);
      // Initial-States je Verfahren; unbekanntes Verfahren → undefined.
      expect(deps!.procedureInitialState?.("verfahren-a", "1")).toBe(
        "eingegangen",
      );
      expect(deps!.procedureInitialState?.("verfahren-b", "1")).toBe("neu");
      expect(deps!.procedureInitialState?.("unbekannt", "1")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("bleibt rückwärtskompatibel: ein einzelner Contract-Pfad (ohne Komma) liefert genau ein Verfahren", async () => {
    const { path, dir } = await writeContract();
    try {
      const deps = await buildDomainApiFromEnv({
        APP_LEISTUNG_CONTRACT: path,
      } as NodeJS.ProcessEnv);
      expect(
        deps!.catalog.transitionsFor("leistung-test", "1").map((t) => t.action),
      ).toEqual(["entschieden"]);
      expect(deps!.procedureInitialState?.("leistung-test", "1")).toBe(
        "eingegangen",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
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
