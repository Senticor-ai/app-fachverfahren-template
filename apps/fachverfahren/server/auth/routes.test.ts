import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
  UnavailableAuthStore,
} from "@senticor/app-store-postgres";
import fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { createRequirePrincipal } from "./require-principal.js";
import { registerAuthRoutes } from "./routes.js";

// No default parameter values here: `setUp(undefined)` must mean "no
// bootstrap token configured", not silently fall back to a default — a
// default parameter triggers on an explicit `undefined` argument too and
// would mask exactly the case one of the tests below needs to exercise.
function buildTestApp(bootstrapToken: string | undefined) {
  const authStore = new InMemoryAuthStore();
  const kanbanStore = new InMemoryKanbanStore();
  const auditStore = new InMemoryAuditStore();
  const app: FastifyInstance = fastify({ logger: false });

  return { app, authStore, kanbanStore, auditStore, bootstrapToken };
}

async function setUp(bootstrapToken: string | undefined) {
  const { app, authStore, kanbanStore, auditStore } =
    buildTestApp(bootstrapToken);
  await app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore,
    kanbanStore,
    auditStore,
    bootstrapToken,
  });

  const requirePrincipal = createRequirePrincipal(authStore);
  app.get(
    "/__test/protected",
    { preHandler: requirePrincipal },
    async (request) => ({ actorId: request.principal?.actorId }),
  );

  await app.ready();
  return { app, authStore, kanbanStore, auditStore };
}

const bootstrapBody = {
  token: "test-bootstrap-token",
  email: "admin@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Admin",
};

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    ({ app } = await setUp("test-bootstrap-token"));
  });

  it("reports not-bootstrapped status before setup", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ bootstrapped: false });
  });

  it("rejects bootstrap with a wrong token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { ...bootstrapBody, token: "wrong" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("bootstraps, sets a session cookie, and reports bootstrapped afterward", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers["set-cookie"]).toBeDefined();
    expect(String(response.headers["set-cookie"])).toContain("HttpOnly");

    const status = await app.inject({ method: "GET", url: "/auth/status" });
    expect(status.json()).toMatchObject({ bootstrapped: true });
  });

  it("refuses a second bootstrap attempt", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    const second = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: { ...bootstrapBody, email: "second@example.org" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("serializes CONCURRENT bootstrap attempts — exactly one succeeds", async () => {
    // Ohne Lock sähen beide Requests `countUsers() === 0` und legten zwei Erstbenutzer an.
    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: bootstrapBody,
      }),
      app.inject({
        method: "POST",
        url: "/auth/bootstrap",
        payload: { ...bootstrapBody, email: "rival@example.org" },
      }),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
  });

  it("grants access to a protected route using the bootstrap session cookie", async () => {
    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    const cookie = extractCookie(bootstrapResponse);

    const protectedResponse = await app.inject({
      method: "GET",
      url: "/__test/protected",
      headers: { cookie },
    });
    expect(protectedResponse.statusCode).toBe(200);
    expect(protectedResponse.json().actorId).toBeTruthy();
  });

  it("denies the protected route without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/__test/protected",
    });
    expect(response.statusCode).toBe(401);
  });

  it("logs in with correct credentials after bootstrap and denies wrong credentials", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });

    const wrongLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: bootstrapBody.email, password: "totally-wrong" }, // pragma: allowlist-secret
    });
    expect(wrongLogin.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: bootstrapBody.email,
        password: bootstrapBody.password,
      },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeDefined();
  });

  it("logs out and revokes the session so the protected route becomes inaccessible again", async () => {
    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    const cookie = extractCookie(bootstrapResponse);

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/__test/protected",
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("reports the current principal from GET /auth/session", async () => {
    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    const cookie = extractCookie(bootstrapResponse);

    const session = await app.inject({
      method: "GET",
      url: "/auth/session",
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    const principal = session.json();
    expect(principal.email).toBe(bootstrapBody.email);
    // Frontend-Guards autorisieren NUR über Permissions; workspaceRole ist Anzeige
    // (`role` bleibt EIN Release als deprecated Alias erhalten).
    expect(principal.workspaceRole).toBe("admin");
    expect(principal.role).toBe("admin");
    expect(principal.permissions).toContain("users.manage");
    // Personas = Arbeitsbereiche (Erlebnis): der Bootstrap-Admin bekommt explizit alle drei.
    expect(principal.personas).toEqual([
      "buerger",
      "sachbearbeitung",
      "aufsicht",
    ]);
    expect(principal.personaManagementMode).toBe("local");
    expect(principal.principalVersion).toBe(1);
    expect(principal.tenantId).toBe("default");
    expect(principal.identity).toEqual({
      provider: "local",
      subject: principal.actorId,
    });
    expect(principal.account).toMatchObject({
      email: bootstrapBody.email,
      status: "active",
    });
  });

  it("advertises schema capabilities and the registration mode on GET /auth/status", async () => {
    const status = await app.inject({ method: "GET", url: "/auth/status" });
    expect(status.statusCode).toBe(200);
    const body = status.json();
    // Capability-Anzeige statt Client-Konstante: meldet der Server userPersonas und das
    // personas-Feld fehlt trotzdem, fällt der Client auf LEER zurück (fail closed) —
    // nur ein ALTER Server ohne Capability bekommt den Alle-drei-Fallback.
    expect(body.sessionSchemaVersion).toBe(2);
    expect(body.capabilities).toEqual({ userPersonas: true });
    // Registrierung ist ohne explizite Konfiguration AUS.
    expect(body.registration).toBe("disabled");
  });
});

describe("auth routes — password change", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    ({ app } = await setUp("test-bootstrap-token"));
    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    cookie = extractCookie(bootstrapResponse);
  });

  it("requires a session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/password",
      payload: { currentPassword: "x", newPassword: "y" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects weak new passwords and wrong current passwords", async () => {
    const weak = await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: { cookie },
      payload: { currentPassword: bootstrapBody.password, newPassword: "kurz" },
    });
    expect(weak.statusCode).toBe(400);

    const wrongCurrent = await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: { cookie },
      payload: {
        currentPassword: "definitely-not-it", // pragma: allowlist-secret
        newPassword: "another correct horse battery", // pragma: allowlist-secret
      },
    });
    expect(wrongCurrent.statusCode).toBe(403);
  });

  it("locks the account after repeated wrong current passwords (stolen-session guessing)", async () => {
    // Eine gestohlene Session darf currentPassword nicht unbegrenzt raten:
    // derselbe Failure-/Lockout-Pfad wie beim Login (Codex-Review PR #27, Runde 2).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/password",
        headers: { cookie },
        payload: {
          currentPassword: `wrong-guess-${attempt}`,
          newPassword: "another correct horse battery", // pragma: allowlist-secret
        },
      });
      expect(response.statusCode).toBe(403);
    }

    const locked = await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: { cookie },
      payload: {
        currentPassword: bootstrapBody.password,
        newPassword: "another correct horse battery", // pragma: allowlist-secret
      },
    });
    expect(locked.statusCode).toBe(423);

    // Auch der Login ist jetzt gesperrt — ein gemeinsamer Zähler, kein Nebeneingang.
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: bootstrapBody.email,
        password: bootstrapBody.password,
      },
    });
    expect(login.statusCode).toBe(423);
  });

  it("changes the password: old stops working, new works", async () => {
    const newPassword = "another correct horse battery"; // pragma: allowlist-secret
    const change = await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: { cookie },
      payload: { currentPassword: bootstrapBody.password, newPassword },
    });
    expect(change.statusCode).toBe(204);

    const oldLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: bootstrapBody.email,
        password: bootstrapBody.password,
      },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: bootstrapBody.email, password: newPassword },
    });
    expect(newLogin.statusCode).toBe(200);
  });
});

