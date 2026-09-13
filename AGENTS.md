# AGENTS.md

Kanonische Arbeitsanweisung für Coding Agents (Claude Code, Cursor, Copilot,
OpenCode, Codex, Gemini, …) und Menschen in diesem Repository. Tool-spezifische
Dateien (`CLAUDE.md`, `.claude/skills/*`) sind nur Shims auf diese Datei und
`.agents/skills/*` — sie duplizieren keine Regeln.

## Was dieses Repository IST

Eine fertige, dünne Fachverfahren-App als Kit-Komposition plus versionierte
Plattformpakete:

- `apps/fachverfahren` ist die EINE lauffähige App. Sie rendert drei Personas
  (Bürger:in · Sachbearbeitung · Aufsicht) vollständig aus EINER Konfiguration
  und enthält selbst keine Fachlogik — nur Routing, eine Store-Instanz, die
  Konfiguration und die neutrale Fastify-Web-Runtime für Delivery/Health.
- `packages/fachverfahren-kit` liefert die generischen Bausteine
  (AntragStepper, Arbeitsvorrat, ReviewWorkspace, AufsichtDashboard, …) und den
  Typ `LeistungConfig`, aus dem die App rendert.
- Weitere Pakete (`platform-contracts`, `public-sector-sdk`,
  `public-sector-ui`, `app-runtime-fastify` (neutrale Web-Runtime),
  `app-bff-fastify` (fachliche BFF-Routen) + `app-bff-contracts`
  (TypeBox-DTOs), `app-store-postgres`, `workflow-bpmn-stub`, `provider-*`,
  `conformance-kit`, `migration-kit`, `jurisdictions/*`) sind die
  wiederverwendbare Plattformbasis.

