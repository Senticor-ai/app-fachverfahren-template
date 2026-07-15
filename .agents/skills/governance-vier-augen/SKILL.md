---
name: governance-vier-augen
description: Understand and use the server-enforced four-eyes / governance on the case-management path (ADR-0001) — a requiresFourEyes state transition (POST /api/cases/:id/transitions) may not be triggered by the same person who wrote the most recent append-only audit event, gated server-side against app_audit_events, with the legal basis taken from the procedure and never invented. Use it when asked how four-eyes / Vier-Augen / governance works now, how a case decision is approved by a second person, or how requiresFourEyes flows from BPMN into the server.
---

# Governance Vier-Augen (Fall-/Dossier-Pfad)

## Wann

Nimm diese Capability, wenn es um das VIER-AUGEN-PRINZIP auf dem
server-autoritativen Fall-/Dossier-Pfad geht (ADR-0001): „wie wird ein
Zustandswechsel einer Akte durch eine ZWEITE Person freigegeben", „wo wird
Vier-Augen erzwungen", „wie kommt `requiresFourEyes` aus BPMN in den Server".
Sie beschreibt den Ist-Stand der Fall-API (`@senticor/app-bff-fastify` +
`@senticor/public-sector-sdk`), nicht den Antrag-/`LeistungConfig`-Pfad. Die
umgebende Akte, ihre Ziele/Schritte/Termine und der auditierte DossierPort
liegen in [[dossier-fallmanagement]]. Root-Policy und Pfad-Karte: `AGENTS.md`.

## Kernprinzip: zwei VERSCHIEDENE Personen

„Vier Augen" heißt: der fachliche Zustandswechsel wird von einer ANDEREN
natürlichen Person ausgelöst als die, die zuletzt an derselben Akte gehandelt
hat. Es ist eine SERVER-Policy, keine Client-Anzeige. Die Wahrheit ist das
append-only Fach-Audit (`app_audit_events`) — nicht ein Client-Flag, nicht ein
Feld im Request-Body.

## Wo es server-erzwungen wird

Genau EINE Stelle prüft die zwei Personen:
`packages/app-bff-fastify/src/routes/cases.ts`, Route
`POST /api/cases/:id/transitions`. Ablauf:

1. Der passende Übergang wird aus dem Verfahren aufgelöst — `from` = AKTUELLER
   Zustand der Akte und `action` = `body.action`. Der Zielzustand wird NIE aus
   dem Body gelesen (`procedure.allowedTransitions.find(...)`); unbekannt ⇒ 400.
