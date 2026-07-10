# Management-Ebene & Automations-Engine

Dieser Vertrag beschreibt die verfahrensübergreifende Sachbearbeitungs-Ebene (Aufgaben, Board,
Triage-Eingang, Vermerke, Aktivität, gespeicherte Ansichten) und die server-autoritative
Automations-Engine (deklarative Regeln/Hooks). Alles ist additiv zur fachlichen Fall-Ebene
(`app_cases`) — Metadaten tragen kein Vier-Augen-Gate, fachliche Statuswechsel schon.

## Datenschichten

Die Persistenz kennt zwei austauschbare Laufzeiten mit identischer Semantik: In-Memory (DEV/Test)
und Postgres (PROD, gepoolt). Der Mandanten-Scope (Mandant/Behörde) kommt AUSSCHLIESSLICH aus der
Server-Session, nie aus Query, Body oder URL.

- **Aufgaben** (`app_tasks`): verfahrensübergreifende Management-Klammer über einem Vorgang —
  Priorität, Zuweisung, Labels, Board-Spalte, Rang. Optimistic-Locking über `version`.
- **Triage-Eingang** (`app_intake_items`): verfahrensübergreifender Eingang. `accept` erzeugt ATOMAR
  einen Fall + eine Aufgabe + das Wurzel-Audit.
- **Vermerke** (`app_task_comments`): interne Notizen, APPEND-ONLY (kein Update/Delete). Nur mit
  `comment.read`/`comment.write` sichtbar — Bürgerrollen erhalten diese Rechte nie.
- **Aktivität** (`app_task_activity`): APPEND-ONLY Protokoll jeder Metadaten-Änderung.
- **Gespeicherte Ansichten** (`app_saved_views`): persönliche ODER geteilte Filter/Sortier/Layout.
  LÖSCHBAR (kein Aktenbestandteil): eine persönliche Ansicht nur durch ihren Eigentümer, eine
  geteilte nur innerhalb ihrer Behörde. Geteilte Ansichten anlegen erfordert `view.share`.

Jede Personendaten-Fläche ist im Modul-Manifest (`server/pm-module-manifest.ts`) mit
Datenklassifikation + Aufbewahrungsregel deklariert; das Manifest wird beim Start geprüft.

## Routen (Auszug)

| Route                                | Recht                                   | Zweck                                   |
| ------------------------------------ | --------------------------------------- | --------------------------------------- |
| `GET/PATCH /api/tasks[/:id]`         | `task.read`/`task.write`                | Aufgaben lesen/ändern (kein Vier-Augen) |
| `GET/POST /api/tasks/:id/comments`   | `comment.read`/`comment.write`          | interne Vermerke (append-only)          |
| `GET /api/tasks/:id/activity`        | `task.read`                             | Aktivitäts-Feed                         |
| `GET/POST/DELETE /api/views`         | `view.read`/`view.write`(+`view.share`) | gespeicherte Ansichten                  |
| `GET/POST/PATCH /api/automations`    | `automation.read`/`automation.write`    | Regeln verwalten                        |
| `POST /api/automations/:id/simulate` | `automation.read`                       | REINER Trockenlauf (keine Mutation)     |
| `GET /api/automations/:id/runs`      | `automation.read`                       | Läufe einsehen (mandanten-scoped)       |

## Automations-Engine (deklarative Regeln/Hooks)

Eine Regel ist DATEN: `trigger_event` + optionale `condition` (jsonb) + `actions` (jsonb) +
`requires_four_eyes`. Die Auswertung ist zweischichtig: der REINE Evaluator (Trockenlauf/Vorschau)
und die server-autoritative Engine (führt Effekte durch dieselbe geprüfte Kette aus wie ein Mensch).

**Roundtrip:** Eine Domain-Mutation schreibt ihr Outbox-Event (`app_automation_events`) ATOMAR in
DERSELBEN Transaktion (kein Fall/Übergang ohne sein Event, und umgekehrt — schlägt der Event-Insert
fehl, rollt die Mutation mit zurück). Ein Poller CLAIMT fällige Events (`FOR UPDATE SKIP LOCKED`,
atomar als verarbeitet markiert), lädt die passenden aktiven Regeln (mandanten- UND behörden-scoped),
wertet die Bedingung aus und führt die Effekte aus — jeder Lauf wird IDEMPOTENT protokolliert
(`app_automation_runs`, `UNIQUE(rule_id, idempotency_key)`). Emittiert werden `beim-eingang` (aus
`acceptIntake`) und `beim-uebergang` (aus einem menschlichen Statuswechsel).

**Harte Invarianten:**

- **Vier-Augen:** Die Automation ist NIE ein „Auge" einer Vier-Augen-Entscheidung. Die Engine
  blockiert jeden `requires_four_eyes`-Übergang HART, bevor die Policy greift (Lauf `blocked`).
  Zusätzlich zählt ein maschineller Übergang (`automation.service`) NICHT als Vorbereiter — so kann
  ein maschineller Vorbereitungsschritt keinen einzelnen Menschen zum alleinigen Entscheider machen.
- **Fail-closed:** Eine zustandsändernde Regel OHNE Bedingung feuert nie (Lauf `skipped`,
  `mutierend-ohne-wenn`). Eine Bedingung, die der node-safe Evaluator nicht vollständig versteht,
  feuert ebenfalls nicht (`unsupported-condition`). Die Auswertung spiegelt exakt die Kit-Semantik
  (verifiziert im Paritäts-Test) — eine Regel entscheidet server-seitig wie in der Client-Vorschau.
- **Keine Rekursion:** Von der Automation erzeugte Events werden übersprungen — kein Event-Sturm.
- **Idempotenz:** Ein dauerhaft scheiterndes Event wird nicht endlos neu verarbeitet; sein
  Fehlversuch steht als `failed`-Lauf im Protokoll.

**Betrieb:** Der Poller ist bewusst OPT-IN (`APP_AUTOMATION_POLL_MS > 0`) — ein Template soll nicht
überraschend im Hintergrund Fälle mutieren. Mehrere Repliken sind durch `SKIP LOCKED` abgesichert.
Die `beim-uebergang`-Emission ist ihrerseits auf eine konfigurierte Automations-Datenschicht gegated,
damit ein Deployment ohne Automation keine unbearbeiteten Events sammelt.

## KI-Assistenz (assistiv, Mensch entscheidet)

Die KI ist AUSSCHLIESSLICH vorschlagend — nie autoritativ und nie eines der zwei Augen (EU-AI-Act
Art. 50). Der `KiAssistPort` ist austauschbar (DEV: erklärbare Heuristik aus Frist/Betrag; PROD: ein
echter LLM-Adapter).

- `POST /api/tasks/:id/ai/assist` (`task.read` + `ai.assist`): REIN — liefert einen Vorschlag mit
  `marking:"ki-vorschlag"`, `reviewRequired:true`, Begründung + Quellen, ohne jede Mutation. Der
  Kontext ist PII-arm (nur Metadaten).
- `POST /api/tasks/:id/ai/apply` (`task.write` + `ai.assist`): übernimmt AUSSCHLIESSLICH
  nicht-autoritative Metadaten (Priorität/Zuweisung/Label). Ruft NIE `executeCaseTransition` und
  schreibt NIE ein `case.*`-Audit — die KI kann strukturell nie eine fachliche Entscheidung treffen.
  Eine Zuweisung wird server-seitig gegen die Zuständigkeit (`app_actor_roles`, aktive Rolle in der
  Behörde) geprüft (sonst 422); die KI-Herkunft wird als `task.ki-uebernommen` protokolliert.
