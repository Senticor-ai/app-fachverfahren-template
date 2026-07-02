# AGENTS.md

Kanonische Arbeitsanweisung für Coding Agents (Claude Code, Cursor, Copilot,
OpenCode, Codex, Gemini, …) und Menschen in diesem Repository. Tool-spezifische
Dateien (`CLAUDE.md`, `.claude/skills/*`) sind nur Shims auf diese Datei und
`.agents/skills/*` — sie duplizieren keine Regeln.

## Was dieses Repository IST

Eine fertige, dünne Fachverfahren-App als Kit-Komposition plus versionierte
Plattformpakete:

- `apps/antragsservice` ist die EINE lauffähige App. Sie rendert drei Personas
  (Bürger:in · Sachbearbeitung · Aufsicht) vollständig aus EINER Konfiguration
  und enthält selbst keine Fachlogik — nur Routing, eine Store-Instanz, die
  Konfiguration und die neutrale Fastify-Web-Runtime für Delivery/Health.
- `packages/fachverfahren-kit` liefert die generischen Bausteine
  (AntragStepper, Arbeitsvorrat, ReviewWorkspace, AufsichtDashboard, …) und den
  Typ `LeistungConfig`, aus dem die App rendert.
- Weitere Pakete (`platform-contracts`, `public-sector-sdk`,
  `public-sector-ui`, `provider-*`, `conformance-kit`, `migration-kit`,
  `app-store-postgres`, `jurisdictions/*`) sind die wiederverwendbare
  Plattformbasis.

Das Template baut und läuft ohne jedes externe Werkzeug:

```bash
pnpm install
pnpm run dev
```

Ein neues Fachverfahren entsteht, indem GENAU EINE Datei mit Fachdaten gefüllt
wird — die Austausch-Naht (nächster Abschnitt). Es wird nichts neu gebaut, was
im Kit existiert.

## PLAN vs. IST

Dieses Dokument und alle Pfadangaben darin beschreiben den IST-Stand des
Scaffolds. Geplante Zielarchitektur ist ausdrücklich mit `(PLAN)` markiert.

Aktuell gilt insbesondere:

- Es existiert eine neutrale Fastify-Web-Runtime unter
  `apps/antragsservice/server/` für SPA-Auslieferung, Runtime-Konfiguration,
  Security-/Cache-Header, Health, Metrics und Build-Info.
- Fachliche API-, OpenAPI-, Postgres-E2E- und Domain-Route-Schichten sind
  weiterhin Ausbauschritte; Zielarchitektur:
  `docs/reference/backend-fastify.md`.
- Es existiert KEIN MSW-Mocking: `docs/reference/mock-data-msw.md` (PLAN).
- Es existieren KEINE E2E-Suiten und keine Scripts `test:e2e`,
  `test:e2e:postgres`, `dev:postgres`, `dev:all`.
- `modules/` enthält KEINE Instanz (nur Dokumentation). Der Generator-Pfad
  `app:new` kann dort ein Modul-Gerüst erzeugen, aber die laufende App bindet
  Module NICHT ein (kein Modul-Mount). Details: `modules/README.md`.

Wer eines dieser Themen umsetzt, entfernt die `(PLAN)`-Markierung im selben
Change und verdrahtet die zugehörigen Scripts real.

## DIE EINE Austausch-Naht

`apps/antragsservice/src/leistung.config.ts` ist der einzige Austausch-Punkt
der App. Die exportierte `leistungConfig: LeistungConfig` (Typ:
`packages/fachverfahren-kit/src/types.ts`) treibt die komplette 3-Personen-UX.
Ein Fachverfahren-Build ändert ausschließlich diese Datei.

Der Vertrag der `LeistungConfig` (Pflichtfelder zuerst; `?` = im Typ
optional):