Das Template baut ohne jedes externe Werkzeug; die klickbaren Sichten sind
seit dem Session-Gate anmeldepflichtig:

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` allein zeigt die Landing mit „Server nicht erreichbar" — für
die klickbaren Personas braucht es zusätzlich `pnpm run dev:api` (Postgres
vorausgesetzt) und eine Anmeldung. Die login-freie Demo der Bausteine ist
`pnpm run storybook`.

Ein neues Fachverfahren entsteht, indem GENAU EINE Datei mit Fachdaten gefüllt
wird — die Austausch-Naht (nächster Abschnitt). Es wird nichts neu gebaut, was
im Kit existiert.

## Doktrin: Fachverfahren als agentic-composable Netz aus Bausteinen

Ein Fachverfahren wird als **Netz aus Bausteinen** gedacht — jeder Baustein ist
eine **Zuständigkeit der Ablauforganisation** (Bürgerdienst · Fachprüfung ·
Datenanbindung · Aufsicht · das Backend), besetzbar durch **Mensch ODER Agent
ODER beide**. Die Bausteine folgen der fachlichen Zuständigkeit (aus dem
Fachkonzept: Prozesse, Rollen, `statusMachine`-Transitionen mit `rollen[]`/
Vier-Augen), NICHT technischer Willkür. Ein Baustein bündelt Können, Wissen und
Nachweise; die Bausteine spielen über typisierte Verträge auf drei Ebenen
zusammen — governt und evidenziert, zu Build- UND Laufzeit. Mensch und Agent
sind **gleichrangige Peer-Knoten**.

Was das Template davon HEUTE trägt (der OSS-Runtime-Anteil):

- **KOORDINATION — der Aktenvermerk als Blackboard** _(gebaut)_. Die geteilte
  Fall-Akte ist der Arbeitsraum, in den Mensch UND Agent gleichrangig
  **typisierte Zellen** schreiben (`kind` ∈ hypothese/teilergebnis/frage/befund/
  entscheidung/notiz), jede mit Peer-Kennung (`urheber` = `human:<rolle>` ODER
  Modell/Agent), Sichtbarkeit und Threading — append-only im Fall-Audit, KI-Zellen
  prüfpflichtig (HITL). Routen unter `/api/cases/:id/vermerke*` (Skill
  `dossier-fallmanagement`). Damit dokumentieren Mensch und Agent DASSELBE, für
  beide les- und nutzbar. Ein Agent **steuert** dieses Mesh headless über die
  **Agenten-CLI** (`apps/fachverfahren/server/dev/mesh-cli.ts`, Package-Script
  `mesh`) gegen eine deterministische **Golden Fixture** — ohne Browser/Server/
  finalen Build, über dieselben Routen (die CLI reimplementiert nichts).
- **FÄHIGKEIT — austauschbare Ports** _(teilweise)_. Capabilities sind Ports mit
  Conformance-Vertrag und per Env wählbaren Anbietern (`AiAssistPort` local↔ollama,
  `BlobStoragePort`); ein Baustein konsumiert sie governt (RBAC), nie einen
  konkreten Anbieter (Skill `ki-assistenz`, `platform/capabilities.json`).
- **DATEN — Datenanbindung** _(dünn)_. Register/Nachweise als Daten-Naht
  (`leistung.config` `register`/`nachweise()`, Nachweis-Upload über `BlobStoragePort`).

**Ehrlich abgegrenzt:** das VOLLE Mesh (GraphStore-Substrat, Capability-Mesh mit
`governedDispatch`, evaluiertes Qualitäts-Routing, das selbst-wachsende
Skill-Learning, der offene Runtime-Kernel) lebt hinter der Naht in **chos-code**
(governter Build-/Runtime-Agent) und wird über dieselben Store-/Port-Verträge
angebunden — das Template ist die **standalone-lauffähige OSS-Seite** (Open-Core:
OPEN = Runtime/Verträge; PROPRIETÄR = kuratiertes Wissen + getunte Agenten/Evals).
Ein Baustein/eine neue Zuständigkeit fügst du daher HIER als DATEN + Vertrag hinzu:
Rolle/Permission (`rbac.ts`), Zustände/Übergänge (`procedure.config`/`leistung.config`),
konsumierte Capability (Port + `capabilities.json`), Beiträge in die geteilte Akte
(Vermerke) — nie als handverdrahteter Monolith.

## PLAN vs. IST

Dieses Dokument und alle Pfadangaben darin beschreiben den IST-Stand des
Scaffolds. Geplante Zielarchitektur ist ausdrücklich mit `(PLAN)` markiert.

Aktuell gilt insbesondere:

- Es existiert eine neutrale Fastify-Web-Runtime (`packages/app-runtime-fastify`,
  komponiert in `apps/fachverfahren/server/`) für SPA-Auslieferung,
  Runtime-Konfiguration, Security-/Cache-Header, Health, Metrics und Build-Info.
- Die fachliche API existiert: `packages/app-bff-fastify` trägt 15 Routenmodule
  (`session`, `capabilities`, `preferences`, `mailbox`, `cases`, `tasks`,
  `buerger`, `composables`, `identity`, `payment`, `register`, `vermerke`,
  `zustellung`, `verfahren-wissen`, `ai-assist`). Details:
  `docs/reference/backend-fastify.md`.
- Der OpenAPI-Snapshot `schemas/openapi.internal.json` ist die Wahrheit über die
  Pfade und wird von `check:openapi` gehalten — ein Gate in `check:ci`.
- MSW ist ausschließlich TEST-Schicht
  (`apps/fachverfahren/src/antrag-client.browser.test.tsx`, `pnpm run test:browser`);
  eine fachliche Mock-Schicht der App gibt es nicht
  (`docs/reference/mock-data-msw.md`).
- Es existieren `pnpm run test:e2e` (hermetischer Rauchtest, `tests/e2e/`) und
  `pnpm run test:pg` (Store-Tests gegen echtes Postgres, testcontainers);
  KEINE Scripts `test:e2e:postgres`, `dev:postgres`, `dev:all`.
- `modules/` enthält KEINE Instanz (nur Dokumentation). Der Generator-Pfad
  `app:new` kann dort ein Modul-Gerüst erzeugen, aber die laufende App bindet
  Module NICHT ein (kein Modul-Mount). Details: `modules/README.md`.

Wer eines dieser Themen umsetzt, entfernt die `(PLAN)`-Markierung im selben
Change und verdrahtet die zugehörigen Scripts real.

## DIE EINE Austausch-Naht — je Verfahrenstyp

Es gibt **zwei** Nähte, eine je Verfahrenstyp — welcher Typ wann gilt, steht in
`docs/agents/fachverfahren-typen.md` und wird hier nicht wiederholt:

| Naht                                            | Typ            | Vertrag                          |
| ----------------------------------------------- | -------------- | -------------------------------- |
| `apps/fachverfahren/src/leistung.config.ts`     | Antrag/Vorgang | `leistungConfig: LeistungConfig` |
| `apps/fachverfahren/server/procedure.config.ts` | Fall/Dossier   | die Verfahrens-/Dossier-Naht     |

In einer **erzeugten** App heißt der Antragspfad
`apps/<domain>/src/leistung.config.ts` — der Scaffold benennt das
App-Verzeichnis um, nicht die Naht.

Die exportierte `leistungConfig: LeistungConfig` (Typ:
`packages/fachverfahren-kit/src/types.ts`) treibt die komplette 3-Personen-UX.
Ein Antrags-Build ändert ausschließlich diese Datei.

**Pflichtform als Werkzeug** — die Form kommt zum Agenten, statt dass der Agent
sie sich aus 57 KB Typgraph liest. Quelle jeder Regel ist
`packages/fachverfahren-kit/src/leistung-contract-form.ts`:

```bash
pnpm seam:shape
pnpm seam:check --from <datei|->
pnpm seam:set --from <datei|-> --part <teil>
```

`seam:check --from <datei|-> [--part <teil>]` prüft VOR dem Schreiben, `seam:set`
schreibt einen Teil. `seam:check` ist eine echte **Teilmenge** von
`check:leistung-contract` — keine Snapshot-Frische, kein `verifyDatenanbindung`.
Das Gate bleibt die Wahrheit.

Der Vertrag der `LeistungConfig` (Pflichtfelder zuerst; `?` = im Typ
optional). **Pflichtfelder** = die 8 Pflichten der `LEISTUNG_CONTRACT_FORM`
(`id`, `label`, `kommune`, `rechtsgrundlagen`, `antrag.steps`,
`statusMachine.states`, `detailSektionen`, `register.suchfelder`);
`pnpm seam:shape` druckt sie:

| Feld                                                               | Vertrag                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `label`                                                      | Slug und Anzeigename der Leistung                                                                                                                                                                                                                                                                       |
| `kommune`                                                          | Trägerin / erlassende Stelle der Leistung — Kommune ODER Behörde ODER interne Stelle, z. B. `"Stadt Musterstadt"`, `"Bundesamt für …"`, `"Zentrale Vergabe"`                                                                                                                                            |
| `rechtsgrundlagen`                                                 | Liste `{ norm, titel, satzung? }` — nur belegte Normen, nie erfunden                                                                                                                                                                                                                                    |
| `antrag.steps`                                                     | Schritte mit Feldern (`FeldDef`: `name/label/typ/required/pattern/onceOnly/…`); jedes Pflichtfeld mit passender Validierung                                                                                                                                                                             |
| `antrag.konditionierendesFeld?`                                    | Feldpfad der Vorgangsart, der den Rest des Antrags konditioniert — MUSS ein Feld aus `steps[0]` sein (Invariante von `check:leistung-contract`); fehlt es, gibt es keine progressive Disclosure                                                                                                         |
| `statusMachine`                                                    | `initial` + `states` (Endzustände mit `terminal: true`) + `transitions` (`rollen`, kritische Entscheidungen mit `vierAugen: true`, `detailPflicht`)                                                                                                                                                     |
| `tarif?`                                                           | Gebühren-/Tariftabelle als DATEN (Staffeln statt `const`+`switch`) — der **Default**: fehlt `berechne`, wertet der reine Interpreter (`lib/interpreter`) diesen Tarif zur `Berechnung` aus                                                                                                              |
| `berechne?`                                                        | OPTIONAL — der Escape-Hatch für **nicht-tabellarische** Subsumtion; gesetzt hat er Vorrang vor `tarif`. REINE, deterministische Funktion (kein Datum, kein Zufall). Beträge in GANZEN EURO (natürliche Einheit, `120` = 120,00 €), `status` `provisional`/`final`, `begruendung` als belegte Herleitung |
| `rechenproben?`                                                    | Die SOLLWERT-Tabelle der Berechnung als DATEN (je Fallgruppe eine Probe, mit `herleitung` und `quelle` aus dem Fachkonzept). Das AUSFÜHRENDE Programm ist der Test — niemand rechnet im Kopf                                                                                                            |
| `codelisten?` · `datenlisten?`                                     | Wiederverwendbare Auswahl-Listen als DATEN, über `FeldDef.optionsRef` referenziert. `codelisten` sind geerdet (`normRef`/`belege` je Eintrag) und leiten daraus die erforderlichen Nachweise ab                                                                                                         |
| `registerRefs?` · `fimRefs?` · `fristenTypen?` · `datenanbindung?` | Register-/FIM-Referenzen, Fristen-Typen und die generische, zweckgebundene Datenanbindung — alles als DATEN. `datenanbindung` verallgemeinert die anderen zu EINER Sicht                                                                                                                                |
| `register`                                                         | Once-Only-Register: `suchfelder` + deterministische `mock`-Daten                                                                                                                                                                                                                                        |
| `detailSektionen`                                                  | Anzeige-Mapping der Antragsdaten für die Sachbearbeitung                                                                                                                                                                                                                                                |
| `verwaltungsaktInhalt?`                                            | Die Pflichtinhalte des Verwaltungsakts. `tenorNachrechnung` deklariert den Status-Pfad, über den die Behörde den Tenor VOR dem Einfrieren nachrechnet (`statusPathOf`); schweigt die Naht, entfällt der Block, statt geerbt zu werden                                                                   |
| `ki?`                                                              | `schwelleAutonom` + optional transparenter `vorschlag` (KI assistiert, Mensch entscheidet); im Typ optional, im Template-Default gesetzt                                                                                                                                                                |
| `seed?`                                                            | Deterministische Demo-Vorgänge, damit die Sachbearbeitungs-Sicht sofort arbeitet; im Typ optional, im Template-Default gesetzt                                                                                                                                                                          |
| `personas?`                                                        | `PersonaDescriptor[]`. `navLabels` benennt die Navigations-WÖRTER je Arbeitsbereich (`FachverfahrenShell`/`PersonaSwitcher` lesen sie); WELCHE Einträge überhaupt erscheinen, entscheidet der Vertrag, nicht diese Liste                                                                                |
| optional                                                           | `fimLeistung`, `nachweise`, `ePayment`, `zustellung`, `termin`, `adressValidierung` — NUR setzen, wenn das Fachkonzept es vorsieht                                                                                                                                                                      |

`FeldDef.leichteSprache`/`hintEinfach` (DIN SPEC 33429, additiv zu
`label`/`hint`) gehören zum selben Naht-Write wie der Rest des Feldes — nie
eine spätere Anreicherungsphase, sonst veraltet `leistung.contract.json`
gegenüber der Config. Gilt NUR für Bürger-Felder (`/buerger*`); die
Sachbearbeitung nutzt stattdessen `labelFachlich`. Details:
`.agents/skills/fachverfahren-app/SKILL.md` („Bürger-Sprache").

NACH JEDEM Write auf die Naht den Vertrags-Snapshot neu erzeugen und mit
committen:

```bash
pnpm --filter @senticor/fachverfahren emit:contract
```

Der Snapshot `apps/fachverfahren/leistung.contract.json` ist GENERIERT und
wird nie von Hand editiert.

Die realen Routen der App. Die QUELLE ist
`apps/fachverfahren/src/app/route-gates.ts` (Pfad → Gate) plus
`apps/fachverfahren/src/app/routes.tsx` (Pfad → Sicht) — eine neue Route
entsteht in diesen beiden Dateien, sonst nirgends. Ohne Anmeldung sind GENAU
ZWEI Routen erreichbar: `/` (Landing/Anmeldung) und `/hilfe` (das Doku-Wiki;
Doku ist nicht sensibel, und ein Agent soll sie lesen können). `/login` bleibt
nur Alias auf `/`; `/auth/register` existiert nur bei
`AUTH_REGISTRATION_MODE=open_unverified`. Alle Persona- und Workspace-Routen
sind session-pflichtig; Persona-Routen setzen zusätzlich den ZUGEWIESENEN
Arbeitsbereich voraus (Navigation, keine Autorisierung), `/boards*` verlangt die
Permission `boards.collaborate` (Details: `docs/reference/rbac.md`):

```text
/ · /login · /hilfe   (ohne Anmeldung)
/buerger · /buerger/anmelden · /buerger/bestaetigung/:id    (Arbeitsbereich buerger)
/buerger/antraege · /buerger/antrag/:id                     (Arbeitsbereich buerger)
/buerger/bescheid/:id · /buerger/postfach                   (Arbeitsbereich buerger)
/amt · /amt/vorgang/:id                                     (Arbeitsbereich sachbearbeitung)
/amt/akten · /amt/akte/:id                                  (Arbeitsbereich sachbearbeitung)
/amt/verfahren/:procedureId/:version/wiki                   (Arbeitsbereich sachbearbeitung)
/amt/assistent                                              (Arbeitsbereich sachbearbeitung)
/aufsicht                                                   (Arbeitsbereich aufsicht)
/boards · /boards/:boardId   (Permission boards.collaborate)
/admin/users   (Permission users.manage) · /konto/passwort
```

## Was Agenten NIE anfassen

- Kit-Interna: `packages/fachverfahren-kit/src/components/` und `…/src/ui/`
  werden importiert, nicht kopiert und für einen Fachverfahren-Build nicht
  geändert. Neue wiederverwendbare Bausteine sind Plattformarbeit mit Tests
  und Storybook, kein Nebenprodukt eines Verfahrens-Builds.
- Generierte Snapshots: `apps/fachverfahren/leistung.contract.json` (nur via
  `emit:contract`).
- Die dünne App-Komposition (`App.tsx`, `store.ts`, `main.tsx`,
  `AppErrorBoundary.tsx`, `styles.css`, `index.html`, `vite.config.ts`): für
  einen Fachverfahren-Build tabu — die Naht reicht.
- Die neutrale Web-Runtime (`apps/fachverfahren/server/`) ist
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
4. Beruhen die Sätze auf Annahmen, setzt die Berechnung
   `Berechnung.saetzeBelegt = false` — die Ergebnis-Plakette
   (`packages/fachverfahren-kit/src/ergebnis-plakette.ts`) zeigt dann kein
   „§-BELEGT" mehr, sondern was tatsächlich gilt.

## Kanonische Pfad-Karte

Jede Zeile beschreibt den IST-Stand. Zeilen mit `(PLAN)` existieren noch nicht.

| Pfad                                                              | Rolle                                                    | Agenten-Regel                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `apps/fachverfahren/src/leistung.config.ts`                       | DIE EINE Austausch-Naht (`LeistungConfig`)               | Einzige Datei eines Fachverfahren-Builds           |
| `apps/fachverfahren/leistung.contract.json`                       | Generierter Vertrags-Snapshot                            | Nur via `emit:contract`                            |
| `apps/fachverfahren/src/`                                         | Dünne Komposition (Routing, Store, Shell)                | Für Verfahrens-Builds nicht ändern                 |
| `packages/fachverfahren-kit/src/types.ts`                         | Naht-Vertrag (`LeistungConfig`, `Berechnung`, `Vorgang`) | Lesen; Änderungen sind Plattformarbeit             |
| `packages/fachverfahren-kit/src/components/`                      | Fertige Fachverfahren-Bausteine                          | Importieren, nie kopieren                          |
| `packages/fachverfahren-kit/src/ui/`                              | shadcn/Radix/Tailwind-Primitive                          | Nur nutzen, wenn kein Baustein passt               |
| `packages/fachverfahren-kit/src/stories/`                         | Storybook-Review-Fläche                                  | Stories bei Kit-Änderungen pflegen                 |
| `packages/public-sector-ui/src/`                                  | Public-Sector-UI-Fassade + Stories                       | UI-Vertrag; ShadCN bleibt Implementierungsdetail   |
| `packages/platform-contracts/`                                    | Capability-Ports                                         | Fachlogik nutzt Ports, nie Provider direkt         |
| `packages/public-sector-sdk/`                                     | Authorization, RBAC, Audit, Domain-Kernel                | Rollen über RBAC-Registry erweitern                |
| `packages/app-store-postgres/`                                    | Store-Schicht + PostgreSQL-Migrator                      | Migrationen über `db:migrate`                      |
| `packages/app-runtime-fastify/`                                   | Neutrale Fastify-Web-Runtime                             | Delivery/Health; keine Fachlogik                   |
| `packages/app-bff-fastify/`                                       | Fachliche BFF-Routen (15 Module)                         | Autorisierung serverseitig, nie in der UI          |
| `packages/app-bff-contracts/`                                     | TypeBox-DTOs der BFF-Routen                              | Route-Schema ist die verbindliche Prüfung          |
| `packages/workflow-bpmn-stub/`                                    | BPMN-Workflow-Stub (`WorkflowPort`)                      | Über den Port nutzen, nie direkt                   |
| `jurisdictions/de`, `jurisdictions/eu`                            | Rechtsraum-Packs                                         | Keine `country === "DE"`-Logik in der App          |
| `modules/`                                                        | Leerer Zielort des Generator-Pfads                       | `modules/README.md` lesen; keine Instanz (PLAN)    |
| `docs/examples/hundesteuer/`                                      | Externes Beispiel (Spec + Prompt)                        | Nie in Runtime-Code kopieren                       |
| `tooling/template/cli.ts`                                         | Template-Lifecycle- und Agent-CLI                        | Verhalten nur hier, hinter `pnpm run template`     |
| `scripts/`                                                        | Deterministische Checks und Werkzeuge                    | Checks sind die Wahrheit, kein LLM-Urteil          |
| `schemas/`, `platform/capabilities.json`, `sources/registry.yaml` | Maschinenlesbare Verträge und Kataloge                   | Über `check:*`-Scripts validiert                   |
| `agent.discovery.json`                                            | Öffentliche Discovery-API für Agenten                    | Muss `check:agent-discovery` bestehen              |
| `apps/fachverfahren/server/`                                      | Server-Komposition (Runtime + BFF)                       | Plattform-/Delivery-Arbeit; keine Fachlogik direkt |
| `apps/fachverfahren/server/procedure.config.ts`                   | Die Dossier-Naht (Fall/Akte)                             | Nur via `emit:procedure-contract` snapshotten      |
| `apps/fachverfahren/src/app/route-gates.ts`                       | Pfad → Gate, die Routen-Wahrheit                         | Neue Route hier UND in `routes.tsx`                |

## Sprache und Benennung

- User-facing Dokumentation und UI-Texte: Deutsch mit echten Umlauten.
- Code, Typen, Variablen, Package-Namen, Env-Keys: Englisch. Eigener Code ist
  seit 2026-09 englisch (z. B. `statusPathOf`).
- OFFEN: ob Rechts-/Fachbegriffe (Bescheid, Vermerk, Widerspruch …) in
  Bezeichnern deutsch bleiben. Bis zur Entscheidung NICHT umbenennen.
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
- Kein React-Hook steht nach einem bedingten `return` (Ratsche
  `apps/fachverfahren/tests/hooks-vor-jedem-ausgang.test.ts`).
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
`commandsExecuted`. Kurzskills liegen kanonisch unter `.agents/skills/`.

Zuerst den Verfahrenstyp wählen: `docs/agents/fachverfahren-typen.md` ist der
Wegweiser (Antrag/Vorgang vs. Fall/Dossier/Case-Management) mit den passenden
Skills und Paket-Ankern. Startpunkt für Antrag/Vorgang-Builds ist
`.agents/skills/fachverfahren-app/SKILL.md`; für Fall/Dossier-Verfahren
`.agents/skills/dossier-fallmanagement/SKILL.md` (mit BPMN
`.agents/skills/bpmn-prozess-workflow/SKILL.md` und Governance
`.agents/skills/governance-vier-augen/SKILL.md`).

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

**Provisionierungs-Vertrag für Builder und Agenten:** Konsumenten entstehen
über `scaffold:domain-app` — NIEMALS durch `git clone` + Kopieren des Baums.
Eine Rohkopie behält die Vorlagen-Identität, hat keine `.template/lock.json`
(kein `template:update`-Migrationspfad) und lässt Template-eigene CI-Jobs wie
`scaffold-health` im Konsumenten mitlaufen (Issue #13; der zusätzliche
CI-Identitäts-Guard in `scripts/test-generated-app-ci.sh` fängt nur diesen
letzten Punkt ab). Für bereits roh kopierte Bäume ist `template:adopt` der
Reparaturpfad.

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
`apps/fachverfahren/dist-server/index.js`; `check:dockerfile-paths` hält die
`COPY`-Quellen deterministisch mit dem Scaffold synchron.

Bei pnpm-Filterbefehlen steht `--filter` vor `run`:

```bash
pnpm --filter "./packages/**" run --if-present build
```

## Authorization und Audit

Rollen in der UI sind keine Autorisierung. Entscheidungen gehören serverseitig
in Policy-Checks; kritische Übergänge tragen `vierAugen: true` in der
`statusMachine` und werden SERVERSEITIG erzwungen: ab
`requiredApprovalsOf(transition) >= 2` verlangt der Server die
Personen-Separation, und ab `> 2` zählt er die DISTINKTEN Freigebenden, die über
`POST /api/cases/:id/approvals` gesammelt wurden. Fachliche Audit-Historie (`Vorgang.history`) ist append-only.
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
pnpm --filter @senticor/fachverfahren emit:contract
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
