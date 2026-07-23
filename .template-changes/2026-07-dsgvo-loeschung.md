---
bump: minor
updateMode: review
migration: none
---

Ergänzt eine DSGVO-Löschung (Art. 17 / §84 SGB X, Issue #55) über die volle
Naht — Store bis HTTP-Endpunkt.

`CaseStore.patchCaseData` ersetzt die fachliche Nutzlast `case.data` ATOMAR
(Optimistic-Locking, `version`+1) UND schreibt das Lösch-Audit in derselben
Transaktion — über alle drei Laufzeiten (Postgres/InMemory/chos), symmetrisch zu
`patchCaseState`. Der `state` bleibt unangetastet (eine Löschung ist kein
Zustandswechsel).

Der Endpunkt `POST /api/cases/:id/loeschung` redigiert die benannten PII-Pfade in
`case.data` (reine Funktion `redactData` → Tombstone) und protokolliert die
Löschung append-only als `case.data.redacted` — OHNE die gelöschten Werte zu
wiederholen (nur die Pfade + Rechtsgrundlage). Eigene, eng gefasste Permission
`case.pii.erase` (der Sachbearbeitung zugeordnet, nie auf `case.decision.prepare`
mitreitend). Behörden-scoped.

Der eingefrorene Bescheid-Verwaltungsakt ist strukturell AUSGENOMMEN — er lebt in
der append-only Audit-payload, nicht in `case.data`; eine Löschung der lebenden
Daten berührt ihn nie (Bestandskraft, Art. 17 Abs. 3).

Ergänzt die reinen Löschmechanismen aus ADR-0005 (`crypto-shred.ts`
Krypto-Shredding, `redaction.ts` referenzielle Redaction).

Offen (bewusst spec-gated): ein Legal-Hold/Retention-Guard, der eine Löschung
während gesetzlicher Aufbewahrungsfristen blockiert — er braucht die
jurisdiktions-spezifische Fristen-Matrix und wird nicht erfunden.
