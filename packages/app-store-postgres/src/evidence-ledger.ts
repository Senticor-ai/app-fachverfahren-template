// evidence-ledger — der HASH-VERKETTETE Evidence-Ledger (CHOS Blueprint §15.3 / §27): jede agentische
// Governance-Handlung (Tool Decision, Spine-Vorschlag, Review, Approval) wird actor-gebunden + tamper-evident
// protokolliert. Manipulation oder Lücke bricht die Hash-Kette. BEWUSST getrennt vom fachlichen Audit
// (app_audit_events, das eine Rechtsgrundlage trägt — die wird NIE erfunden): ein Spine-Vorschlag ist eine
// technische/agentische Handlung, kein Verwaltungsakt mit legalBasisId.
//
// Nur METADATEN werden protokolliert (Akteur, Typ, Zusammenfassung, Referenzen, Modell) — NIE der
// Vorschlagsinhalt (potenziell PII), genau wie das app-data-Audit. Die Kette nutzt dieselbe kanonische
// Hash-Primitive wie das fachliche Audit (`hashChainEntry`) — eine Wahrheit.
//
// DAUERHAFTIGKEIT (der gemessene Befund, der die Postgres-Variante unten ausgelöst hat): bis zum
// 2026-07-28 gab es hier NUR `InMemoryEvidenceLedger` — und genau der war in
// `apps/fachverfahren/server/index.ts` produktiv verdrahtet. Jeder Nachbar-Speicher dieses Pakets
// (audit, auth, case, kanban, task, wissen) war längst durable; ausgerechnet der NACHWEIS lebte nur im
// Prozess. Eine Hash-Kette, die ein Neustart löscht, beweist nichts — sie ist ein Siegel auf einer Tür,
// die es nicht mehr gibt. Deshalb: `PostgresEvidenceLedger` (Tabelle `app_evidence_ledger`, append-only
// per DB-Trigger) als OSS-Default, `ChosEvidenceLedger` für den Graph-Store, `Unavailable…` fail-closed —
// und `createEvidenceLedgerFromEnv` wählt wie jeder andere Store. In-Memory bleibt AUSSCHLIESSLICH für
// Tests/DEV und sagt beim Start laut, dass der Nachweis keinen Neustart überlebt.
import { hashChainEntry } from "./audit-chain.js";
import { ChosEvidenceLedger } from "./chos-evidence-ledger.js";
import { createChosClientFromEnv } from "./chos-client.js";
import { createPgClient, type PgClient } from "./client.js";

/** Ein Eintrag im Evidence-Ledger — actor-gebunden, hash-verkettet. */
export interface EvidenceEntry {
  evidenceId: string;
  /** Der Ledger-Strom (z. B. `composable:musterverfahren`) — pro Strom eine eigene Kette. */
  ledgerId: string;
  tenantId: string;
  actorId: string;
  /** Handlungstyp, z. B. "spine.suggestion", "review", "approval". */
  entryType: string;
  summary: string;
  /** Referenzen (z. B. { composableId, aufgabe, modelId, caseId }) — nie PII/Inhalt. */
  refs: Record<string, string>;
  occurredAt: string;
  prevHash: string | null;
  entryHash: string;
}

/** Die Eingabe zum Anhängen — Ketten-Felder (prev/entryHash) stempelt der Ledger selbst. */
export type EvidenceAppendInput = Omit<EvidenceEntry, "prevHash" | "entryHash">;

/** Berechnet den `entryHash` eines Evidence-Eintrags (kanonische Bytes INKL. prevHash). */
export function evidenceEntryHash(
  input: EvidenceAppendInput,
  prevHash: string | null,
): string {
  return hashChainEntry(
    {
      evidenceId: input.evidenceId,
      ledgerId: input.ledgerId,
      tenantId: input.tenantId,
      actorId: input.actorId,
      entryType: input.entryType,
      summary: input.summary,
      refs: input.refs,
      occurredAt: input.occurredAt,
    },
    prevHash,
  );
}

/** Prüft die Hash-Kette eines (geordneten) Ledger-Stroms: jeder `entryHash` re-hasht + jeder `prevHash`
 *  referenziert den Vorgänger. Gibt `valid` + optional den 0-basierten Index des ersten Bruchs zurück. */
export function verifyEvidenceChain(entries: readonly EvidenceEntry[]): {
  valid: boolean;
  length: number;
  brokenAt?: number;
} {
  let prev: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.prevHash !== prev)
      return { valid: false, length: entries.length, brokenAt: i };
    if (evidenceEntryHash(e, e.prevHash) !== e.entryHash)
      return { valid: false, length: entries.length, brokenAt: i };
    prev = e.entryHash;
  }
  return { valid: true, length: entries.length };
}

