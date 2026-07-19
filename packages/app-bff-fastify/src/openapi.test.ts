// openapi.test — das OpenAPI-Dokument wird auf dem PUBLIC-Server GESAMMELT
// (Collector vor den BFF-Routen — die Reihenfolge ist ein harter Vertrag, eigener
// Test) und NUR intern ausgeliefert (/internal/openapi.json). Public exponiert
// weder das Dokument noch eine Doku-UI.
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  MemoryAuditSink,
  NoSessionResolver,
} from "@senticor/app-runtime-fastify";
import {
  InMemoryAppStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";
import { registerOpenApiCollector, registerOpenApiRoute } from "./openapi.js";
import { appBff } from "./plugin.js";

let apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function buildPair({ collectorFirst = true } = {}): Promise<{
  publicApp: FastifyInstance;
  internalApp: FastifyInstance;
}> {
  const publicApp = fastify({ logger: false });
  const internalApp = fastify({ logger: false });
  apps.push(publicApp, internalApp);
  const bffOptions = {
    appStore: new InMemoryAppStore(),
    caseStore: new InMemoryCaseStore(),
    taskStore: new InMemoryTaskStore(),
    procedureRegistry: createInMemoryProcedureRegistry([]),
    sessionResolver: new NoSessionResolver(),
    auditSink: new MemoryAuditSink(),
  };
  if (collectorFirst) {
    registerOpenApiCollector(publicApp);
    await publicApp.register(appBff, bffOptions);
  } else {
    await publicApp.register(appBff, bffOptions);
    registerOpenApiCollector(publicApp);
  }
  registerOpenApiRoute(internalApp, publicApp);
  return { publicApp, internalApp };
}

describe("OpenAPI intern-only", () => {
  it("liefert intern ein Dokument mit ALLEN sechsunddreissig BFF-Operationen", async () => {
    const { internalApp } = await buildPair();
    const response = await internalApp.inject({
      method: "GET",
      url: "/internal/openapi.json",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const doc = response.json();
    expect(doc.info.title).toBe("App-BFF-API");
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/api/ai/assist",
      "/api/buerger/antraege",
      "/api/buerger/antraege/{id}",
      "/api/buerger/antraege/{id}/bescheid",
      "/api/buerger/antraege/{id}/nachweise",
      "/api/buerger/antraege/{id}/nachweise/{attachmentId}",
      "/api/buerger/antraege/{id}/widerspruch",
      "/api/capabilities",
      "/api/cases",
      "/api/cases/{id}",
      "/api/cases/{id}/allowed-actions",
      "/api/cases/{id}/audit",
      "/api/cases/{id}/progress",
      "/api/cases/{id}/tasks",
      "/api/cases/{id}/transitions",
      "/api/cases/{id}/vermerke",
      "/api/cases/{id}/vermerke/export",
      "/api/cases/{id}/vermerke/ki",
      "/api/cases/{id}/vermerke/{vermerkId}/review",
      "/api/mailbox",
      "/api/preferences",
      "/api/procedures",
      "/api/session",
      "/api/tasks/{id}",
      "/api/verfahren/{procedureId}/{version}/wissen",
      "/api/verfahren/{procedureId}/{version}/wissen/export",
      "/api/verfahren/{procedureId}/{version}/wissen/ki",
      "/api/verfahren/{procedureId}/{version}/wissen/{eintragId}/review",
    ]);
    const operations = Object.values(
      doc.paths as Record<string, Record<string, unknown>>,
    ).flatMap((path) => Object.keys(path));
    expect(operations.sort()).toEqual([
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "get",
      "patch",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "post",
      "put",
    ]);
  });

  it("public liefert weder das Dokument noch eine Doku-UI aus", async () => {
    const { publicApp } = await buildPair();
    for (const url of [
      "/internal/openapi.json",
      "/documentation",
      "/documentation/json",
    ]) {
      const response = await publicApp.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(404);
    }
  });

  it("untagged Routen erscheinen NICHT im Dokument (hideUntagged)", async () => {
    const { publicApp, internalApp } = await buildPair();
    publicApp.get("/ohne-tag", async () => ({ status: "ok" }));
    const response = await internalApp.inject({
      method: "GET",
      url: "/internal/openapi.json",
    });
    expect(Object.keys(response.json().paths)).not.toContain("/ohne-tag");
  });

  it("REIHENFOLGE-Vertrag: Collector NACH den Routen registriert → leeres Dokument", async () => {
    // Bricht laut, statt still ein leeres Dokument auszuliefern, wenn die
    // Komposition die Registrierungs-Reihenfolge kippt.
    const { internalApp } = await buildPair({ collectorFirst: false });
    const response = await internalApp.inject({
      method: "GET",
      url: "/internal/openapi.json",
    });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths ?? {})).toHaveLength(0);
  });
});
