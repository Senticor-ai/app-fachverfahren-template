// audit-chain — kryptografische Hash-VERKETTUNG des append-only Fach-Audits (tamper-evidentes „git über
// alles"-Log, Issue #53). Jedes Ereignis trägt `prevHash` (Hash des Vorgängers im selben Stream) + `entryHash`
// (Hash über die eigenen kanonischen Bytes INKL. prevHash). Damit ist die Historie kryptografisch verifizierbar:
//   • MODIFIKATION eines Ereignisses  → sein `entryHash` re-hasht nicht mehr.
//   • LÖSCHUNG/REORDER in der Mitte    → der `prevHash` des Nachfolgers passt nicht mehr zum Vorgänger.
// Das ergänzt den DB-Riegel (REVOKE UPDATE/DELETE): der Riegel ist tamper-RESISTENT, die Kette tamper-EVIDENT.
//
// STREAM = (tenantId, caseId). INVARIANTE: `occurredAt` wird server-seitig beim Append gesetzt und ist pro
// Stream monoton — die Ketten-Reihenfolge ist deshalb (occurredAt, auditEventId) und deckt sich mit der
// Append-Reihenfolge UND `listAuditEvents`. `node:crypto` ist node-only (dieses Paket ist node-only; das SDK
// bleibt browser-neutral, deshalb liegt der Hash HIER und nicht im SDK).
import { createHash } from "node:crypto";
import type { AppAuditEvent } from "./case-store.js";

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Kanonische JSON-Serialisierung: Objekt-Schlüssel rekursiv sortiert (Array-Reihenfolge bleibt bedeutungs-
 *  tragend) → byte-stabil über jsonb-Roundtrips. */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortRecursive(value as JsonValue));
}

function sortRecursive(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortRecursive);
  if (value !== null && typeof value === "object") {
    const sorted: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortRecursive(value[key] ?? null);
    }
    return sorted;
  }
  return value;
}

/** Der `entryHash` eines Ereignisses: SHA-256 über die kanonischen Bytes ALLER inhaltstragenden Felder INKL.
 *  `prevHash`. Die Ketten-Felder `entryHash`/`prevHash` selbst gehen NICHT ein (prevHash schon — als Verkettung). */
export function auditEntryHash(
  event: AppAuditEvent,
  prevHash: string | null,
): string {
  return createHash("sha256")
    .update(
      canonicalize({
        prevHash,
        auditEventId: event.auditEventId,
        caseId: event.caseId,
        tenantId: event.tenantId,
        authorityId: event.authorityId,
        jurisdictionId: event.jurisdictionId,
        actorId: event.actorId,
        eventType: event.eventType,
        purpose: event.purpose,
        legalBasisId: event.legalBasisId,
        requestId: event.requestId,
        payload: event.payload,
        occurredAt: event.occurredAt,
      }),
      "utf8",
    )
    .digest("hex");
}

/** Deterministische Stream-Reihenfolge (occurredAt, dann auditEventId als Tiebreak) — EINE Wahrheit für
 *  Ketten-Append, `listAuditEvents` und Verifikation, damit die Reihenfolgen nie divergieren. */
export function auditStreamOrder(a: AppAuditEvent, b: AppAuditEvent): number {
  return (
    a.occurredAt.localeCompare(b.occurredAt) ||
    a.auditEventId.localeCompare(b.auditEventId)
  );
}

/** Stempelt `prevHash` + `entryHash` auf ein NEUES Ereignis. `prevHash` = `entryHash` der KETTEN-SPITZE der
 *  bereits vorhandenen Ereignisse — die Spitze ist das Ereignis, dessen `entryHash` von KEINEM anderen als
 *  `prevHash` referenziert wird (Ende der verketteten Liste). Bewusst REIHENFOLGE-UNABHÄNGIG (nicht occurredAt-
 *  sortiert): die Kette selbst definiert die Ordnung, damit ein nicht-monotoner `occurredAt` sie nicht bricht.
 *  Leerer Stream → `null` (Genesis). Unverkettete Alt-Ereignisse (ohne entryHash) zählen nicht als Spitze. */
export function chainAuditEvent(
  event: AppAuditEvent,
  existingInStream: readonly AppAuditEvent[],
): AppAuditEvent {
  const referenced = new Set(
    existingInStream.map((e) => e.prevHash).filter((h): h is string => !!h),
  );
  const tip = existingInStream.find(
    (e) => e.entryHash !== undefined && !referenced.has(e.entryHash),
  );
  const prevHash = tip?.entryHash ?? null;
  return { ...event, prevHash, entryHash: auditEntryHash(event, prevHash) };
}

export interface AuditChainResult {
  ok: boolean;
  /** Ein Ereignis, an dem die Kette bricht (auditEventId), falls `ok === false`. */
  brokenAt?: string;
  reason?:
    "prev-hash-mismatch" | "entry-hash-mismatch" | "missing-hash" | "genesis";
}

/** Verifiziert einen Audit-Stream (Ereignisse EINES (tenantId, caseId)) durch FOLGEN der kryptografischen
 *  Verkettung — NICHT durch Vertrauen in die Eingabe-Reihenfolge (order-independent):
 *   1. jedes `entryHash` muss über die eigenen Bytes (inkl. `prevHash`) re-hashen → sonst MODIFIKATION.
 *   2. genau EIN Genesis (`prevHash === null`) → sonst gelöschte Wurzel / Fork.
 *   3. von Genesis den `prevHash`-Verweisen folgen; ALLE Ereignisse müssen erreicht werden → sonst LÖSCHUNG/
 *      Lücke in der Mitte. So werden Manipulation, Löschung und Reorder erkannt. */
export function verifyAuditChain(
  events: readonly AppAuditEvent[],
): AuditChainResult {
  if (events.length === 0) return { ok: true };
  for (const e of events) {
    if (e.entryHash === undefined || e.prevHash === undefined) {
      return { ok: false, brokenAt: e.auditEventId, reason: "missing-hash" };
    }
    if (e.entryHash !== auditEntryHash(e, e.prevHash ?? null)) {
      return {
        ok: false,
        brokenAt: e.auditEventId,
        reason: "entry-hash-mismatch",
      };
    }
  }
  const genesis = events.filter((e) => (e.prevHash ?? null) === null);
  if (genesis.length !== 1) {
    return {
      ok: false,
      ...(genesis[0] ? { brokenAt: genesis[0].auditEventId } : {}),
      reason: "genesis",
    };
  }
  const bySuccessor = new Map<string, AppAuditEvent>();
  for (const e of events) if (e.prevHash) bySuccessor.set(e.prevHash, e);
  let current: AppAuditEvent | undefined = genesis[0];
  const visited = new Set<string>();
  while (current?.entryHash && !visited.has(current.entryHash)) {
    visited.add(current.entryHash);
    current = bySuccessor.get(current.entryHash);
  }
  if (visited.size !== events.length) {
    // Ein nicht erreichtes Ereignis zeigt auf einen fehlenden Vorgänger → Löschung/Lücke in der Mitte.
    const orphan = events.find((e) => !visited.has(e.entryHash ?? ""));
    return {
      ok: false,
      ...(orphan ? { brokenAt: orphan.auditEventId } : {}),
      reason: "prev-hash-mismatch",
    };
  }
  return { ok: true };
}