| Feld               | Vertrag                                                                                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `label`      | Slug und Anzeigename der Leistung                                                                                                                                                                                                                                     |
| `kommune`          | Trägerin der Leistung, z. B. `"Stadt Musterstadt"`                                                                                                                                                                                                                    |
| `rechtsgrundlagen` | Liste `{ norm, titel, satzung? }` — nur belegte Normen, nie erfunden                                                                                                                                                                                                  |
| `antrag.steps`     | Schritte mit Feldern (`FeldDef`: `name/label/typ/required/pattern/onceOnly/…`); jedes Pflichtfeld mit passender Validierung                                                                                                                                           |
| `statusMachine`    | `initial` + `states` (Endzustände mit `terminal: true`) + `transitions` (`rollen`, kritische Entscheidungen mit `vierAugen: true`, `detailPflicht`)                                                                                                                   |
| `berechne`         | REINE, deterministische Funktion (kein Datum, kein Zufall). Beträge in GANZEN EURO (natürliche Einheit, `120` = 120,00 €), `status` `provisional`/`final`, `begruendung` als belegte Herleitung, jede Tarifstufe/Befreiung/Ermäßigung als eigene prüfbare Verzweigung |
| `register`         | Once-Only-Register: `suchfelder` + deterministische `mock`-Daten                                                                                                                                                                                                      |
| `detailSektionen`  | Anzeige-Mapping der Antragsdaten für die Sachbearbeitung                                                                                                                                                                                                              |
| `ki?`              | `schwelleAutonom` + optional transparenter `vorschlag` (KI assistiert, Mensch entscheidet); im Typ optional, im Template-Default gesetzt                                                                                                                              |
| `seed?`            | Deterministische Demo-Vorgänge, damit die Sachbearbeitungs-Sicht sofort arbeitet; im Typ optional, im Template-Default gesetzt                                                                                                                                        |
| optional           | `fimLeistung`, `nachweise`, `ePayment`, `zustellung`, `termin`, `adressValidierung`, `personas` — NUR setzen, wenn das Fachkonzept es vorsieht                                                                                                                        |

NACH JEDEM Write auf die Naht den Vertrags-Snapshot neu erzeugen und mit
committen:

```bash
pnpm --filter @senticor/antragsservice emit:contract
```

Der Snapshot `apps/antragsservice/leistung.contract.json` ist GENERIERT und
wird nie von Hand editiert.

Die realen Routen der App (`apps/antragsservice/src/App.tsx`):

```text
/buerger · /buerger/anmelden · /buerger/bestaetigung/:id
/amt · /amt/vorgang/:id
/aufsicht
```

## Was Agenten NIE anfassen

- Kit-Interna: `packages/fachverfahren-kit/src/components/` und `…/src/ui/`
  werden importiert, nicht kopiert und für einen Fachverfahren-Build nicht
  geändert. Neue wiederverwendbare Bausteine sind Plattformarbeit mit Tests
  und Storybook, kein Nebenprodukt eines Verfahrens-Builds.
- Generierte Snapshots: `apps/antragsservice/leistung.contract.json` (nur via
  `emit:contract`).
- Die dünne App-Komposition (`App.tsx`, `store.ts`, `main.tsx`,
  `AppErrorBoundary.tsx`, `styles.css`, `index.html`, `vite.config.ts`): für
  einen Fachverfahren-Build tabu — die Naht reicht.
- Die neutrale Web-Runtime (`apps/antragsservice/server/`) ist
  Plattform-/Delivery-Arbeit, kein Nebenprodukt eines Fachverfahren-Builds.
- Template-Provenienz in generierten Repositories (`.template/*`): nur über
  die Template-CLI.

## WISSENSLÜCKE ⇒ Annahme als DATEN

Unbekannte oder unbelegte Fachwerte (Satzungsbeträge, Fristen, Schwellen)
werden NIE als Fakt behauptet. Konvention:

1. Der Wert steht als benannte Konstante in der Naht, markiert mit einem
   Annahme-Kommentar im Format `// annahme <wert> <einheit> — TBD-<QUELLE>`:

   ```ts
   // annahme 120 EUR — TBD-SATZUNG-MUSTERSTADT
   const TARIF_ERSTER_HUND = 120;
   ```

