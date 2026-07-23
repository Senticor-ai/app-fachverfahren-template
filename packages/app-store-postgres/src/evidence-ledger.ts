// evidence-ledger — der HASH-VERKETTETE Evidence-Ledger (CHOS Blueprint §15.3 / §27): jede agentische
// Governance-Handlung (Tool Decision, Spine-Vorschlag, Review, Approval) wird actor-gebunden + tamper-evident
// protokolliert. Manipulation oder Lücke bricht die Hash-Kette. BEWUSST getrennt vom fachlichen Audit
// (app_audit_events, das eine Rechtsgrundlage trägt — die wird NIE erfunden): ein Spine-Vorschlag ist eine
// technische/agentische Handlung, kein Verwaltungsakt mit legalBasisId.
//
// Nur METADATEN werden protokolliert (Akteur, Typ, Zusammenfassung, Referenzen, Modell) — NIE der
// Vorschlagsinhalt (potenziell PII), genau wie das app-data-Audit. Die Kette nutzt dieselbe kanonische
// Hash-Primitive wie das fachliche Audit (`hashChainEntry`) — eine Wahrheit.
import { hashChainEntry } from "./audit-chain.js";

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

/** Der Evidence-Ledger-Port (austauschbar: In-Memory-Stub im Template; chos-/Postgres-Backing hinter derselben
 *  Naht). Append hängt hash-verkettet an die Spitze des Stroms an; list/verify lesen + prüfen. */
export interface EvidenceLedger {
  append(input: EvidenceAppendInput): Promise<EvidenceEntry>;
  list(query: { tenantId: string; ledgerId: string }): Promise<EvidenceEntry[]>;
  verify(query: {
    tenantId: string;
    ledgerId: string;
  }): Promise<{ valid: boolean; length: number; brokenAt?: number }>;
}

/** In-Memory-EvidenceLedger (Template-Stub/DEV). Einfüge-Reihenfolge IST Ketten-Reihenfolge. */
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
