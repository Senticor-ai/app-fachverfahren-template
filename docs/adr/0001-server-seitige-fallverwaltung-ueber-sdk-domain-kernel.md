# ADR-0001: Server-seitige Fallverwaltung über den SDK-domain-kernel + versionierte Stores

- Status: proposed
- Datum: 2026-07-14

## Kontext

Das erste reale Fachverfahren auf dieser Plattform — „Integrationsberatung / kommunales
Integrationsmanagement" (Vorbild-Mock `IntegrationsManager/integrai-slice1`, geerdet in der VwV
Integrationsmanagement 2023 BW + DGCC-Case-Management) — ist **Fall-/Dossier-zentriert**: eine
Klient:in ist eine langlebige Akte mit Zielen, Schritten, Terminen/Fristen, Vermerken und einem
über Jahre laufenden, wiederaufnehmbaren Fall-Status. Es braucht eine **server-autoritative,
revisionssichere, mandanten-scoped Fallverwaltung** (Akte, Aufgaben, Fristen, Entscheidungen,
append-only Fach-Audit) — nicht die Antrag/Bescheid-zentrierte `Vorgang`-UX allein.

Das aktuelle `main` trägt die **Fundamente dafür bereits, aber DORMANT**:

- SDK-`domain-kernel` (`packages/public-sector-sdk/src/domain-kernel.ts`): reine Typen `Case`,
  `Task` (`open|claimed|completed|cancelled`, `caseId`, `dueAt`, `assignedTo`), `Deadline`,
  `Evidence`, `Decision`, `Document`, `Communication`, `Payment`, `RetentionRule`,
  `Procedure`/`ProcedureVersion` (`allowedStates`, `allowedTransitions`) und der REINE Reducer
  `transitionCase(...)` (Versions-Konflikt + `CaseTransition.requiresFourEyes`).
- Tabellen `app_cases` + `app_audit_events` (erste Migration `20260623000000_app_foundation`) in
  exakt der SDK-`Case`/`FachlicheAuditEvent`-Form — von **keinem** Store-Code gelesen/geschrieben.
- Capability-Ports `workflow`, `records-management`, `audit` (`platform-contracts/src/ports.ts`);
  RBAC-Rechte `case.read` / `case.decision.prepare` (an `caseworker` vergeben).

