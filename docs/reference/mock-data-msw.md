# Mockdaten und MSW

Das Template haelt Mockdaten fachneutral. Die aktuelle Referenz-App
`apps/antragsservice` ist eine duenne Kit-Komposition und liefert keine
eingebaute fachliche MSW-Schicht aus.

## Vertrag

- Fachliche Mockdaten gehoeren in das jeweilige Domain-Modul unter
  `modules/<domain>/tests/`, `modules/<domain>/ui/` oder
  `modules/<domain>/server/`.
- Plattformnahe Mocks fuer Sitzung, Login, Logout, Benachrichtigungen,
  Benutzereinstellungen und Postfach duerfen nur als explizite
  Plattform-Testschicht ergaenzt werden.
- Browser-Service-Worker fuer MSW sind generierte Testassets und duerfen nicht
  mit dem produktiven `/service-worker.js` verwechselt werden.
- MSW und Fastify-Test-Routen muessen dieselben Berechtigungsgrenzen abbilden.
  Abweichende Mock-Ergebnisse gelten als Testfehler, nicht als UI-Sonderfall.

## Testgetriebene Nutzung

Der empfohlene Ablauf:

1. Screen Contract oder API Contract schreiben.
2. Fachlichen MSW-Handler im Domain-Modul anlegen.
3. Vitest- oder E2E-Test gegen den Handler schreiben.
4. UI oder Backend minimal implementieren.
5. Storybook-State fuer Default, Loading, Empty und Error ergaenzen.

Produktive App-Daten, Auth-Entscheidungen und Audit-Events bleiben
server-autoritativ.
