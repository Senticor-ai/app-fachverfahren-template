# Testing Skill

Nutze diese Anleitung, wenn ein Agent Änderungen in diesem Repository
verifiziert.

## Standardreihenfolge

1. `pnpm run check:esm`
2. `pnpm run check:typescript-policy`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run test:k8s:render`
6. `pnpm run evidence:build`

Für Template-Lifecycle-Änderungen zusätzlich:

```bash
pnpm run test:template
pnpm run check:template-invariants
pnpm run check:scaffold
pnpm run check:scaffold-reproducible
```

Nach jeder Änderung an der Austausch-Naht
`apps/fachverfahren/src/leistung.config.ts` zusätzlich den Vertrags-Snapshot
erzeugen und mit committen:

```bash
pnpm --filter @senticor/fachverfahren emit:contract
```

Bei schmalen Änderungen darf zunächst ein Pakettest laufen. Vor Abschluss
einer plattformweiten Änderung müssen die Standardchecks versucht werden.

## Wo die Tests WIRKLICH laufen (Ebenen — ehrlich)

`pnpm run test` ist bewusst die schnelle Ebene (Node, kein Browser, keine DB) —
Projekte `unit` + `template-tooling`. Die schwereren Ebenen sind eigene Kommandos:

- **Stories als Tests im ECHTEN Browser** — `pnpm run test:storybook`
  (`--project storybook`): jede Story rendert headless in Chromium (`@vitest/
  browser` + Playwright), führt `play`-Interaktionen aus UND prüft Axe-A11y
  (`.storybook/preview.ts` `a11y.test = "error"` → Verstoß = rot). ~39 Stories.
- **Komponenten im ECHTEN Browser** — `pnpm run test:browser`
  (`vitest.browser.config.ts`, Chromium/Playwright headless): die
  `*.browser.test.tsx` (z. B. `KanbanBoard` Drag&Drop — braucht echte
  Pointer-Events). KEIN jsdom/happy-dom im Repo — Komponententests sind ECHTER Browser.
- **Gebautes SPA + echter HTTP-Smoke** — `pnpm run test:e2e`
  (`tests/e2e/*.e2e.test.ts`): baut das reale Bundle, bootet den Server, prüft
  Persona-Routen + `/livez` via `app.inject()`. Kein Browser, KEINE DB.
- **Postgres-Integration** — die Store-Vertragstests
  (`packages/app-store-postgres/src/*.test.ts`) laufen parametrisiert über
  InMemory + Chos-Fake IMMER, und über **echtes Postgres NUR wenn**
  `APP_PG_DIRECT_URL`/`APP_PG_URL` gesetzt ist (`describe.skipIf`). Lokal liefert
  `docker-compose.yml` (postgres:16) die DB; Migrationen via `pnpm run db:migrate`
  (Direct-URL). **Automatisiert:** `pnpm run test:pg` fährt über **testcontainers**
  (`tests/pg/global-setup.ts`) selbst einen echten Postgres hoch, migriert und
  lässt die Store-Tests gegen die echte DB laufen — GRACEFUL-SKIP ohne Docker
  (dann InMemory/Fake). Bei Rancher/colima `DOCKER_HOST` +
  `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` auf den Socket setzen. Der schnelle
  `test`-Lauf enthält den PG-Pfad bewusst NICHT (kein Docker-Zwang).
- **Golden-Fixture/Referenz-Seed** — `apps/fachverfahren/server/dev/*.test.ts`
  (self-test der DEV-Seed-Daten; die Seed selbst läuft nur unter
  `APP_STORE_MODE=memory`, ist verfahrens-neutral + synthetisch).

**Ehrlich (kein Mock-Setup vorhanden):** `msw` (Mock Service Worker) ist NICHT
verdrahtet (keine Dependency, keine Handler) — die Browser-Tests speisen sich aus
Props/Fixtures, nicht aus MSW; `testcontainers` wird NICHT genutzt (PG kommt aus
docker-compose bzw. der CI-Umgebung). Wer echte HTTP-Mocks/auto-Container braucht,
muss sie erst einführen — nicht so tun, als liefen sie schon.

## Evidence

Fehler nicht nur im Chat beschreiben. Wenn ein Test Evidence erzeugt, nutze den
generierten Report als Quelle. Das Compliance-Evidence-Bundle liegt unter
`dist/evidence/`.
