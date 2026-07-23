# Capability: audit

Verwende `AuditPort` für append-only Fachereignisse. Domain-Module beschreiben
Ereignistyp, Fallbezug, Rechtsgrundlage und Zustandswechsel; technische Logs
sind kein Ersatz.

## Tamper-evidente Hash-Kette (Issue #53)

Das Fach-Audit (`app_audit_events`) ist zusätzlich zum DB-Riegel (`REVOKE
UPDATE/DELETE` + Trigger, tamper-*resistent*) kryptografisch **verkettet**
(tamper-*evident*, „git über alles"): jedes Ereignis trägt `prevHash` (Hash des
Vorgängers im Stream `(tenantId, caseId)`) + `entryHash` (SHA-256 über die
kanonischen Bytes inkl. `prevHash`). Der Store stempelt die Kette beim Append
selbst (`packages/app-store-postgres/src/audit-chain.ts`), in allen Laufzeiten
(InMemory/Postgres/chos) mit identischer Semantik. Manipulation, Löschung und
Reorder werden bei der Verifikation erkannt.

- Reine Verifikation: `verifyAuditChain(events)` (order-independent, folgt den
  `prevHash`-Links). Migration: `20260721000000_audit_hash_chain`.
- Server-Report: `GET /api/cases/:id/audit` liefert `{ events, chain: { ok,
  brokenAt?, reason? } }` — `chain.ok:false` heißt: das Protokoll wurde
  nachträglich verändert. Die Verifikation läuft über den UNGEKÜRZTEN Stream
  (ein `limit` erzeugt keinen Falsch-Bruch).
