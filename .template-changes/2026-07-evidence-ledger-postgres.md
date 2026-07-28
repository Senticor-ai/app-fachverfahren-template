---
bump: minor
updateMode: review
migration: none
---

Der Evidence-Ledger (Blueprint §15.3/§27) persistiert. Bis hierher gab es nur
`InMemoryEvidenceLedger` — und genau der war im Server-Entrypoint fest verdrahtet: der
hash-verkettete Nachweis der agentischen Handlungen starb mit dem Prozess, waehrend
audit-, auth-, case-, kanban-, task- und wissen-store laengst dauerhaft schrieben. Eine
Kette, die ein Neustart loescht, belegt nichts.

Neu: `PostgresEvidenceLedger` plus Migration `20260728000000_evidence_ledger` — die
append-only Tabelle `app_evidence_ledger` mit BEFORE-UPDATE/DELETE-Trigger und
`REVOKE UPDATE, DELETE` (Unveraenderlichkeit als Eigenschaft der Tabelle, wie
`app_audit_events`/`app_verfahren_wissen`), mandantengetrennt, je `ledger_id` eine
eigene Kette. Dazu `ChosEvidenceLedger` fuer `APP_STORE_MODE=chos` und
`UnavailableEvidenceLedger` (fail-closed). `createEvidenceLedgerFromEnv` waehlt nach
demselben Muster wie `createAuditStoreFromEnv`/`createWissenStoreFromEnv`.

Nebenlaeufigkeit: der verkettete Append laeuft in EINER Transaktion mit
`pg_advisory_xact_lock` je Strom; ein UNIQUE-Index auf
`(tenant_id, ledger_id, COALESCE(prev_hash,''))` verhindert zusaetzlich DB-seitig jede
Gabelung (ein Genesis, ein Nachfolger je Eintrag). Die Hash-Arithmetik bleibt
unveraendert `evidenceEntryHash`/`verifyEvidenceChain` — es gibt weiterhin nur EINE
Ketten-Wahrheit ueber alle Backings. `occurred_at` ist bewusst `text`: der Wert geht in
die gehashten Bytes ein, ein `timestamptz`-Roundtrip wuerde ihn normalisieren und die
Kette brechen.

`InMemoryEvidenceLedger` bleibt — ausschliesslich fuer Tests/DEV. Wird er ueber
`APP_STORE_MODE=memory` gezogen, warnt der Start laut, dass der Nachweis keinen Neustart
ueberlebt; ohne Datenbank und ohne chos gibt es keinen stillen Rueckfall, sondern
`Unavailable`.

Consumer: kein Code-Umbau noetig (`migration: none`) — die neue DB-Migration zieht der
bestehende `db:migrate`-Schritt mit. Wer den Server ohne Postgres/chos betreibt, muss
`APP_STORE_MODE=memory` setzen und bekommt die Warnung; das ist gewollt.
