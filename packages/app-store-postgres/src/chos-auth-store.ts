// chos-auth-store — der AuthStore-Adapter auf den chos-Graph-Store. Konten, lokale Credentials, Sessions und
// Identity-Links liegen als chos-Entities in vier Collections. Sicherheitssensibel: atomare Mehr-Entity-
// Schritte (lokale Konto-Anlage, Konto-Löschung, Deaktivierung MIT Session-Widerruf) laufen über das
// ChosClient-`transact`-Primitiv (unteilbar). Semantik in Parität zu InMemory (dieselbe Duplikat-/No-op-/
// Optimistic-Lock-Logik via `resolveUserAccessPatch`). Gewählt via APP_STORE_MODE=chos; Postgres bleibt Default.
//
// PARTITIONEN: Konten und Identity-Links sind mandanten-scoped (Partition = tenantId). Credentials und Sessions
// werden über einen GLOBAL eindeutigen Schlüssel (actorId bzw. sessionIdHash) gelesen — ihre Port-Methoden
// tragen keinen tenantId —, deshalb liegen sie unter einer festen Auth-Partition (kein Tenant-Query nötig,
// Parität zur InMemory-Map, die sie ebenfalls global keyt).
//
// EHRLICH: die Optimistic-Lock-Prüfung (principalVersion) ist wie im InMemory-Pfad ein Read-Check-Write; die
// strikte CAS-Vorbedingung ist beim realen chos eine Transaktions-Precondition (Integrations-Feinschliff).

import { type ChosClient } from "./chos-client.js";
import {
  resolveUserAccessPatch,
  StalePrincipalVersionError,
  type AuthStore,
  type IdentityLink,
  type LocalCredential,
  type PersonaManagementMode,
  type SessionRecord,
  type UserAccessPatch,
  type UserAccessResult,
  type UserAccount,
  type UserPersona,
  type UserRole,
  type UserStatus,
} from "./auth-store.js";

const USERS = "app_users";
const CREDS = "app_local_credentials";
const SESSIONS = "app_sessions";
const LINKS = "app_identity_links";
/** Feste Partition für global-gekeyte Collections (Credentials/Sessions ohne tenantId-Query). */
const AUTH_PARTITION = "_auth";

function nowIso(): string {
  return new Date().toISOString();
}

