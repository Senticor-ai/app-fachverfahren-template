# Mockdaten und MSW (PLAN)

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: PLAN — Zielarchitektur. Im Scaffold existiert KEIN MSW: keine
> Handler, kein Service Worker, keine `msw`-Abhängigkeit in irgendeinem
> `package.json`. Die ausgelieferte App nutzt deterministische Demo-Daten aus
> der `LeistungConfig`-Naht (`register.mock`, `seed`).
> Quellen: Architekturentscheidungen dieses Templates, `AGENTS.md`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

Zielbild: eine kleine, fachneutrale Mock-Schicht für frühe Validierung. Sie
deckt Sitzung, Login, Logout, Willkommens-Benachrichtigungen,
Benutzereinstellungen und fachneutralen Posteingang/Ausgang ab.
Fachverfahrensdaten gehören in die Naht bzw. später in Domain-Module unter
`modules/<domain>/`.

## Geplante Bestandteile (PLAN)

- `apps/antragsservice/shared/mock-data.ts`: typisierte Fixtures und
  Antwortverträge.
- `apps/antragsservice/shared/app-contracts.ts`: API-Verträge für Präferenzen
  und Postfach.
- `apps/antragsservice/src/mocks/handlers.ts`: MSW-Handler für Browser, Vitest
  und E2E.
- `apps/antragsservice/src/mocks/browser.ts`: Browser Worker.
- `apps/antragsservice/src/mocks/node.ts`: Node Server für Tests.
- `apps/antragsservice/public/mockServiceWorker.js`: generierter MSW Service
  Worker.
- `apps/antragsservice/server/routes/mock-session.ts`: optionale
  Backend-Routen für Integrationstests (setzt die Backend-Stufe voraus, siehe
  `docs/reference/backend-fastify.md`).

## Geplante Nutzung (PLAN)

Im Vite-Dev-Modus wäre MSW standardmäßig aktiv und über
`VITE_API_MOCKING=disabled` abschaltbar. MSW und Backend müssen dieselben
Berechtigungsgrenzen abbilden: Bürgerinnen und Bürger lesen nur
`/api/v1/me/*`, Sachbearbeitung liest nur `/api/v1/work/*`. Abweichende
Mock-Ergebnisse gelten als Testfehler, nicht als UI-Sonderfall.

Neue fachliche Mocks entstehen nicht in der Basis-Schicht, sondern im
jeweiligen Domain-Modul; die Basis-Mocks bleiben für Plattformfähigkeiten
reserviert (Sitzung, Identität, Benachrichtigungen, Benutzereinstellungen,
Postfach).

Wer diese Schicht baut, entfernt die PLAN-Markierung, verdrahtet die Pfade
real und ergänzt die zugehörigen Tests.
