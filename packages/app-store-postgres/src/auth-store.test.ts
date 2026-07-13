import { describe, expect, it } from "vitest";
import {
  InMemoryAuthStore,
  StalePrincipalVersionError,
  effectivePersonas,
  normalizePersonas,
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
    role: "admin",
    localPersonas: ["buerger", "sachbearbeitung", "aufsicht"],
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

describe("InMemoryAuthStore — administration", () => {
  it("rejects a second user with the same email in the same tenant, case-insensitively", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());

    await expect(
      store.createUser(
        makeUser({ actorId: "actor.2", email: "ADMIN@example.org" }),
      ),
    ).rejects.toThrow(/already exists/);
    // Anderer Tenant: gleiche E-Mail ist legitim (Unique-Index ist tenant-scoped).
    await expect(
      store.createUser(makeUser({ actorId: "actor.3", tenantId: "tenant.b" })),
    ).resolves.toMatchObject({ actorId: "actor.3" });
  });

  it("lists users of one tenant ordered by creation time", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(
      makeUser({
        actorId: "actor.2",
        email: "b@example.org",
        createdAt: "2026-07-02T00:00:00.000Z",
      }),
    );
    await store.createUser(
      makeUser({
        actorId: "actor.1",
        email: "a@example.org",
        createdAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    await store.createUser(
      makeUser({
        actorId: "actor.x",
        tenantId: "tenant.b",
        email: "x@example.org",
      }),
    );

    const users = await store.listUsers({ tenantId: "tenant.local" });
    expect(users.map((user) => user.actorId)).toEqual(["actor.1", "actor.2"]);
  });

  it("updates a user's status and fails for unknown actors", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());

    const disabled = await store.updateUserStatus({
      tenantId: "tenant.local",
      actorId: "actor.1",
      status: "disabled",
    });
    expect(disabled.status).toBe("disabled");
    expect(
      (
        await store.getUserById({
          tenantId: "tenant.local",
          actorId: "actor.1",
        })
      )?.status,
    ).toBe("disabled");

    await expect(
      store.updateUserStatus({
        tenantId: "tenant.local",
        actorId: "actor.unknown",
        status: "active",
      }),
    ).rejects.toThrow(/not found/);
  });

  it("replaces the password hash and resets lockout counters", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.createLocalCredential(
      makeCredential({
        failedAttempts: 3,
        lockedUntil: "2026-07-12T10:00:00.000Z",
      }),
    );

    const updated = await store.updateLocalCredentialPassword({
      actorId: "actor.1",
      passwordHash: "argon2id$new-hash",
      hashAlgo: "argon2id",
      passwordChangedAt: "2026-07-12T11:00:00.000Z",
    });
    expect(updated.passwordHash).toBe("argon2id$new-hash");
    expect(updated.failedAttempts).toBe(0);
    expect(updated.lockedUntil).toBeNull();
    expect(updated.passwordChangedAt).toBe("2026-07-12T11:00:00.000Z");
  });

  it("disabling a user revokes every active session ATOMICALLY with the status change", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    const future = new Date(Date.now() + 60_000).toISOString();
    for (const hash of ["hash.a", "hash.b"]) {
      await store.createSession({
        sessionIdHash: hash,
        actorId: "actor.1",
        tenantId: "tenant.local",
        authorityId: "authority.local",
        jurisdictionId: "de",
        createdAt: new Date().toISOString(),
        expiresAt: future,
        revokedAt: null,
      });
    }

    await store.updateUserStatus({
      tenantId: "tenant.local",
      actorId: "actor.1",
      status: "disabled",
    });
    expect(await store.getActiveSessionByHash("hash.a")).toBeUndefined();
    expect(await store.getActiveSessionByHash("hash.b")).toBeUndefined();

    // Re-Aktivierung lässt widerrufene Sessions widerrufen (kein Wiederaufleben).
    await store.updateUserStatus({
      tenantId: "tenant.local",
      actorId: "actor.1",
      status: "active",
    });
    expect(await store.getActiveSessionByHash("hash.a")).toBeUndefined();
  });
});

