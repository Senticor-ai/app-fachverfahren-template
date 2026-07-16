import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAttachmentStore,
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryCaseStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../auth/routes.js";
import { registerCaseRoutes } from "./routes.js";

const bootstrapBody = {
  token: "test-bootstrap-token",
  email: "caseowner@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Case Owner",
};

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    throw new Error("expected a set-cookie header");
  }
  return value.split(";")[0] ?? "";
}

async function setUp() {
  const authStore = new InMemoryAuthStore();
  const kanbanStore = new InMemoryKanbanStore();
  const auditStore = new InMemoryAuditStore();
  const caseStore = new InMemoryCaseStore();
  const attachmentStore = new InMemoryAttachmentStore();
  const app: FastifyInstance = fastify({ logger: false });
  await app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore,
    kanbanStore,
    auditStore,
    bootstrapToken: "test-bootstrap-token",
  });
  registerCaseRoutes(app, {
    authStore,
    caseStore,
    attachmentStore,
  });
  await app.ready();

  const bootstrapResponse = await app.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: bootstrapBody,
  });
  expect(bootstrapResponse.statusCode).toBe(201);
  const cookie = extractCookie(bootstrapResponse);
  return { app, caseStore, cookie };
}

describe("case routes", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    ({ app, cookie } = await setUp());
  });

  it("returns 401 without session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/cases" });
    expect(res.statusCode).toBe(401);
  });

  it("creates and lists cases", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/cases",
      headers: {
        cookie,
        "idempotency-key": "create-1",
      },
      payload: {
        antragsdaten: { anliegen: { kategorie: "standard" } },
        tenantId: "evil",
      },
    });
    expect(created.statusCode).toBe(400);

    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/cases",
      headers: {
        cookie,
        "idempotency-key": "create-2",
      },
      payload: {
        antragsdaten: { anliegen: { kategorie: "standard" } },
      },
    });
    expect(ok.statusCode).toBe(201);
    const body = ok.json();
    expect(body.status).toBe("eingegangen");

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/cases",
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items.length).toBeGreaterThanOrEqual(1);

    const got = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${body.id}`,
      headers: { cookie },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(body.id);
  });

  it("transitions with expectedVersion and rejects client actorId", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/cases",
      headers: { cookie, "idempotency-key": "t-create" },
      payload: { antragsdaten: { anliegen: { kategorie: "express" } } },
    });
    const caseBody = created.json();

    const bad = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${caseBody.id}/transitions`,
      headers: { cookie, "idempotency-key": "t-bad" },
      payload: {
        eventName: "start-pruefung",
        expectedVersion: caseBody.version,
        actorId: "someone-else",
      },
    });
    expect(bad.statusCode).toBe(400);

    const transition = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${caseBody.id}/transitions`,
      headers: { cookie, "idempotency-key": "t-ok" },
      payload: {
        eventName: "start-pruefung",
        expectedVersion: caseBody.version,
        rolle: "sachbearbeitung",
      },
    });
    expect(transition.statusCode).toBe(200);
    expect(transition.json().status).toBe("in_pruefung");

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${caseBody.id}/transitions`,
      headers: { cookie, "idempotency-key": "t-stale" },
      payload: {
        eventName: "festsetzen",
        expectedVersion: caseBody.version,
      },
    });
    expect(stale.statusCode).toBe(409);
  });

  it("returns 503 when case store unavailable", async () => {
    const authStore = new InMemoryAuthStore();
    const kanbanStore = new InMemoryKanbanStore();
    const auditStore = new InMemoryAuditStore();
    const { UnavailableCaseStore } =
      await import("@senticor/app-store-postgres");
    const app2 = fastify({ logger: false });
    await app2.register(fastifyCookie);
    registerAuthRoutes(app2, {
      authStore,
      kanbanStore,
      auditStore,
      bootstrapToken: "test-bootstrap-token",
    });
    registerCaseRoutes(app2, {
      authStore,
      caseStore: new UnavailableCaseStore("db down"),
    });
    await app2.ready();
    const boot = await app2.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: {
        ...bootstrapBody,
        email: "unavail@example.org",
      },
    });
    const c = extractCookie(boot);
    const res = await app2.inject({
      method: "GET",
      url: "/api/v1/cases",
      headers: { cookie: c },
    });
    expect(res.statusCode).toBe(503);
    await app2.close();
  });
});
