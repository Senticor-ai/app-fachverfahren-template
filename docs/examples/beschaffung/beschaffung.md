# Beispiel-Blueprint: Beschaffung (Nicht-Bürger-Verfahren)

Dieser Blueprint zeigt, wie ein **Beschaffungs-Verfahren** (Bestellanforderung →
Freigabe → Bestellung → Wareneingang → Abschluss) auf demselben generischen Template
entsteht wie ein Bürger↔Behörde-Verfahren — nach der P0-1-Öffnung (Personas/Rollen
daten-getrieben). Kein neuer Server-Code: nur andere **Daten** an den bekannten Nähten.

Der Kernel-Beweis liegt als Test bei:
`packages/public-sector-sdk/src/beschaffung-blueprint.test.ts` (voller Lebenszyklus über
`transitionCase`, Vier-Augen-Freigabe, ungültiger Übergang abgewiesen).

## 1. Personas (die Naht `leistung.config.personas`)

Ein Beschaffungs-Verfahren hat andere Arbeitsbereiche als Bürger↔Behörde. Weil die
Persona-Keys jetzt **disjunkt = vollständige Ersetzung** sind (`mergePersonas`), erscheinen
NUR diese vier (keine generischen Default-Personas):

```ts
personas: [
  { key: "requester",  label: "Anfordernde Stelle", home: "/anforderung", routePrefix: "/anforderung" },
  { key: "approver",   label: "Freigabe",           home: "/freigabe",    routePrefix: "/freigabe" },
  { key: "einkauf",    label: "Einkauf",            home: "/einkauf",     routePrefix: "/einkauf" },
  { key: "lieferant",  label: "Lieferant",          home: "/lieferant",   routePrefix: "/lieferant" },
]
```

Sidebar, Landing-Einstiege, URL↔Persona-Zuordnung und die Admin-Zuweisung leiten sich
daraus ab (siehe `apps/fachverfahren/tests/personas.test.ts`, Abschnitt Beschaffung).

## 2. Verfahren (die Naht `procedure.config.ts` → `ProcedureVersion`)

Die Zustandsmaschine ist DATEN. Die **Freigabe** oberhalb der Wertgrenze trägt
`requiresFourEyes` — dieselbe Governance wie ein Verwaltungsakt; der Abschluss trägt
`closesCase`:

```ts
allowedStates: ["angefordert","in_pruefung","genehmigt","bestellt","geliefert","abgeschlossen","abgelehnt"],
allowedTransitions: [
  { from: "angefordert", to: "in_pruefung", action: "pruefen",     requiredPermission: PREPARE },
  { from: "in_pruefung", to: "genehmigt",   action: "genehmigen",  requiredPermission: PREPARE, requiresFourEyes: true },
  { from: "in_pruefung", to: "abgelehnt",   action: "ablehnen",    requiredPermission: PREPARE },
  { from: "genehmigt",   to: "bestellt",    action: "bestellen",   requiredPermission: PREPARE },
  { from: "bestellt",    to: "geliefert",   action: "wareneingang",requiredPermission: PREPARE },
  { from: "geliefert",   to: "abgeschlossen",action:"abschliessen",requiredPermission: PREPARE, closesCase: true },
]
```

## 3. Rollen (RBAC — bereits erweiterbar)

RBAC ist string-getrieben: eigene Rollen (`approver`, `einkauf`) fügt ein Konsument über
`extendRbacRegistry` hinzu und injiziert die Registry über `appBff.rbacRegistry`. Personas
sind NUR Navigation; die Autorisierung trifft der Server über Permissions/RBAC.

## 4. Positionen / Mengen / Lieferant (die Fall-Nutzlast `app_cases.data`)

Bestellpositionen (Artikel, Menge, Preis) und der Lieferantenbezug leben in der
opaken Fall-Nutzlast `data` (jsonb) — der Server interpretiert sie NICHT (wie die
Antragsdaten/Berechnung eines Antrags-Verfahrens); die Beschaffungs-UI rechnet, der
Server bewahrt auf, stempelt Identität/Zeit und auditiert.

## Grenzen (ehrlich) — Folge-Ausbau

- **N-Augen** (3+ Freigeber): modelliert als engine-neutrales
  `CaseTransition.requiredApprovals` (Zahl, grafisch im BPMN via
  `senticor:requiredApprovals` konfigurierbar; `requiresFourEyes` ≡ `requiredApprovals: 2`).
  Server-seitig erzwungen ist heute die 2-Augen-Untergrenze; die volle Zählung N>2
  distinkter Freigebender und **wertgrenzen-gestaffelte** Ketten (P1-4) sind Folge-Arbeit.
- **Positions-Formularfelder**: `FeldTyp` hat (noch) keine Wiederhol-/Array-Felder für
  eine Positionstabelle im Antrag; Dossier-Verfahren nutzen `data`/Aufgaben (P1-6).
