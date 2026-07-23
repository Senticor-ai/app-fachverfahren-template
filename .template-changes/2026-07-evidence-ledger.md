---
bump: minor
updateMode: review
migration: none
---

Ergänzt einen hash-verketteten EVIDENCE-LEDGER für die Spine-Handlungen der
Agentic Composables (CHOS Blueprint §15.3 / §27: „Evidence ist hash-verkettet und
exportierbar"). Jede agentische Governance-Handlung wird actor-gebunden und
tamper-evident protokolliert; Manipulation oder Lücke bricht die Hash-Kette.

**SDK (app-store-postgres):** `hashChainEntry` ist jetzt die EINE kanonische
Hash-Primitive (aus `auditEntryHash` extrahiert — eine Wahrheit, geteilt mit dem
fachlichen Audit). Neu: `evidence-ledger.ts` mit `EvidenceEntry`,
`InMemoryEvidenceLedger` (append kettet, list, verify) und `verifyEvidenceChain`
(rein — erkennt Manipulation + Lücke, nennt den Bruch-Index).

**BEWUSST getrennt vom fachlichen Audit** (`app_audit_events`, das eine
Rechtsgrundlage trägt — die wird nie erfunden): ein Spine-Vorschlag ist eine
technische/agentische Handlung, kein Verwaltungsakt. Nur METADATEN werden
protokolliert (Akteur, Aufgabe, Modell) — nie der Vorschlagsinhalt (kein PII).

**Naht:** `BffDeps.evidenceLedger` (optional). Der Spine-Run hängt bei jeder
Ausführung einen Eintrag an. `GET /api/composables/:id/evidence` (behördliche
Oversight, `case.read`) exportiert den Ledger inkl. Ketten-Verifikation
(`chain.valid` + `brokenAt`). CLI: `mesh composable evidence <id>`.