/** Der Evidence-Ledger-Port. Append hängt hash-verkettet an die Spitze des Stroms an; list/verify lesen +
 *  prüfen. Implementierungen: `PostgresEvidenceLedger` (OSS-Default, durable) · `ChosEvidenceLedger`
 *  (Graph-Store) · `UnavailableEvidenceLedger` (fail-closed) · `InMemoryEvidenceLedger` (NUR Tests/DEV). */
export interface EvidenceLedger {
  append(input: EvidenceAppendInput): Promise<EvidenceEntry>;
  list(query: { tenantId: string; ledgerId: string }): Promise<EvidenceEntry[]>;
  verify(query: {
    tenantId: string;
    ledgerId: string;
  }): Promise<{ valid: boolean; length: number; brokenAt?: number }>;
}

/**
 * In-Memory-EvidenceLedger — AUSSCHLIESSLICH FÜR TESTS UND DEV. Einfüge-Reihenfolge IST Ketten-Reihenfolge.
 *
 * NICHT als Produktions-Backing benutzen: der Nachweis stirbt mit dem Prozess. Wer ihn über
 * `createEvidenceLedgerFromEnv` (APP_STORE_MODE=memory) bekommt, bekommt dazu eine laute Warnung — ein
 * stiller Rückfall auf flüchtigen Nachweis wäre derselbe Defekt, den die Postgres-Variante behebt.
 */
export class InMemoryEvidenceLedger implements EvidenceLedger {
  private readonly streams = new Map<string, EvidenceEntry[]>();

  private key(tenantId: string, ledgerId: string): string {
    return `${tenantId}:${ledgerId}`;
  }

  async append(input: EvidenceAppendInput): Promise<EvidenceEntry> {
    const k = this.key(input.tenantId, input.ledgerId);
    const stream = this.streams.get(k) ?? [];
    const prevHash =
      stream.length > 0 ? stream[stream.length - 1]!.entryHash : null;
    const entry: EvidenceEntry = {
      ...input,
      refs: { ...input.refs },
      prevHash,
      entryHash: evidenceEntryHash(input, prevHash),
    };
    stream.push(entry);
    this.streams.set(k, stream);
    return { ...entry, refs: { ...entry.refs } };
  }

  async list(query: {
    tenantId: string;
    ledgerId: string;
  }): Promise<EvidenceEntry[]> {
    return (
      this.streams.get(this.key(query.tenantId, query.ledgerId)) ?? []
    ).map((e) => ({ ...e, refs: { ...e.refs } }));
  }

  async verify(query: { tenantId: string; ledgerId: string }) {
    return verifyEvidenceChain(await this.list(query));
  }
}

// ─── Unavailable ─────────────────────────────────────────────────────────

/** Fail-closed: ist keine Persistenz konfiguriert, gibt es KEINEN Ledger. Lieber ein lauter Fehler als ein
 *  flüchtiger Nachweis, der Dauerhaftigkeit vortäuscht (Parität zu Unavailable{Audit,Case,Wissen}Store). */
export class UnavailableEvidenceLedger implements EvidenceLedger {
  constructor(private readonly reason: string) {}

  async append(): Promise<EvidenceEntry> {
    throw new Error(this.reason);
  }
  async list(): Promise<EvidenceEntry[]> {
    throw new Error(this.reason);
  }
  async verify(): Promise<{
    valid: boolean;
    length: number;
    brokenAt?: number;
  }> {
    throw new Error(this.reason);
  }
}

// ─── Postgres ────────────────────────────────────────────────────────────
// Durable Adapter auf `app_evidence_ledger` (Migration 20260728000000_evidence_ledger). APPEND-ONLY: der
// Adapter führt NUR INSERT + SELECT aus; die Tabelle erzwingt es zusätzlich per Trigger + REVOKE. Muster wie
// PostgresWissenStore/PostgresCaseStore (withClient pro Aufruf); der verkettete Append läuft in EINER
// Transaktion. Die Hash-Arithmetik bleibt `evidenceEntryHash`/`verifyEvidenceChain` — es gibt nur EINE Kette.

const LEDGER_COLS = `evidence_id, ledger_id, tenant_id, actor_id, entry_type,
  summary, refs, occurred_at, prev_hash, entry_hash`;

interface EvidenceRow extends Record<string, unknown> {
  evidence_id: string;
  ledger_id: string;
  tenant_id: string;
  actor_id: string;
  entry_type: string;
  summary: string;
  refs: Record<string, string> | null;
  occurred_at: string;
  prev_hash: string | null;
  entry_hash: string;
}

function entryFromRow(row: EvidenceRow): EvidenceEntry {
  return {
    evidenceId: row.evidence_id,
    ledgerId: row.ledger_id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    entryType: row.entry_type,
    summary: row.summary,
    refs: row.refs ?? {},
    // `occurred_at` ist bewusst text (s. Migration): der Ledger gibt exakt die Bytes zurück, über die
    // gehasht wurde — ein timestamptz-Roundtrip würde die Kette für nicht-kanonische Eingaben brechen.
    occurredAt: row.occurred_at,
    prevHash: row.prev_hash,
    entryHash: row.entry_hash,
  };
}