2. Anzeige-Strings (Labels, `begruendung`, Microcopy) geben Annahmen nie als
   geltendes Recht aus. Eine auf Annahmen beruhende Herleitung benennt das:
   „Annahme — zu validieren gegen <Quelle>".
3. `rechtsgrundlagen` und `fimLeistung` enthalten nur belegte Einträge. Ein
   unbelegtes `fimLeistung` trägt `status: "annahme-zu-validieren"`; unbelegte
   Rechtsgrundlagen entfallen (Einträge haben KEIN Status-Feld) und werden im
   Abschlussbericht als offene Validierungsfrage gemeldet.

## Kanonische Pfad-Karte

Jede Zeile beschreibt den IST-Stand. Zeilen mit `(PLAN)` existieren noch nicht.

| Pfad                                                              | Rolle                                                    | Agenten-Regel                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `apps/antragsservice/src/leistung.config.ts`                      | DIE EINE Austausch-Naht (`LeistungConfig`)               | Einzige Datei eines Fachverfahren-Builds           |
| `apps/antragsservice/leistung.contract.json`                      | Generierter Vertrags-Snapshot                            | Nur via `emit:contract`                            |
| `apps/antragsservice/src/`                                        | Dünne Komposition (Routing, Store, Shell)                | Für Verfahrens-Builds nicht ändern                 |
| `packages/fachverfahren-kit/src/types.ts`                         | Naht-Vertrag (`LeistungConfig`, `Berechnung`, `Vorgang`) | Lesen; Änderungen sind Plattformarbeit             |
| `packages/fachverfahren-kit/src/components/`                      | Fertige Fachverfahren-Bausteine                          | Importieren, nie kopieren                          |
| `packages/fachverfahren-kit/src/ui/`                              | shadcn/Radix/Tailwind-Primitive                          | Nur nutzen, wenn kein Baustein passt               |
| `packages/fachverfahren-kit/src/stories/`                         | Storybook-Review-Fläche                                  | Stories bei Kit-Änderungen pflegen                 |
| `packages/public-sector-ui/src/`                                  | Public-Sector-UI-Fassade + Stories                       | UI-Vertrag; ShadCN bleibt Implementierungsdetail   |
| `packages/platform-contracts/`                                    | Capability-Ports                                         | Fachlogik nutzt Ports, nie Provider direkt         |
| `packages/public-sector-sdk/`                                     | Authorization, RBAC, Audit, Domain-Kernel                | Rollen über RBAC-Registry erweitern                |
| `packages/app-store-postgres/`                                    | PostgreSQL-Migrator + Plattformtabellen                  | Migrationen über `db:migrate`                      |
| `jurisdictions/de`, `jurisdictions/eu`                            | Rechtsraum-Packs                                         | Keine `country === "DE"`-Logik in der App          |
| `modules/`                                                        | Leerer Zielort des Generator-Pfads                       | `modules/README.md` lesen; keine Instanz (PLAN)    |
| `docs/examples/hundesteuer/`                                      | Externes Beispiel (Spec + Prompt)                        | Nie in Runtime-Code kopieren                       |
| `tooling/template/cli.ts`                                         | Template-Lifecycle- und Agent-CLI                        | Verhalten nur hier, hinter `pnpm run template`     |
| `scripts/`                                                        | Deterministische Checks und Werkzeuge                    | Checks sind die Wahrheit, kein LLM-Urteil          |
| `schemas/`, `platform/capabilities.json`, `sources/registry.yaml` | Maschinenlesbare Verträge und Kataloge                   | Über `check:*`-Scripts validiert                   |
| `agent.discovery.json`                                            | Öffentliche Discovery-API für Agenten                    | Muss `check:agent-discovery` bestehen              |
| `apps/antragsservice/server/`                                     | Fastify-Web-Runtime                                      | Plattform-/Delivery-Arbeit; keine Fachlogik direkt |

## Sprache und Benennung

