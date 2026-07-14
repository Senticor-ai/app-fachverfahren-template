// preferences.test — GET/PUT /api/preferences: Defaults, partieller Merge mit genau
// EINEM AppDataAuditEvent, 400 ohne Audit-Event, Kontext-Override-Abwehr, 403 ohne
// Write-Permission und 503 bei nicht verfügbarem Store.
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { UnavailableAppStore } from "@senticor/app-store-postgres";
import { buildBffApp, citizenSession } from "../test-helpers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("GET /api/preferences", () => {
  it("liefert die Default-Einstellungen aus dem InMemory-Store", async () => {
    ({ app } = await buildBffApp({ session: citizenSession() }));
    const response = await app.inject({
      method: "GET",
      url: "/api/preferences",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.actorId).toBe("actor-citizen");
    expect(body.tenantId).toBe("tenant-1");
    expect(body.colorScheme).toBe("light");
    expect(body.accessibility.highContrast).toBe(false);
    expect(body.navigation.sidebarAutoExpand).toBe(true);
  });

  it("503 mit Envelope, wenn der Store nicht verfügbar ist", async () => {
    const built = await buildBffApp({
      session: citizenSession(),
      appStore: new UnavailableAppStore("APP_PG_URL fehlt"),
    });
    app = built.app;
    const response = await app.inject({
      method: "GET",
      url: "/api/preferences",
      headers: { "x-request-id": "req-503" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "app data storage unavailable",
      requestId: "req-503",
    });
  });
});

describe("PUT /api/preferences", () => {
  it("merged partiell und emittiert genau EIN AppDataAuditEvent", async () => {
    const built = await buildBffApp({ session: citizenSession() });
    app = built.app;
    const response = await app.inject({
      method: "PUT",
      url: "/api/preferences",
      headers: { "x-request-id": "req-7" },
      payload: { colorScheme: "dark", accessibility: { largeText: true } },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.colorScheme).toBe("dark");
    expect(body.accessibility.largeText).toBe(true);
    // Nicht angefasste Felder bleiben Default.
    expect(body.accessibility.highContrast).toBe(false);
    expect(body.navigation.sidebarAutoExpand).toBe(true);

    const appDataEvents = built.auditSink.events.filter(
      (event) => event.kind === "app-data",
    );
    expect(appDataEvents).toHaveLength(1);
    const event = appDataEvents[0];
    if (event?.kind === "app-data") {
      expect(event.event.eventType).toBe("preferences.updated");
      expect(event.event.actorId).toBe("actor-citizen");
      expect(event.event.tenantId).toBe("tenant-1");
      expect(event.event.requestId).toBe("req-7");
      expect(event.event.resource).toEqual({
        type: "preferences",
        id: "actor-citizen",
      });
    }
  });

  it("400 mit Envelope bei ungültigem Body — OHNE Audit-Event", async () => {
    const built = await buildBffApp({ session: citizenSession() });
    app = built.app;
    for (const payload of [
      { colorScheme: "neon" },
      { accessibility: { largeText: "ja" } },
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: "/api/preferences",
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json().error).toBe("invalid request");
    }
    expect(
      built.auditSink.events.filter((event) => event.kind === "app-data"),
    ).toHaveLength(0);
  });

  it("Kontext-Override im Body wird GESTRIPPT — tenant bleibt der der Sitzung", async () => {
    // Fastifys Ajv-Default (removeAdditional) entfernt unbekannte Felder statt 400:
    // additionalProperties:false wirkt hier als Strip-Politik. Der Kontext kommt
    // ohnehin NUR aus der Sitzung — der Versuch bleibt wirkungslos.
    const built = await buildBffApp({ session: citizenSession() });
    app = built.app;
    const response = await app.inject({
      method: "PUT",
      url: "/api/preferences",
      payload: { colorScheme: "dark", tenantId: "fremd", actorId: "fremd" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tenantId).toBe("tenant-1");
    expect(response.json().actorId).toBe("actor-citizen");
  });

  it("403 ohne preferences.write — Schreiben reitet nicht auf Leserechten", async () => {
    const built = await buildBffApp({
      // Kunst-Rolle nur mit Leserechten: eigene Registry wäre schwerer — leere
      // Rollen reichen, um den Write-Guard zu beweisen (GET wäre ebenfalls 403).
      session: citizenSession({ rbacRoles: [] }),
    });
    app = built.app;
    const response = await app.inject({
      method: "PUT",
      url: "/api/preferences",
      payload: { colorScheme: "dark" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("preferences.write");
  });

  it("503 bei nicht verfügbarem Store — ohne AppDataAuditEvent", async () => {
    const built = await buildBffApp({
      session: citizenSession(),
      appStore: new UnavailableAppStore("APP_PG_URL fehlt"),
    });
    app = built.app;
    const response = await app.inject({
      method: "PUT",
      url: "/api/preferences",
      payload: { colorScheme: "dark" },
    });
    expect(response.statusCode).toBe(503);
    expect(
      built.auditSink.events.filter((event) => event.kind === "app-data"),
    ).toHaveLength(0);
  });
});
