import { createPgClient, type PgClient } from "./client.js";

export type UserStatus = "active" | "disabled";

/** Workspace-Rolle (gespeichertes Primitiv). Das Permission-Mapping (users.manage,
 *  boards.collaborate, …) lebt bewusst im App-Server (workspace-permissions.ts), damit
 *  später feinere Rollen ohne Schema-Änderung entstehen können. */
export type UserRole = "admin" | "member";

export interface UserAccount {
  actorId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  email: string;
  displayName: string;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/** Authentifizierung ≠ Autorisierung: externe Identität (provider/issuer + subject) →
 *  Application Actor. Der IdP beweist nur Identität; Actor, Rollen und Tenant-Kontext
 *  gehören der Anwendung (siehe docs/capabilities/identity-and-trust.md). */
export interface IdentityLink {
  tenantId: string;
  provider: string;
  subject: string;
  actorId: string;
}

export interface LocalCredential {
  actorId: string;
  passwordHash: string;
  hashAlgo: string;
  passwordChangedAt: string;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  sessionIdHash: string;
  actorId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AuthStore {
  createUser(user: UserAccount): Promise<UserAccount>;
  getUserByEmail(input: {
    tenantId: string;
    email: string;
  }): Promise<UserAccount | undefined>;
  getUserById(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserAccount | undefined>;
  countUsers(input: { tenantId: string }): Promise<number>;
  listUsers(input: { tenantId: string }): Promise<UserAccount[]>;
  updateUserStatus(input: {
    tenantId: string;
    actorId: string;
    status: UserStatus;
  }): Promise<UserAccount>;
  /** Kompensations-Löschung für abgebrochene Bootstraps: entfernt Benutzer samt Credential
   *  und Sessions (Postgres: ON DELETE CASCADE), damit `countUsers()` wieder 0 meldet und der
   *  Operator das Setup erneut versuchen kann. */
  deleteUser(input: { tenantId: string; actorId: string }): Promise<void>;
  /** Serialisiert konkurrierende First-User-Bootstraps eines Tenants (kanban plan decision 3):
   *  Postgres = Advisory Lock über die gesamte Bootstrap-Ausführung, In-Memory = Mutex.
   *  Ohne dieses Gate können zwei gleichzeitige Setup-POSTs beide `countUsers() === 0` sehen. */
  withBootstrapLock<T>(tenantId: string, run: () => Promise<T>): Promise<T>;

  createLocalCredential(credential: LocalCredential): Promise<LocalCredential>;
  getLocalCredential(actorId: string): Promise<LocalCredential | undefined>;
  recordLoginFailure(actorId: string): Promise<LocalCredential>;
  resetLoginFailures(actorId: string): Promise<LocalCredential>;
  setAccountLock(
    actorId: string,
    lockedUntil: string | null,
  ): Promise<LocalCredential>;
  /** Ersetzt den Passwort-Hash und resettet Lockout-Zähler (Passwortwechsel = Neustart
   *  der Brute-Force-Zählung). */
  updateLocalCredentialPassword(input: {
    actorId: string;
    passwordHash: string;
    hashAlgo: string;
    passwordChangedAt: string;
  }): Promise<LocalCredential>;

  createSession(session: SessionRecord): Promise<SessionRecord>;
  getActiveSessionByHash(
    sessionIdHash: string,
  ): Promise<SessionRecord | undefined>;
  revokeSession(sessionIdHash: string): Promise<void>;
  /** Deaktivierung ohne Session-Revocation wäre 12h wirkungslos (Session-TTL):
   *  widerruft ALLE aktiven Sessions eines Actors. */
  revokeSessionsForActor(actorId: string): Promise<void>;

  linkIdentity(link: IdentityLink): Promise<IdentityLink>;
  findActorByIdentity(input: {
    tenantId: string;
    provider: string;
    subject: string;
  }): Promise<string | undefined>;
}

// ─── InMemory ────────────────────────────────────────────────────────────

export class InMemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, UserAccount>();
  private readonly credentials = new Map<string, LocalCredential>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly identityLinks = new Map<string, string>();
  private readonly bootstrapLocks = new Map<string, Promise<unknown>>();

  async createUser(user: UserAccount): Promise<UserAccount> {
    // Spiegelt den Postgres-Unique-Index (tenant_id, lower(email)), damit der
    // 409-Duplikat-Pfad der Benutzer-API auch in-memory testbar ist.
    const existing = await this.getUserByEmail({
      tenantId: user.tenantId,
      email: user.email,
    });
    if (existing) {
      throw new Error(
        `user with email "${user.email}" already exists in tenant "${user.tenantId}"`,
      );
    }
    this.users.set(userKey(user.tenantId, user.actorId), { ...user });
    return { ...user };
  }

  async getUserByEmail(input: {
    tenantId: string;
    email: string;
  }): Promise<UserAccount | undefined> {
    const lowerEmail = input.email.toLowerCase();
    const found = [...this.users.values()].find(
      (user) =>
        user.tenantId === input.tenantId &&
        user.email.toLowerCase() === lowerEmail,
    );
    return found ? { ...found } : undefined;
  }

  async getUserById(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserAccount | undefined> {
    const user = this.users.get(userKey(input.tenantId, input.actorId));
    return user ? { ...user } : undefined;
  }

  async countUsers(input: { tenantId: string }): Promise<number> {
    return [...this.users.values()].filter(
      (user) => user.tenantId === input.tenantId,
    ).length;
  }

  async listUsers(input: { tenantId: string }): Promise<UserAccount[]> {
    return [...this.users.values()]
      .filter((user) => user.tenantId === input.tenantId)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.actorId.localeCompare(b.actorId),
      )
      .map((user) => ({ ...user }));
  }

  async updateUserStatus(input: {
    tenantId: string;
    actorId: string;
    status: UserStatus;
  }): Promise<UserAccount> {
    const key = userKey(input.tenantId, input.actorId);
    const current = this.users.get(key);
    if (!current) {
      throw new Error(
        `user "${input.actorId}" not found in tenant "${input.tenantId}"`,
      );
    }
    const next: UserAccount = {
      ...current,
      status: input.status,
      updatedAt: nowIso(),
    };
    this.users.set(key, next);
    return { ...next };
  }

  async deleteUser(input: {
    tenantId: string;
    actorId: string;
  }): Promise<void> {
    this.users.delete(userKey(input.tenantId, input.actorId));
    this.credentials.delete(input.actorId);
    for (const [hash, session] of this.sessions) {
      if (session.actorId === input.actorId) {
        this.sessions.delete(hash);
      }
    }
    for (const [key, actorId] of this.identityLinks) {
      if (actorId === input.actorId) {
        this.identityLinks.delete(key);
      }
    }
  }

  async withBootstrapLock<T>(
    tenantId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const previous = this.bootstrapLocks.get(tenantId) ?? Promise.resolve();
    const next = previous.then(run, run);
    // Fehler nur im zurückgegebenen Promise sichtbar — die Kette selbst darf nie rejecten,
    // sonst bliebe der Mutex nach einem fehlgeschlagenen Bootstrap dauerhaft „kaputt".
    this.bootstrapLocks.set(
      tenantId,
      next.catch(() => undefined),
    );
    return next;
  }

  async createLocalCredential(
    credential: LocalCredential,
  ): Promise<LocalCredential> {
    this.credentials.set(credential.actorId, { ...credential });
    return { ...credential };
  }

  async getLocalCredential(
    actorId: string,
  ): Promise<LocalCredential | undefined> {
    const credential = this.credentials.get(actorId);
    return credential ? { ...credential } : undefined;
  }

  async recordLoginFailure(actorId: string): Promise<LocalCredential> {
    const current = this.requireCredential(actorId);
    const next: LocalCredential = {
      ...current,
      failedAttempts: current.failedAttempts + 1,
      updatedAt: nowIso(),
    };
    this.credentials.set(actorId, next);
    return { ...next };
  }

  async resetLoginFailures(actorId: string): Promise<LocalCredential> {
    const current = this.requireCredential(actorId);
    const next: LocalCredential = {
      ...current,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: nowIso(),
    };
    this.credentials.set(actorId, next);
    return { ...next };
  }

  async setAccountLock(
    actorId: string,
    lockedUntil: string | null,
  ): Promise<LocalCredential> {
    const current = this.requireCredential(actorId);
    const next: LocalCredential = {
      ...current,
      lockedUntil,
      updatedAt: nowIso(),
    };
    this.credentials.set(actorId, next);
    return { ...next };
  }

  async updateLocalCredentialPassword(input: {
    actorId: string;
    passwordHash: string;
    hashAlgo: string;
    passwordChangedAt: string;
  }): Promise<LocalCredential> {
    const current = this.requireCredential(input.actorId);
    const next: LocalCredential = {
      ...current,
      passwordHash: input.passwordHash,
      hashAlgo: input.hashAlgo,
      passwordChangedAt: input.passwordChangedAt,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: nowIso(),
    };
    this.credentials.set(input.actorId, next);
    return { ...next };
  }

  async createSession(session: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(session.sessionIdHash, { ...session });
    return { ...session };
  }

  async getActiveSessionByHash(
    sessionIdHash: string,
  ): Promise<SessionRecord | undefined> {
    const session = this.sessions.get(sessionIdHash);
    if (!session || session.revokedAt) {
      return undefined;
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }
    return { ...session };
  }

  async revokeSession(sessionIdHash: string): Promise<void> {
    const session = this.sessions.get(sessionIdHash);
    if (session) {
      this.sessions.set(sessionIdHash, { ...session, revokedAt: nowIso() });
    }
  }

  async revokeSessionsForActor(actorId: string): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.actorId === actorId && !session.revokedAt) {
        this.sessions.set(hash, { ...session, revokedAt: nowIso() });
      }
    }
  }

  async linkIdentity(link: IdentityLink): Promise<IdentityLink> {
    const key = identityKey(link.tenantId, link.provider, link.subject);
    if (this.identityLinks.has(key)) {
      throw new Error(
        `identity "${link.provider}:${link.subject}" is already linked in tenant "${link.tenantId}"`,
      );
    }
    this.identityLinks.set(key, link.actorId);
    return { ...link };
  }

  async findActorByIdentity(input: {
    tenantId: string;
    provider: string;
    subject: string;
  }): Promise<string | undefined> {
    return this.identityLinks.get(
      identityKey(input.tenantId, input.provider, input.subject),
    );
  }

  private requireCredential(actorId: string): LocalCredential {
    const credential = this.credentials.get(actorId);
    if (!credential) {
      throw new Error(`local credential for actor "${actorId}" not found`);
    }
    return credential;
  }
}