- User-facing Dokumentation und UI-Texte: Deutsch mit echten Umlauten.
- Code, Typen, Variablen, Package-Namen, Env-Keys: Englisch.
- Keine Hundesteuer- oder sonstigen Fachinhalte im Template-Runtime-Code.
  Fachliches lebt in der Naht eines konkreten Builds oder unter
  `docs/examples/<instanz>/`.

## Runtime- und Toolchain-Vertrag

- Node.js `>=24 <25`; pnpm ist der einzige Paketmanager.
- Strict ESM: alle Workspaces deklarieren `"type": "module"`, TypeScript nutzt
  `NodeNext`, relative Imports enden in `.js`.
- Implementierungsquellen sind TypeScript-only: unter `apps/`, `packages/`,
  `jurisdictions/` und `modules/` sind nur `.ts` und `.tsx` erlaubt.
  Ausnahmen sind ausschließlich die in `scripts/check-esm-policy.mjs`
  allowgelisteten Interop- und Browser-Runtime-Assets.
- `pnpm run check:esm` und `pnpm run check:typescript-policy` müssen bestehen.

## UI

Die wiederverwendbaren Bausteine liegen in
`packages/fachverfahren-kit/src/components/`, die Primitive in
`packages/fachverfahren-kit/src/ui/`. Vor UI-Arbeit
`docs/reference/fachverfahren-kit-components.md` lesen und über
`@senticor/fachverfahren-kit` importieren. Der verbindliche UX/UI-Vertrag steht
in `docs/ux-ui/fachverfahren-ux-contract.md`; bei UI-, Storybook- oder
Screen-Contract-Änderungen gilt zusätzlich `.agents/skills/ux-ui/SKILL.md`.

- Design-Tokens: Komponenten und Stories nutzen die `--color-*`-Aliasse,
  nie rohe HSL-Quelltokens wie `var(--foreground)`;
  `pnpm run check:css-tokens` blockiert Verstöße.
- Jede neue UI-Funktion braucht Tastaturbedienbarkeit, Landmarks, sichtbaren
  Fokus, Fehlermeldungen mit Recovery-Pfad sowie Storybook-/Testzustände für
  Default, Loading, Empty, Error und relevante Accessibility-Varianten.
- React-Hilfskomponenten stehen auf Modulebene; lokale Render-Helfer werden als
  Funktionsaufruf wie `{renderStep()}` verwendet, nicht als JSX-Komponente.
- Neue Exports aus `public-sector-ui` müssen in Storybook sichtbar sein und
  `pnpm run check:storybook` bestehen.

## Test-Konvention

- Unit-/Contract-Tests liegen neben der Quelle als `*.test.ts` und laufen über
  Vitest vom Repo-Root: `pnpm run test`.
- Die Berechnung der Naht ist rein und deterministisch — sie wird gegen die
  Beispielwerte des Fachkonzepts getestet, nicht gegen die UI.
- Typprüfung: `pnpm run typecheck` (Root-Pakete + App).
- Template-Lifecycle-Code wird testgetrieben entwickelt:
  `pnpm run test:template` plus `check:template-invariants` und
  `check:scaffold` vor Abschluss von Template-Änderungen.
- Evidenz statt Chat-Behauptung: wenn ein Check einen Report erzeugt
  (`dist/evidence/`, `agent:verify`), ist der Report die Quelle.

## Agent-Workflow

Vendor-neutraler Einstieg (alle Befehle sind reale Package-Scripts):

```bash
pnpm run agent:bootstrap -- --json
pnpm run agent:discover -- --json
pnpm run agent:context -- --task <app-spec> --paths <pfad>
```

`agent.discovery.json` ist die öffentliche Discovery-API. `agent:context`
liefert `nextCommands`, `validationProfiles` und `writeBoundaries`;
`agent:verify` validiert einen Abschlussbericht mit echten
`commandsExecuted`. Kurzskills liegen kanonisch unter `.agents/skills/`;
Startpunkt für Fachverfahren-Builds ist
`.agents/skills/fachverfahren-app/SKILL.md`.

