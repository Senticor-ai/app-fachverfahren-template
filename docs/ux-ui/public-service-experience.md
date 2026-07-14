> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST — dieses Dokument ist der normative Verhaltensvertrag für die
> öffentliche Service-Erfahrung des Scaffolds.
> Quellen: Epic #29, bestätigter PR-2-Scope, `AGENTS.md`,
> `docs/ux-ui/fachverfahren-ux-contract.md`.
> Pflicht-Lektüre vorher: `AGENTS.md`, `.agents/skills/ux-ui/SKILL.md`,
> `.agents/skills/accessibility-bitv/SKILL.md`.

# Public Service Experience

Dieses Dokument trennt beobachtbares Verhalten von Implementierungsdetails.
Jede Anforderung besitzt eine stabile ID und mindestens einen automatisierten
Beleg. Änderungen am Verhalten ändern zuerst diesen Vertrag und anschließend
die zugeordneten Tests.

## Öffentliche Routen

### PUB-ROUTE-001 — Öffentliche Seiten vor dem Einmal-Setup

**Gegeben** es existiert noch kein erstes Konto und keine Sitzung, **wenn** eine
Person `/` oder `/barrierefreiheit` öffnet, **dann** rendert die angeforderte
Seite ohne Umleitung durch First-Run- oder Session-Gate. Query und Fragment
ändern diese Entscheidung nicht.

### PUB-ROUTE-002 — Kanonischer Pfad und Near-Matches

`/barrierefreiheit/` leitet clientseitig auf `/barrierefreiheit` um. Die
Varianten `/barrierefreiheit/x`, `/Barrierefreiheit`,
`//barrierefreiheit` und kodierte Abwandlungen sind nicht öffentlich. Sie
dürfen weder First-Run- noch Session-Gates umgehen.

### PUB-GATE-001 — Geschützte Routen bleiben geschützt

Unter denselben Vorbedingungen leiten Persona- und Workspace-Routen weiter auf
`/`. `/login` bleibt ausschließlich ein Alias auf `/` und ist keine eigene
öffentliche Erfahrung.

### PUB-CONFIG-001 — Branding ohne Serverzustand

Die öffentliche Erklärung liest Leistungsname und Kommune synchron aus der
beim App-Start erzeugten `store.config`. Sie führt selbst keinen Session- oder
API-Request aus. Eine ungültige `LeistungConfig` bleibt ein Fehler beim
App-Start und wird nicht durch erfundene Branding-Fallbacks verdeckt.

### PUB-NAV-001 — Ein reales Ziel

Landing und authentifizierte Shells verlinken dieselbe reale Route
`/barrierefreiheit`. Clientseitige Navigation nutzt den bestehenden
Router-Callback.

## Barrierefreiheit

### PUB-A11Y-001 — Semantik und Fokus

Landing und Erklärung besitzen jeweils genau ein `main`, eine
Seitenüberschrift `h1`, einen top-level Header/Banner und ein globales
`contentinfo`. Die Überschriftenhierarchie ist lückenlos. Die Tastaturreihenfolge
folgt den sichtbaren, verständlichen Namen der Interaktionen.

### PUB-A11Y-002 — Status und Linkverhalten

Konformitäts- und Erledigt-Status werden immer durch Text und Icon vermittelt.
Dekorative Icons sind für assistive Technik verborgen. Nur Links mit
`target="_blank"` kündigen den neuen Browsing-Kontext auch für Screenreader an.

### PUB-LEGAL-001 — Vorläufige Mustererklärung

Die Template-Erklärung ist als vorläufig sichtbar gekennzeichnet. Ein
generierter Konsument darf den Release-Check mit `provisional: true`,
`example.org` oder dem Platzhalter der Schlichtungsstelle nur mit dem
ausdrücklichen Demo-Override
`ALLOW_PROVISIONAL_ACCESSIBILITY_DECLARATION=1` zusammen mit
`DEMO_MODE=true` passieren. Der Override entfernt die sichtbare Kennzeichnung
nicht.

## Admin-Onboarding

### ONB-VIS-001 — Sichtbarkeitsentscheidung