export class PostgresEvidenceLedger implements EvidenceLedger {
  constructor(private readonly databaseUrl: string) {}

  async append(input: EvidenceAppendInput): Promise<EvidenceEntry> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        // KEINE GABELUNG DER KETTE: der Advisory-Lock serialisiert konkurrierende Appends DESSELBEN Stroms
        // bis zum COMMIT — "Spitze lesen" und "anhängen" sind damit unteilbar. Der fachliche Audit-Pfad
        // (case-store.ts, insertChainedAuditEvent) lässt für Standalone-Appends bewusst ein enges
        // Race-Fenster offen; für den NACHWEIS ist das zu wenig, deshalb hier der Lock. Der UNIQUE-Index
        // (tenant_id, ledger_id, COALESCE(prev_hash,'')) ist die zweite, DB-seitige Verteidigungslinie:
        // selbst ohne Lock kann kein zweiter Nachfolger und kein zweiter Genesis entstehen.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0::bigint))",
          [JSON.stringify([input.tenantId, input.ledgerId])],
        );
        const prev = await client.query<{ entry_hash: string }>(
          `SELECT entry_hash FROM app_evidence_ledger
            WHERE tenant_id = $1 AND ledger_id = $2
            ORDER BY seq DESC
            LIMIT 1`,
          [input.tenantId, input.ledgerId],
        );
        // Das prevHash kommt aus dem DAUERHAFTEN Stand, nie aus einem Prozess-Speicher.
        const prevHash = prev.rows[0]?.entry_hash ?? null;
        const entry: EvidenceEntry = {
          ...input,
          refs: { ...input.refs },
          prevHash,
          entryHash: evidenceEntryHash(input, prevHash),
        };
        await client.query(
          `INSERT INTO app_evidence_ledger (${LEDGER_COLS})
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
          [
            entry.evidenceId,
            entry.ledgerId,
            entry.tenantId,
            entry.actorId,
            entry.entryType,
            entry.summary,
            JSON.stringify(entry.refs),
            entry.occurredAt,
            entry.prevHash,
            entry.entryHash,
          ],
        );
        await client.query("COMMIT");
        return { ...entry, refs: { ...entry.refs } };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  async list(query: {
    tenantId: string;
    ledgerId: string;
  }): Promise<EvidenceEntry[]> {
    return this.withClient(async (client) => {
      const result = await client.query<EvidenceRow>(
        `SELECT ${LEDGER_COLS} FROM app_evidence_ledger
          WHERE tenant_id = $1 AND ledger_id = $2
          ORDER BY seq ASC`,
        [query.tenantId, query.ledgerId],
      );
      return result.rows.map(entryFromRow);
    });
  }

  async verify(query: { tenantId: string; ledgerId: string }) {
    return verifyEvidenceChain(await this.list(query));
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

// ─── Auswahl aus der Umgebung ────────────────────────────────────────────

/** Die EINE Stelle, an der ein flüchtiger Nachweis benannt wird. ABSENZ IST EINE AUSSAGE: ein stiller
 *  Rückfall auf Prozess-Speicher wäre derselbe Defekt in neuer Verkleidung. */
function warneFluechtigerNachweis(grund: string): void {
  console.warn(
    `[evidence-ledger] FLÜCHTIG (${grund}): der Evidence-Ledger liegt NUR im Prozessspeicher. ` +
      "Der Nachweis überlebt keinen Neustart — die Hash-Kette belegt dann nichts. Für einen Betrieb " +
      "APP_PG_URL/APP_PG_DIRECT_URL setzen (Postgres) oder APP_STORE_MODE=chos.",
  );
}

/**
 * Wählt den Evidence-Ledger aus der Umgebung — nach DEMSELBEN Muster wie `createAuditStoreFromEnv` /
 * `createWissenStoreFromEnv`: `APP_STORE_MODE=memory` → In-Memory (DEV/Preview, mit lauter Warnung) ·
 * `APP_STORE_MODE=chos` (+ `CHOS_API_URL`) → Graph-Store, ohne URL fail-closed · sonst Postgres über
 * `APP_PG_URL`/`APP_PG_DIRECT_URL` · ohne alles fail-closed `Unavailable`. Kein stiller Fallback.
 */
export function createEvidenceLedgerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EvidenceLedger {
  if (env["APP_STORE_MODE"] === "memory") {
    warneFluechtigerNachweis("APP_STORE_MODE=memory");
    return new InMemoryEvidenceLedger();
  }
  if (env["APP_STORE_MODE"] === "chos") {
    const client = createChosClientFromEnv(env);
    return client
      ? new ChosEvidenceLedger(client)
      : new UnavailableEvidenceLedger(
          "CHOS_API_URL is required for APP_STORE_MODE=chos",
        );
  }
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresEvidenceLedger(databaseUrl)
    : new UnavailableEvidenceLedger(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for evidence-ledger data",
      );
}
