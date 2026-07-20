// chos-auth-store.test — der AuthStore-chos-Adapter über einen Fake-Graph (InMemoryChosClient), OHNE laufendes
// chos. Deckt die sicherheitsrelevanten Pfade: Duplikat-Schutz, Optimistic-Locking, atomare Konto-Anlage/
// -Löschung, Deaktivierung-widerruft-Sessions, Credential-Lockout, Session-Gültigkeit, Identity-Links.
import { describe, expect, it } from "vitest";
import { ChosAuthStore } from "./chos-auth-store.js";
import { InMemoryChosClient } from "./chos-client.js";
import {
  StalePrincipalVersionError,
  type LocalCredential,
  type SessionRecord,
  type UserAccount,
} from "./auth-store.js";

function store(): ChosAuthStore {
  return new ChosAuthStore(new InMemoryChosClient());
}

function makeUser(overrides: Partial<UserAccount> = {}): UserAccount {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    actorId: "actor.1",
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    email: "admin@example.org",
    displayName: "Admin",
    status: "active",
    role: "admin",
    localPersonas: ["buerger", "sachbearbeitung"],
    oidcPersonas: [],
    personaManagementMode: "local",
    principalVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCredential(
  overrides: Partial<LocalCredential> = {},
): LocalCredential {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    actorId: "actor.1",
    passwordHash: "argon2id$fake",
    hashAlgo: "argon2id",
    passwordChangedAt: now,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionIdHash: "hash.1",
    actorId: "actor.1",
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    createdAt: "2026-06-01T00:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

describe("ChosAuthStore — Konten", () => {
  it("createUser + getUserById/getUserByEmail (case-insensitiv); Duplikat-E-Mail wirft", async () => {
    const s = store();
    await s.createUser(makeUser());
    expect(
      (await s.getUserById({ tenantId: "tenant.local", actorId: "actor.1" }))
        ?.email,
    ).toBe("admin@example.org");
    expect(
      (
        await s.getUserByEmail({
          tenantId: "tenant.local",
          email: "ADMIN@example.org",
        })
      )?.actorId,
    ).toBe("actor.1");
    await expect(
      s.createUser(makeUser({ actorId: "actor.2" })),
    ).rejects.toThrow(/already exists/);
    expect(await s.countUsers({ tenantId: "tenant.local" })).toBe(1);
    // Fremd-Mandant sieht nichts.
    expect(await s.countUsers({ tenantId: "tenant.andere" })).toBe(0);
  });

  it("createLocalUserWithCredential: User + Credential + local-Identity-Link atomar", async () => {
    const s = store();
    await s.createLocalUserWithCredential({
      user: makeUser(),
      credential: makeCredential(),
    });
    expect(await s.getLocalCredential("actor.1")).toBeDefined();
    expect(
      await s.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "local",
        subject: "actor.1",
      }),
    ).toBe("actor.1");
    // Duplikat → weder zweiter User noch Überschreibung.
    await expect(
      s.createLocalUserWithCredential({
        user: makeUser({ actorId: "actor.2" }),
        credential: makeCredential({ actorId: "actor.2" }),
      }),
    ).rejects.toThrow(/already exists/);
    expect(await s.countUsers({ tenantId: "tenant.local" })).toBe(1);
  });
});

describe("ChosAuthStore — updateUserAccess", () => {
  it("No-op (gleiche Persona-Menge) bumpt principalVersion NICHT (changed=false)", async () => {
    const s = store();
    await s.createUser(makeUser());
    const res = await s.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      patch: { localPersonas: ["sachbearbeitung", "buerger"] }, // gleiche Menge, andere Reihenfolge
    });
    expect(res.changed).toBe(false);
    expect(res.after.principalVersion).toBe(1);
  });

  it("echte Änderung bumpt principalVersion um genau 1; If-Match-Konflikt wirft", async () => {
    const s = store();
    await s.createUser(makeUser());
    const res = await s.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      expectedPrincipalVersion: 1,
      patch: { status: "disabled" },
    });
    expect(res.changed).toBe(true);
    expect(res.after.principalVersion).toBe(2);
    // Erneut mit veralteter erwarteter Version → Stale.
    await expect(
      s.updateUserAccess({
        tenantId: "tenant.local",
        actorId: "actor.1",
        expectedPrincipalVersion: 1,
        patch: { status: "active" },
      }),
    ).rejects.toBeInstanceOf(StalePrincipalVersionError);
  });

  it("Deaktivierung widerruft aktive Sessions ATOMAR", async () => {
    const s = store();
    await s.createUser(makeUser());
    await s.createSession(makeSession({ sessionIdHash: "h1" }));
    await s.createSession(makeSession({ sessionIdHash: "h2" }));
    expect(await s.getActiveSessionByHash("h1")).toBeDefined();
    await s.updateUserStatus({
      tenantId: "tenant.local",
      actorId: "actor.1",
      status: "disabled",
    });
    expect(await s.getActiveSessionByHash("h1")).toBeUndefined();
    expect(await s.getActiveSessionByHash("h2")).toBeUndefined();
  });
});