Die Karte erscheint nur auf exakt `/boards`, wenn ein Actor vorhanden ist,
`users.manage` besitzt, noch nicht Actor-spezifisch ausgeblendet hat und
`GET /api/v1/users` genau ein Konto liefert. Sie erscheint nie im Board-Detail.

### ONB-AUTH-001 — Keine unberechtigte Enumeration

Ohne Actor oder `users.manage` wird `/api/v1/users` nicht angefragt. Eine
bereits persistierte Ausblendung verhindert den Request ebenfalls.

### ONB-FETCH-001 — Fail closed

Pending, Fehler, Nicht-JSON und nicht-arrayförmige Antworten zeigen keine
Onboarding-Karte und beeinträchtigen die Board-Liste nicht. `0` oder mehr als
`1` Konto blendet die Karte ebenfalls aus.

### ONB-STEPS-001 — Stabile Schritte

Die Reihenfolge lautet `organisation`, `team`, `idp`, `discovery`. Nur `team`
verlinkt `/admin/users`. Der IdP-Schritt nennt die Repository-Dokumentation nur
als Text. Der Discovery-Schritt verweist auf die Board-Liste unter der Karte.

### ONB-STEPS-002 — Keine erfundete Erledigung

Solange die App-Karte sichtbar ist, bleiben alle vier Schritte offen, weil kein
verlässliches Fertig-Signal existiert. Der generische Kit-Baustein unterstützt
und belegt dennoch einen textuell sichtbaren `done`-Zustand.

### ONB-DISMISS-001 — Actor-spezifische Ausblendung

Ausblenden entfernt die Karte sofort und persistiert best-effort unter
`fv-admin-onboarding-dismissed:<actorId>`. Schlägt `localStorage.setItem` fehl,
bleibt sie bis zum Reload verborgen und darf danach wieder erscheinen.

### ONB-FOCUS-001 — Fokus nach dem Ausblenden

Nach dem Entfernen wandert der Fokus auf die fokussierbare, mit „Boards“
benannte Inhaltsregion, die die Board-Liste umschließt.

### ONB-ACTOR-001 — Kontowechsel

Ein Actor-Wechsel liest den neuen Schlüssel, verwirft den alten Ladezustand und
prüft die Sichtbarkeit neu. Eine Ausblendung gilt nie für ein anderes Konto.

## Demo-Modus

### DEMO-CONFIG-001 — Strikte Konfiguration

`DEMO_MODE` nutzt dieselbe Boolean-Grammatik wie andere Runtime-Flags. Fehlend
bedeutet `false`; unbekannte Werte verhindern den Start mit einem
Konfigurationsfehler.

### DEMO-AUTHORITY-001 — Eine Darstellungsquelle

`/runtime-config.json.features.demoMode` ist für die sichtbaren Banner
maßgeblich. `/auth/status.demoMode` spiegelt denselben serverseitig geparsten
Wert für Session-Konsumenten.

### DEMO-DISAGREE-001 — Widerspruch

Widersprechen Test-Doubles oder gemischte Deployment-Versionen einander,
entscheidet die Runtime-Konfiguration über alle Banner. Der Session-Snapshot
bewahrt das Statusfeld nur als additiven API-Vertrag.

### DEMO-COMPAT-001 — Additive Kompatibilität

Fehlende, nicht-boolsche, nicht-JSON oder unerreichbare Felder bedeuten
`demoMode: false`. Alte Clients ignorieren die neuen Serverfelder. Alter Server
und neuer Client bleiben durch den False-Fallback kompatibel.

### DEMO-BANNER-001 — Warnung vor Interaktion

Die App wartet auf den aufgelösten Runtime-Konfigurationszustand, bevor sie
interaktive Routen rendert. Im Demo-Modus erscheint der Hinweis auf Landing,
Persona-Shell und Boards-Shell, bevor Anmelde- oder Arbeitsaktionen verfügbar
sind.

### DEMO-SEED-001 — Fresh-Bootstrap

Bei leerem Store erzeugt der Env-Bootstrap zuerst genau ein Admin-Konto und
anschließend drei lokale Demo-Konten: Sachbearbeitung, Aufsicht und Bürger:in.
Danach existieren vier Konten.

