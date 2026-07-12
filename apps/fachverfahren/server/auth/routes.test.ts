import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
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
    expect(response.json()).toEqual({ bootstrapped: false });
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
    expect(status.json()).toEqual({ bootstrapped: true });
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
    expect(session.json().email).toBe(bootstrapBody.email);
    // Frontend-Guards brauchen Rolle + Permissions aus dem App-Identity-Modell.
    expect(session.json().role).toBe("admin");
    expect(session.json().permissions).toContain("users.manage");
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

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    throw new Error("expected a set-cookie header");
  }
  return value.split(";")[0] ?? "";
}
