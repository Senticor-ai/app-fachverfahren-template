import { createPgClient, type PgClient } from "./client.js";

export type UserStatus = "active" | "disabled";

/** Workspace-Rolle (gespeichertes Primitiv). Das Permission-Mapping (users.manage,
 *  boards.collaborate, …) lebt bewusst im App-Server (workspace-permissions.ts), damit
 *  später feinere Rollen ohne Schema-Änderung entstehen können. `citizen` =
 *  selbstregistrierte Bürger:innen (KEINE Workspace-Permissions). */
export type UserRole = "admin" | "member" | "citizen";

/** Personas = Arbeitsbereiche/Produkt-Erlebnis (Navigation), NIE Server-Autorisierung. OFFEN (`string`),
 *  damit ein Fachverfahren BELIEBIGE Personas fuehren kann (Beschaffung/HR) — nicht nur die 3 kanonischen.
 *  `USER_PERSONAS` bleibt die DEFAULT-Reihenfolge (Sortier-Referenz); es ist KEIN Validierungs-Enum mehr:
 *  Personas sind opake Strings (keine Autz), der Server sortiert/dedupliziert sie nur. */
export type UserPersona = string;
export const USER_PERSONAS: readonly UserPersona[] = [
  "buerger",
  "sachbearbeitung",
  "aufsicht",
];

/** Autoritäts-Policy der Persona-Pflege: wer „besitzt" die Zuweisungen?
 *  local = nur Admin-Pflege; oidc_authoritative = nur externe Claims (lokale Pflege
 *  gesperrt); oidc_additive = Union aus beiden (lokale Pflege bleibt erlaubt). */
export type PersonaManagementMode =
  "local" | "oidc_authoritative" | "oidc_additive";

