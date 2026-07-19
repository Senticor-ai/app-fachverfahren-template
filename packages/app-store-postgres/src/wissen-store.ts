// wissen-store — der VERFAHRENS-WISSENS-Store: das generelle, KI-gestützte Wiki EINES Fachverfahrens
// (Normen-Auslegung, Arbeitshilfen, FAQ, Fähigkeiten), verfahrens-scoped statt fall-scoped. Er ist die
// durable Ebene der Brücke Mensch↔KI-Agent↔Composable: Mensch UND Agent hinterlassen typisierte Wissens-
// Einträge, die chos-code später in Skills + Kontext übersetzt. APPEND-ONLY (eine Korrektur ist ein neuer
// Eintrag) und mandanten-/behörden-scoped — dieselbe Zellform wie der Fall-Aktenvermerk (Zwei-Ebenen-
// Symmetrie), nur an der ProcedureVersion verankert.
//
// TRIAS wie CaseStore/TaskStore: InMemory (DEV/Tests) · Unavailable (fail-closed) · createXFromEnv. Der
// Postgres-Adapter + die Migration sind der nächste Ausbauschritt (konsistent mit der übrigen Postgres-
// Politik); der Standalone-/OSS-DEV-Pfad läuft auf InMemory. In PROD sitzt derselbe Store hinter der Naht.

import { createPgClient, type PgClient } from "./client.js";

/** Ein Wissens-Eintrag eines Verfahrens (dieselbe Zellform wie der Fall-Aktenvermerk, verfahrens-scoped). */
export interface VerfahrensWissenEintrag {
  eintragId: string;
  procedureId: string;
  procedureVersion: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  /** Akteurs-Kennung (server-autoritativ aus der Sitzung). */
  actorId: string;
  /** Zell-Typ (wissen/faehigkeit/notiz/reflexion/… — frei, die BFF-Schicht kuratiert das Vokabular). */
  art: string;
  /** Peer-Kennung: `human:<rolle>` ODER Modell/Agent. */
  urheber: string;
  text: string;
  /** Strukturierte, agenten-konsumierbare Metadaten. */
  metadaten: Record<string, unknown>;
  occurredAt: string;
}

export interface WissenQuery {
  tenantId: string;
  authorityId: string;
  procedureId: string;
  procedureVersion: string;
  limit?: number;
}

export interface WissenStore {
  /** Append-only: einen Wissens-Eintrag anfügen (nie ändern/löschen). */
  appendEintrag(
    eintrag: VerfahrensWissenEintrag,
  ): Promise<VerfahrensWissenEintrag>;
  /** Die Wissens-Einträge eines Verfahrens (behörden-scoped), chronologisch aufsteigend. */
  listEintraege(query: WissenQuery): Promise<VerfahrensWissenEintrag[]>;
  ping?(): Promise<void>;
}

/** Defensive Kopie — der Store gibt NIE eine Referenz auf seinen internen Zustand heraus (append-only:
 *  eine Caller-Mutation darf die gespeicherte Zelle nicht verändern). */
function clone(e: VerfahrensWissenEintrag): VerfahrensWissenEintrag {
  return { ...e, metadaten: { ...e.metadaten } };
}

/** In-Memory, append-only. Für DEV/Preview/Tests; der Standalone-Pfad des Templates. */
export class InMemoryWissenStore implements WissenStore {
  private readonly eintraege: VerfahrensWissenEintrag[] = [];

  async appendEintrag(
    eintrag: VerfahrensWissenEintrag,
  ): Promise<VerfahrensWissenEintrag> {
    this.eintraege.push(clone(eintrag));
    return clone(eintrag);
  }

  async listEintraege(query: WissenQuery): Promise<VerfahrensWissenEintrag[]> {
    const treffer = this.eintraege
      .filter(
        (e) =>
          e.tenantId === query.tenantId &&
          e.authorityId === query.authorityId &&
          e.procedureId === query.procedureId &&
          e.procedureVersion === query.procedureVersion,
      )
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map(clone);
    return query.limit !== undefined ? treffer.slice(0, query.limit) : treffer;
  }

  async ping(): Promise<void> {
    // In-Memory ist immer bereit.
  }
}

