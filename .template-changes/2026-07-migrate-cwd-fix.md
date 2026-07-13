---
bump: patch
updateMode: auto
migration: none
---

# Fix: `db:migrate` findet die Migrationen unabhängig vom Arbeitsverzeichnis

`resolveMigrationOptions` löste den Default-Migrationsordner cwd-relativ auf
(`join(process.cwd(), "packages/app-store-postgres/migrations")`). Das brach die
Standard-Invokation `pnpm --filter @senticor/app-store-postgres db:migrate`, weil pnpm
das Skript im Paketordner ausführt → doppelter Pfad
(`packages/app-store-postgres/packages/app-store-postgres/migrations`, ENOENT).

Jetzt MODUL-relativ: `fileURLToPath(new URL("../migrations", import.meta.url))` — sowohl
`src/migrate.ts` als auch `dist/migrate.js` liegen eine Ebene unter dem Paket-Root, die
Migrationen werden also unabhängig vom cwd gefunden. `APP_MIGRATIONS_DIR` überschreibt
weiterhin. Robuster auch für Konsumenten (verbatim kopiertes Paket). Kein Verhaltensbruch
bei gesetztem `APP_MIGRATIONS_DIR`.
