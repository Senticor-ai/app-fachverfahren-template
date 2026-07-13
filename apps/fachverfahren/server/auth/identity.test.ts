import { InMemoryAuthStore } from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { resolveActorForIdentity } from "./identity.js";

function makeUser(actorId: string, tenantId = "default") {
  const now = new Date().toISOString();
  return {
    actorId,
    tenantId,
    authorityId: "default",
    jurisdictionId: "de",
    email: `${actorId}@example.org`,
    displayName: actorId,
    status: "active" as const,
    role: "member" as const,
    localPersonas: [],
    oidcPersonas: [],
    personaManagementMode: "local" as const,
    principalVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe("resolveActorForIdentity", () => {
  it("resolves a linked external identity to its application actor", async () => {
    const authStore = new InMemoryAuthStore();
    await authStore.createUser(makeUser("actor.1"));
    await authStore.linkIdentity({
      tenantId: "default",
      provider: "oidc:keycloak.example",
      subject: "sub-abc",
      actorId: "actor.1",
    });

    expect(
      await resolveActorForIdentity(authStore, {
        tenantId: "default",
        provider: "oidc:keycloak.example",
        subject: "sub-abc",
      }),
    ).toBe("actor.1");
  });

  it("does NOT auto-provision unknown external identities (documented policy)", async () => {
    const authStore = new InMemoryAuthStore();
    expect(
      await resolveActorForIdentity(authStore, {
        tenantId: "default",
        provider: "oidc:keycloak.example",
        subject: "sub-unknown",
      }),
    ).toBeUndefined();
  });

  it("keeps tenants isolated: the same subject in another tenant does not resolve", async () => {
    const authStore = new InMemoryAuthStore();
    await authStore.createUser(makeUser("actor.1", "tenant.a"));
    await authStore.linkIdentity({
      tenantId: "tenant.a",
      provider: "oidc:keycloak.example",
      subject: "sub-abc",
      actorId: "actor.1",
    });

    expect(
      await resolveActorForIdentity(authStore, {
        tenantId: "tenant.b",
        provider: "oidc:keycloak.example",
        subject: "sub-abc",
      }),
    ).toBeUndefined();
  });
});
