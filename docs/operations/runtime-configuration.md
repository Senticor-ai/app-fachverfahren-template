> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST — beschreibt die ausgelieferte Runtime-Konfiguration und ihre
> Betriebsgrenzen.
> Quellen: `apps/fachverfahren/server/index.ts`,
> `apps/fachverfahren/server/auth/auto-bootstrap.ts`,
> `apps/fachverfahren/src/runtime-config.tsx`.
> Pflicht-Lektüre vorher: `AGENTS.md`,
> `docs/ux-ui/public-service-experience.md`.

# Runtime-Konfiguration

`/runtime-config.json` enthält nur öffentliche Informationen:
Anwendungsname, Behörde, Rechtsraum, Tenant-Hinweis, Lokalisierung,
Feature-Hinweise und sichtbare Capability-Beschreibungen.

Geheimnisse, interne Upstreams und Provider-Bindings bleiben serverseitig im
`ServerRuntimeConfig`-Modell aus `@senticor/public-sector-sdk`.

Regeln:

- Konfiguration hat eine Schema-Version.
- Unbekannte oder widersprüchliche Kombinationen müssen beim Start fehlschlagen.
- Logs dürfen Konfigurationswerte nur nach Klassifikation ausgeben.
- Feature Flags sind keine Autorisierung.
- Umgebungsvariablen dürfen Konfiguration befüllen, sind aber nicht der
  öffentliche Vertrag.

Operative Endpunkte:

- `GET /livez`
- `GET /readyz`
- `GET /startupz`
- `GET /runtime-config.json`
- `GET /internal/metrics`
- `GET /internal/build-info`

`/runtime-config.json` ist ein Public-Endpunkt auf `PORT` und wird mit
`Cache-Control: no-store` ausgeliefert. `/internal/metrics` und
`/internal/build-info` laufen auf `INTERNAL_PORT` und dürfen nicht öffentlich
geroutet werden.

Der Service Worker bleibt per `APP_ENABLE_SERVICE_WORKER=false` deaktiviert,
bis die App den Update-Flow bewusst freischaltet.

## Demo-Modus

`DEMO_MODE` nutzt die strikte Boolean-Grammatik der Runtime (`true`, `1`,
`yes` beziehungsweise `false`, `0`, `no`; Groß-/Kleinschreibung ist
unerheblich). Ein unbekannter Wert verhindert den Serverstart. Das Flag ist
eine Deployment-Kennzeichnung, keine Autorisierung:

- `runtime-config.json.features.demoMode` ist die maßgebliche Quelle für alle
  sichtbaren Banner.
- `/auth/status.demoMode` spiegelt denselben geparsten Serverwert additiv für
  Session-Konsumenten.
- Der Client lädt Runtime-Konfiguration genau einmal für Demo-Banner und
  Service-Worker-Aktivierung. Fehlende, ungültige oder unerreichbare Felder
  ergeben sicher `false`.
- Das Deployment-Banner („Demo-Modus“) warnt vor der Eingabe echter
  personenbezogener Daten. `showDemoBadge` bezeichnet davon getrennt
  synthetische Daten einer Persona-Sicht; der Boards-Workspace kann echte
  Arbeitsdaten zeigen und trägt deshalb dieses Badge nicht.

`DEMO_USER_PASSWORD` ist nur im Zusammenspiel mit dem env-gesteuerten,
frischen Admin-Bootstrap wirksam. Bei `DEMO_MODE=true`, gültigem
`AUTH_BOOTSTRAP_ADMIN_EMAIL`/`AUTH_BOOTSTRAP_ADMIN_PASSWORD` und leerem Store
entstehen nach dem Admin genau drei lokale Konten für Sachbearbeitung,
Aufsicht und Bürger:in. Bereits initialisierte Stores werden nie nachträglich
geseedet. Ein fehlendes oder kürzer als `MINIMUM_PASSWORD_LENGTH` gewähltes
Demo-Passwort überspringt alle Demo-Konten, lässt `demoMode=true` aber
unverändert. Passwörter und Hash-Material dürfen weder in Logs noch in
Audit-Metadaten erscheinen.

Diese Variablen sind ausschließlich für dokumentierte Demo-Deployments. Dort
gelten zusätzlich:

- keine echten personenbezogenen Daten eingeben;
- ein eigenes, ausreichend langes Secret für `DEMO_USER_PASSWORD` verwenden;
- Demo-Konten erhalten keine persönlichen Starter-Boards;
- das Bürgerkonto besitzt keine Boards-Permission.

## Öffentliche Erklärung und Onboarding

Der normative Vertrag steht in
`docs/ux-ui/public-service-experience.md`. Vor einem Consumer-Release müssen
`provisional: false`, eine freigegebene Kontaktadresse und die zuständige
Schlichtungsstelle gesetzt sein. `pnpm run check:accessibility-declaration`
blockiert bekannte Platzhalter in generierten Konsumenten. Der Ausnahmeweg
`ALLOW_PROVISIONAL_ACCESSIBILITY_DECLARATION=1` ist nur zusammen mit
`DEMO_MODE=true` zulässig und entfernt den sichtbaren Warnhinweis nicht.

Das Admin-Onboarding auf exakt `/boards` fragt Benutzer nur mit
`users.manage` ab. Loading, Fehler, Nicht-JSON und malformed Antworten bleiben
unsichtbar und lassen die Board-Liste nutzbar. Ausblendungen werden
best-effort Actor-spezifisch gespeichert.

## Lokales Release-Gate

`check:agent-release` führt nach den Unit-Tests auch die Storybook-
Interaktions- und Axe-Tests in Chromium aus. Lokal muss Chromium einmalig
installiert werden:

```bash
pnpm exec playwright install chromium
```

In GitHub CI installiert der unabhängige `storybook-a11y`-Job zusätzlich die
benötigten Systembibliotheken. Die GitLab-Pipeline bleibt unverändert.
