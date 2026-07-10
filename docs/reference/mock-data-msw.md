# Mockdaten und MSW

Das Template hält Mockdaten fachneutral. Die aktuelle Referenz-App
`apps/fachverfahren` ist eine dünne Kit-Komposition und liefert keine
eingebaute fachliche MSW-Schicht aus.

## Vertrag

- Fachliche Mockdaten gehören in das jeweilige Domain-Modul unter
  `modules/<domain>/tests/`, `modules/<domain>/ui/` oder
  `modules/<domain>/server/`.
- Plattformnahe Mocks für Sitzung, Login, Logout, Benachrichtigungen,
  Benutzereinstellungen und Postfach dürfen nur als explizite
  Plattform-Testschicht ergänzt werden.
- Browser-Service-Worker für MSW sind generierte Testassets und dürfen nicht
  mit dem produktiven `/service-worker.js` verwechselt werden.
- MSW und Fastify-Test-Routen müssen dieselben Berechtigungsgrenzen abbilden.
  Abweichende Mock-Ergebnisse gelten als Testfehler, nicht als UI-Sonderfall.

## Testgetriebene Nutzung

Der empfohlene Ablauf:

1. Screen Contract oder API Contract schreiben.
2. Fachlichen MSW-Handler im Domain-Modul anlegen.
3. Vitest- oder E2E-Test gegen den Handler schreiben.
4. UI oder Backend minimal implementieren.
5. Storybook-State für Default, Loading, Empty und Error ergänzen.

Produktive App-Daten, Auth-Entscheidungen und Audit-Events bleiben
server-autoritativ.
