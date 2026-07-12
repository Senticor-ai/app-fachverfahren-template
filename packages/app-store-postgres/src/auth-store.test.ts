import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  type LocalCredential,
  type UserAccount,
} from "./auth-store.js";

function makeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  const now = new Date().toISOString();
  return {
    actorId: "actor.1",
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    email: "admin@example.org",
    displayName: "Admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCredential(
  overrides: Partial<LocalCredential> = {},
): LocalCredential {
  const now = new Date().toISOString();
  return {
    actorId: "actor.1",
    passwordHash: "argon2id$fake-hash",
    hashAlgo: "argon2id",
    passwordChangedAt: now,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("InMemoryAuthStore — users", () => {
  it("creates and looks up a user by email, case-insensitively, scoped by tenant", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());

    const byEmail = await store.getUserByEmail({
      tenantId: "tenant.local",
      email: "ADMIN@Example.org",
    });
    expect(byEmail?.actorId).toBe("actor.1");

    const wrongTenant = await store.getUserByEmail({
      tenantId: "tenant.other",
      email: "admin@example.org",
    });
    expect(wrongTenant).toBeUndefined();
  });

  it("counts users per tenant, the signal the bootstrap route uses to refuse a second bootstrap", async () => {
    const store = new InMemoryAuthStore();
    expect(await store.countUsers({ tenantId: "tenant.local" })).toBe(0);

    await store.createUser(makeUser());
    expect(await store.countUsers({ tenantId: "tenant.local" })).toBe(1);
    expect(await store.countUsers({ tenantId: "tenant.other" })).toBe(0);
  });
});

describe("InMemoryAuthStore — local credentials", () => {
  it("tracks failed login attempts and resets them", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.createLocalCredential(makeCredential());

    await store.recordLoginFailure("actor.1");
    const afterOneFailure = await store.recordLoginFailure("actor.1");
    expect(afterOneFailure.failedAttempts).toBe(2);

    const reset = await store.resetLoginFailures("actor.1");
    expect(reset.failedAttempts).toBe(0);
    expect(reset.lockedUntil).toBeNull();
  });

  it("persists and clears an explicit account lock", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.createLocalCredential(makeCredential());

    const locked = await store.setAccountLock(
      "actor.1",
      "2026-07-11T10:15:00.000Z",
    );
    expect(locked.lockedUntil).toBe("2026-07-11T10:15:00.000Z");

    const unlocked = await store.setAccountLock("actor.1", null);
    expect(unlocked.lockedUntil).toBeNull();
  });
});

describe("InMemoryAuthStore — sessions", () => {
  it("returns an active session by its hash and rejects an expired one", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    const now = Date.now();

    await store.createSession({
      sessionIdHash: "hash.active",
      actorId: "actor.1",
      tenantId: "tenant.local",
      authorityId: "authority.local",
      jurisdictionId: "de",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      revokedAt: null,
    });
    await store.createSession({
      sessionIdHash: "hash.expired",
      actorId: "actor.1",
      tenantId: "tenant.local",
      authorityId: "authority.local",
      jurisdictionId: "de",
      createdAt: new Date(now - 120_000).toISOString(),
      expiresAt: new Date(now - 60_000).toISOString(),
      revokedAt: null,
    });

    expect((await store.getActiveSessionByHash("hash.active"))?.actorId).toBe(
      "actor.1",
    );
    expect(await store.getActiveSessionByHash("hash.expired")).toBeUndefined();
    expect(await store.getActiveSessionByHash("hash.unknown")).toBeUndefined();
  });

  it("treats a revoked session as inactive", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.createSession({
      sessionIdHash: "hash.revocable",
      actorId: "actor.1",
      tenantId: "tenant.local",
      authorityId: "authority.local",
      jurisdictionId: "de",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
    });

    await store.revokeSession("hash.revocable");
    expect(
      await store.getActiveSessionByHash("hash.revocable"),
    ).toBeUndefined();
  });
});
