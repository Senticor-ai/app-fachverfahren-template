// bff-wiring.test — KOMPOSITIONS-Beweis der BFF-Verdrahtung: /api/session läuft über den
// ECHTEN Cookie/AuthStore-Flow (401 ohne Cookie, 200 mit geseedeter Session inkl.
// Rollen-Mapping), der ErrorHandler des BFF-Plugins bleibt gekapselt (App-Routen
// behalten ihre Fehlerform), und das OpenAPI-Dokument ist public 404 / intern 200.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAuditSink, NoopAuditSink } from "@senticor/app-runtime-fastify";
import {
  InMemoryAppStore,
  InMemoryAuthStore,
  type UserRole,
} from "@senticor/app-store-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashSessionToken } from "./auth/session-token.js";
import {
  buildInternalServer,
  buildPublicServer,
  readRuntimeConfig,
} from "./index.js";

async function seedUserWithSession(
  authStore: InMemoryAuthStore,
  actorId: string,
  role: UserRole,
  token: string,
): Promise<void> {
  const now = new Date().toISOString();
  await authStore.createUser({
    actorId,
    tenantId: "default",
    authorityId: "authority-1",
    jurisdictionId: "de",
    email: `${actorId}@example.org`,
    displayName: actorId,
    status: "active",
    role,
    localPersonas: [],
    oidcPersonas: [],
    personaManagementMode: "local",
    principalVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  await authStore.createSession({
    sessionIdHash: hashSessionToken(token),
    actorId,
    tenantId: "default",
    authorityId: "authority-1",
    jurisdictionId: "de",
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
  });
}

let staticDir: string;

beforeAll(async () => {
  staticDir = join(tmpdir(), `bff-wiring-${Date.now()}`);
  await mkdir(join(staticDir, "assets"), { recursive: true });
  await writeFile(
    join(staticDir, "index.html"),
    '<!doctype html><div id="root"></div>',
  );
});

afterAll(async () => {
  await rm(staticDir, { recursive: true, force: true });
});

describe("BFF-Verdrahtung im App-Server", () => {
  it("/api/session: 401 ohne Cookie, 200 mit echter Session inkl. Rollen-Mapping", async () => {
    const authStore = new InMemoryAuthStore();
    await seedUserWithSession(authStore, "actor-b", "citizen", "token-b");
    const auditSink = new MemoryAuditSink();
    const app = buildPublicServer({
      config: readRuntimeConfig({ STATIC_DIR: staticDir }),
      state: { startupComplete: true, shuttingDown: false },
      authStore,
      appStore: new InMemoryAppStore(),
      auditSink,
    });
    try {
      const anonym = await app.inject({ method: "GET", url: "/api/session" });
      expect(anonym.statusCode).toBe(401);
      expect(anonym.json()).toMatchObject({
        error: "authentication required",
      });
      expect(auditSink.events[0]?.event.eventType).toBe("bff.session.missing");

      const angemeldet = await app.inject({
        method: "GET",
        url: "/api/session",
        cookies: { app_session: "token-b" },
      });
      expect(angemeldet.statusCode).toBe(200);
      expect(angemeldet.json()).toEqual({
        actorId: "actor-b",
        tenantId: "default",
        authorityId: "authority-1",
        jurisdictionId: "de",
        rbacRoles: ["citizen"],
      });

      // Preferences über die volle Kette (Cookie → Session → Store).
      const preferences = await app.inject({
        method: "PUT",
        url: "/api/preferences",
        cookies: { app_session: "token-b" },
        payload: { colorScheme: "dark" },
      });
      expect(preferences.statusCode).toBe(200);
      expect(preferences.json().colorScheme).toBe("dark");
    } finally {
      await app.close();
    }
  });

  it("member wird auf caseworker gemappt und liest das behördliche Postfach", async () => {
    const authStore = new InMemoryAuthStore();
    await seedUserWithSession(authStore, "actor-m", "member", "token-m");
    const app = buildPublicServer({
      config: readRuntimeConfig({ STATIC_DIR: staticDir }),
      state: { startupComplete: true, shuttingDown: false },
      authStore,
      appStore: new InMemoryAppStore(),
      auditSink: new NoopAuditSink(),
    });
    try {
      const capabilities = await app.inject({
        method: "GET",
        url: "/api/capabilities",
        cookies: { app_session: "token-m" },
      });
      expect(capabilities.statusCode).toBe(200);
      expect(capabilities.json().rbacRoles).toEqual(["caseworker"]);
      expect(capabilities.json().permissions).toContain(
        "mailbox.authority.write",
      );

      const mailbox = await app.inject({
        method: "GET",
        url: "/api/mailbox?box=inbox&scope=authority",
        cookies: { app_session: "token-m" },
      });
      expect(mailbox.statusCode).toBe(200);
      expect(mailbox.json().messages).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("der BFF-ErrorHandler bleibt gekapselt — App-Routen behalten ihre Fehlerform", async () => {
    const app = buildPublicServer({
      config: readRuntimeConfig({ STATIC_DIR: staticDir }),
      state: { startupComplete: true, shuttingDown: false },
      authStore: new InMemoryAuthStore(),
      appStore: new InMemoryAppStore(),
      auditSink: new NoopAuditSink(),
    });
    try {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "wer@example.org", password: "falsch" },
      });
      // App-Fehlerform { error } ohne requestId — nicht der BFF-Envelope.
      expect(login.statusCode).toBe(401);
      expect(login.json()).toEqual({ error: "invalid credentials" });
    } finally {
      await app.close();
    }
  });

  it("OpenAPI: public 404, intern 200 mit allen BFF-Pfaden", async () => {
    const config = readRuntimeConfig({ STATIC_DIR: staticDir });
    const publicApp = buildPublicServer({
      config,
      state: { startupComplete: true, shuttingDown: false },
      authStore: new InMemoryAuthStore(),
      appStore: new InMemoryAppStore(),
      auditSink: new NoopAuditSink(),
    });
    const internalApp = buildInternalServer({
      config,
      publicServer: publicApp,
    });
    try {
      const onPublic = await publicApp.inject({
        method: "GET",
        url: "/internal/openapi.json",
      });
      expect(onPublic.statusCode).toBe(404);
      expect(onPublic.json()).toEqual({ status: "not-found" });

      const internal = await internalApp.inject({
        method: "GET",
        url: "/internal/openapi.json",
      });
      expect(internal.statusCode).toBe(200);
      expect(Object.keys(internal.json().paths).sort()).toEqual([
        "/api/ai/assist",
        "/api/buerger/antraege",
        "/api/buerger/antraege/{id}",
        "/api/buerger/antraege/{id}/bescheid",
        "/api/buerger/antraege/{id}/bescheid.pdf",
        "/api/buerger/antraege/{id}/nachweise",
        "/api/buerger/antraege/{id}/nachweise/{attachmentId}",
        "/api/buerger/antraege/{id}/rueckforderung/zahlung",
        "/api/buerger/antraege/{id}/widerspruch",
        "/api/capabilities",
        "/api/cases",
        "/api/cases/{id}",
        "/api/cases/{id}/allowed-actions",
        "/api/cases/{id}/approvals",
        "/api/cases/{id}/audit",
        "/api/cases/{id}/loeschung",
        "/api/cases/{id}/progress",
        "/api/cases/{id}/rechtsbehelf/entscheidung",
        "/api/cases/{id}/tasks",
        "/api/cases/{id}/transitions",
        "/api/cases/{id}/vermerke",
        "/api/cases/{id}/vermerke/export",
        "/api/cases/{id}/vermerke/ki",
        "/api/cases/{id}/vermerke/{vermerkId}/review",
        "/api/identity",
        "/api/identity/assurance",
        "/api/mailbox",
        "/api/payment",
        "/api/payment/{paymentId}",
        "/api/preferences",
        "/api/procedures",
        "/api/register/evidence",
        "/api/session",
        "/api/tasks/{id}",
        "/api/verfahren/{procedureId}/{version}/wissen",
        "/api/verfahren/{procedureId}/{version}/wissen/export",
        "/api/verfahren/{procedureId}/{version}/wissen/ki",
        "/api/verfahren/{procedureId}/{version}/wissen/{eintragId}/review",
        "/api/zustellung",
        "/api/zustellung/{deliveryId}",
      ]);
    } finally {
      await publicApp.close();
      await internalApp.close();
    }
  });
});