function userKey(tenantId: string, actorId: string): string {
  return `${tenantId}:${actorId}`;
}

function identityKey(
  tenantId: string,
  provider: string,
  subject: string,
): string {
  return `${tenantId}:${provider}:${subject}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Unavailable ─────────────────────────────────────────────────────────

export class UnavailableAuthStore implements AuthStore {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new Error(this.reason);
  }

  async createUser(): Promise<UserAccount> {
    this.fail();
  }
  async getUserByEmail(): Promise<UserAccount | undefined> {
    this.fail();
  }
  async getUserById(): Promise<UserAccount | undefined> {
    this.fail();
  }
  async countUsers(): Promise<number> {
    this.fail();
  }
  async listUsers(): Promise<UserAccount[]> {
    this.fail();
  }
  async updateUserStatus(): Promise<UserAccount> {
    this.fail();
  }
  async deleteUser(): Promise<void> {
    this.fail();
  }
  async withBootstrapLock<T>(): Promise<T> {
    this.fail();
  }
  async createLocalCredential(): Promise<LocalCredential> {
    this.fail();
  }
  async getLocalCredential(): Promise<LocalCredential | undefined> {
    this.fail();
  }
  async recordLoginFailure(): Promise<LocalCredential> {
    this.fail();
  }
  async resetLoginFailures(): Promise<LocalCredential> {
    this.fail();
  }
  async setAccountLock(): Promise<LocalCredential> {
    this.fail();
  }
  async updateLocalCredentialPassword(): Promise<LocalCredential> {
    this.fail();
  }
  async createSession(): Promise<SessionRecord> {
    this.fail();
  }
  async getActiveSessionByHash(): Promise<SessionRecord | undefined> {
    this.fail();
  }
  async revokeSession(): Promise<void> {
    this.fail();
  }
  async revokeSessionsForActor(): Promise<void> {
    this.fail();
  }
  async linkIdentity(): Promise<IdentityLink> {
    this.fail();
  }
  async findActorByIdentity(): Promise<string | undefined> {
    this.fail();
  }
}

export function createAuthStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuthStore {
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresAuthStore(databaseUrl)
    : new UnavailableAuthStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for auth data",
      );
}

// ─── Postgres ────────────────────────────────────────────────────────────

interface UserRow extends Record<string, unknown> {
  actor_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  role: UserRole;
  created_at: Date | string;
  updated_at: Date | string;
}

interface IdentityLinkRow extends Record<string, unknown> {
  tenant_id: string;
  provider: string;
  subject: string;
  actor_id: string;
}

interface CredentialRow extends Record<string, unknown> {
  actor_id: string;
  password_hash: string;
  hash_algo: string;
  password_changed_at: Date | string;
  failed_attempts: number;
  locked_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SessionRow extends Record<string, unknown> {
  session_id_hash: string;
  actor_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  created_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly databaseUrl: string) {}

  async createUser(user: UserAccount): Promise<UserAccount> {
    return this.withClient(async (client) => {
      const result = await client.query<UserRow>(
        `
          INSERT INTO app_users (
            actor_id, tenant_id, authority_id, jurisdiction_id, email,
            display_name, status, role, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          user.actorId,
          user.tenantId,
          user.authorityId,
          user.jurisdictionId,
          user.email,
          user.displayName,
          user.status,
          user.role,
          user.createdAt,
          user.updatedAt,
        ],
      );
      return userFromRow(requireRow(result.rows, "user", user.actorId));
    });
  }

  async listUsers(input: { tenantId: string }): Promise<UserAccount[]> {
    return this.withClient(async (client) => {
      const result = await client.query<UserRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 ORDER BY created_at ASC, actor_id ASC`,
        [input.tenantId],
      );
      return result.rows.map(userFromRow);
    });
  }

  async updateUserStatus(input: {
    tenantId: string;
    actorId: string;
    status: UserStatus;
  }): Promise<UserAccount> {
    return this.withClient(async (client) => {
      const result = await client.query<UserRow>(
        `
          UPDATE app_users
          SET status = $3, updated_at = now()
          WHERE tenant_id = $1 AND actor_id = $2
          RETURNING *
        `,
        [input.tenantId, input.actorId, input.status],
      );
      return userFromRow(requireRow(result.rows, "user", input.actorId));
    });
  }

  async getUserByEmail(input: {
    tenantId: string;
    email: string;
  }): Promise<UserAccount | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<UserRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 AND lower(email) = lower($2)`,
        [input.tenantId, input.email],
      );
      const row = result.rows[0];
      return row ? userFromRow(row) : undefined;
    });
  }

  async getUserById(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserAccount | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<UserRow>(
        `SELECT * FROM app_users WHERE tenant_id = $1 AND actor_id = $2`,
        [input.tenantId, input.actorId],
      );
      const row = result.rows[0];
      return row ? userFromRow(row) : undefined;
    });
  }

  async countUsers(input: { tenantId: string }): Promise<number> {
    return this.withClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM app_users WHERE tenant_id = $1`,
        [input.tenantId],
      );
      return Number(result.rows[0]?.count ?? "0");
    });
  }

  async deleteUser(input: {
    tenantId: string;
    actorId: string;
  }): Promise<void> {
    await this.withClient(async (client) => {
      // Credentials + Sessions hängen per ON DELETE CASCADE am Benutzer (Migration local_auth).
      await client.query(
        `DELETE FROM app_users WHERE tenant_id = $1 AND actor_id = $2`,
        [input.tenantId, input.actorId],
      );
    });
  }

  async withBootstrapLock<T>(
    tenantId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    // Session-Advisory-Lock auf einer DEDIZIERTEN Verbindung, die für die gesamte
    // Bootstrap-Ausführung offen bleibt — die eigentlichen Schreibzugriffe laufen über
    // eigene Verbindungen, konkurrierende Bootstraps serialisiert der Lock trotzdem.
    return this.withClient(async (client) => {
      await client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [
        `auth-bootstrap:${tenantId}`,
      ]);
      try {
        return await run();
      } finally {
        await client.query(
          `SELECT pg_advisory_unlock(hashtextextended($1, 0))`,
          [`auth-bootstrap:${tenantId}`],
        );
      }
    });
  }

  async createLocalCredential(
    credential: LocalCredential,
  ): Promise<LocalCredential> {
    return this.withClient(async (client) => {
      const result = await client.query<CredentialRow>(
        `
          INSERT INTO app_local_credentials (
            actor_id, password_hash, hash_algo, password_changed_at,
            failed_attempts, locked_until, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          credential.actorId,
          credential.passwordHash,
          credential.hashAlgo,
          credential.passwordChangedAt,
          credential.failedAttempts,
          credential.lockedUntil,
          credential.createdAt,
          credential.updatedAt,
        ],
      );
      return credentialFromRow(
        requireRow(result.rows, "local credential", credential.actorId),
      );
    });
  }

  async getLocalCredential(
    actorId: string,
  ): Promise<LocalCredential | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<CredentialRow>(
        `SELECT * FROM app_local_credentials WHERE actor_id = $1`,
        [actorId],
      );
      const row = result.rows[0];
      return row ? credentialFromRow(row) : undefined;
    });
  }

  async recordLoginFailure(actorId: string): Promise<LocalCredential> {
    return this.withClient(async (client) => {
      const result = await client.query<CredentialRow>(
        `
          UPDATE app_local_credentials
          SET failed_attempts = failed_attempts + 1, updated_at = now()
          WHERE actor_id = $1
          RETURNING *
        `,
        [actorId],
      );
      return credentialFromRow(
        requireRow(result.rows, "local credential", actorId),
      );
    });
  }

  async resetLoginFailures(actorId: string): Promise<LocalCredential> {
    return this.withClient(async (client) => {
      const result = await client.query<CredentialRow>(
        `
          UPDATE app_local_credentials
          SET failed_attempts = 0, locked_until = NULL, updated_at = now()
          WHERE actor_id = $1
          RETURNING *
        `,
        [actorId],
      );
      return credentialFromRow(
        requireRow(result.rows, "local credential", actorId),
      );
    });
  }

  async setAccountLock(
    actorId: string,
    lockedUntil: string | null,
  ): Promise<LocalCredential> {
    return this.withClient(async (client) => {
      const result = await client.query<CredentialRow>(
        `
          UPDATE app_local_credentials
          SET locked_until = $2, updated_at = now()
          WHERE actor_id = $1
          RETURNING *
        `,
        [actorId, lockedUntil],
      );
      return credentialFromRow(
        requireRow(result.rows, "local credential", actorId),
      );
    });
  }

  async updateLocalCredentialPassword(input: {
    actorId: string;
    passwordHash: string;
    hashAlgo: string;
    passwordChangedAt: string;
  }): Promise<LocalCredential> {
    return this.withClient(async (client) => {
      const result = await client.query<CredentialRow>(
        `
          UPDATE app_local_credentials
          SET password_hash = $2, hash_algo = $3, password_changed_at = $4,
              failed_attempts = 0, locked_until = NULL, updated_at = now()
          WHERE actor_id = $1
          RETURNING *
        `,
        [
          input.actorId,
          input.passwordHash,
          input.hashAlgo,
          input.passwordChangedAt,
        ],
      );
      return credentialFromRow(
        requireRow(result.rows, "local credential", input.actorId),
      );
    });
  }

  async revokeSessionsForActor(actorId: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `UPDATE app_sessions SET revoked_at = now() WHERE actor_id = $1 AND revoked_at IS NULL`,
        [actorId],
      );
    });
  }

  async linkIdentity(link: IdentityLink): Promise<IdentityLink> {
    return this.withClient(async (client) => {
      const result = await client.query<IdentityLinkRow>(
        `
          INSERT INTO app_identity_links (tenant_id, provider, subject, actor_id)
          VALUES ($1, $2, $3, $4)
          RETURNING tenant_id, provider, subject, actor_id
        `,
        [link.tenantId, link.provider, link.subject, link.actorId],
      );
      const row = requireRow(
        result.rows,
        "identity link",
        `${link.provider}:${link.subject}`,
      );
      return {
        tenantId: row.tenant_id,
        provider: row.provider,
        subject: row.subject,
        actorId: row.actor_id,
      };
    });
  }

  async findActorByIdentity(input: {
    tenantId: string;
    provider: string;
    subject: string;
  }): Promise<string | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<IdentityLinkRow>(
        `
          SELECT actor_id FROM app_identity_links
          WHERE tenant_id = $1 AND provider = $2 AND subject = $3
        `,
        [input.tenantId, input.provider, input.subject],
      );
      return result.rows[0]?.actor_id;
    });
  }

  async createSession(session: SessionRecord): Promise<SessionRecord> {
    return this.withClient(async (client) => {
      const result = await client.query<SessionRow>(
        `
          INSERT INTO app_sessions (
            session_id_hash, actor_id, tenant_id, authority_id,
            jurisdiction_id, created_at, expires_at, revoked_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          session.sessionIdHash,
          session.actorId,
          session.tenantId,
          session.authorityId,
          session.jurisdictionId,
          session.createdAt,
          session.expiresAt,
          session.revokedAt,
        ],
      );
      return sessionFromRow(
        requireRow(result.rows, "session", session.sessionIdHash),
      );
    });
  }

  async getActiveSessionByHash(
    sessionIdHash: string,
  ): Promise<SessionRecord | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<SessionRow>(
        `
          SELECT * FROM app_sessions
          WHERE session_id_hash = $1 AND revoked_at IS NULL AND expires_at > now()
        `,
        [sessionIdHash],
      );
      const row = result.rows[0];
      return row ? sessionFromRow(row) : undefined;
    });
  }

  async revokeSession(sessionIdHash: string): Promise<void> {
    await this.withClient(async (client) => {
      await client.query(
        `UPDATE app_sessions SET revoked_at = now() WHERE session_id_hash = $1`,
        [sessionIdHash],
      );
    });
  }

  private async withClient<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }
}

function requireRow<T>(rows: T[], resource: string, resourceId: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`${resource} "${resourceId}" write returned no row`);
  }
  return row;
}

function userFromRow(row: UserRow): UserAccount {
  return {
    actorId: row.actor_id,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    role: row.role,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function credentialFromRow(row: CredentialRow): LocalCredential {
  return {
    actorId: row.actor_id,
    passwordHash: row.password_hash,
    hashAlgo: row.hash_algo,
    passwordChangedAt: toIsoString(row.password_changed_at),
    failedAttempts: row.failed_attempts,
    lockedUntil: toIsoOrNull(row.locked_until),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    sessionIdHash: row.session_id_hash,
    actorId: row.actor_id,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    createdAt: toIsoString(row.created_at),
    expiresAt: toIsoString(row.expires_at),
    revokedAt: toIsoOrNull(row.revoked_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}