describe("ChosAuthStore — Credentials + Sessions + Löschung", () => {
  it("Lockout-Zähler: recordLoginFailure erhöht, Passwortwechsel/reset setzt zurück", async () => {
    const s = store();
    await s.createLocalCredential(makeCredential());
    await s.recordLoginFailure("actor.1");
    expect((await s.getLocalCredential("actor.1"))?.failedAttempts).toBe(1);
    await s.setAccountLock("actor.1", "2999-01-01T00:00:00.000Z");
    expect((await s.getLocalCredential("actor.1"))?.lockedUntil).toBeTruthy();
    await s.updateLocalCredentialPassword({
      actorId: "actor.1",
      passwordHash: "argon2id$neu",
      hashAlgo: "argon2id",
      passwordChangedAt: "2026-07-01T00:00:00.000Z",
    });
    const c = await s.getLocalCredential("actor.1");
    expect(c?.failedAttempts).toBe(0);
    expect(c?.lockedUntil).toBeNull();
    expect(c?.passwordHash).toBe("argon2id$neu");
  });

  it("Session-Gültigkeit: revoked und abgelaufen liefern undefined", async () => {
    const s = store();
    await s.createSession(makeSession({ sessionIdHash: "aktiv" }));
    await s.createSession(
      makeSession({
        sessionIdHash: "alt",
        expiresAt: "2000-01-01T00:00:00.000Z",
      }),
    );
    expect(await s.getActiveSessionByHash("aktiv")).toBeDefined();
    expect(await s.getActiveSessionByHash("alt")).toBeUndefined();
    await s.revokeSession("aktiv");
    expect(await s.getActiveSessionByHash("aktiv")).toBeUndefined();
  });

  it("linkIdentity ist idempotenz-geschützt (Duplikat wirft)", async () => {
    const s = store();
    await s.linkIdentity({
      tenantId: "tenant.local",
      provider: "keycloak",
      subject: "sub-1",
      actorId: "actor.1",
    });
    expect(
      await s.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "keycloak",
        subject: "sub-1",
      }),
    ).toBe("actor.1");
    await expect(
      s.linkIdentity({
        tenantId: "tenant.local",
        provider: "keycloak",
        subject: "sub-1",
        actorId: "actor.2",
      }),
    ).rejects.toThrow(/already linked/);
  });

  it("deleteUser entfernt User + Credential + Sessions + Links (countUsers → 0)", async () => {
    const s = store();
    await s.createLocalUserWithCredential({
      user: makeUser(),
      credential: makeCredential(),
    });
    await s.createSession(makeSession({ sessionIdHash: "h1" }));
    await s.deleteUser({ tenantId: "tenant.local", actorId: "actor.1" });
    expect(await s.countUsers({ tenantId: "tenant.local" })).toBe(0);
    expect(await s.getLocalCredential("actor.1")).toBeUndefined();
    expect(await s.getActiveSessionByHash("h1")).toBeUndefined();
    expect(
      await s.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "local",
        subject: "actor.1",
      }),
    ).toBeUndefined();
  });

  it("withBootstrapLock serialisiert konkurrierende Läufe je Tenant", async () => {
    const s = store();
    const order: string[] = [];
    const run = (id: string) => async () => {
      order.push(`${id}:start`);
      await Promise.resolve();
      order.push(`${id}:end`);
      return id;
    };
    await Promise.all([
      s.withBootstrapLock("t", run("a")),
      s.withBootstrapLock("t", run("b")),
    ]);
    // b darf erst starten, wenn a fertig ist.
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });
});
