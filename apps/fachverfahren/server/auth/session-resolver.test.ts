// session-resolver.test — der Cookie-SessionResolver bindet die BFF-Naht an den ECHTEN
// Auth-Flow: Session-Cookie → AuthStore-Session → Konto (live pro Request) →
// Workspace-Rolle auf SDK-RBAC-Rollen gemappt (citizen→citizen, member/admin→caseworker).
// Deny-by-default: fehlendes Cookie, unbekannter Hash, inaktives oder fehlendes Konto → null.
import type { FastifyRequest } from "fastify";
import { InMemoryAuthStore, type UserRole } from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "./constants.js";
import { createCookieSessionResolver } from "./session-resolver.js";
import { hashSessionToken } from "./session-token.js";

function makeUser(actorId: string, role: UserRole) {
  const now = new Date().toISOString();
  return {
    actorId,
    tenantId: "default",
    authorityId: "authority-1",
    jurisdictionId: "de",
    email: `${actorId}@example.org`,
    displayName: actorId,
    status: "active" as const,
    role,
    localPersonas: [],
    oidcPersonas: [],
    personaManagementMode: "local" as const,
    principalVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

async function seedSession(
  authStore: InMemoryAuthStore,
  actorId: string,
  token: string,
) {
  await authStore.createSession({
    sessionIdHash: hashSessionToken(token),
    actorId,
    tenantId: "default",
    authorityId: "authority-1",
    jurisdictionId: "de",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
  });
}

function requestWithCookie(token?: string): FastifyRequest {
  return {
    cookies: token ? { [SESSION_COOKIE_NAME]: token } : {},
  } as unknown as FastifyRequest;
}

describe("createCookieSessionResolver", () => {
  it.each([
    ["citizen", ["citizen"]],
    ["member", ["caseworker"]],
    ["admin", ["caseworker"]],
  ] as const)(
    "mappt Workspace-Rolle %s auf SDK-RBAC-Rollen %j",
    async (role, expectedRoles) => {
      const authStore = new InMemoryAuthStore();
      await authStore.createUser(makeUser("actor-1", role));
      await seedSession(authStore, "actor-1", "token-1");
      const resolver = createCookieSessionResolver(authStore);

      const session = await resolver.resolve(requestWithCookie("token-1"));
      expect(session).toEqual({
        actorId: "actor-1",
        tenantId: "default",
        authorityId: "authority-1",
        jurisdictionId: "de",
        rbacRoles: expectedRoles,
      });
    },
  );

  it("liefert null ohne Cookie und bei unbekanntem Token", async () => {
    const authStore = new InMemoryAuthStore();
    const resolver = createCookieSessionResolver(authStore);
    expect(await resolver.resolve(requestWithCookie())).toBeNull();
    expect(await resolver.resolve(requestWithCookie("unbekannt"))).toBeNull();
  });

  it("liefert null für widerrufene Sessions und deaktivierte Konten (live pro Request)", async () => {
    const authStore = new InMemoryAuthStore();
    await authStore.createUser(makeUser("actor-1", "citizen"));
    await seedSession(authStore, "actor-1", "token-1");
    const resolver = createCookieSessionResolver(authStore);
    expect(await resolver.resolve(requestWithCookie("token-1"))).not.toBeNull();

    await authStore.updateUserStatus({
      tenantId: "default",
      actorId: "actor-1",
      status: "disabled",
    });
    expect(await resolver.resolve(requestWithCookie("token-1"))).toBeNull();

    await authStore.revokeSession(hashSessionToken("token-1"));
    expect(await resolver.resolve(requestWithCookie("token-1"))).toBeNull();
  });

  it("liefert null, wenn das Konto zur Session fehlt", async () => {
    const authStore = new InMemoryAuthStore();
    await seedSession(authStore, "actor-geist", "token-1");
    const resolver = createCookieSessionResolver(authStore);
    expect(await resolver.resolve(requestWithCookie("token-1"))).toBeNull();
  });
});
