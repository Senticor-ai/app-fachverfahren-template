# ADR-0004: Keine eigene case-management-Capability — Fall/Dossier aus records-management + workflow + audit

- Status: proposed
- Datum: 2026-07-15

## Kontext

ADR-0001 hat die server-seitige Fallverwaltung über die AKZEPTIERTEN package/runtime-Nähte
realisiert und die Frage, ob dafür eine EIGENE Capability nötig ist, ausdrücklich als Alternative E
hierher zurückgestellt. Diese Entscheidung ist jetzt fällig, weil die Fall/Dossier-Naht steht:

- `CaseStore` + `TaskStore` (`packages/app-store-postgres/src/case-store.ts`,
  `task-store.ts`; Migration `20260714140000_app_tasks`) persistieren die SDK-`Case`/`Task`-Form
  server-autoritativ, mandanten-scoped, mit append-only Fach-Audit — in der etablierten Impl-Trias
  Postgres / InMemory / Unavailable.
- Die BFF-Routen (`packages/app-bff-fastify/src/routes/cases.ts` + `tasks.ts`:
  `GET/POST /api/cases`, `GET /api/cases/:id`, `POST /api/cases/:id/transitions`,
  `GET/POST /api/cases/:id/tasks`, `PATCH /api/tasks/:id`, `GET /api/cases/:id/progress`)
  exponieren sie hinter RBAC + `sessionOf`-Scope.
- `ProcedureRegistry` + `transitionCase` (SDK-`domain-kernel`) tragen die Zustandsmaschine als
  Config-Daten; die BPMN-Stub-Engine (ADR-0002) treibt `Case.state` über denselben Reducer.

Der Capability-Katalog (`platform/capabilities.json` +
`packages/platform-contracts/src/capabilities.ts`/`ports.ts`) trägt bereits die Ports, unter die
sich diese Naht fachlich einordnet: **records-management** (Aktenablage, Retention, Legal-Hold),
**workflow** (langlaufende Prozess-Orchestrierung, Zustandsmaschine) und **audit** (revisionssicherer
Fach-Audit-Trail, `case-context` als Extension-Point). Es gibt aktuell **genau EINEN Konsumenten**
dieser Fall/Dossier-Naht — das Integrationsmanagement. Ohne Entscheidung droht eine präzedenzlose,
vierte „case-management"-Capability-Fläche, die neben den drei vorhandenen Ports eine zweite Wahrheit
über Akte, Prozess und Audit aufmacht.

## Entscheidung

Wir führen **VORERST KEINE eigene `case-management`-Capability** ein. Die Fall/Dossier-Naht wird
durch `CaseStore`/`TaskStore` (`@senticor/app-store-postgres`) + die BFF-Routen +
`ProcedureRegistry`/`transitionCase` (SDK-`domain-kernel`) gebildet und ordnet sich fachlich unter
die **bestehenden** Capabilities ein: **records-management** (Aktenablage/Retention/Legal-Hold),
**workflow** (Prozess/Zustandsmaschine, ADR-0002) und **audit** (append-only Fach-Audit). Eine
dedizierte Capability wird erst dann eingeführt, wenn ein **ZWEITER Konsument** sie nachweislich
braucht (Rule of Three) — so vermeiden wir eine präzedenzlose Capability-Fläche, die aus einem
einzigen Verfahren abstrahiert wird.

Konkret gilt: Die SDK-`domain-kernel`-Primitive (`Case`, `Task`, `ProcedureVersion`,
`transitionCase`) und die Store/BFF-Nähte sind die Fall/Dossier-Naht; die Capability-Ports bleiben
das Integrations-Vokabular nach außen (Retention über records-management, langlaufende
Orchestrierung über workflow, Revisionssicherheit über audit). Das Betreiber-Muster aus ADR-0001/0002
bleibt unberührt: Template liefert den Stub, chos sitzt in Produktion hinter denselben Ports.

## Alternativen