describe("InMemoryAuthStore — identity links", () => {
  it("links an external identity to an actor and resolves it tenant-scoped", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());

    await store.linkIdentity({
      tenantId: "tenant.local",
      provider: "local",
      subject: "actor.1",
      actorId: "actor.1",
    });

    expect(
      await store.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "local",
        subject: "actor.1",
      }),
    ).toBe("actor.1");
    // Tenant-Isolation: dieselbe externe Identität in einem anderen Tenant löst NICHT auf.
    expect(
      await store.findActorByIdentity({
        tenantId: "tenant.other",
        provider: "local",
        subject: "actor.1",
      }),
    ).toBeUndefined();
  });

  it("rejects a duplicate identity link (mirrors the composite primary key)", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.linkIdentity({
      tenantId: "tenant.local",
      provider: "oidc:example",
      subject: "sub-123",
      actorId: "actor.1",
    });

    await expect(
      store.linkIdentity({
        tenantId: "tenant.local",
        provider: "oidc:example",
        subject: "sub-123",
        actorId: "actor.1",
      }),
    ).rejects.toThrow(/already linked/);
  });

  it("removes identity links when the user is deleted (compensating bootstrap delete)", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.linkIdentity({
      tenantId: "tenant.local",
      provider: "local",
      subject: "actor.1",
      actorId: "actor.1",
    });

    await store.deleteUser({ tenantId: "tenant.local", actorId: "actor.1" });
    expect(
      await store.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "local",
        subject: "actor.1",
      }),
    ).toBeUndefined();
  });
});

// Personas sind Konto-DATEN (Arbeitsbereiche/Erlebnis), keine Autorisierung. Die puren
// Helfer sind deterministisch: USER_PERSONAS-Reihenfolge, dupe-frei — Gleichheitsprüfungen
// (No-op-Erkennung) und UI-Sortierung hängen daran.
describe("Persona-Helfer (pure)", () => {
  it("normalizePersonas dedupliziert und sortiert in kanonischer Reihenfolge", () => {
    expect(
      normalizePersonas(["aufsicht", "buerger", "aufsicht", "buerger"]),
    ).toEqual(["buerger", "aufsicht"]);
  });

  it("effectivePersonas: local-Modus nutzt NUR lokale Zuweisungen", () => {
    const user = makeUser({
      localPersonas: ["aufsicht"],
      oidcPersonas: ["buerger"],
      personaManagementMode: "local",
    });
    expect(effectivePersonas(user)).toEqual(["aufsicht"]);
  });

  it("effectivePersonas: oidc_authoritative nutzt NUR externe Zuweisungen", () => {
    const user = makeUser({
      localPersonas: ["aufsicht"],
      oidcPersonas: ["buerger"],
      personaManagementMode: "oidc_authoritative",
    });
    expect(effectivePersonas(user)).toEqual(["buerger"]);
  });

  it("effectivePersonas: oidc_additive ist die dupe-freie Union in kanonischer Reihenfolge", () => {
    const user = makeUser({
      localPersonas: ["aufsicht", "buerger"],
      oidcPersonas: ["sachbearbeitung", "buerger"],
      personaManagementMode: "oidc_additive",
    });
    expect(effectivePersonas(user)).toEqual([
      "buerger",
      "sachbearbeitung",
      "aufsicht",
    ]);
  });
});

