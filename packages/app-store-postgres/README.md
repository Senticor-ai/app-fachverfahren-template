# PostgreSQL App Store

Dieses Paket ist die **Store-Schicht des Servers** UND der **Migrator** für den
`migrator`-Workload.

Als Store-Schicht liefert es `PostgresAppStore`, `CaseStore`, `TaskStore`,
`AuthStore`, `KanbanStore`, `WissenStore` und `EvidenceLedger` — jeweils in den
Varianten Postgres, InMemory und Unavailable (fail-closed ohne DB) — plus die
chos-Adapter (`src/chos-*.ts`) hinter denselben Verträgen, gewählt über
`APP_STORE_MODE=chos`. `apps/fachverfahren/server/index.ts` konstruiert daraus
die Stores des BFF.

Als Migrator stellt es den kontrollierten Migrationspfad für die Vorlage bereit
und ist der Standard für den `migrator`-Workload.

## Laufzeit

```bash
APP_PG_DIRECT_URL=postgres://app:app@postgres:5432/app \
pnpm --filter @senticor/app-store-postgres build \
&& pnpm --filter @senticor/app-store-postgres db:migrate
```

Regeln:

- Migrationen laufen über `APP_PG_DIRECT_URL`, wenn vorhanden.
- Bekannte PgBouncer-/Pooler-URLs werden ohne Direct-URL abgelehnt.
- Migrationen sind timestamped, checksum-gesichert und laufen unter einem
  PostgreSQL Advisory Lock.
- Fachmodule legen eigene Migrationen in `modules/<domain>/migrations/` ab
  (**PLAN** — die laufende App bindet Module nicht ein, siehe
  `modules/README.md`); die Paketmigrationen bleiben die administrative Basis.

## PostgreSQL-Client

`pg` und `@types/pg` stehen im Workspace-Katalog. App- und Paketcode soll den
PostgreSQL-Client über den Paketexport `createPgClient(...)` erzeugen, damit das
ESM-kompatible dynamische Importmuster nur an einer Stelle gepflegt wird.