| Alternative                                                                                   | Vorteile                                                                       | Nachteile                                                                                                                                         | Warum verworfen                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **B — sofort eigene `case-management`-Capability** (Port in `ports.ts` + `capabilities.json`) | ein expliziter, benannter Fall/Dossier-Port; klare Grenze für spätere Provider | vierte Wahrheit neben records/workflow/audit; präzedenzlose Katalog-Fläche aus EINEM Verfahren abstrahiert; Doppelung von Retention/Prozess/Audit | verworfen (vorerst) — verletzt Rule of Three; die Naht steht bereits ohne neuen Port                                         |
| **C — alles unter `records-management` pressen** (Prozess + Aufgaben als Records modelliert)  | keine neue Fläche; ein Port                                                    | records-management ist Aktenablage/Retention, nicht Zustandsmaschine; verdeckt die workflow/audit-Einordnung; falsche fachliche Abstraktion       | verworfen — presst Prozess-/Audit-Semantik in den falschen Port; ADR-0002 hat workflow bereits als eigene Capability gesetzt |
| **D — ai-assist-artige Extra-Capability** (Fall/Dossier als optionaler, opt-in Zusatz-Port)   | additiv, opt-in, stört bestehende Ports nicht                                  | dieselbe präzedenzlose Fläche wie B, nur als „optional" getarnt; kein zweiter Konsument, der die Extra-Fläche rechtfertigt                        | verworfen — löst das Rule-of-Three-Problem nicht, nur verschoben                                                             |

## Konsequenzen

**Leichter:** Der Capability-Katalog bleibt schmal und ehrlich — keine vierte, aus einem einzigen
Verfahren abstrahierte Wahrheit. Die Fall/Dossier-Naht nutzt die vorhandenen Nähte (Store/BFF/SDK)
und ordnet sich sauber unter records-management/workflow/audit ein. `check:capability-catalog` bleibt
grün, weil **kein** neuer `capabilities.json`-Eintrag entsteht. Das Betreiber-Muster (Template-Stub,
chos als Provider) gilt unverändert über die bestehenden Ports.

**Schwerer / Folgekosten:** Die Fall/Dossier-Semantik verteilt sich über mehrere Nähte
(Store + BFF + SDK-Reducer + drei Capability-Ports) statt hinter EINEM benannten Port — die
Einordnung „was gehört wohin" lebt in dieser ADR und in ADR-0001/0002/0003, nicht in einem einzigen
Port-Contract. Ein zweiter Konsument muss dieselbe Naht (Store/BFF/SDK) wiederverwenden können, sonst
wird die fehlende Capability zum Reibungspunkt — genau das ist das Rule-of-Three-Signal für die
Wiedervorlage.

**Migrationspfad (falls später B):** Sobald ein zweiter Konsument die Fall/Dossier-Naht braucht,
wird eine `case-management`-Capability additiv eingeführt: neuer `CaseManagementPort` in
`platform-contracts/src/ports.ts` (Methoden aus den heutigen BFF-Routen abgeleitet:
Akte lesen/anlegen, Transition, Aufgaben, Fortschritt), ein Eintrag in `platform/capabilities.json`
(mit `extensionPoints`/`contractTests`/`forbidden`), und die bestehenden `CaseStore`/`TaskStore`
werden zur Template-Stub-Implementierung HINTER diesem Port (chos als Produktions-Provider — das
Adapter-Muster aus ADR-0001/0002). Der Schritt ist rückwärtskompatibel: die heutigen Store/BFF-Nähte
bleiben, es kommt nur eine Port-Naht darüber. Die Einordnung unter records-management/workflow/audit
für Retention/Orchestrierung/Audit bleibt auch dann bestehen — die neue Capability trägt nur die
fall-spezifische Komposition, nicht deren Ersatz.

**Betroffene Module/Verträge:** keine Code-Änderung durch diese Entscheidung; sie hält
`@senticor/platform-contracts` und `platform/capabilities.json` bewusst unverändert. Bezug: ADR-0001
(Fall-Store, Alternative E hierher zurückgestellt), ADR-0002 (workflow als Capability), ADR-0003
(Aufgaben-Hierarchie).