function identityKey(
  tenantId: string,
  provider: string,
  subject: string,
): string {
  return `${tenantId}:${provider}:${subject}`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

// ─── (De-)Serialisierung ─────────────────────────────────────────────────
function userToBody(u: UserAccount): Record<string, unknown> {
  return {
    ...u,
    localPersonas: [...u.localPersonas],
    oidcPersonas: [...u.oidcPersonas],
  };
}

function bodyToUser(body: Record<string, unknown>): UserAccount {
  return {
    actorId: String(body["actorId"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    email: String(body["email"]),
    displayName: String(body["displayName"]),
    status: String(body["status"]) as UserStatus,
    role: String(body["role"]) as UserRole,
    localPersonas: stringArray(body["localPersonas"]) as UserPersona[],
    oidcPersonas: stringArray(body["oidcPersonas"]) as UserPersona[],
    personaManagementMode: String(
      body["personaManagementMode"],
    ) as PersonaManagementMode,
    principalVersion: Number(body["principalVersion"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

function credToBody(c: LocalCredential): Record<string, unknown> {
  return { ...c };
}

function bodyToCred(body: Record<string, unknown>): LocalCredential {
  return {
    actorId: String(body["actorId"]),
    passwordHash: String(body["passwordHash"]),
    hashAlgo: String(body["hashAlgo"]),
    passwordChangedAt: String(body["passwordChangedAt"]),
    failedAttempts: Number(body["failedAttempts"]),
    lockedUntil:
      body["lockedUntil"] === null || body["lockedUntil"] === undefined
        ? null
        : String(body["lockedUntil"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

function sessionToBody(s: SessionRecord): Record<string, unknown> {
  return { ...s };
}

function bodyToSession(body: Record<string, unknown>): SessionRecord {
  return {
    sessionIdHash: String(body["sessionIdHash"]),
    actorId: String(body["actorId"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    createdAt: String(body["createdAt"]),
    expiresAt: String(body["expiresAt"]),
    revokedAt:
      body["revokedAt"] === null || body["revokedAt"] === undefined
        ? null
        : String(body["revokedAt"]),
  };
}

export class ChosAuthStore implements AuthStore {
  private readonly bootstrapLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly client: ChosClient) {}

  // ─── Konten ──────────────────────────────────────────────────────────
  async createUser(user: UserAccount): Promise<UserAccount> {
    const existing = await this.getUserByEmail({
      tenantId: user.tenantId,
      email: user.email,
    });
    if (existing)
      throw new Error(
        `user with email "${user.email}" already exists in tenant "${user.tenantId}"`,
      );
    await this.client.putEntity({
      collection: USERS,
      tenantId: user.tenantId,
      id: user.actorId,
      version: user.principalVersion,
      body: userToBody(user),
    });
    return { ...user };
  }

  async getUserByEmail(input: {
    tenantId: string;
    email: string;
  }): Promise<UserAccount | undefined> {
    const lower = input.email.toLowerCase();
    const all = await this.client.listEntities({
      collection: USERS,
      tenantId: input.tenantId,
    });
    const found = all
      .map((e) => bodyToUser(e.body))
      .find((u) => u.email.toLowerCase() === lower);
    return found ? { ...found } : undefined;
  }

  async getUserById(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserAccount | undefined> {
    const found = await this.client.getEntity({
      collection: USERS,
      tenantId: input.tenantId,
      id: input.actorId,
    });
    return found ? bodyToUser(found.body) : undefined;
  }

  async countUsers(input: { tenantId: string }): Promise<number> {
    const all = await this.client.listEntities({
      collection: USERS,
      tenantId: input.tenantId,
    });
    return all.length;
  }

  async listUsers(input: { tenantId: string }): Promise<UserAccount[]> {
    const all = await this.client.listEntities({
      collection: USERS,
      tenantId: input.tenantId,
    });
    return all
      .map((e) => bodyToUser(e.body))
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.actorId.localeCompare(b.actorId),
      );
  }

  async updateUserAccess(input: {
    tenantId: string;
    actorId: string;
    expectedPrincipalVersion?: number;
    patch: UserAccessPatch;
  }): Promise<UserAccessResult> {
    const current = await this.getUserById({
      tenantId: input.tenantId,
      actorId: input.actorId,
    });
    if (!current)
      throw new Error(
        `user "${input.actorId}" not found in tenant "${input.tenantId}"`,
      );
    if (
      input.expectedPrincipalVersion !== undefined &&
      input.expectedPrincipalVersion !== current.principalVersion
    )
      throw new StalePrincipalVersionError(
        input.actorId,
        input.expectedPrincipalVersion,
        current.principalVersion,
      );
    const resolved = resolveUserAccessPatch(current, input.patch);
    const before: UserAccount = { ...current };
    if (!resolved.changed)
      return { before, after: { ...current }, changed: false };
    const next: UserAccount = {
      ...current,
      ...resolved.fields,
      principalVersion: current.principalVersion + 1,
      updatedAt: nowIso(),
    };
    // Deaktivierung widerruft alle aktiven Sessions ATOMAR mit dem Patch (transact).
    const sessionPuts: Array<{
      collection: string;
      tenantId: string;
      id: string;
      version: number;
      body: Record<string, unknown>;
    }> = [];
    if (resolved.fields.status === "disabled") {
      const revokedAt = nowIso();
      const sessions = await this.client.listEntities({
        collection: SESSIONS,
        tenantId: AUTH_PARTITION,
      });
      for (const entity of sessions) {
        const session = bodyToSession(entity.body);
        if (session.actorId === input.actorId && !session.revokedAt)
          sessionPuts.push({
            collection: SESSIONS,
            tenantId: AUTH_PARTITION,
            id: session.sessionIdHash,
            version: 1,
            body: sessionToBody({ ...session, revokedAt }),
          });
      }
    }
    await this.client.transact({
      puts: [
        {
          collection: USERS,
          tenantId: input.tenantId,
          id: input.actorId,
          version: next.principalVersion,
          body: userToBody(next),
        },
        ...sessionPuts,
      ],
    });
    return { before, after: { ...next }, changed: true };
  }

  async updateUserStatus(input: {
    tenantId: string;
    actorId: string;
    status: UserStatus;
  }): Promise<UserAccount> {
    const result = await this.updateUserAccess({
      tenantId: input.tenantId,
      actorId: input.actorId,
      patch: { status: input.status },
    });
    return result.after;
  }

  async createLocalUserWithCredential(input: {
    user: UserAccount;
    credential: LocalCredential;
  }): Promise<UserAccount> {
    const existing = await this.getUserByEmail({
      tenantId: input.user.tenantId,
      email: input.user.email,
    });
    if (existing)
      throw new Error(
        `user with email "${input.user.email}" already exists in tenant "${input.user.tenantId}"`,
      );
    // User + Credential + „local"-Identity-Link atomar oder gar nicht.
    await this.client.transact({
      puts: [
        {
          collection: USERS,
          tenantId: input.user.tenantId,
          id: input.user.actorId,
          version: input.user.principalVersion,
          body: userToBody(input.user),
        },
        {
          collection: CREDS,
          tenantId: AUTH_PARTITION,
          id: input.credential.actorId,
          version: 1,
          body: credToBody(input.credential),
        },
        {
          collection: LINKS,
          tenantId: input.user.tenantId,
          id: identityKey(input.user.tenantId, "local", input.user.actorId),
          version: 1,
          body: {
            tenantId: input.user.tenantId,
            provider: "local",
            subject: input.user.actorId,
            actorId: input.user.actorId,
          },
        },
      ],
    });
    return { ...input.user };
  }

  async deleteUser(input: {
    tenantId: string;
    actorId: string;
  }): Promise<void> {
    const sessions = await this.client.listEntities({
      collection: SESSIONS,
      tenantId: AUTH_PARTITION,
    });
    const links = await this.client.listEntities({
      collection: LINKS,
      tenantId: input.tenantId,
    });
    const deletes: Array<{ collection: string; tenantId: string; id: string }> =
      [
        { collection: USERS, tenantId: input.tenantId, id: input.actorId },
        { collection: CREDS, tenantId: AUTH_PARTITION, id: input.actorId },
      ];
    for (const entity of sessions) {
      const session = bodyToSession(entity.body);
      if (session.actorId === input.actorId)
        deletes.push({
          collection: SESSIONS,
          tenantId: AUTH_PARTITION,
          id: session.sessionIdHash,
        });
    }
    for (const entity of links) {
      if (String(entity.body["actorId"]) === input.actorId)
        deletes.push({
          collection: LINKS,
          tenantId: input.tenantId,
          id: entity.id,
        });
    }
    await this.client.transact({ deletes });
  }

  async withBootstrapLock<T>(
    tenantId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = this.bootstrapLocks.get(tenantId) ?? Promise.resolve();
    const next = previous.then(run, run);
    this.bootstrapLocks.set(
      tenantId,
      next.catch(() => undefined),
    );
    return next;
  }

  // ─── Credentials ─────────────────────────────────────────────────────
  async createLocalCredential(
    credential: LocalCredential,
  ): Promise<LocalCredential> {
    await this.client.putEntity({
      collection: CREDS,
      tenantId: AUTH_PARTITION,
      id: credential.actorId,
      version: 1,
      body: credToBody(credential),
    });
    return { ...credential };
  }

  async getLocalCredential(
    actorId: string,
  ): Promise<LocalCredential | undefined> {
    const found = await this.client.getEntity({
      collection: CREDS,
      tenantId: AUTH_PARTITION,
      id: actorId,
    });
    return found ? bodyToCred(found.body) : undefined;
  }

  private async requireCredential(actorId: string): Promise<LocalCredential> {
    const credential = await this.getLocalCredential(actorId);
    if (!credential)
      throw new Error(`local credential for actor "${actorId}" not found`);
    return credential;
  }

  private async putCredential(next: LocalCredential): Promise<LocalCredential> {
    await this.client.putEntity({
      collection: CREDS,
      tenantId: AUTH_PARTITION,
      id: next.actorId,
      version: 1,
      body: credToBody(next),
    });
    return { ...next };
  }

  async recordLoginFailure(actorId: string): Promise<LocalCredential> {
    const current = await this.requireCredential(actorId);
    return this.putCredential({
      ...current,
      failedAttempts: current.failedAttempts + 1,
      updatedAt: nowIso(),
    });
  }

  async resetLoginFailures(actorId: string): Promise<LocalCredential> {
    const current = await this.requireCredential(actorId);
    return this.putCredential({
      ...current,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: nowIso(),
    });
  }

  async setAccountLock(
    actorId: string,
    lockedUntil: string | null,
  ): Promise<LocalCredential> {
    const current = await this.requireCredential(actorId);
    return this.putCredential({ ...current, lockedUntil, updatedAt: nowIso() });
  }

  async updateLocalCredentialPassword(input: {
    actorId: string;
    passwordHash: string;
    hashAlgo: string;
    passwordChangedAt: string;
  }): Promise<LocalCredential> {
    const current = await this.requireCredential(input.actorId);
    return this.putCredential({
      ...current,
      passwordHash: input.passwordHash,
      hashAlgo: input.hashAlgo,
      passwordChangedAt: input.passwordChangedAt,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: nowIso(),
    });
  }

  // ─── Sessions ────────────────────────────────────────────────────────
  async createSession(session: SessionRecord): Promise<SessionRecord> {
    await this.client.putEntity({
      collection: SESSIONS,
      tenantId: AUTH_PARTITION,
      id: session.sessionIdHash,
      version: 1,
      body: sessionToBody(session),
    });
    return { ...session };
  }

  async getActiveSessionByHash(
    sessionIdHash: string,
  ): Promise<SessionRecord | undefined> {
    const found = await this.client.getEntity({
      collection: SESSIONS,
      tenantId: AUTH_PARTITION,
      id: sessionIdHash,
    });
    if (!found) return undefined;
    const session = bodyToSession(found.body);
    if (session.revokedAt) return undefined;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return undefined;
    return session;
  }

  async revokeSession(sessionIdHash: string): Promise<void> {
    const found = await this.client.getEntity({
      collection: SESSIONS,
      tenantId: AUTH_PARTITION,
      id: sessionIdHash,
    });
    if (!found) return;
    const session = bodyToSession(found.body);
    await this.client.putEntity({
      collection: SESSIONS,
      tenantId: AUTH_PARTITION,
      id: sessionIdHash,
      version: 1,
      body: sessionToBody({ ...session, revokedAt: nowIso() }),
    });
  }

  // ─── Identity-Links ──────────────────────────────────────────────────
  async linkIdentity(link: IdentityLink): Promise<IdentityLink> {
    const key = identityKey(link.tenantId, link.provider, link.subject);
    const existing = await this.client.getEntity({
      collection: LINKS,
      tenantId: link.tenantId,
      id: key,
    });
    if (existing)
      throw new Error(
        `identity "${link.provider}:${link.subject}" is already linked in tenant "${link.tenantId}"`,
      );
    await this.client.putEntity({
      collection: LINKS,
      tenantId: link.tenantId,
      id: key,
      version: 1,
      body: {
        tenantId: link.tenantId,
        provider: link.provider,
        subject: link.subject,
        actorId: link.actorId,
      },
    });
    return { ...link };
  }

  async findActorByIdentity(input: {
    tenantId: string;
    provider: string;
    subject: string;
  }): Promise<string | undefined> {
    const found = await this.client.getEntity({
      collection: LINKS,
      tenantId: input.tenantId,
      id: identityKey(input.tenantId, input.provider, input.subject),
    });
    return found ? String(found.body["actorId"]) : undefined;
  }

  async ping(): Promise<void> {
    await this.client.ping?.();
  }
}