export interface UserAccount {
  actorId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  email: string;
  displayName: string;
  status: UserStatus;
  role: UserRole;
  /** Lokal (Admin/Self-Signup) gepflegte Arbeitsbereiche. PFLICHTFELD: jede Konto-Anlage
   *  entscheidet explizit (fail-closed — es gibt bewusst keinen „alle drei"-Default). */
  localPersonas: UserPersona[];
  /** Extern (OIDC-Sync) gesetzte Arbeitsbereiche — getrennte Quelle, leer bei lokalen Konten. */
  oidcPersonas: UserPersona[];
  personaManagementMode: PersonaManagementMode;
  /** Zählt JEDE principal-relevante Mutation (Status, Rolle, Persona-Quellen, Modus) —
   *  Anker für optimistische Nebenläufigkeit (If-Match) und Principal-Invalidierung.
   *  No-op-Mutationen bumpen NICHT (unveränderte OIDC-Claims sind kein Ereignis). */
  principalVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** Kanonische Form: dedupliziert, Reihenfolge = USER_PERSONAS. Grundlage für
 *  No-op-Erkennung (Mengen-Gleichheit) und stabile UI-Sortierung. */
export function normalizePersonas(
  input: readonly UserPersona[],
): UserPersona[] {
  // Dedup unter Erhalt der Eingabe-Reihenfolge, DANN kanonisch sortiert: die Default-Personas zuerst
  // (USER_PERSONAS-Index), verfahrens-eigene danach (stabil, Eingabe-Reihenfolge). Unbekannte werden NICHT
  // mehr verworfen (Personas sind opak/nicht-Autz) — so ueberleben verfahrens-eigene Personas den Roundtrip.
  const seen = new Set<string>();
  const dedup: UserPersona[] = [];
  for (const persona of input) {
    if (!seen.has(persona)) {
      seen.add(persona);
      dedup.push(persona);
    }
  }
  const rang = (p: UserPersona): number => {
    const i = USER_PERSONAS.indexOf(p);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return dedup.sort((a, b) => rang(a) - rang(b));
}

/** DIE eine Ableitung der wirksamen Arbeitsbereiche aus beiden Quellen je Modus —
 *  deterministisch (kanonische Reihenfolge, dupe-frei); Server-Session und Doku
 *  benutzen ausschließlich diese Funktion. */
export function effectivePersonas(
  account: Pick<
    UserAccount,
    "localPersonas" | "oidcPersonas" | "personaManagementMode"
  >,
): UserPersona[] {
  switch (account.personaManagementMode) {
    case "local":
      return normalizePersonas(account.localPersonas);
    case "oidc_authoritative":
      return normalizePersonas(account.oidcPersonas);
    case "oidc_additive":
      // Dupe-freie Union beider Quellen in kanonischer Reihenfolge (auch verfahrens-eigene Personas).
      return normalizePersonas([
        ...account.localPersonas,
        ...account.oidcPersonas,
      ]);
  }
}

/** Optimistische Nebenläufigkeit: `expectedPrincipalVersion` passt nicht zum Konto —
 *  die Route antwortet 409, der Client lädt neu. */
export class StalePrincipalVersionError extends Error {
  constructor(
    public readonly actorId: string,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `principal version of "${actorId}" is ${actual}, expected ${expected}`,
    );
    this.name = "StalePrincipalVersionError";
  }
}

export interface UserAccessPatch {
  status?: UserStatus;
  localPersonas?: UserPersona[];
  oidcPersonas?: UserPersona[];
  personaManagementMode?: PersonaManagementMode;
}

export interface UserAccessResult {
  before: UserAccount;
  after: UserAccount;
  /** false = No-op nach Normalisierung: kein Version-Bump, kein Audit-Anlass. */
  changed: boolean;
}

/** Gemeinsame Patch-Auflösung beider Store-Implementierungen: normalisiert Personas,
 *  vergleicht als MENGE (Reihenfolge/Duplikate egal) und liefert nur real geänderte
 *  Felder — die Grundlage der No-op-Erkennung. */
function resolveUserAccessPatch(
  current: UserAccount,
  patch: UserAccessPatch,
): { changed: boolean; fields: Partial<UserAccount> } {
  const fields: Partial<UserAccount> = {};
  if (patch.status !== undefined && patch.status !== current.status) {
    fields.status = patch.status;
  }
  if (patch.localPersonas !== undefined) {
    const normalized = normalizePersonas(patch.localPersonas);
    if (!samePersonaSet(normalized, current.localPersonas)) {
      fields.localPersonas = normalized;
    }
  }
  if (patch.oidcPersonas !== undefined) {
    const normalized = normalizePersonas(patch.oidcPersonas);
    if (!samePersonaSet(normalized, current.oidcPersonas)) {
      fields.oidcPersonas = normalized;
    }
  }
  if (
    patch.personaManagementMode !== undefined &&
    patch.personaManagementMode !== current.personaManagementMode
  ) {
    fields.personaManagementMode = patch.personaManagementMode;
  }
  return { changed: Object.keys(fields).length > 0, fields };
}

function samePersonaSet(
  normalized: readonly UserPersona[],
  other: readonly UserPersona[],
): boolean {
  const canonical = normalizePersonas(other);
  return (
    normalized.length === canonical.length &&
    normalized.every((persona, index) => persona === canonical[index])
  );
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
  /** Lokale Konto-Anlage ATOMAR: User + Credential + „local"-Identity-Link entstehen in
   *  EINER Transaktion oder gar nicht — sonst bliebe ein aktives Konto ohne Login-Weg
   *  zurück, dessen E-Mail jede erneute Registrierung blockiert. Duplikat-E-Mail wirft
   *  denselben „already exists"-Fehler wie createUser (Route → 409). */
  createLocalUserWithCredential(input: {
    user: UserAccount;
    credential: LocalCredential;
  }): Promise<UserAccount>;
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
  /** DIE atomare Principal-Mutation (Status, Persona-Quellen, Modus in EINEM Patch):
   *  validiert/normalisiert zuerst, erkennt No-ops (kein Version-Bump, changed=false),
   *  bumpt sonst principalVersion GENAU einmal, liefert before/after (Audit-Grundlage).
   *  `expectedPrincipalVersion` (If-Match) → StalePrincipalVersionError bei Konflikt.
   *  `status: "disabled"` widerruft Sessions ATOMAR mit dem Patch. */
  updateUserAccess(input: {
    tenantId: string;
    actorId: string;
    expectedPrincipalVersion?: number;
    patch: UserAccessPatch;
  }): Promise<UserAccessResult>;
  /** Dünner Wrapper über updateUserAccess({ patch: { status } }) — bestehende Signatur. */
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

  async updateUserAccess(input: {
    tenantId: string;
    actorId: string;
    expectedPrincipalVersion?: number;
    patch: UserAccessPatch;
  }): Promise<UserAccessResult> {
    const key = userKey(input.tenantId, input.actorId);
    const current = this.users.get(key);
    if (!current) {
      throw new Error(
        `user "${input.actorId}" not found in tenant "${input.tenantId}"`,
      );
    }
    if (
      input.expectedPrincipalVersion !== undefined &&
      input.expectedPrincipalVersion !== current.principalVersion
    ) {
      throw new StalePrincipalVersionError(
        input.actorId,
        input.expectedPrincipalVersion,
        current.principalVersion,
      );
    }
    const resolved = resolveUserAccessPatch(current, input.patch);
    const before: UserAccount = { ...current };
    if (!resolved.changed) {
      return { before, after: { ...current }, changed: false };
    }
    const next: UserAccount = {
      ...current,
      ...resolved.fields,
      principalVersion: current.principalVersion + 1,
      updatedAt: nowIso(),
    };
    this.users.set(key, next);
    if (resolved.fields.status === "disabled") {
      for (const [hash, session] of this.sessions) {
        if (session.actorId === input.actorId && !session.revokedAt) {
          this.sessions.set(hash, { ...session, revokedAt: nowIso() });
        }
      }
    }
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
    // „Transaktion" in-memory: erst ALLE Konflikte prüfen, dann schreiben — bei einem
    // Duplikat entsteht weder User noch Credential noch Identity-Link.
    const user = await this.createUser(input.user);
    this.credentials.set(input.credential.actorId, { ...input.credential });
    this.identityLinks.set(
      identityKey(user.tenantId, "local", user.actorId),
      user.actorId,
    );
    return user;
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
  async createLocalUserWithCredential(): Promise<UserAccount> {
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
  async updateUserAccess(): Promise<UserAccessResult> {
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
  // EPHEMERER PREVIEW-/DEV-STORE (EINE Wahrheit über alle Stores): mit APP_STORE_MODE=memory läuft die Runtime OHNE
  // Postgres auf einem prozess-lokalen In-Memory-Store. Ohne ihn wäre der Store „unavailable" → storeAvailable=false →
  // apiAvailable=false → die Preview rendert „Server nicht erreichbar". Rückwärtskompatibel: der Default (ungesetzt) bleibt
  // Postgres-or-Unavailable; NUR der explizite memory-Modus (Preview/Smoke) schaltet den flüchtigen Store frei.
  if (env["APP_STORE_MODE"] === "memory") return new InMemoryAuthStore();
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
  local_personas: UserPersona[];
  oidc_personas: UserPersona[];
  persona_management_mode: PersonaManagementMode;
  principal_version: number | string;
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
        insertUserSql,
        insertUserParams(user),
      );
      return userFromRow(requireRow(result.rows, "user", user.actorId));
    });
  }

