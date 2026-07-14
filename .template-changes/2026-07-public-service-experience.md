---
bump: minor
updateMode: review
migration: none
---

Die öffentliche Service-Erfahrung ergänzt die ohne Sitzung erreichbare Route
`/barrierefreiheit`, eine sichtbar vorläufige Mustererklärung samt
Consumer-Release-Guard, Footer-Navigation, ein Actor-spezifisches
Admin-Onboarding auf `/boards` sowie den Deployment-Flag `DEMO_MODE`. Der
frische env-gesteuerte Bootstrap kann mit `DEMO_USER_PASSWORD` drei lokale
Persona-Konten anlegen; bestehende Konten und Stores werden nie verändert.
`runtime-config.json.features.demoMode` ist die Banner-Autorität,
`/auth/status.demoMode` bleibt der additive Session-Spiegel. GitHub erhält
einen unabhängigen Storybook-/Axe-Job; GitLab bleibt unverändert.

Consumer-Wirkung (`updateMode: review`): `apps/*/server/**`, die geteilten
`packages/**`, der Accessibility-Release-Check und strukturierte
`package.json`-Scripts können über `template:update` propagieren. Die
App-Komposition unter `apps/*/src/**`, ihre Tests, `.storybook/**`, die
GitHub-Workflow-Datei und diese UX-/Operations-Dokumentation sind bewusst
nicht update-verwaltet. Landing-Footer, öffentliche Seite, Onboarding,
Runtime-Provider, Banner und CI-Job benötigen deshalb Re-Scaffolding oder
eine manuelle Übernahme. Es gibt keine Datenbankmigration und keine neuen
HTTP-Endpunkte.

Vor einem produktiven Release ersetzt der Konsument
`barrierefreiheit.config.ts`: `provisional` muss `false` sein, Kontakt und
Schlichtungsstelle müssen freigegeben sein, und bekannte `example.org`-
Platzhalter müssen entfallen. Der Demo-Override ist nur zusammen mit
`DEMO_MODE=true` zulässig und lässt die sichtbare Warnung bestehen. Alte
Konsumenten ohne Seite/Config passieren den neuen Check weiterhin; alte
Clients ignorieren additive Serverfelder, neue Clients behandeln fehlende
oder ungültige Demo-Felder alter Server als `false`.

`check:agent-release` führt jetzt Storybook-Interaktions- und Axe-Tests aus.
Für den lokalen Lauf ist einmalig `pnpm exec playwright install chromium`
erforderlich; der unabhängige GitHub-Job installiert zusätzlich die
Systemabhängigkeiten.
