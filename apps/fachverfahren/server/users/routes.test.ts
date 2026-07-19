import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../auth/routes.js";
import { registerUserRoutes } from "./routes.js";

const bootstrapBody = {
  token: "test-bootstrap-token",
  email: "admin@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Admin",
};

const memberBody = {
  email: "member@example.org",
  displayName: "Mitglied",
  initialPassword: "initial member password", // pragma: allowlist-secret
  personas: ["sachbearbeitung"],
};

async function setUp() {
  const authStore = new InMemoryAuthStore();
  const kanbanStore = new InMemoryKanbanStore();
  const auditStore = new InMemoryAuditStore();
  const app: FastifyInstance = fastify({ logger: false });
  await app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore,
    kanbanStore,
    auditStore,
    bootstrapToken: "test-bootstrap-token",
  });
  registerUserRoutes(app, { authStore, kanbanStore, auditStore });
  await app.ready();

  const bootstrapResponse = await app.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: bootstrapBody,
  });
  const adminCookie = extractCookie(bootstrapResponse);
  const adminActorId = bootstrapResponse.json().actorId as string;

  return { app, authStore, kanbanStore, auditStore, adminCookie, adminActorId };
}

async function loginCookie(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return extractCookie(response);
}

describe("user management routes", () => {
  let ctx: Awaited<ReturnType<typeof setUp>>;

  beforeEach(async () => {
    ctx = await setUp();
  });

  it("denies access without a session and for members", async () => {
    const anonymous = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/users",
    });
    expect(anonymous.statusCode).toBe(401);

    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const memberCookie = await loginCookie(
      ctx.app,
      memberBody.email,
      memberBody.initialPassword,
    );
    const asMember = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie: memberCookie },
    });
    expect(asMember.statusCode).toBe(403);
  });

  it("creates a member with credential, identity link, and a personal starter board", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    expect(created.statusCode).toBe(201);
    const payload = created.json();
    expect(payload.role).toBe("member");
    expect(payload.boardId).toBeTruthy();
    // Safe-Fields: niemals Passwort-/Credential-Daten in der Antwort.
    expect(JSON.stringify(payload)).not.toContain("password");

    // Login mit dem Initialpasswort funktioniert.
    const memberCookie = await loginCookie(
      ctx.app,
      memberBody.email,
      memberBody.initialPassword,
    );
    expect(memberCookie).toContain("app_session=");

    // Persönliches Starter-Board wurde geseedet.
    const boards = await ctx.kanbanStore.listBoards({
      tenantId: "default",
      actorId: payload.actorId,
    });
    const own = boards.filter(
      (board) => board.ownerActorId === payload.actorId,
    );
    expect(own).toHaveLength(1);
    expect(own[0]?.title).toBe("Mein Board");
    expect(own[0]?.visibility).toBe("personal");

    // Identity-Link des lokalen Providers existiert.
    expect(
      await ctx.authStore.findActorByIdentity({
        tenantId: "default",
        provider: "local",
        subject: payload.actorId,
      }),
    ).toBe(payload.actorId);
  });

  it("lists users without leaking credential fields", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
    });
    expect(list.statusCode).toBe(200);
    const users = list.json() as Array<Record<string, unknown>>;
    expect(users).toHaveLength(2);
    expect(users.map((user) => user["role"]).sort()).toEqual([
      "admin",
      "member",
    ]);
    expect(JSON.stringify(users)).not.toContain("passwordHash");
  });

  it("rejects duplicate emails case-insensitively and weak initial passwords", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const duplicate = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { ...memberBody, email: "MEMBER@example.org" },
    });
    expect(duplicate.statusCode).toBe(409);

    const weak = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: {
        ...memberBody,
        email: "other@example.org",
        initialPassword: "kurz",
      },
    });
    expect(weak.statusCode).toBe(400);

    const malformed = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { email: 42 },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it("disables a user: login refused AND the existing session dies immediately", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const memberActorId = created.json().actorId as string;
    const memberCookie = await loginCookie(
      ctx.app,
      memberBody.email,
      memberBody.initialPassword,
    );

    const disable = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${memberActorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { status: "disabled" },
    });
    expect(disable.statusCode).toBe(200);
    expect(disable.json().status).toBe("disabled");

    // Bestehende Session ist sofort widerrufen — nicht erst nach Session-TTL.
    const withOldSession = await ctx.app.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie: memberCookie },
    });
    expect(withOldSession.statusCode).toBe(401);

    const login = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: memberBody.email,
        password: memberBody.initialPassword,
      },
    });
    expect(login.statusCode).toBe(401);

    // Re-Aktivierung stellt den Zugang wieder her.
    await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${memberActorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { status: "active" },
    });
    const reLogin = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: memberBody.email,
        password: memberBody.initialPassword,
      },
    });
    expect(reLogin.statusCode).toBe(200);
  });

  it("normalizes emails: padded input creates the trimmed account, padded duplicate is a 409", async () => {
    const padded = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { ...memberBody, email: "  member@example.org  " },
    });
    expect(padded.statusCode).toBe(201);
    expect(padded.json().email).toBe("member@example.org");

    // Login mit der normalen (getrimmten) Adresse funktioniert.
    await loginCookie(ctx.app, memberBody.email, memberBody.initialPassword);

    const duplicate = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { ...memberBody, email: " member@example.org " },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it("maps only duplicate-email races to 409 — other persistence failures stay 5xx", async () => {
    const originalCreateUser = ctx.authStore.createUser.bind(ctx.authStore);
    ctx.authStore.createUser = async () => {
      throw new Error("relation app_users does not exist");
    };
    const brokenStore = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { ...memberBody, email: "other@example.org" },
    });
    expect(brokenStore.statusCode).toBe(500);
    ctx.authStore.createUser = originalCreateUser;
  });

  it("refuses self-disable and unknown actors", async () => {
    const self = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${ctx.adminActorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { status: "disabled" },
    });
    expect(self.statusCode).toBe(400);

    const unknown = await ctx.app.inject({
      method: "PATCH",
      url: "/api/v1/users/actor.unknown",
      headers: { cookie: ctx.adminCookie },
      payload: { status: "disabled" },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("audits every administrative action", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${created.json().actorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { status: "disabled" },
    });

    const events = await ctx.auditStore.listEvents({ tenantId: "default" });
    const types = events.map((event) => event.eventType);
    expect(types.filter((type) => type === "USER_CREATED")).toHaveLength(2); // Bootstrap + Member
    expect(types).toContain("USER_STATUS_CHANGED");
  });
});

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    throw new Error("expected a set-cookie header");
  }
  return value.split(";")[0] ?? "";
}

