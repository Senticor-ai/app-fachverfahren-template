---
name: bpmn-prozess-workflow
description: Configure a Verfahren's process/workflow BPMN-style — states/transitions in statusMachine, deklarative Automationen, and an executable BPMN-subset process graph in prozesse — all as DATA on the ONE leistung.config seam, deploy-validated fail-closed against the statusMachine and editable in the a11y-primary ProzessEditor.
---

# BPMN-Prozess-Workflow

Der Autorenpfad für den PROZESS/WORKFLOW eines Verfahrens: Zustände und
Übergänge, deklarative Automationen und ein BPMN-nahes Prozess-Diagramm — alle
als DATEN auf derselben Naht wie das übrige Verfahren, plus der grafische,
barrierefreie `ProzessEditor`. Root-Policy und Pfad-Karte: `AGENTS.md`. Der
Einstieg in die Naht selbst steht in `.agents/skills/fachverfahren-app`; dieser
Skill vertieft ausschließlich den Workflow-Anteil.

## Kernprinzip

Der Prozess ist DATEN, kein Code — es gibt EINE Wahrheit, und die grafische
Anzeige (Mermaid) sowie der Editor sind nur Frontends darüber. Drei additive,
data-driven Felder EINER Config beschreiben den vollständigen Workflow eines
Verfahrens:

```text
apps/fachverfahren/src/leistung.config.ts
  → statusMachine   // Zustände + erlaubte Übergänge (die kanonische Zustands-Wahrheit)
  → automationen?   // Trigger → Bedingung → Aktions-ABSICHT (deklarative Hooks)
  → prozesse?       // BPMN-Subset-Prozessgraph als IR (ProzessDefinition[])
```

`statusMachine` ist die verbindliche Zustands-Wahrheit (`states`/`transitions`);
`automationen` reagieren deklarativ auf Ereignisse; `prozesse` orchestriert die
Reihenfolge als BPMN-inspirierter Graph, dessen zustandsändernde Schritte GEGEN
genau diese `statusMachine`-Übergänge mappen. Kein zweiter Wahrheits-Kanal: der
Prozessgraph darf nur Übergänge auslösen, die die `statusMachine` bereits
erlaubt. Der `ProzessEditor` (`packages/fachverfahren-kit/src/components/
ProzessEditor.tsx`) editiert eine `ProzessDefinition` KONTROLLIERT gegen die
`statusMachine` — jede Änderung ruft `beiAenderung(neueDefinition)`, jede
Eingabe wird live über `validateProzessGraph` (fail-closed) geprüft. Bewusst
FORMULAR-/LISTEN-basiert (BITV AA, voll tastaturbedienbar), die Mermaid-Ansicht
ist reine Vorschau/Progressive-Enhancement — kein Canvas-Zwang.

## Wie ein Build-Agent (chos-code/gtc-builder) es nutzt

Die Reihenfolge ist zwingend: erst die Zustands-Wahrheit, dann Automationen,
dann der Graph — der Graph referenziert die Übergänge, die es zu dem Zeitpunkt
schon geben muss.

1. **`statusMachine` füllen** (`LeistungConfig.statusMachine`): `states` mit
   `key`/`label`/`tone`, Endzustände `terminal: true`; `transitions` mit
   `from`/`to`/`label`/`rollen`, kritische Übergänge `vierAugen: true`,
   Begründungspflicht `detailPflicht: true`. Struktur-Regeln
   (`validiereStatusMachine` in `lib/status-machine.ts`): `initial` liegt in
   `states`, jeder nicht-terminale State hat ≥1 Ausgang, jeder terminale State
   0 Ausgänge, alles vom `initial` aus erreichbar.

2. **Optional `automationen`** (`LeistungConfig.automationen: AutomationRule[]`):
   je Regel `trigger` (`beim-eingang`/`beim-uebergang`/`frist-erreicht`/
   `nachweis-eingegangen`/`feld-geaendert`/`zuweisung-geaendert`/`manuell`),
   optional `wenn` (`Bedingung`), `dann` (Aktions-ABSICHTEN wie
   `status-uebergang`/`setze-feld`/`zuweisen`/`benachrichtigen`/`ki-vorschlag`).
   FAIL-CLOSED: eine zustandsändernde Regel OHNE `wenn` wird nie gefeuert
   (`pruefeAutomationen`/`evalAutomationen` überspringen sie).

