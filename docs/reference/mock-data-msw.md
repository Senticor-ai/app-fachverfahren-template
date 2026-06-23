# Mockdaten und MSW

Das Template enthält eine kleine, fachneutrale Mock-Schicht für frühe
Validierung. Sie deckt Sitzung, Login, Logout, Willkommens-Benachrichtigungen,
Benutzereinstellungen und fachneutralen Posteingang/Ausgang ab.
Fachverfahrensdaten gehören später in Domain-Module unter `modules/<domain>/`.

## Bestandteile

- `apps/fachverfahren-template/shared/mock-data.ts`: typisierte Fixtures und
  Antwortverträge.
- `apps/fachverfahren-template/shared/app-contracts.ts`: API-Verträge für
  Präferenzen und Postfach.
- `apps/fachverfahren-template/src/mocks/handlers.ts`: MSW-Handler für Browser,
  Vitest und E2E.
- `apps/fachverfahren-template/src/mocks/browser.ts`: Browser Worker.
- `apps/fachverfahren-template/src/mocks/node.ts`: Node Server für Tests.
- `apps/fachverfahren-template/public/mockServiceWorker.js`: generierter MSW
  Service Worker.
- `apps/fachverfahren-template/server/routes/mock-session.ts`: optionale
  Fastify-Routen für echte Backend-Integrationstests.

Die `msw.workerDirectory`-Einträge in `package.json` halten den Worker bei
späteren `pnpm install`-Läufen aktualisierbar.

## Lokale Frontend-Validierung

Im Vite-Dev-Modus ist MSW standardmäßig aktiv. Die App kann dadurch ohne
laufendes Backend Login, Logout und Benachrichtigungen anzeigen.

```bash
pnpm run dev
```

MSW kann für Backend- oder Proxy-Tests deaktiviert werden:

```bash
VITE_API_MOCKING=disabled pnpm run dev
```

## Backend-Integration

Die Fastify-Mock-Routen sind nicht standardmäßig aktiv. Für lokale
Integrationstests oder einen Full-Stack-Smoke-Test:

```bash
APP_ENABLE_MOCK_AUTH=true pnpm --filter @senticor/fachverfahren-template dev:server
```

Dann stehen diese Endpunkte bereit:

- `GET /api/v1/session`
- `POST /api/v1/session/login`
- `POST /api/v1/session/logout`
- `GET /api/v1/notifications`
- `GET /api/v1/me/preferences`
- `PUT /api/v1/me/preferences`
- `GET /api/v1/me/posteingang`
- `GET /api/v1/me/ausgang`
- `GET /api/v1/work/posteingang`
- `GET /api/v1/work/ausgang`

Die Mock-Sitzungsrouten erscheinen in OpenAPI unter dem Tag `Auth`; App-Daten
nutzen die Tags `User Preferences` und `Mailbox`.

MSW und Fastify müssen dieselben Berechtigungsgrenzen abbilden: Bürgerinnen und
Bürger lesen nur `/api/v1/me/*`, Sachbearbeitung liest nur
`/api/v1/work/*`. Abweichende Mock-Ergebnisse gelten als Testfehler, nicht als
UI-Sonderfall.

## Testgetriebene Nutzung

Neue fachliche Mocks werden nicht direkt in `shared/mock-data.ts` ergänzt,
sondern im jeweiligen Domain-Modul:

```text
modules/<domain>/
  tests/
  ui/
  server/
  contracts/
```

Der empfohlene Ablauf:

1. Screen Contract oder API Contract schreiben.
2. MSW-Handler für den neuen fachlichen Zustand im Domain-Modul anlegen.
3. Vitest- oder E2E-Test gegen den Handler schreiben.
4. UI oder Backend minimal implementieren.
5. Storybook-State für Default, Loading, Empty und Error ergänzen.

Die Basis-Mocks bleiben nur für Plattformfähigkeiten, die jedes Fachverfahren
braucht: Sitzung, Identität, Benachrichtigungen, Benutzereinstellungen und
Postfach.