// updateUserAccess = DIE atomare Principal-Mutation: validiert den ganzen Patch, erkennt
// No-ops nach Normalisierung (kein Version-Bump, kein Audit-Anlass), bumpt sonst GENAU
// einmal und trägt optimistische Nebenläufigkeit (expectedPrincipalVersion → Konflikt).
describe("InMemoryAuthStore — updateUserAccess", () => {
  it("kombinierter Patch (Status + Personas) bumpt principalVersion genau einmal", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser({ localPersonas: ["buerger"] }));

    const result = await store.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      patch: { status: "disabled", localPersonas: ["sachbearbeitung"] },
    });
    expect(result.changed).toBe(true);
    expect(result.before.principalVersion).toBe(1);
    expect(result.after.principalVersion).toBe(2);
    expect(result.after.status).toBe("disabled");
    expect(result.after.localPersonas).toEqual(["sachbearbeitung"]);
  });

  it("No-op bumpt NICHT: gleiche Persona-Menge in anderer Reihenfolge", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(
      makeUser({ localPersonas: ["buerger", "aufsicht"] }),
    );

    const result = await store.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      patch: { localPersonas: ["aufsicht", "buerger", "aufsicht"] },
    });
    expect(result.changed).toBe(false);
    expect(result.after.principalVersion).toBe(1);
  });

  it("stale expectedPrincipalVersion → StalePrincipalVersionError, keine Änderung", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());

    await expect(
      store.updateUserAccess({
        tenantId: "tenant.local",
        actorId: "actor.1",
        expectedPrincipalVersion: 99,
        patch: { localPersonas: [] },
      }),
    ).rejects.toBeInstanceOf(StalePrincipalVersionError);
    const unchanged = await store.getUserById({
      tenantId: "tenant.local",
      actorId: "actor.1",
    });
    expect(unchanged?.principalVersion).toBe(1);
    expect(unchanged?.localPersonas).toEqual([
      "buerger",
      "sachbearbeitung",
      "aufsicht",
    ]);
  });

  it("unbekannter Actor → not found", async () => {
    const store = new InMemoryAuthStore();
    await expect(
      store.updateUserAccess({
        tenantId: "tenant.local",
        actorId: "actor.unknown",
        patch: { status: "active" },
      }),
    ).rejects.toThrow(/not found/);
  });

  it("status→disabled widerruft Sessions ATOMAR mit dem Patch", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    await store.createSession({
      sessionIdHash: "hash.a",
      actorId: "actor.1",
      tenantId: "tenant.local",
      authorityId: "authority.local",
      jurisdictionId: "de",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
    });

    await store.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      patch: { status: "disabled" },
    });
    expect(await store.getActiveSessionByHash("hash.a")).toBeUndefined();
  });

  it("Modus-Wechsel ist principal-relevant und bumpt die Version", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());

    const result = await store.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      patch: { personaManagementMode: "oidc_additive" },
    });
    expect(result.changed).toBe(true);
    expect(result.after.principalVersion).toBe(2);
    // Identischer Sync danach = No-op (unveränderte OIDC-Claims bumpen NICHTS).
    const noop = await store.updateUserAccess({
      tenantId: "tenant.local",
      actorId: "actor.1",
      patch: { personaManagementMode: "oidc_additive", oidcPersonas: [] },
    });
    expect(noop.changed).toBe(false);
    expect(noop.after.principalVersion).toBe(2);
  });

  it("updateUserStatus (Wrapper) bumpt die Version weiterhin", async () => {
    const store = new InMemoryAuthStore();
    await store.createUser(makeUser());
    const disabled = await store.updateUserStatus({
      tenantId: "tenant.local",
      actorId: "actor.1",
      status: "disabled",
    });
    expect(disabled.principalVersion).toBe(2);
  });
});

// Lokale Konto-Anlage ist ATOMAR: User + Credential + „local"-Identity-Link entstehen
// zusammen oder gar nicht — sonst bliebe ein aktives Konto ohne Login-Möglichkeit zurück,
// dessen E-Mail jede erneute Registrierung blockiert.
describe("InMemoryAuthStore — createLocalUserWithCredential", () => {
  it("legt User, Credential und local-Identity-Link zusammen an", async () => {
    const store = new InMemoryAuthStore();
    const user = await store.createLocalUserWithCredential({
      user: makeUser({ localPersonas: ["buerger"], role: "citizen" }),
      credential: makeCredential(),
    });
    expect(user.role).toBe("citizen");
    expect(await store.getLocalCredential("actor.1")).toBeDefined();
    expect(
      await store.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "local",
        subject: "actor.1",
      }),
    ).toBe("actor.1");
  });

  it("Duplikat-E-Mail → nichts wird angelegt (kein Zombie-Credential/-Link)", async () => {
    const store = new InMemoryAuthStore();
    await store.createLocalUserWithCredential({
      user: makeUser(),
      credential: makeCredential(),
    });

    await expect(
      store.createLocalUserWithCredential({
        user: makeUser({ actorId: "actor.2", email: "ADMIN@example.org" }),
        credential: makeCredential({ actorId: "actor.2" }),
      }),
    ).rejects.toThrow(/already exists/);
    expect(await store.getLocalCredential("actor.2")).toBeUndefined();
    expect(
      await store.findActorByIdentity({
        tenantId: "tenant.local",
        provider: "local",
        subject: "actor.2",
      }),
    ).toBeUndefined();
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
