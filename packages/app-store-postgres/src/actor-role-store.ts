// actor-role-store — der Lesepfad auf `app_actor_roles` (Zuständigkeit). Bis hierher war die Tabelle totes Schema.
//
// Zweck: server-seitig prüfen, WER in einem Mandanten/einer Behörde eine aktive Rolle trägt — die Grundlage für den
// KI-Zuständigkeitsfilter (eine KI-Zuweisung darf NUR an zuständige, aktive Akteure gehen, kein Plane-Self-Assign)
// und für rollenbasierte Automations-Zuweisungen. Node-safe, mandanten-scoped, zwei Laufzeiten (In-Memory/Postgres).
// „Aktiv" = `valid_from <= now < valid_to` (oder `valid_to IS NULL`).
import { createPooledPgClient } from "./client.js";

export interface ActorRole {
  tenantId: string;
  actorId: string;
  roleKey: string;
  authorityId: string;
  jurisdictionId: string;
  validFrom: string;
  validTo: string | null;
}

export interface ActorRoleStore {
  insertActorRole(role: ActorRole): Promise<ActorRole>;
  /** Aktive Rollen eines Akteurs im Mandanten (zum Zeitpunkt `nowIso`). Leer ⇒ der Akteur ist kein zuständiger
   *  Bearbeiter (dann darf ihm die KI keine Aufgabe zuweisen). */
  listActiveRolesForActor(query: {
    tenantId: string;
    actorId: string;
    nowIso: string;
  }): Promise<ActorRole[]>;
  /** Aktive Akteure mit einer bestimmten Rolle in einer Behörde — für rollenbasierte Zuweisungs-Vorschläge. */
  listActiveActorsForRole(query: {
    tenantId: string;
    authorityId: string;
    roleKey: string;
    nowIso: string;
  }): Promise<ActorRole[]>;
}

function istAktiv(r: ActorRole, nowIso: string): boolean {
  return r.validFrom <= nowIso && (r.validTo === null || r.validTo > nowIso);
}

// ── In-Memory ─────────────────────────────────────────────────────────────────────────────────────
export class InMemoryActorRoleStore implements ActorRoleStore {
  private readonly roles: ActorRole[] = [];

  async insertActorRole(role: ActorRole): Promise<ActorRole> {
    // Upsert auf dem 4-Spalten-Schlüssel (tenant, actor, role, authority) — verhaltensgleich zum Postgres-PK.
    const i = this.roles.findIndex(
      (r) =>
        r.tenantId === role.tenantId &&
        r.actorId === role.actorId &&
        r.roleKey === role.roleKey &&
        r.authorityId === role.authorityId,
    );
    if (i >= 0) this.roles[i] = { ...role };
    else this.roles.push({ ...role });
    return { ...role };
  }

  async listActiveRolesForActor(query: {
    tenantId: string;
    actorId: string;
    nowIso: string;
  }): Promise<ActorRole[]> {
    return this.roles
      .filter(
        (r) =>
          r.tenantId === query.tenantId &&
          r.actorId === query.actorId &&
          istAktiv(r, query.nowIso),
      )
      .map((r) => ({ ...r }));
  }

  async listActiveActorsForRole(query: {
    tenantId: string;
    authorityId: string;
    roleKey: string;
    nowIso: string;
  }): Promise<ActorRole[]> {
    return this.roles
      .filter(
        (r) =>
          r.tenantId === query.tenantId &&
          r.authorityId === query.authorityId &&
          r.roleKey === query.roleKey &&
          istAktiv(r, query.nowIso),
      )
      .map((r) => ({ ...r }));
  }
}

// ── Postgres ───────────────────────────────────────────────────────────────────────────────────────
export class PostgresActorRoleStore implements ActorRoleStore {
  constructor(private readonly databaseUrl: string) {}

  async insertActorRole(role: ActorRole): Promise<ActorRole> {
    return this.withClient(async (c) => {
      await c.query(
        // Conflict-Target = der 4-Spalten-PK (inkl. authority_id) → ein Akteur kann dieselbe Rolle in mehreren
        // Behörden halten; nur bei exakt gleicher (tenant, actor, role, authority) wird das Zeitfenster aktualisiert.
        `INSERT INTO app_actor_roles
           (tenant_id, actor_id, role_key, authority_id, jurisdiction_id, valid_from, valid_to)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, actor_id, role_key, authority_id) DO UPDATE SET
           jurisdiction_id = EXCLUDED.jurisdiction_id,
           valid_from = EXCLUDED.valid_from,
           valid_to = EXCLUDED.valid_to`,
        [
          role.tenantId,
          role.actorId,
          role.roleKey,
          role.authorityId,
          role.jurisdictionId,
          role.validFrom,
          role.validTo,
        ],
      );
      return { ...role };
    });
  }

  async listActiveRolesForActor(query: {
    tenantId: string;
    actorId: string;
    nowIso: string;
  }): Promise<ActorRole[]> {
    return this.withClient(async (c) => {
      const r = await c.query<RoleRow>(
        `${ROLE_SELECT}
         WHERE tenant_id = $1 AND actor_id = $2
           AND valid_from <= $3 AND (valid_to IS NULL OR valid_to > $3)`,
        [query.tenantId, query.actorId, query.nowIso],
      );
      return r.rows.map(roleFromRow);
    });
  }

  async listActiveActorsForRole(query: {
    tenantId: string;
    authorityId: string;
    roleKey: string;
    nowIso: string;
  }): Promise<ActorRole[]> {
    return this.withClient(async (c) => {
      const r = await c.query<RoleRow>(
        `${ROLE_SELECT}
         WHERE tenant_id = $1 AND authority_id = $2 AND role_key = $3
           AND valid_from <= $4 AND (valid_to IS NULL OR valid_to > $4)`,
        [query.tenantId, query.authorityId, query.roleKey, query.nowIso],
      );
      return r.rows.map(roleFromRow);
    });
  }

  private async withClient<T>(
    cb: (c: import("./client.js").PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPooledPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await cb(client);
    } finally {
      await client.end();
    }
  }
}

export function createActorRoleStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ActorRoleStore | undefined {
  const url = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return url ? new PostgresActorRoleStore(url) : undefined;
}

const ROLE_COLS = `tenant_id, actor_id, role_key, authority_id, jurisdiction_id, valid_from, valid_to`;
const ROLE_SELECT = `SELECT ${ROLE_COLS} FROM app_actor_roles`;

interface RoleRow extends Record<string, unknown> {
  tenant_id: string;
  actor_id: string;
  role_key: string;
  authority_id: string;
  jurisdiction_id: string;
  valid_from: Date | string;
  valid_to: Date | string | null;
}

function roleFromRow(r: RoleRow): ActorRole {
  const iso = (v: Date | string | null): string | null =>
    v === null ? null : v instanceof Date ? v.toISOString() : v;
  return {
    tenantId: r.tenant_id,
    actorId: r.actor_id,
    roleKey: r.role_key,
    authorityId: r.authority_id,
    jurisdictionId: r.jurisdiction_id,
    validFrom: iso(r.valid_from)!,
    validTo: iso(r.valid_to),
  };
}