3. **Optional `prozesse`** (`LeistungConfig.prozesse: ProzessDefinition[]`, Typen
   in `lib/process-ir.ts`): je Prozess `id`/`version`/`knoten`/`kanten`.
   V1-ausführbare `knoten`: `start` (genau 1), `ende` (≥1), `userTask`
   (menschlicher Schritt: `rollen` + `catalogAction`), `serviceTask`
   (maschineller Schritt: `catalogAction`), `exclusiveGateway` (XOR). Jeder
   statusändernde Knoten trägt `catalogAction === transition.to` einer
   `statusMachine`-Transition; `kanten` (`ProzessKante`: `von`/`nach`, optional
   `guard`/`default` nur an Gateway-Zweigen).

4. **Grafisch bearbeiten** (interaktive App-/Governance-Sicht): den
   `ProzessEditor` mit `wert`/`statusMachine`/`beiAenderung` mounten; `nurLesen`
   für Read-only; `kiPort?: KiAssistPort` OPTIONAL für einen transparenten,
   menschlich zu prüfenden Vorschlag (HITL). Der Editor bietet nur die
   V1-ausführbaren Knotentypen an und zeigt Validierungsfehler live via
   `aria-live`.

5. **Snapshot emittieren**: `prozesse`/`automationen`/`statusMachine` landen über
   `contract-snapshot.ts` als echte Zeilen in `leistung.contract.json`:

   ```bash
   pnpm --filter @senticor/fachverfahren emit:contract
   ```