/** Fail-closed: kein stiller Fallback ohne echte Persistenz. */
export class UnavailableWissenStore implements WissenStore {
  constructor(private readonly reason: string) {}
  async appendEintrag(): Promise<VerfahrensWissenEintrag> {
    throw new Error(this.reason);
  }
  async listEintraege(): Promise<VerfahrensWissenEintrag[]> {
    throw new Error(this.reason);
  }
  async ping(): Promise<void> {
    throw new Error(this.reason);
  }
}

/**
 * Wählt den WissenStore aus der Umgebung. `APP_STORE_MODE=memory` → InMemory (DEV/Preview/Standalone).
 * Sonst fail-closed `Unavailable`: der Postgres-Adapter + die Migration sind der nächste Ausbauschritt
 * (Naht wie CaseStore/TaskStore) — kein stiller In-Memory-Fallback in PROD.
 */
export function createWissenStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WissenStore {
  if (env["APP_STORE_MODE"] === "memory") return new InMemoryWissenStore();
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresWissenStore(databaseUrl)
    : new UnavailableWissenStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for verfahren-wissen data",
      );
}

// ─── Postgres ────────────────────────────────────────────────────────────
// Durable Adapter auf app_verfahren_wissen (Migration 20260719000000_verfahren_wissen). APPEND-ONLY: der Store
// führt NUR INSERT + SELECT aus; die Tabelle erzwingt es zusätzlich per Trigger + REVOKE. Muster wie
// PostgresAuditStore (append-only): withClient öffnet/schließt pro Query eine Verbindung.

interface WissenRow extends Record<string, unknown> {
  eintrag_id: string;
  procedure_id: string;
  procedure_version: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  actor_id: string;
  art: string;
  urheber: string;
  text: string;
  metadaten: Record<string, unknown>;
  occurred_at: Date | string;
}

function eintragFromRow(row: WissenRow): VerfahrensWissenEintrag {
  return {
    eintragId: row.eintrag_id,
    procedureId: row.procedure_id,
    procedureVersion: row.procedure_version,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    actorId: row.actor_id,
    art: row.art,
    urheber: row.urheber,
    text: row.text,
    metadaten: row.metadaten ?? {},
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
  };
}

export class PostgresWissenStore implements WissenStore {
  constructor(private readonly databaseUrl: string) {}

  async appendEintrag(
    eintrag: VerfahrensWissenEintrag,
  ): Promise<VerfahrensWissenEintrag> {
    return this.withClient(async (client) => {
      const result = await client.query<WissenRow>(
        `
          INSERT INTO app_verfahren_wissen (
            eintrag_id, procedure_id, procedure_version, tenant_id, authority_id,
            jurisdiction_id, actor_id, art, urheber, text, metadaten, occurred_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
          RETURNING *
        `,
        [
          eintrag.eintragId,
          eintrag.procedureId,
          eintrag.procedureVersion,
          eintrag.tenantId,
          eintrag.authorityId,
          eintrag.jurisdictionId,
          eintrag.actorId,
          eintrag.art,
          eintrag.urheber,
          eintrag.text,
          JSON.stringify(eintrag.metadaten),
          eintrag.occurredAt,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(
          `verfahren-wissen "${eintrag.eintragId}" write returned no row`,
        );
      }
      return eintragFromRow(row);
    });
  }

  async listEintraege(query: WissenQuery): Promise<VerfahrensWissenEintrag[]> {
    return this.withClient(async (client) => {
      const result = await client.query<WissenRow>(
        `
          SELECT * FROM app_verfahren_wissen
          WHERE tenant_id = $1 AND authority_id = $2
            AND procedure_id = $3 AND procedure_version = $4
          ORDER BY occurred_at ASC, eintrag_id ASC
          LIMIT $5
        `,
        // LIMIT NULL = alle Zeilen (deckungsgleich mit InMemory: kein Default-Limit).
        [
          query.tenantId,
          query.authorityId,
          query.procedureId,
          query.procedureVersion,
          query.limit ?? null,
        ],
      );
      return result.rows.map(eintragFromRow);
    });
  }

  async ping(): Promise<void> {
    await this.withClient(async (client) => {
      await client.query("SELECT 1");
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
