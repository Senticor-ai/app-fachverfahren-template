import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { defaultMockUserId } from "../shared/mock-data.js";
import { buildApp } from "./app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("Fastify app", () => {
  it("serves health probes", async () => {
    app = await buildApp({ logger: false });
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, probe: "readiness" });
  });

  it("serves OpenAPI JSON", async () => {
    app = await buildApp({ logger: false });
    const response = await app.inject({
      method: "GET",
      url: "/api/openapi.json",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      openapi: expect.stringMatching(/^3/),
    });
  });

  it("serves optional mock session routes for integration tests", async () => {
    app = await buildApp({ enableMockAuth: true, logger: false });

    const initialSession = await app.inject({
      method: "GET",
      url: "/api/v1/session",
    });
    expect(initialSession.statusCode).toBe(200);
    expect(initialSession.json()).toMatchObject({
      authenticated: false,
      user: null,
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/session/login",
      payload: { userId: defaultMockUserId },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      authenticated: true,
      user: { id: defaultMockUserId },
    });

    const notifications = await app.inject({
      method: "GET",
      url: "/api/v1/notifications",
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json()).toMatchObject({
      notifications: expect.arrayContaining([
        expect.objectContaining({ id: `welcome-${defaultMockUserId}` }),
      ]),
    });

    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/session/logout",
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toMatchObject({
      authenticated: false,
      user: null,
    });
  });
});
