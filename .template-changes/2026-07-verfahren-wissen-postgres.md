---
bump: minor
updateMode: review
migration: none
---

Der Verfahrens-Wissens-Store (Verfahrens-Wiki) bekommt einen durablen Postgres-Adapter
(`PostgresWissenStore`) plus die Migration `20260719000000_verfahren_wissen` — eine
append-only Tabelle `app_verfahren_wissen` mit BEFORE-UPDATE/DELETE-Trigger und
`REVOKE UPDATE, DELETE` (Unveraenderlichkeit als Eigenschaft der Tabelle, wie
`app_audit_events`).

`createWissenStoreFromEnv` liefert jetzt den Postgres-Store, wenn `APP_PG_URL` bzw.
`APP_PG_DIRECT_URL` gesetzt ist (zuvor fail-closed `Unavailable` ausserhalb von
`APP_STORE_MODE=memory`). Damit war das Verfahrens-Wiki der einzige Store ohne
Persistenz und ging in PROD verloren — jetzt persistiert es.

Consumer: kein Code-Umbau noetig (`migration: none`) — die neue DB-Migration wird vom
bestehenden `db:migrate`-Schritt mitgezogen. Parametrisierte Vertragstests
(InMemory == Postgres) und ein append-only-Trigger-Test laufen gegen eine echte
Datenbank, wenn `APP_PG_URL`/`APP_PG_DIRECT_URL` gesetzt ist.
