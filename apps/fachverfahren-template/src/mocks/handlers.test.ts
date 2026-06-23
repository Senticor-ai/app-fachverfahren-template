import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { defaultMockUserId } from "../../shared/mock-data.js";
import { resetMockSessionState } from "./handlers.js";
import { mockServer } from "./node.js";

beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  resetMockSessionState();
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});

describe("MSW session handlers", () => {
  it("supports login, welcome notifications, and logout", async () => {
    const loggedOut = await getJson("http://localhost/api/v1/session");
    expect(loggedOut).toMatchObject({ authenticated: false, user: null });

    const loginResponse = await fetch("http://localhost/api/v1/session/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: defaultMockUserId }),
    });
    expect(loginResponse.status).toBe(200);
    expect(await loginResponse.json()).toMatchObject({
      authenticated: true,
      user: { id: defaultMockUserId },
    });

    const notifications = await getJson(
      "http://localhost/api/v1/notifications",
    );
    expect(notifications).toMatchObject({
      notifications: expect.arrayContaining([
        expect.objectContaining({
          id: `welcome-${defaultMockUserId}`,
          severity: "success",
        }),
      ]),
    });

    const defaultPreferences = await getJson(
      "http://localhost/api/v1/me/preferences",
    );
    expect(defaultPreferences).toMatchObject({
      preferences: {
        actorId: defaultMockUserId,
        colorScheme: "light",
        accessibility: { largeText: false },
        navigation: { sidebarAutoExpand: true },
      },
    });

    const savedPreferences = await fetch(
      "http://localhost/api/v1/me/preferences",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          colorScheme: "dark",
          accessibility: { largeText: true },
          navigation: { sidebarAutoExpand: false },
        }),
      },
    );
    expect(savedPreferences.status).toBe(200);
    expect(await savedPreferences.json()).toMatchObject({
      preferences: {
        colorScheme: "dark",
        accessibility: { largeText: true },
        navigation: { sidebarAutoExpand: false },
      },
    });

    const citizenInbox = await getJson(
      "http://localhost/api/v1/me/posteingang",
    );
    expect(citizenInbox).toMatchObject({
      box: "inbox",
      audience: "citizen",
      messages: [expect.objectContaining({ messageId: "msg.citizen.inbox" })],
    });

    const forbiddenWorkInbox = await fetch(
      "http://localhost/api/v1/work/posteingang",
    );
    expect(forbiddenWorkInbox.status).toBe(403);

    const caseworkerLoginResponse = await fetch(
      "http://localhost/api/v1/session/login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: "caseworker-max-beispiel" }),
      },
    );
    expect(caseworkerLoginResponse.status).toBe(200);

    const forbiddenCitizenInbox = await fetch(
      "http://localhost/api/v1/me/posteingang",
    );
    expect(forbiddenCitizenInbox.status).toBe(403);

    const workInbox = await getJson("http://localhost/api/v1/work/posteingang");
    expect(workInbox).toMatchObject({
      box: "inbox",
      audience: "caseworker",
      messages: [
        expect.objectContaining({ messageId: "msg.caseworker.inbox" }),
      ],
    });

    const logoutResponse = await fetch(
      "http://localhost/api/v1/session/logout",
      { method: "POST" },
    );
    expect(logoutResponse.status).toBe(200);
    expect(await logoutResponse.json()).toMatchObject({
      authenticated: false,
      user: null,
    });
  });
});

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return response.json();
}
