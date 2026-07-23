# ADR-0002: BPMN/Workflow-Engine als Capability (Template-Stub + chos als Provider)

- Status: proposed
- Datum: 2026-07-14

## Kontext

Die Prozesse kommunaler Fachverfahren kommen als **BPMN-2.0-Modelle** aus den Standardquellen
**FIM** (Föderales Informationsmanagement — Prozessbibliothek) und **KGSt** und werden je Kommune
**kundenspezifisch angepasst**. Ein Verfahren wie das Integrationsmanagement hat einen echten,
über Jahre laufenden Prozess (Aufnahme → Assessment → Ziel-/Hilfeplanung → Leistungssteuerung →
Monitoring ⇄ Re-Assessment → Abschluss, wiederaufnehmbar; DGCC-Regelkreis) mit Fristen, Gateways
und Vier-Augen-Entscheidungen. Kunden müssen **ihre FIM/KGSt-BPMN mitbringen, anpassen und
ausführen** können — eine reine, handgepflegte Config-Zustandsmaschine reicht dafür nicht.

Auf `main` existiert der **`workflow`-Capability-Port** (`WorkflowPort.startWorkflow`/`signalWorkflow`,
`platform-contracts/src/ports.ts`) als Contract, aber ohne Engine-Implementierung.
`ProcedureVersion.allowedTransitions` (SDK-`domain-kernel`) ist die minimale Zustandsmaschine als
Daten. Ein früher app-lokaler „BPMN-Editor/-Runtime" wurde als überzeichnete Reife verworfen (PR
#37) — als **Capability mit Stub + Provider** ist BPMN/Workflow jedoch architekturkonform und
ehrlich. Ergänzend gilt (Betreibermodell): **der Fall-/Prozess-Store wird in Produktion chos**;
das Template braucht einen **Stub + Dokumentation für den Betrieb OHNE chos** (analog ADR-0001).

## Entscheidung

BPMN/Workflow wird als **Capability** realisiert (der vorhandene `workflow`-Port, erweitert um
BPMN-Definition-Handling), mit vier Bausteinen:

1. **BPMN 2.0 als Prozess-Definition (EINE Wahrheit).** Die FIM/KGSt-BPMN-Modelle (XML) sind die
   Quelle; eine `ProcedureVersion` wird daraus abgeleitet (die `allowedTransitions` spiegeln die
   BPMN-Sequenzflüsse/Tasks/Gateways). Kein zweites, konkurrierendes Prozessmodell.
2. **Template-Stub-Engine (Standalone/OSS).** Eine minimale, deterministische Referenz-Workflow-
   Engine im Template führt ein dokumentiertes **BPMN-Kern-Subset** aus (Start/End, User-/Service-
   Task, Exclusive/Parallel-Gateway, Sequence-Flow mit Bedingungen, Timer/Fristen) und treibt
   `Case.state` AUSSCHLIESSLICH über den reinen Reducer `transitionCase` (Versions-Konflikt +
   `requiresFourEyes`), mit append-only Fach-Audit. Damit ist ein Konsument **ohne chos**
   lauffähig — der dokumentierte Standalone-Pfad.
3. **chos als Engine-Provider (Produktion).** In PROD sitzt die chos-Workflow-Engine hinter
   DEMSELBEN `WorkflowPort` (Adapter-Muster wie `AiAssistPort → chos`). chos-IP bleibt hinter der
   chos-API; das Template konsumiert nur das OSS-Port-Protokoll und bettet keine chos-IP ein.
   Stub (Template) und chos (PROD) sind austauschbar, ohne App/Config zu ändern.
4. **BPMN-Editor als Kit-Komponente (a11y-primär).** Anzeige + kundenspezifische Anpassung der
   FIM/KGSt-Prozesse (Lesen/Bearbeiten der BPMN-Definition, tastaturbedienbar, BITV). Der Editor
   bearbeitet die DEFINITION; er ist NICHT die Engine.

## Alternativen

| Alternative                                                           | Vorteile                 | Nachteile                                                            | Warum verworfen                                               |
| --------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| **B — nur Config-Zustandsmaschine** (`allowedTransitions`, kein BPMN) | einfach, kein Parser     | Kunden können ihre FIM/KGSt-BPMN nicht direkt nutzen/anpassen        | verworfen — Kern-Anforderung ist BPMN                         |
| **C — Fremd-Engine (Camunda/Zeebe) einbetten**                        | mächtig, standardkonform | schwere Runtime/Betriebslast, Lizenz/IP, überzeichnet Template-Reife | nicht als Template-Default; als Provider-Adapter-Option offen |
| **D — nur chos-Engine, kein Stub**                                    | wenig Template-Code      | Template nicht standalone lauffähig                                  | verletzt „Stub + Doku ohne chos" (ADR-0001-Prinzip)           |
| **E — eigene, BPMN-freie DSL**                                        | maßgeschneidert          | präzedenzlos, weg vom FIM/KGSt-Standard, Lock-in                     | verworfen — BPMN ist der Kunden-Standard                      |

## Konsequenzen

**Leichter:** Kunden-BPMN (FIM/KGSt) wird erstklassig und anpassbar; das Template ist standalone
lauffähig (Stub-Engine); chos pluggt in PROD ohne Config-Änderung; EINE Wahrheit (BPMN ↔
`ProcedureVersion` ↔ `transitionCase`).

**Schwerer / Folgekosten:** eine bewusst minimale Stub-Engine bauen + testen; ein BPMN-Kern-Subset
parsen (nicht ganz BPMN 2.0); die Abbildung BPMN → `ProcedureVersion.allowedTransitions` →
`transitionCase`; die a11y-BPMN-Editor-Komponente.

**Neue Pflichten:** das ausführbare BPMN-Subset explizit dokumentieren (kein Overclaiming „volle
Camunda-Parität"); Governance an Entscheidungs-Gateways (`requiresFourEyes`, zwei Akteure server-
erzwungen); Timer/Fristen über den vorhandenen deadline/`Deadline`-Mechanismus; Dokumentation des
„Betrieb ohne chos"-Pfads.

**Betroffene Module/Verträge:** `@senticor/platform-contracts` (`WorkflowPort`), ein neues
Engine-/BPMN-Paket (Stub) bzw. `provider-*`-Adapter (chos), `@senticor/fachverfahren-kit`
(Editor-Komponente), `@senticor/public-sector-sdk` (`ProcedureVersion`/`transitionCase`, Konsum).

**Bezug:** ADR-0001 (Fall-Store, gleiches Stub+chos-Muster). Folge: ADR-0004 (ob eine eigene
`case-management`-Capability nötig ist oder `workflow`+`records`+`audit` reichen).
