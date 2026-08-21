---
bump: minor
updateMode: review
migration: none
---

Der Evidence-Ledger (Blueprint §15.3/§27) persistiert. Bis hierher gab es nur
`InMemoryEvidenceLedger` — und genau der war im Server-Entrypoint fest verdrahtet: der
hash-verkettete Nachweis der agentischen Handlungen starb mit dem Prozess, während
audit-, auth-, case-, kanban-, task- und wissen-store längst dauerhaft schrieben. Eine
Kette, die ein Neustart löscht, belegt nichts.

Neu: `PostgresEvidenceLedger` plus Migration `20260728000000_evidence_ledger` — die
append-only Tabelle `app_evidence_ledger` mit BEFORE-UPDATE/DELETE-Trigger und
`REVOKE UPDATE, DELETE` (Unveränderlichkeit als Eigenschaft der Tabelle, wie
`app_audit_events`/`app_verfahren_wissen`), mandantengetrennt, je `ledger_id` eine
eigene Kette. Dazu `ChosEvidenceLedger` für `APP_STORE_MODE=chos` und
`UnavailableEvidenceLedger` (fail-closed). `createEvidenceLedgerFromEnv` wählt nach
demselben Muster wie `createAuditStoreFromEnv`/`createWissenStoreFromEnv`.

Nebenläufigkeit: der verkettete Append läuft in EINER Transaktion mit
`pg_advisory_xact_lock` je Strom; ein UNIQUE-Index auf
`(tenant_id, ledger_id, COALESCE(prev_hash,''))` verhindert zusätzlich DB-seitig jede
Gabelung (ein Genesis, ein Nachfolger je Eintrag). Die Hash-Arithmetik bleibt
unverändert `evidenceEntryHash`/`verifyEvidenceChain` — es gibt weiterhin nur EINE
Ketten-Wahrheit über alle Backings. `occurred_at` ist bewusst `text`: der Wert geht in
die gehashten Bytes ein, ein `timestamptz`-Roundtrip würde ihn normalisieren und die
Kette brechen.

`InMemoryEvidenceLedger` bleibt — ausschließlich für Tests/DEV. Wird er über
`APP_STORE_MODE=memory` gezogen, warnt der Start laut, dass der Nachweis keinen Neustart
überlebt; ohne Datenbank und ohne chos gibt es keinen stillen Rückfall, sondern
`Unavailable`.

Consumer: kein Code-Umbau nötig (`migration: none`) — die neue DB-Migration zieht der
bestehende `db:migrate`-Schritt mit. Wer den Server ohne Postgres/chos betreibt, muss
`APP_STORE_MODE=memory` setzen und bekommt die Warnung; das ist gewollt.