Gouvernierte Webquellen stehen in `sources/registry.yaml`; für registrierte
Quellen `source:fetch` statt beliebiger Netzwerkzugriffe verwenden.

## Template-Lifecycle

Dieses Repository ist ein versioniertes Template. Neue vollständige
Fachverfahren-Repositories entstehen über die TypeScript-CLI:

```bash
pnpm run scaffold:domain-app -- --domain beispiel --display-name Beispiel --target /tmp/app-beispiel --allow-existing-empty
```

Ein App-only-Export der Kompositions-App:

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

Lifecycle-Befehle laufen über `tooling/template/cli.ts`
(`template:status/diff/update/doctor/explain`). Generierte Repositories tragen
`.template/`-Provenienz ohne Zeitstempel und lokale Pfade. Runbook-Befehle
enthalten keine Inline-Shell-Kommentare (`check:runbook-commands`).

## CI und Container-Builds

GitHub `main` ist die kanonische Quelle; nach grüner CI wird nach
GitLab/openCode gespiegelt. opencode.de-Runner sind unprivilegierte
Kubernetes-Pods: kein Docker-Socket, kein `docker:dind` — Image-Builds nutzen
Kaniko (`.gitlab-ci.yml`).

Die reale Build-Kette ist:

```bash
pnpm run build:packages
pnpm run build:app
pnpm run build:server
```

Das Dockerfile baut genau diese Kette und startet die Fastify-Web-Runtime aus
`apps/antragsservice/dist-server/index.js`; `check:dockerfile-paths` hält die
`COPY`-Quellen deterministisch mit dem Scaffold synchron.

Bei pnpm-Filterbefehlen steht `--filter` vor `run`:

```bash
pnpm --filter "./packages/**" run --if-present build
```

## Authorization und Audit

Rollen in der UI sind keine Autorisierung. Entscheidungen gehören serverseitig
in Policy-Checks; kritische Übergänge tragen `vierAugen: true` in der
`statusMachine` und werden in der Zielarchitektur serverseitig erzwungen
(PLAN). Fachliche Audit-Historie (`Vorgang.history`) ist append-only.
Eingebaute Rollen sind `citizen` und `caseworker`; neue Rollen laufen über die
RBAC-Registry in `@senticor/public-sector-sdk`, nicht über verstreute
UI-Bedingungen.

## Kopfblock-Standard für generierte Dokumentation

Jedes von Agenten generierte Dokument (Fachkonzept, Audit, Referenz, Report)
beginnt mit diesem Kopfblock:

```markdown
> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST | PLAN — `IST` beschreibt das reale Scaffold, `PLAN` eine
> Zielarchitektur, die noch nicht existiert.
> Quellen: <Dateien, Normen, Specs, aus denen dieses Dokument abgeleitet ist>
> Pflicht-Lektüre vorher: `AGENTS.md`, <weitere Skills/Docs>
```

Regeln: Jede Pfadangabe existiert im Scaffold oder trägt `(PLAN)`. Gemischte
Dokumente markieren PLAN-Abschnitte einzeln. Annahmen folgen der
Annahme-DATEN-Konvention dieses Dokuments.

## Verifikation

Vor Abschluss einer Änderung, je nach Scope (alles reale Scripts):

```bash
pnpm --filter @senticor/antragsservice emit:contract
pnpm run check:agent-smoke
pnpm run check:agent-domain
pnpm run check:agent-ui
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:storybook
pnpm run check:css-tokens
pnpm run check:agent-discovery
pnpm run check:domain-contracts
pnpm run build:server
pnpm run check:web-delivery
pnpm run test:k8s:render
pnpm run check:k8s-delivery
pnpm run test:supply-chain
pnpm run evidence:build
pnpm run test:template
pnpm run check:template-invariants
pnpm run check:scaffold
pnpm run check:precommit
```

`emit:contract` ist nur nach Naht-Änderungen nötig. Wenn Abhängigkeiten nicht
installiert sind, wird das klar im Ergebnis dokumentiert — nicht behauptet.