// Arbeitsbereiche (Personas) in der Benutzerverwaltung: PFLICHT bei der Anlage
// (fail-closed, keine stillen Defaults), atomarer PATCH über updateUserAccess mit
// optimistischer Nebenläufigkeit (If-Match) und Audit mit before/after.
describe("user management routes — Arbeitsbereiche", () => {
  let ctx: Awaited<ReturnType<typeof setUp>>;

  beforeEach(async () => {
    ctx = await setUp();
  });

  it("verlangt personas bei der Anlage (400 ohne / bei ungültigen Werten)", async () => {
    const { personas: _omit, ...withoutPersonas } = memberBody;
    const missing = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: withoutPersonas,
    });
    expect(missing.statusCode).toBe(400);

    // Personas sind OFFEN: ungueltig ist nur die FORM (kein Array / leere Strings), nicht der Wert.
    const invalid = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { ...memberBody, personas: "sachbearbeitung" },
    });
    expect(invalid.statusCode).toBe(400);

    // Eine VERFAHRENS-EIGENE Persona (z.B. `hausmeister`) ist jetzt GUELTIG (kein Enum-Filter mehr).
    const eigene = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: {
        ...memberBody,
        email: "eigene-persona@example.org",
        personas: ["hausmeister"],
      },
    });
    expect(eigene.statusCode).toBe(201);

    // Leeres Array ist GÜLTIG (Null-Arbeitsbereiche-Konto, z.B. Boards-only später).
    const empty = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: { ...memberBody, personas: [] },
    });
    expect(empty.statusCode).toBe(201);
    expect(empty.json().personas).toEqual([]);
  });

  it("liefert Arbeitsbereichs-Felder in Antworten und ändert sie atomar per PATCH", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    expect(created.statusCode).toBe(201);
    const actorId = created.json().actorId as string;
    expect(created.json()).toMatchObject({
      workspaceRole: "member",
      personas: ["sachbearbeitung"],
      localPersonas: ["sachbearbeitung"],
      oidcPersonas: [],
      personaManagementMode: "local",
      principalVersion: 1,
    });

    // Status UND Personas in EINEM Patch → GENAU ein Version-Bump.
    const patched = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${actorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { personas: ["buerger", "aufsicht"], status: "active" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().personas).toEqual(["buerger", "aufsicht"]);
    expect(patched.json().principalVersion).toBe(2);

    const events = await ctx.auditStore.listEvents({ tenantId: "default" });
    const personasChanged = events.find(
      (event) => event.eventType === "USER_PERSONAS_CHANGED",
    );
    expect(personasChanged?.metadata).toMatchObject({
      before: ["sachbearbeitung"],
      after: ["buerger", "aufsicht"],
      source: "local_admin",
    });
  });

  it("If-Match mit veralteter principalVersion → 409, keine Änderung", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const actorId = created.json().actorId as string;

    const stale = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${actorId}`,
      headers: { cookie: ctx.adminCookie, "if-match": '"99"' },
      payload: { personas: [] },
    });
    expect(stale.statusCode).toBe(409);

    const fresh = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${actorId}`,
      headers: { cookie: ctx.adminCookie, "if-match": '"1"' },
      payload: { personas: [] },
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().personas).toEqual([]);
  });

  it("verweigert lokale Persona-Pflege bei oidc_authoritative (409)", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const actorId = created.json().actorId as string;
    await ctx.authStore.updateUserAccess({
      tenantId: "default",
      actorId,
      patch: { personaManagementMode: "oidc_authoritative" },
    });

    const denied = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${actorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { personas: ["buerger"] },
    });
    expect(denied.statusCode).toBe(409);
  });

  it("identischer Persona-PATCH ist ein No-op: keine Version, kein Audit-Event", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { cookie: ctx.adminCookie },
      payload: memberBody,
    });
    const actorId = created.json().actorId as string;

    const noop = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/users/${actorId}`,
      headers: { cookie: ctx.adminCookie },
      payload: { personas: ["sachbearbeitung"] },
    });
    expect(noop.statusCode).toBe(200);
    expect(noop.json().principalVersion).toBe(1);

    const events = await ctx.auditStore.listEvents({ tenantId: "default" });
    expect(
      events.filter((event) => event.eventType === "USER_PERSONAS_CHANGED"),
    ).toHaveLength(0);
  });
});