Ein früherer Anlauf (app-lokaler Domain-Server `apps/fachverfahren/server/domain-api.ts`,
`ModuleHost`-Runtime-Mount, Multi-Verfahren-Registry, „dual-mode auf EINER `LeistungConfig`")
wurde vom Maintainer verworfen (PR #37 geschlossen: „konflikten mit der aktuellen
package/runtime-Architektur und brauchen ein explizites ADR vor der Umsetzung"). Ohne
Entscheidung entsteht entweder erneut eine verworfene Monolith-Naht oder das Verfahren bleibt
unbaubar.

## Entscheidung

Wir realisieren die server-seitige Fallverwaltung durch **Aktivierung der bestehenden
SDK-`domain-kernel`-Primitive** über die AKZEPTIERTEN package/runtime-Nähte — nicht über einen
app-lokalen Domain-Server:

1. **Persistenz hinter einer Capability-Naht — Template-STUB, chos als Provider.** Die
   Fallverwaltung liegt hinter einem Capability-Port (Fall/Dossier; Records/Workflow/Audit
   wiederverwendet). Das **Template liefert eine eigenständige Referenz-/Stub-Implementierung**,
   damit ein Konsument **ohne chos** lauffähig ist: ein `CaseStore` (und `TaskStore`) in
   `@senticor/app-store-postgres` in der etablierten Impl-Trias **Postgres / InMemory /
   Unavailable + `createXFromEnv`** (wie `KanbanStore`) persistiert die SDK-`Case`/`Task`-Form
   gegen `app_cases` (+ eine additive, checksum-gelockte `app_tasks`-Migration). In **Produktion
   sitzt chos hinter demselben Port** (Adapter-Muster wie `AiAssistPort → chos`) — der
   Fall-/Prozess-Store IST dann chos; die Template-Impl bleibt der dokumentierte OSS-/Standalone-
   Pfad. Fachliche Zustandswechsel laufen AUSSCHLIESSLICH über den reinen Reducer `transitionCase`
   (Versions-Konflikt + `requiresFourEyes` server-erzwungen); jede Mutation schreibt ein
   append-only `FachlicheAuditEvent` in derselben Transaktion. Der Port ist die eine Wahrheit —
   Stub (Template) und chos (PROD) sind austauschbar, ohne die App/Config zu ändern.
2. **Exposition über den BFF** (`@senticor/app-bff-fastify`): neue Routen (`routes/cases.ts`,
   `routes/tasks.ts`) nach dem `mailbox`-Muster — `bffRouteAuth({kind:"rbac",permission:"case.read"})`,
   Kontext NUR aus `sessionOf`, `storeUnavailable` bei Store-Ausfall, `auditSink.emit({kind:"fachlich",…})`
   bei Schreibzugriffen, OpenAPI-Response-Schemas, registriert in `plugin.ts`. Reifere
   Verwaltungs-Fähigkeiten laufen über die vorhandenen Capability-Ports (`records-management`
   für Aktenablage/Retention/Legal-Hold, `workflow` für langlaufende Orchestrierung, `audit`).
3. **Prozess-Steuerung** ist Gegenstand von **ADR-0002 (Workflow/BPMN-Engine als Capability)**:
   volle BPMN-Unterstützung inkl. Workflow-Engine (Template-Stub + chos als Engine-Provider),
   weil die Kundenprozesse aus FIM/KGSt BPMN-basiert + kundenspezifisch angepasst sind. Die
   minimale, immer vorhandene Basis ist `ProcedureVersion.allowedTransitions` (Zustandsmaschine
   als Config-Daten, `requiredPermission`/`requiresFourEyes`); die BPMN-Engine treibt den
   `Case.state` über denselben `transitionCase`-Reducer.
4. **Client** bindet über den vorhandenen Seam an: ein HTTP-Adapter analog `board-client.ts`
   (der `VorgangPort` ist heute synchron → ein PARALLELER async `CasePort` für die Akte, statt
   den synchronen `VorgangPort` umzubauen). Die App bleibt dünn (nur Komposition + `leistung.config`).

Ausdrücklich NICHT Teil dieser Entscheidung: app-lokaler Domain-Server, `ModuleHost`-Runtime-Mount,
Multi-Verfahren-Registry, „dual-mode auf EINER `LeistungConfig`".

## Alternativen

| Alternative | Vorteile | Nachteile | Warum verworfen |
| --- | --- | --- | --- |
| **B — app-lokaler Domain-Server** (`apps/.../server/domain-api.ts`) | schnell, alles an einem Ort | genau das vom Maintainer verworfene Muster; verletzt thin-app/versioned-package-Schichtung; keine Wiederverwendung | abgelehnt (Feedback zu PR #37) |
| **C — `modules/<domain>/`-Runtime-Mount** | der vorgesehene Generator-Pfad | `modules/` ist explizit PLAN/nicht-gemountet; präzedenzlos; bräuchte eigenes ADR | verfrüht — erst nach stabiler Store/BFF-Naht |
| **D — nur In-Browser-Zustand-Store** | kein Backend nötig | nur DEV; nicht revisions-/mandantensicher; für Sozialdaten (Art. 9 DSGVO) untragbar | abgelehnt für ein echtes Verfahren |
| **E — neue eigenständige `case-management`-Capability** statt Wiederverwendung records/workflow/audit | klarer Port | mehr Capability-Catalog-Fläche; evtl. Doppelung mit records/workflow | zurückgestellt → ADR-0004 |

## Konsequenzen

**Leichter:** die IntegrationsManager-Akte wird server-autoritativ, revisionssicher,
mandanten-scoped; nutzt vorhandene Capability-/RBAC-/Audit-Nähte; die App bleibt dünn; der Weg
bleibt generierbar-fähig (die `leistung.config`-Naht steuert die UI, nicht der Server).

**Schwerer / Folgekosten:** neue `app_tasks`-Migration + `CaseStore`/`TaskStore`-Impls (Postgres+
InMemory-Parität + Contract-Tests + `e2e:postgres`); neue BFF-DTOs + Routen; ein async `CasePort`
+ HTTP-Adapter (der synchrone `VorgangPort` bleibt für Antrag-Verfahren unangetastet).

**Neue Pflichten:** append-only-Audit-Riegel (`REVOKE UPDATE/DELETE` + Trigger) auf
`app_audit_events`; DSGVO-Feld-Klassifikation (Art. 9 / Sozialdaten) am Fach-Datenmodell;
per-Record-Typ-Löschkonzept (§84 SGB X, kein globaler TTL) — eigenes ADR; Server-Erzwingung von
`requiresFourEyes` (zwei verschiedene Akteure).

**Betroffene Module/Verträge:** `@senticor/app-store-postgres`, `@senticor/app-bff-contracts`,
`@senticor/app-bff-fastify`, `@senticor/public-sector-sdk` (nur Konsum), `apps/fachverfahren`.

**Folge-ADRs:** ADR-0002 (Ziele/Schritte/Termine als `Task`-Hierarchie + Fortschritt) · ADR-0003
(Fall-Volltextsuche: OpenSearch-Capability vs. in-DB) · ADR-0004 (eigene `case-management`-
Capability vs. records/workflow-Wiederverwendung) · späteres ADR (DSGVO-Löschkonzept/Redaction).
