# PostgreSQL App Store

Dieses Paket stellt den kontrollierten Migrationspfad fuer die Vorlage bereit.
Es ist der Standard fuer den `migrator`-Workload und nicht Teil des
Browser-/BFF-Startpfads.

## Laufzeit

```bash
APP_PG_DIRECT_URL=postgres://app:app@postgres:5432/app \
pnpm --filter @senticor/app-store-postgres build \
&& pnpm --filter @senticor/app-store-postgres db:migrate
```

Regeln:

- Migrationen laufen ueber `APP_PG_DIRECT_URL`, wenn vorhanden.
- Bekannte PgBouncer-/Pooler-URLs werden ohne Direct-URL abgelehnt.
- Migrationen sind timestamped, checksum-gesichert und laufen unter einem
  PostgreSQL Advisory Lock.
- Fachmodule legen eigene Migrationen in `modules/<domain>/migrations/` ab; die
  Paketmigrationen bleiben die administrative Basis.