  async createLocalUserWithCredential(input: {
    user: UserAccount;
    credential: LocalCredential;
  }): Promise<UserAccount> {
    // EINE Transaktion für User + Credential + „local"-Identity-Link: entweder entsteht
    // das Konto vollständig oder gar nicht (kein aktives Konto ohne Login-Weg, dessen
    // E-Mail jede erneute Registrierung blockiert). Duplikate meldet der Unique-Index.
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await client.query<UserRow>(
          insertUserSql,
          insertUserParams(input.user),
        );
        const row = requireRow(result.rows, "user", input.user.actorId);
        await client.query(
          `
            INSERT INTO app_local_credentials (
              actor_id, password_hash, hash_algo, password_changed_at,
              failed_attempts, locked_until, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            input.credential.actorId,
            input.credential.passwordHash,
            input.credential.hashAlgo,
            input.credential.passwordChangedAt,
            input.credential.failedAttempts,
            input.credential.lockedUntil,
            input.credential.createdAt,
            input.credential.updatedAt,
          ],
        );
        await client.query(
          `
            INSERT INTO app_identity_links (tenant_id, provider, subject, actor_id)
            VALUES ($1, 'local', $2, $2)
          `,
          [input.user.tenantId, input.user.actorId],
        );
        await client.query("COMMIT");
        return userFromRow(row);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        // Unique-Verletzung des tenant-scoped E-Mail-Index → dieselbe Fehlerform wie
        // InMemory.createUser, damit die Routen einheitlich auf 409 mappen.
        if (isUniqueViolation(error)) {
          throw new Error(
            `user with email "${input.user.email}" already exists in tenant "${input.user.tenantId}"`,
            { cause: error },
          );
        }
        throw error;
      }
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

  async updateUserAccess(input: {
    tenantId: string;
    actorId: string;
    expectedPrincipalVersion?: number;
    patch: UserAccessPatch;
  }): Promise<UserAccessResult> {
    return this.withClient(async (client) => {
      // EINE Transaktion: Zeile sperren (FOR UPDATE, kein TOCTOU), ganzen Patch auflösen,
      // No-op ohne Version-Bump beenden, sonst GENAU ein Bump — und die Session-Konsequenz
      // von `disabled` atomar mitnehmen (sonst bliebe nach einem Teilfehler ein
      // deaktiviertes Konto mit lebender 12h-Session zurück).
      await client.query("BEGIN");
      try {
        const currentResult = await client.query<UserRow>(
          `SELECT * FROM app_users WHERE tenant_id = $1 AND actor_id = $2 FOR UPDATE`,
          [input.tenantId, input.actorId],
        );
        const currentRow = currentResult.rows[0];
        if (!currentRow) {
          throw new Error(
            `user "${input.actorId}" not found in tenant "${input.tenantId}"`,
          );
        }
        const before = userFromRow(currentRow);
        if (
          input.expectedPrincipalVersion !== undefined &&
          input.expectedPrincipalVersion !== before.principalVersion
        ) {
          throw new StalePrincipalVersionError(
            input.actorId,
            input.expectedPrincipalVersion,
            before.principalVersion,
          );
        }
        const resolved = resolveUserAccessPatch(before, input.patch);
        if (!resolved.changed) {
          await client.query("COMMIT");
          return { before, after: before, changed: false };
        }
        const merged = { ...before, ...resolved.fields };
        const updateResult = await client.query<UserRow>(
          `
            UPDATE app_users
            SET status = $3, local_personas = $4, oidc_personas = $5,
                persona_management_mode = $6,
                principal_version = principal_version + 1, updated_at = now()
            WHERE tenant_id = $1 AND actor_id = $2
            RETURNING *
          `,
          [
            input.tenantId,
            input.actorId,
            merged.status,
            normalizePersonas(merged.localPersonas),
            normalizePersonas(merged.oidcPersonas),
            merged.personaManagementMode,
          ],
        );
        const row = requireRow(updateResult.rows, "user", input.actorId);
        if (resolved.fields.status === "disabled") {
          await client.query(
            `UPDATE app_sessions SET revoked_at = now() WHERE actor_id = $1 AND revoked_at IS NULL`,
            [input.actorId],
          );
        }
        await client.query("COMMIT");
        return { before, after: userFromRow(row), changed: true };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
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

// Von createUser UND createLocalUserWithCredential geteilt — die Spaltenliste existiert
// genau einmal.
const insertUserSql = `
  INSERT INTO app_users (
    actor_id, tenant_id, authority_id, jurisdiction_id, email,
    display_name, status, role, local_personas, oidc_personas,
    persona_management_mode, principal_version, created_at, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  RETURNING *
`;

function insertUserParams(user: UserAccount): unknown[] {
  return [
    user.actorId,
    user.tenantId,
    user.authorityId,
    user.jurisdictionId,
    user.email,
    user.displayName,
    user.status,
    user.role,
    normalizePersonas(user.localPersonas),
    normalizePersonas(user.oidcPersonas),
    user.personaManagementMode,
    user.principalVersion,
    user.createdAt,
    user.updatedAt,
  ];
}

/** Duplikat-Erkennung über beide Store-Implementierungen: Postgres meldet die
 *  Unique-Violation als SQLSTATE 23505 (wird in createLocalUserWithCredential bereits
 *  in die "already exists"-Form übersetzt), der InMemory-Store wirft "... already
 *  exists" — Routen mappen dies einheitlich auf 409/neutral. */
export function isDuplicateUserError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "23505" || /already exists/i.test(error.message);
}

/** Postgres-Fehlercode 23505 = unique_violation (tenant-scoped E-Mail-Index). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
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
    localPersonas: normalizePersonas(row.local_personas ?? []),
    oidcPersonas: normalizePersonas(row.oidc_personas ?? []),
    personaManagementMode: row.persona_management_mode,
    // bigint kommt aus pg als String an.
    principalVersion: Number(row.principal_version),
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