2. Trägt der Übergang `requiresFourEyes`, lädt die Route
   `caseStore.listAuditEvents({ tenantId, caseId })` (aufsteigend nach
   `occurred_at`), nimmt den JÜNGSTEN Eintrag und vergleicht dessen `actorId`
   mit `session.actorId`. Gleich ⇒ **403** („four-eyes: der auslösende Akteur
   muss ein anderer sein"). Der Akteur kommt AUSSCHLIESSLICH aus der Sitzung
   (`sessionOf(request)`), nie aus dem Body.
3. Erst danach rechnet der reine SDK-Reducer `transitionCase(...)` den
   Zielzustand (Versions-Konflikt/Guard), und `patchCaseState` schreibt in
   DERSELBEN Transaktion ein neues `app_audit_events`-Ereignis
   (`eventType: "case.transitioned"`, `actorId` = Sitzungs-Akteur). Damit ist der
   auslösende Akteur ab jetzt der jüngste Eintrag — der nächste
   Vier-Augen-Übergang braucht wieder jemand anderen.

Wichtig für die Erdung: die Zwei-Personen-Prüfung lebt in der ROUTE, nicht im
Reducer. `transitionCase` (`packages/public-sector-sdk/src/domain-kernel.ts`)
prüft nur Versions-Konflikt und gültigen Übergang; es liest `requiresFourEyes`
NICHT. Das Flag ist reine Modell-Daten, die Erzwingung ist BFF-seitig.

## requiresFourEyes am `CaseTransition` / aus BPMN

- Typ: `CaseTransition.requiresFourEyes?: boolean` in
  `packages/public-sector-sdk/src/domain-kernel.ts` (Teil von
  `ProcedureVersion.allowedTransitions`). Das Verfahren ist DATEN
  (Zustandsmaschine + Rechtsgrundlagen), aufgelöst über die
  `ProcedureRegistry`-Naht — der Server erfindet keine Übergänge.
- Ableitung aus BPMN:
  `packages/workflow-bpmn-stub/src/bpmn-to-procedure-version.ts`
  (`bpmnToProcedureVersion`) setzt `requiresFourEyes: true` an einem Übergang,
  wenn IRGENDEIN `sequenceFlow` auf dem Pfad die Vier-Augen-Konvention erfüllt:
  Flow-`@name` beginnt (case-insensitiv) mit „entscheiden" ODER der Flow trägt
  ein Extension-Attribut mit Local-Name `requiresFourEyes="true"` (Präfix egal,
  z. B. `senticor:requiresFourEyes`). Die Funktion ist rein/deterministisch und
  SETZT NUR das Flag — die Zwei-Personen-Erzwingung bleibt server-seitig (ADR-0002).

## RBAC-Rechte

`packages/public-sector-sdk/src/rbac.ts`, `builtInPermissions`:

- `case.read` (`caseRead`) — Vorgänge lesen: `GET /api/cases`,
  `GET /api/cases/:id`, `GET /api/cases/:id/progress` (`readAuth`).
- `case.decision.prepare` (`casePrepareDecision`) — Entscheidung vorbereiten:
  `POST /api/cases`, `POST /api/cases/:id/transitions` (`writeAuth`).

Beide sind der Rolle `caseworker` zugeordnet; `citizen` hat KEINES davon. Die
Route gatet über `bffRouteAuth({ kind: "rbac", permission })` VOR dem Handler
(fail-closed: fehlendes Recht ⇒ 403/401 vor jeder Logik).

## Append-only Fach-Audit — nie die Rechtsgrundlage faken

- Tabelle `app_audit_events` (Migration
  `packages/app-store-postgres/migrations/20260623000000_app_foundation`); der
  `CaseStore` (`packages/app-store-postgres/src/case-store.ts`) bietet NUR
  `appendAuditEvent` + `listAuditEvents` (aufsteigend nach `occurred_at`) —
  KEIN Update/Delete auf der Schnittstelle. Das Log ist die Vier-Augen-Wahrheit.
- Jeder Schreibzugriff schreibt genau EIN Fach-Ereignis mit
  `legalBasisId` — Pflichtfeld von `FachlicheAuditEvent`
  (`packages/public-sector-sdk/src/audit.ts`, `createFachlicheAuditEvent`). Die
  `legalBasisId` stammt IMMER aus `procedure.legalBasisIds[0]`; hat das Verfahren
  keine, bricht die Route mit 400 („procedure has no legal basis") ab — eine
  Rechtsgrundlage wird NIE erfunden.

## Fail-closed

- Unbekanntes Verfahren ⇒ 400; Verfahren ohne Rechtsgrundlage ⇒ 400; ungültiger
  Übergang (`from`/`action`) ⇒ 400.
- Fremd-Behörde im selben Mandanten ⇒ 404 (keine Existenz-Leaks); Mandant/
  Behörde/Jurisdiktion/Akteur kommen NUR aus der Sitzung.
- Vier-Augen-Verletzung ⇒ 403; Versions-Konflikt (Optimistic-Locking über
  `expectedVersion`) ⇒ 409; Store-Ausfall ⇒ 503 (`storeUnavailable`) — nie ein
  stiller Teil-Write.

## Ehrlich: was heute NÄHERUNG ist / noch fehlt

- **Prepare/Approve ist eine Näherung, kein echter Split.** Die Prüfung ist
  „Akteur des JÜNGSTEN Audit-Eintrags ≠ auslösender Akteur" — verglichen wird
  gegen den EINEN letzten Eintrag (beliebiger `eventType`), NICHT gegen eine
  dedizierte, an DIESE Entscheidung gebundene Vorbereiter-Rolle. Ein
  Entscheidungs-Entwurf mit `preparedBy`/`approvedBy`-Paarung existiert noch
  nicht.
- **Keine eigene `case.decide`-Berechtigung.** Vorbereiten und Freigeben laufen
  beide unter `case.decision.prepare`; getrennt werden sie nur über die
  Akteur-Identität im Audit, nicht über verschiedene Rechte. Das per-Übergang
  gepflegte `CaseTransition.requiredPermission` wird von der Route derzeit NICHT
  ausgewertet — gegatet wird der ganze Schreibpfad auf `case.decision.prepare`;
  feinere per-Übergang-RBAC ist noch offen.
- **DB-Riegel für Append-only fehlt noch.** Append-only ist heute nur über die
  Store-Schnittstelle gesichert (kein Update/Delete). Der zusätzliche
  DB-seitige Riegel (`REVOKE UPDATE/DELETE` + Trigger) auf `app_audit_events`
  ist in ADR-0001 als neue Pflicht/Folgekosten benannt, aber NOCH NICHT
  migriert.
- **Client/App-Naht offen.** Eine App-Route (z. B. `/amt/akte/:id`) und eine
  eigene `case-management`-Capability in `capabilities.json` sind geplant
  (ADR-0001/0004), heute aber nicht verdrahtet — die Governance ist bereits über
  die BFF-Routen server-erzwungen.

## Minimalbeispiel (Ablauf, synthetisch)

Verfahren mit einem Vier-Augen-Übergang (z. B. „bescheiden"), dann zwei
verschiedene Akteure:

```http
# 1) Akteurin A eröffnet die Akte → app_audit_events: eventType "case.opened", actorId A
POST /api/cases
{ "procedureId": "beispiel.verfahren", "procedureVersion": "1", "state": "eingegangen" }

# 2) Akteurin A versucht, den requiresFourEyes-Übergang selbst auszulösen → 403
POST /api/cases/<caseId>/transitions
{ "action": "bescheiden", "expectedVersion": 1 }
# → 403 "four-eyes: der auslösende Akteur muss ein anderer sein"
#   (jüngster Audit-Akteur == A == Sitzungs-Akteur)

# 3) Akteur B (andere Sitzung, Rolle caseworker) löst denselben Übergang aus → 200
POST /api/cases/<caseId>/transitions
{ "action": "bescheiden", "expectedVersion": 1 }
# → 200; app_audit_events: eventType "case.transitioned", actorId B, legalBasisId aus dem Verfahren
```

Die Aktions-/Zustandsschlüssel und `requiresFourEyes` stammen aus der
`ProcedureVersion` des jeweiligen Verfahrens (aus BPMN abgeleitet oder als
Config-Daten) — hier neutral gehalten, kein konkretes Fachverfahren.