### DEMO-SEED-002 — Keine nachträgliche Mutation

Ein bereits eingerichteter Store wird nicht geseedet. Späteres Aktivieren des
Flags verändert kein bestehendes Konto. Bestehende Demo-E-Mail-Adressen werden
nicht überschrieben.

### DEMO-SEED-003 — Passwort-Policy

Fehlt `DEMO_USER_PASSWORD` oder verletzt es die bestehende
`MINIMUM_PASSWORD_LENGTH`, werden keine Demo-Konten angelegt. Das
Deployment-Flag bleibt davon unabhängig `true`.

### DEMO-IDEMP-001 — Wiederholbarkeit

Ein Neustart oder direkter Seed-Rerun erzeugt weder doppelte Konten noch
doppelte `USER_CREATED`-Events.

### DEMO-PARTIAL-001 — Teilfehler

Der Fehler eines Kontos wird protokolliert, verhindert weder die weiteren
Versuche noch den Serverstart und erzeugt für das fehlgeschlagene Konto kein
Audit-Event.

### DEMO-AUDIT-001 — Audit ohne Geheimnis

Jedes erfolgreich angelegte Demo-Konto erzeugt genau ein `USER_CREATED` mit
`metadata.via === "demo-seed"`. Logs und Metadata enthalten weder Klartext-
Passwort noch abgeleitetes Hash-Material.

### DEMO-DATA-001 — Kontoformen und Boards

Sachbearbeitung und Aufsicht sind `member`, Bürger:in ist `citizen`. Jedes
Konto besitzt genau seinen namensgleichen lokalen Arbeitsbereich und
`personaManagementMode: "local"`. Demo-Konten erhalten keine persönlichen
Starter-Boards; der Bootstrap erzeugt nur das geteilte Discovery-Board.

### DEMO-AUTHZ-001 — Bürgerkonto bleibt ausgeschlossen

Das Demo-Bürgerkonto kann sich anmelden, erhält aber beim Lesen und Schreiben
der Boards-API `403`.

## CI- und Release-Vertrag

### CI-STORYBOOK-001 — Blockierendes GitHub-A11y-Gate

GitHub führt `test:storybook` in einem unabhängigen Job mit Chromium aus.
Actions sind auf Commit-SHAs gepinnt. `check:agent-release` führt
`test:storybook` unmittelbar nach `test` aus; GitLab bleibt unverändert.

## Traceability

| Anforderungen                                                | Testebene                    | Automatisierter Beleg                                          |
| ------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| `PUB-ROUTE-*`, `PUB-GATE-001`                                | Pure Logik + Router-Story    | `landing-state.test.ts`, `PublicServiceExperience.stories.tsx` |
| `PUB-A11Y-*`, `PUB-NAV-001`                                  | Storybook Interaktion + Axe  | Erklärung-, Shell- und App-Stories                             |
| `PUB-LEGAL-001`                                              | Script-Vertrag               | `check-accessibility-declaration.test.mjs`                     |
| `ONB-VIS-*`, `ONB-STEPS-*`                                   | Unit                         | `admin-onboarding.test.ts`                                     |
| `ONB-AUTH-*`, `ONB-DISMISS-*`, `ONB-FOCUS-*`                 | App-Story                    | `PublicServiceExperience.stories.tsx`                          |
| `DEMO-CONFIG-*`, `DEMO-AUTHORITY-*`                          | Server-JSON-Vertrag          | `server/index.test.ts`, `auth/routes.test.ts`                  |
| `DEMO-SEED-*`, `DEMO-IDEMP-*`, `DEMO-AUDIT-*`, `DEMO-DATA-*` | Store-/Bootstrap-Integration | `demo-seed.test.ts`, `auto-bootstrap.test.ts`                  |
| `DEMO-AUTHZ-001`                                             | Fastify-Integration          | `demo-authz.test.ts`                                           |
| `DEMO-COMPAT-*`, `DEMO-DISAGREE-*`                           | Client-Vertrag + App-Story   | Session-/Runtime-Tests und App-Story                           |
| `CI-STORYBOOK-001`                                           | YAML-/Script-Vertrag         | `ci-storybook-contract.test.ts` + GitHub-Job                   |
