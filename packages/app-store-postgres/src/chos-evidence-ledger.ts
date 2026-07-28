// chos-evidence-ledger — der EvidenceLedger-Adapter auf den chos-Graph-Store. Der Evidence-Ledger ist ein
// append-only, scoped, chronologisches Log → 1:1 das Ereignis-Primitiv des ChosClient (Stream-Key
// `evidence:<ledgerId>`, `tenantId` = chos-Partition), genau wie ChosWissenStore/ChosAuditStore. Gewählt via
// APP_STORE_MODE=chos; Postgres bleibt der OSS-Default.
//
// Die Ketten-Arithmetik kommt UNVERÄNDERT aus evidence-ledger.ts (`evidenceEntryHash`/`verifyEvidenceChain`) —
// es gibt nur EINE Hash-Wahrheit über alle drei Backings. Die Reihenfolge des Stroms ist die Anhänge-
// Reihenfolge (ChosClient.listEvents liefert aufsteigend), deckungsgleich mit In-Memory und Postgres (`seq`).

import { type ChosClient } from "./chos-client.js";
import {
  evidenceEntryHash,
  verifyEvidenceChain,
  type EvidenceAppendInput,
  type EvidenceEntry,
  type EvidenceLedger,
} from "./evidence-ledger.js";

/** Der Ereignis-Strom EINES Ledgers — reproduziert das In-Memory-/Postgres-Filterprädikat (tenantId trägt
 *  die chos-Partition, der Stream die ledgerId). */
function ledgerStream(ledgerId: string): string {
  return `evidence:${ledgerId}`;
}

function entryToBody(entry: EvidenceEntry): Record<string, unknown> {
  return { ...entry, refs: { ...entry.refs } };
}

function bodyToEntry(body: Record<string, unknown>): EvidenceEntry {
  const refs = body["refs"];
  const prevHash = body["prevHash"];
  return {
    evidenceId: String(body["evidenceId"]),
    ledgerId: String(body["ledgerId"]),
    tenantId: String(body["tenantId"]),
    actorId: String(body["actorId"]),
    entryType: String(body["entryType"]),
    summary: String(body["summary"]),
    refs:
      refs && typeof refs === "object" ? (refs as Record<string, string>) : {},
    occurredAt: String(body["occurredAt"]),
    prevHash:
      prevHash === null || prevHash === undefined ? null : String(prevHash),
    entryHash: String(body["entryHash"]),
  };
}

export class ChosEvidenceLedger implements EvidenceLedger {
  constructor(private readonly client: ChosClient) {}

  async append(input: EvidenceAppendInput): Promise<EvidenceEntry> {
    // Das prevHash kommt aus dem DAUERHAFTEN Stand des Stroms (letztes Ereignis), nie aus Prozess-Speicher.
    const vorhanden = await this.list({
      tenantId: input.tenantId,
      ledgerId: input.ledgerId,
    });
    const prevHash =
      vorhanden.length > 0 ? vorhanden[vorhanden.length - 1]!.entryHash : null;
    const entry: EvidenceEntry = {
      ...input,
      refs: { ...input.refs },
      prevHash,
      entryHash: evidenceEntryHash(input, prevHash),
    };
    await this.client.appendEvent({
      tenantId: entry.tenantId,
      stream: ledgerStream(entry.ledgerId),
      id: entry.evidenceId,
      occurredAt: entry.occurredAt,
      body: entryToBody(entry),
    });
    return { ...entry, refs: { ...entry.refs } };
  }

  async list(query: {
    tenantId: string;
    ledgerId: string;
  }): Promise<EvidenceEntry[]> {
    const events = await this.client.listEvents({
      tenantId: query.tenantId,
      stream: ledgerStream(query.ledgerId),
    });
    return events.map((e) => bodyToEntry(e.body));
  }

  async verify(query: { tenantId: string; ledgerId: string }) {
    return verifyEvidenceChain(await this.list(query));
  }
}
