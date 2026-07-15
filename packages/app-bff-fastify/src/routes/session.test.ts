// session.test — 200/401/403-Verträge von /api/session und /api/capabilities inkl.
// SecurityEvents in der MemoryAuditSink und der ErrorHandler-Kapselung des Plugins.
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryAuditSink } from "@senticor/app-runtime-fastify";
import {
  InMemoryAppStore,
  InMemoryCaseStore,
} from "@senticor/app-store-postgres";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";
import { appBff } from "../plugin.js";
import { buildBffApp, citizenSession, stubResolver } from "../test-helpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("GET /api/session", () => {
  it("liefert die SDK-RBAC-Sicht der Sitzung", async () => {
    ({ app } = await buildBffApp({ session: citizenSession() }));
    const response = await app.inject({ method: "GET", url: "/api/session" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      actorId: "actor-citizen",
      tenantId: "tenant-1",
      authorityId: "authority-1",
      jurisdictionId: "de",
      rbacRoles: ["citizen"],
    });
  });

  it("401 ohne Sitzung — mit Envelope und SecurityEvent", async () => {
    const built = await buildBffApp();
    app = built.app;
    const response = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { "x-request-id": "req-42" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "authentication required",
      requestId: "req-42",
    });
    expect(built.auditSink.events).toHaveLength(1);
    const event = built.auditSink.events[0];
    expect(event?.kind).toBe("security");
    expect(event?.event.eventType).toBe("bff.session.missing");
  });

  it("403 ohne session.read — mit SecurityEvent (severity warning, actorId)", async () => {
    const built = await buildBffApp({
      session: citizenSession({ rbacRoles: [] }),
    });
    app = built.app;
    const response = await app.inject({ method: "GET", url: "/api/session" });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("session.read");
    const event = built.auditSink.events[0];
    expect(event?.kind).toBe("security");
    expect(event?.event.eventType).toBe("bff.permission.denied");
    if (event?.kind === "security") {
      expect(event.event.severity).toBe("warning");
      expect(event.event.actorId).toBe("actor-citizen");
    }
  });

  it("eine unbekannte ZUSATZ-Rolle kostet keine Rechte und wirft nicht (fail-closed gefiltert)", async () => {
    ({ app } = await buildBffApp({
      session: citizenSession({ rbacRoles: ["citizen", "alien-role"] }),
    }));
    const response = await app.inject({ method: "GET", url: "/api/session" });
    expect(response.statusCode).toBe(200);
    expect(response.json().rbacRoles).toEqual(["citizen", "alien-role"]);
  });
});

describe("GET /api/capabilities", () => {
  it("liefert sortierte Permissions inkl. der neuen Mailbox-Schreibrechte", async () => {
    ({ app } = await buildBffApp({ session: citizenSession() }));
    const response = await app.inject({
      method: "GET",
      url: "/api/capabilities",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.rbacRoles).toEqual(["citizen"]);
    expect(body.permissions).toEqual([
      "mailbox.own.read",
      "mailbox.own.write",
      "preferences.read",
      "preferences.write",
      "session.read",
    ]);
  });

  it("caseworker erhält die authority-Schreibrechte", async () => {
    ({ app } = await buildBffApp({
      session: citizenSession({ rbacRoles: ["caseworker"] }),
    }));
    const response = await app.inject({
      method: "GET",
      url: "/api/capabilities",
    });
    expect(response.json().permissions).toContain("mailbox.authority.write");
    expect(response.json().permissions).not.toContain("mailbox.own.write");
  });

  it("unbekannte Rollen erscheinen in rbacRoles, aber ohne Permissions (kein 500)", async () => {
    ({ app } = await buildBffApp({
      session: citizenSession({ rbacRoles: ["citizen", "alien-role"] }),
    }));
    const response = await app.inject({
      method: "GET",
      url: "/api/capabilities",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().rbacRoles).toContain("alien-role");
    expect(response.json().permissions).toContain("session.read");
  });
});

describe("ErrorHandler-Kapselung", () => {
  it("Routen AUSSERHALB des Plugins behalten die Fastify-Standard-Fehlerform", async () => {
    const auditSink = new MemoryAuditSink();
    app = fastify({ logger: false });
    await app.register(appBff, {
      appStore: new InMemoryAppStore(),
      caseStore: new InMemoryCaseStore(),
      procedureRegistry: createInMemoryProcedureRegistry([]),
      sessionResolver: stubResolver(citizenSession()),
      auditSink,
    });
    app.get("/aussen/kaputt", async () => {
      throw new Error("boom");
    });
    const response = await app.inject({
      method: "GET",
      url: "/aussen/kaputt",
    });
    expect(response.statusCode).toBe(500);
    // Fastify-Standardform (statusCode/error/message) — NICHT unser Envelope.
    expect(response.json()).toMatchObject({ statusCode: 500 });
    expect(response.json()).not.toHaveProperty("requestId");
  });
});