describe("auth routes — audit trail", () => {
  it("writes audit events for bootstrap, successful and failed logins", async () => {
    const { app, auditStore } = await setUp("test-bootstrap-token");
    await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: bootstrapBody.email, password: "totally-wrong" }, // pragma: allowlist-secret
    });
    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: bootstrapBody.email,
        password: bootstrapBody.password,
      },
    });

    const events = await auditStore.listEvents({ tenantId: "default" });
    const types = events.map((event) => event.eventType);
    expect(types).toContain("USER_CREATED");
    expect(types).toContain("LOGIN_FAILED");
    expect(types).toContain("LOGIN_SUCCESS");
  });

  it("audits successful password changes", async () => {
    const { app, auditStore } = await setUp("test-bootstrap-token");
    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    const cookie = extractCookie(bootstrapResponse);
    await app.inject({
      method: "POST",
      url: "/auth/password",
      headers: { cookie },
      payload: {
        currentPassword: bootstrapBody.password,
        newPassword: "another correct horse battery", // pragma: allowlist-secret
      },
    });
    const events = await auditStore.listEvents({ tenantId: "default" });
    expect(events.map((event) => event.eventType)).toContain(
      "PASSWORD_CHANGED",
    );
  });
});

describe("auth routes — bootstrap disabled (no BOOTSTRAP_TOKEN configured)", () => {
  it("refuses bootstrap entirely when no token is configured", async () => {
    const { app } = await setUp(undefined);
    const response = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("auth routes — auth store unavailable (no APP_PG_URL)", () => {
  // Ohne Datenbank antwortet /auth/status bewusst degradiert (200 + storeAvailable=false)
  // statt 500: Web-Tier oben, Datenbank unten. Der Client behandelt das wie „API nicht
  // erreichbar" (session-state.ts), und der Browser loggt keinen Ressourcen-Fehler —
  // der hermetische PWA-Browser-Audit läuft genau in diesem Zustand gegen die Landing.
  it("reports storeAvailable=false with 200 instead of throwing", async () => {
    const app: FastifyInstance = fastify({ logger: false });
    await app.register(fastifyCookie);
    registerAuthRoutes(app, {
      authStore: new UnavailableAuthStore("db down"),
      kanbanStore: new InMemoryKanbanStore(),
      auditStore: new InMemoryAuditStore(),
      bootstrapToken: undefined,
    });
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/auth/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bootstrapped: false,
      storeAvailable: false,
    });
    await app.close();
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

// Self-Signup (Phase D): default AUS; `open_unverified` heißt ehrlich so, bis
// E-Mail-Verifikation existiert. Anti-Enumeration: identische neutrale Antwort für
// neue UND vergebene Adressen, KEIN Auto-Login (kein Cookie) — Existenz von Konten
// ist von außen nicht ablesbar. Tenant kommt NIE aus dem Request-Body.
describe("auth routes — POST /auth/register", () => {
  const registerBody = {
    email: "neu@example.org",
    displayName: "Neue Bürger:in",
    password: "citizen register pw", // pragma: allowlist-secret
  };

  async function setUpOpen() {
    const { app, authStore, kanbanStore, auditStore } = buildTestApp(
      "test-bootstrap-token",
    );
    await app.register(fastifyCookie);
    registerAuthRoutes(app, {
      authStore,
      kanbanStore,
      auditStore,
      bootstrapToken: "test-bootstrap-token",
      registrationMode: "open_unverified",
    });
    await app.ready();
    return { app, authStore, auditStore };
  }

  it("ist ohne Konfiguration deaktiviert (403) und auditierbar", async () => {
    const { app } = await setUp("test-bootstrap-token");
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: registerBody,
    });
    expect(response.statusCode).toBe(403);
  });

  it("legt im open_unverified-Modus ein citizen-Konto mit Arbeitsbereich buerger an — neutral, ohne Auto-Login", async () => {
    const { app, authStore, auditStore } = await setUpOpen();
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: registerBody,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const message = response.json().message as string;
    expect(message).toContain("Anmeldung");

    const user = await authStore.getUserByEmail({
      tenantId: "default",
      email: registerBody.email,
    });
    expect(user?.role).toBe("citizen");
    expect(user?.localPersonas).toEqual(["buerger"]);
    expect(user?.personaManagementMode).toBe("local");
    // Danach normaler Login mit den registrierten Zugangsdaten.
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: registerBody.email, password: registerBody.password },
    });
    expect(login.statusCode).toBe(200);

    const events = await auditStore.listEvents({ tenantId: "default" });
    const created = events.find((event) => event.eventType === "USER_CREATED");
    expect(created?.metadata).toMatchObject({ selfSignup: true });
  });

  it("antwortet für eine bereits vergebene E-Mail IDENTISCH neutral (Anti-Enumeration)", async () => {
    const { app } = await setUpOpen();
    const first = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: registerBody,
    });
    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...registerBody, displayName: "Doppelt" },
    });
    expect(second.statusCode).toBe(first.statusCode);
    expect(second.body).toBe(first.body);
    expect(second.headers["set-cookie"]).toBeUndefined();
  });

  it("weist zu kurze Passwörter und überlange Eingaben ab (Caps vor argon2)", async () => {
    const { app } = await setUpOpen();
    const short = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...registerBody, password: "kurz" },
    });
    expect(short.statusCode).toBe(400);

    const oversized = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...registerBody, password: "x".repeat(300) },
    });
    expect(oversized.statusCode).toBe(400);

    const longEmail = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...registerBody, email: `${"a".repeat(255)}@example.org` },
    });
    expect(longEmail.statusCode).toBe(400);
  });

  it("ignoriert einen tenantId-Versuch im Body (Tenant kommt aus dem Deployment-Kontext)", async () => {
    const { app, authStore } = await setUpOpen();
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { ...registerBody, tenantId: "tenant.evil" },
    });
    expect(
      await authStore.getUserByEmail({
        tenantId: "default",
        email: registerBody.email,
      }),
    ).toBeDefined();
    expect(
      await authStore.getUserByEmail({
        tenantId: "tenant.evil",
        email: registerBody.email,
      }),
    ).toBeUndefined();
  });

  it("drosselt wiederholte Registrierungsversuche derselben Quelle (429)", async () => {
    const { app } = await setUpOpen();
    let limited = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { ...registerBody, email: `probe-${attempt}@example.org` },
      });
      if (response.statusCode === 429) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });
});