6. **Deploy-validieren + testen** (siehe „Gates"): `check:leistung-contract`
   fährt `validateProzessGraph` gegen `snap.statusMachine`, dann `typecheck` +
   `test`.

## Vertrag & Leitplanken

Typen/Ports (alle im Kit, nie im Verfahren nachbauen):
`ProzessDefinition`/`ProzessKnoten`/`ProzessKante` (`lib/process-ir.ts`),
`StatusMachine`/`Transition`/`AutomationRule`/`AutomationTrigger`/
`AutomationAktion` (`types.ts`), `KiAssistPort` (`lib/ai-assist.ts`).

ERZWUNGEN (nicht verhandelbar):

- **Fail-closed Graph-Gate** (`validateProzessGraph`, `lib/process-graph.ts`):
  eindeutige Ids; nur V1-Knotentypen [G5]; genau 1 `start`, ≥1 `ende`; Kanten
  referenzieren existierende Knoten; Erreichbarkeit ab `start` (DFS); keine
  Sackgasse (Nicht-Ende hat Ausgang, Ende hat keinen); Guards NUR an
  Exclusive-Gateway-Zweigen; je Gateway genau 1 `default` und jeder
  Nicht-Default-Zweig ein nicht-leerer Guard mit ausschließlich bekannten
  Operatoren [G2]. Ein Prozess mit auch nur EINEM Fehler wird nicht deployt.
- **Katalog-Bindung [H4]**: jeder statusändernde Knoten mappt auf eine
  `transition` mit `to === catalogAction`; `knoten.vierAugen` ist BIJEKTIV zur
  `transition.vierAugen`; eine `userTask`-`rollen` ist Teilmenge der Rollen
  JEDER gemappten Transition (kein Rollen-Widening über den Katalog hinaus).
- **Nicht-unterstützte BPMN-Elemente sind TYPISIERT, nicht ignoriert**
  (`parallelGateway`/`timerEvent`/`messageEvent`/`signalEvent`/`boundaryEvent`/
  `subprozess`): der Validator lehnt sie HART ab, statt sie still zu droppen.
- **Server-autoritativ + procedure-gebunden**: die zustandsändernden Schritte
  laufen NICHT im Client, sondern durch dieselbe Governance-Kette wie ein
  manueller Übergang — RBAC + Vier-Augen + Optimistic-Locking + append-only
  Audit (`public-sector-sdk/case-service.ts`). `planTokenSchritt`
  (`lib/process-run.ts`) ist ein REINER Planer (kein Effekt, kein Netz, keine
  Zeit).
- **Maschine ist nie ein Auge**: der ausführende Dienst handelt als
  `PROCESS_SERVICE_ACTOR = "service:process"` (reserviertes `service:`-Präfix,
  `isServiceActor` in `public-sector-sdk/case-service.ts`). Als VORBEREITER ist
  ein Dienst-Akteur strukturell ausgeschlossen — `executeCaseTransition`
  filtert ihn aus `previousApproverActorId`. Als FREIGEBER stoppt ihn die
  Policy allein NICHT: `DefaultDenyPolicyEngine` prüft nur
  `actor ≠ Vorbereiter`, was ein Maschinen-Akteur besteht — deshalb MUSS die
  ausführende Engine jeden `requiresFourEyes`-Schritt HART VOR der Policy
  blocken (so tut es die reale `automation-engine.ts`; für eine Prozess-Runtime
  gilt dieselbe verbindliche Invariante). Ein Vier-Augen-Übergang gehört daher
  an eine menschliche `userTask`; ein `serviceTask` darf ihn nie abschließen.
  V1 liefert dazu die SEAMS (reservierter Dienst-Akteur, `assertHumanActor` als
  Request-Grenze gegen einen Menschen, der sich als Dienst ausgibt, Graph-Gate,
  reiner Planer `planTokenSchritt`) — die zustandsändernde Prozess-Runtime
  selbst ist noch nicht Teil des Kits.
- **Automationen fail-closed**: mutierende Regel ohne `wenn` feuert nie; ein
  `status-uebergang` läuft server-autoritativ durch `executeCaseTransition`
  (RBAC/Optimistic-Locking/append-only Audit), und ein
  `requiresFourEyes`-Übergang wird von der `automation-engine.ts` HART geblockt
  (nie autonom, da die Automation nie eines der zwei Augen ist);
  `ki-vorschlag` ist NIE autonom.
- **KI strikt additiv + HITL** (`kiPort`, EU-AI-Act Art. 50 / DSGVO Art. 22):
  fehlt der Port, arbeitet der Editor vollständig ohne KI; ist er verbunden,
  liefert er einen transparenten Vorschlag (`reviewErforderlich: true`), den ein
  Mensch MANUELL übernimmt — die KI ist nie eines der zwei Augen.
- **Barrierefreiheit (BITV AA)**: der Editor ist formular-/listenbasiert, voll
  tastaturbedienbar, ohne Maus-/Canvas-Zwang; Fehler kommen über `role="status"`
  `aria-live="polite"`; die Mermaid-Vorschau ist Progressive-Enhancement.
- **Determinismus**: Knoten-/Kanten-Ids sind stabil (`k<n>`/`e<n>`), aus dem
  Bestand abgeleitet — kein `Random`/`Date`.

## Gates & Verifikation

```bash
pnpm --filter @senticor/fachverfahren emit:contract
pnpm run check:leistung-contract
pnpm run typecheck
pnpm run test
```

- `check:leistung-contract` (`scripts/check-leistung-contract.mts`) validiert
  die StatusMachine strukturell UND fährt für jeden `snap.prozesse[]`-Eintrag
  `validateProzessGraph(prozess, snap.statusMachine)` — jeder Graph-Fehler bricht
  das Gate (fail-closed). Fehlt `prozesse`, bleibt der Vertrag byte-identisch.
- `pnpm run test` deckt die reinen Kerne ab: `process-graph.test.ts`,
  `process-run.test.ts`, `status-machine.test.ts`, `automation.test.ts`,
  `automation-run.test.ts`, `process-ir-view.test.ts` sowie
  `ProzessEditor.dom.test.tsx` (a11y-Rendering/Interaktion).
- Alle drei laufen in `check:precommit` (`precommit:check`) und `check:ci`
  (`scripts/ci-validate.sh`) mit; `check:docs-language` prüft, dass Skill-/Doc-
  Texte deutschsprachig (mit Umlauten) sind.

Reihenfolge beachten: `emit:contract` MUSS nach dem letzten Naht-Write laufen,
sonst ist `leistung.contract.json` veraltet und `check:leistung-contract`
schlägt fehl.

## Minimalbeispiel

Generisch (Vokabular `leistung`/`vorgang`, neutrale Zustände) — nie ein
konkretes Verfahren hartkodieren. Zustands-Wahrheit, ein passender Prozessgraph
und eine Automation auf DERSELBEN Naht:

```ts
// 1) statusMachine — die kanonische Zustands-Wahrheit
const statusMachine: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "in_pruefung", label: "In Prüfung", tone: "info" },
    { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
  ],
  transitions: [
    {
      from: "eingegangen",
      to: "in_pruefung",
      label: "Zur Prüfung",
      rollen: ["sachbearbeitung"],
    },
    // kritischer Übergang: Vier-Augen — nur menschlich abschließbar
    {
      from: "in_pruefung",
      to: "festgesetzt",
      label: "Festsetzen",
      rollen: ["sachbearbeitung"],
      vierAugen: true,
    },
    {
      from: "in_pruefung",
      to: "abgelehnt",
      label: "Ablehnen",
      rollen: ["sachbearbeitung"],
      detailPflicht: true,
    },
  ],
};

// 2) prozesse — BPMN-Subset-Graph; catalogAction === transition.to, vierAugen bijektiv
const prozess: ProzessDefinition = {
  id: "standard-lauf",
  version: 1,
  label: "Standard-Bearbeitung",
  knoten: [
    { id: "k1", typ: "start", label: "Eingang" },
    {
      id: "k2",
      typ: "userTask",
      label: "Prüfen",
      rollen: ["sachbearbeitung"],
      catalogAction: "in_pruefung",
    },
    { id: "k3", typ: "exclusiveGateway", label: "Vollständig?" },
    // Vier-Augen-Schritt MUSS userTask sein (Maschine ist nie ein Auge — ein serviceTask darf ihn nie abschließen)
    {
      id: "k4",
      typ: "userTask",
      label: "Festsetzen",
      rollen: ["sachbearbeitung"],
      catalogAction: "festgesetzt",
      vierAugen: true,
    },
    {
      id: "k5",
      typ: "userTask",
      label: "Ablehnen",
      rollen: ["sachbearbeitung"],
      catalogAction: "abgelehnt",
    },
    { id: "k6", typ: "ende", label: "Abgeschlossen" },
  ],
  kanten: [
    { id: "e1", von: "k1", nach: "k2" },
    { id: "e2", von: "k2", nach: "k3" },
    // Nicht-Default-Zweig eines Gateways: nicht-leerer Guard PFLICHT
    {
      id: "e3",
      von: "k3",
      nach: "k4",
      guard: { feld: "vollstaendig", op: "==", wert: true },
    },
    { id: "e4", von: "k3", nach: "k5", default: true }, // genau EIN Default
    { id: "e5", von: "k4", nach: "k6" },
    { id: "e6", von: "k5", nach: "k6" },
  ],
};

// 3) automationen — deklarativer Hook (mutierend ⇒ wenn PFLICHT, sonst fail-closed)
const automationen: AutomationRule[] = [
  {
    id: "eskaliere-bei-frist",
    trigger: { art: "frist-erreicht", fristTyp: "bearbeitung" },
    wenn: { feld: "$status", op: "==", wert: "in_pruefung" },
    dann: [{ art: "setze-prioritaet", wert: "hoch" }],
  },
];

// … in LeistungConfig: { …, statusMachine, prozesse: [prozess], automationen }
```

Grafisches Bearbeiten (kontrolliert, `kiPort` optional/HITL):

```tsx
<ProzessEditor
  wert={prozess}
  statusMachine={statusMachine}
  beiAenderung={(def) => setProzess(def)}
  // kiPort={port}   // OPTIONAL — additive, HITL-geprüfte Vorschläge
/>
```
