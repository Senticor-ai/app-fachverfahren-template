// verfahren.registry — die NEUE, N-wertige Naht: die VERFAHREN-REGISTRY des Sachbearbeiter-Workspace.
//
// Wo `leistung.config.ts` GENAU EIN Verfahren beschreibt, aggregiert diese `WorkspaceConfig` MEHRERE Verfahren zu
// EINEM verfahrensübergreifenden Workspace (Plane-artige Inbox/Board über alle Verfahren). Für ein neues Verfahren
// wird hier ein weiterer `VerfahrenEintrag` ergänzt — der Workspace-Store aggregiert sie automatisch. Prioritäten
// und Labels sind das GEMEINSAME, workspace-weite Vokabular; ein Verfahren kann über `LeistungConfig.prioritaeten`
// eigene Stufen mitbringen.
//
// Die Registry lebt bewusst INNERHALB von `apps/` (kein statischer Import aus `modules/*`) — sie bricht damit
// `check:module-boundaries` nicht.
import type {
  KommuneTheme,
  VerfahrenEintrag,
  WorkspaceConfig,
} from "@senticor/fachverfahren-kit";
import { leistungConfig } from "./leistung.config.js";
import { beispielConfig } from "./leistung.config.beispiel.js";

// Das zweite Demo-Verfahren erscheint NUR, solange das primäre noch das unveränderte Vorlagen-Demo (`musterantrag`)
// ist. Ein generierender Build ÜBERSCHREIBT `leistung.config.ts` mit dem echten Verfahren (andere id) — dann fällt
// dieses Demo automatisch weg und der Konsument sieht ausschließlich SEIN Verfahren. So zeigt die Vorlage die
// verfahrensübergreifende Sicht eigenständig, ohne einen generierten Fork zu verschmutzen.
const istUnveraendertesVorlagenDemo = leistungConfig.id === "musterantrag";
const verfahren: VerfahrenEintrag[] = [
  { procedureId: leistungConfig.id, config: leistungConfig },
  ...(istUnveraendertesVorlagenDemo
    ? [{ procedureId: beispielConfig.id, config: beispielConfig }]
    : []),
  // Weitere Verfahren hier ergänzen — der Workspace führt sie verfahrensübergreifend zusammen.
];

// PORTAL-MARKE (Skalierungsplan #21, strikt optional): die Build-Zeit-Identität DIESES Portals — Anzeigename,
// Wappen + Markenfarbe. `KommuneBranding` (runtime-config.tsx) mountet sie in den `KommuneThemeProvider`, sodass die
// Shell Wappen + Markenfarben zeigt. Ein Server mit `APP_BRAND_*` überschreibt sie zur Laufzeit (Runtime schlägt
// Build-Zeit). SYNTHETISCH: das Demo-Wappen ist KEIN echtes Hoheitszeichen — ein generierender Build ersetzt die
// Marke durch die verifizierte Kommune (Wappen + Provenienz). Ungesetzt lassen ⇒ neutrales Default-Kit.
export const portalMarke: KommuneTheme = {
  name: "Stadt Musterstadt",
  brand: {
    // Deutlich unterscheidbare Demo-Markenfarbe (Teal) — belegt live, dass das White-Labeling die Token bespielt.
    primary: "hsl(174 62% 26%)",
  },
  logo: {
    // Mit dem Vite-Base präfixiert (BASE_URL endet auf „/") — ein relativer src würde sonst gegen die SPA-Route
    // (z. B. /amt/board) aufgelöst und 404en. Standalone „/demo-wappen.svg", hinter Proxy „/<base>/demo-wappen.svg".
    src: `${import.meta.env.BASE_URL}demo-wappen.svg`,
    alt: "Wappen der Stadt Musterstadt (Demo)",
  },
};

export const workspaceConfig: WorkspaceConfig = {
  // DEV-Demo: EIN synthetischer Mandant. In PROD kommt der Mandanten-Scope IMMER aus der Server-Session,
  // NIE aus dem Client — die Kit-Komponenten exponieren keinen Mandanten-Wechsler.
  tenantId: "demo-tenant",
  authorityId: "demo-authority",
  jurisdictionId: "de",
  verfahren,
  prioritaeten: [
    {
      key: "dringend",
      label: "Dringend",
      tone: "block",
      ordinal: 0,
      slaStunden: 24,
    },
    { key: "hoch", label: "Hoch", tone: "warn", ordinal: 1, slaStunden: 72 },
    { key: "normal", label: "Normal", tone: "info", ordinal: 2 },
    { key: "niedrig", label: "Niedrig", tone: "neu", ordinal: 3 },
  ],
  labels: [
    { key: "rueckfrage", label: "Rückfrage", tone: "warn" },
    { key: "eilt", label: "Eilt", tone: "block" },
    { key: "vollstaendig", label: "Vollständig", tone: "ok" },
  ],
  // WORKSPACE-WEITE Automations-/Hook-Regeln als DATEN (verfahrensübergreifend). Rein deklarativ; die AUSFÜHRUNG ist
  // server-autoritativ (RBAC · Vier-Augen · Audit · Idempotenz). Das `RegelwerkPanel` macht sie sichtbar + erlaubt
  // einen reinen Trockenlauf. Neutrale Muster — ein generierendes Verfahren bringt eigene Regeln mit.
  automationenGlobal: [
    // NICHT-mutierend (kein `wenn` nötig): Eingangsbestätigung ins Bürger-Postfach.
    {
      id: "benachrichtigung.eingang",
      trigger: { art: "beim-eingang" },
      dann: [
        {
          art: "benachrichtigen",
          kanal: "postfach",
          template: "eingang-bestaetigung",
        },
      ],
    },
    // NICHT-mutierend: jeden Statuswechsel zusätzlich fachlich protokollieren.
    {
      id: "audit.uebergang",
      trigger: { art: "beim-uebergang" },
      dann: [{ art: "audit", aktion: "statuswechsel-protokolliert" }],
    },
    // MUTIEREND → `wenn` PFLICHT (fail-closed): bei Fristablauf eskalieren, wenn noch nicht dringend.
    {
      id: "eskalation.frist",
      trigger: { art: "frist-erreicht", fristTyp: "bearbeitung" },
      wenn: { feld: "$prioritaet", op: "!=", wert: "dringend" },
      dann: [
        { art: "setze-prioritaet", wert: "dringend" },
        { art: "label-hinzufuegen", label: "eilt" },
      ],
    },
    // MUTIEREND + inaktiv (nur Trockenlauf): eilige Vorgänge bei Übergang der Sachbearbeitung zuweisen.
    {
      id: "zuweisung.eilige",
      trigger: { art: "beim-uebergang" },
      wenn: { feld: "$prioritaet", op: "in", wert: ["dringend", "hoch"] },
      dann: [{ art: "zuweisen", an: { rolle: "sachbearbeitung" } }],
      aktiv: false,
    },
  ],
  // INTERNE WISSENSBASIS/WIKI als DATEN (Wiki.js-inspiriert) — neutrale Arbeitshilfen zum System selbst, keine
  // verfahrens-spezifischen Rechtsaussagen. Ein generierendes Verfahren bringt eigene Artikel mit.
  wissen: [
    {
      id: "handbuch.arbeitsvorrat",
      kategorie: "Handbuch",
      titel: "Der verfahrensübergreifende Arbeitsvorrat",
      standIso: "2026-07-10T00:00:00.000Z",
      markdown: [
        "# Arbeitsvorrat",
        "",
        "Der **Arbeitsvorrat** bündelt alle Aufgaben über **alle Verfahren** in einer Sicht.",
        "",
        "- **Alle Verfahren** — verfahrensübergreifende Liste mit Priorität, Zuweisung und Labels.",
        "- **Board** — Kanban nach Status; Karten per Drag&Drop **oder** per Tastatur-Aktionsmenü verschieben.",
        "- **Eingang** — die Triage-Inbox: Eingänge annehmen (→ Vorgang) oder zurückstellen.",
        "",
        "> Ein Board-Move ändert **nie** einen fachlichen Status — Statuswechsel laufen ausschließlich über die",
        "> geprüfte Entscheidung (Rolle · Vier-Augen · Begründung).",
      ].join("\n"),
    },
    {
      id: "handbuch.board",
      parentId: "handbuch.arbeitsvorrat",
      kategorie: "Handbuch",
      titel: "Das Board (Kanban)",
      standIso: "2026-07-10T00:00:00.000Z",
      markdown: [
        "# Board",
        "",
        "Das **Board** zeigt die Aufgaben als Kanban nach **Status**. Karten lassen sich per **Drag&Drop** ODER",
        "vollständig per **Tastatur-Aktionsmenü** verschieben (BITV-konform). Ein Board-Move ändert **nie** den",
        "fachlichen Status — dafür ist die geprüfte Entscheidung zuständig.",
      ].join("\n"),
    },
    {
      id: "prozesse.vier-augen",
      kategorie: "Prozesse",
      titel: "Vier-Augen-Prinzip",
      standIso: "2026-07-10T00:00:00.000Z",
      markdown: [
        "# Vier-Augen-Prinzip",
        "",
        "Kritische Übergänge sind **vier-augen-pflichtig**: der Vorbereiter der Entscheidung und die freigebende",
        "Person müssen **verschiedene** Akteure sein.",
        "",
        "1. Person A bereitet die Entscheidung vor (`decision.prepared`).",
        "2. Person B gibt frei — **nicht** dieselbe Kennung wie A.",
        "",
        "Serverseitig wird dies gegen das append-only Audit erzwungen; die KI ist **nie** eines der zwei Augen.",
      ].join("\n"),
    },
    {
      id: "prozesse.fristen",
      kategorie: "Prozesse",
      titel: "Fristen & Eskalation",
      standIso: "2026-07-10T00:00:00.000Z",
      markdown: [
        "# Fristen & Eskalation",
        "",
        "Fristen werden aus dem **Fristentyp** des Verfahrens und dem Eingang abgeleitet (nicht frei gesetzt).",
        "",
        "- Der **Fristenkalender** zeigt anstehende Fälligkeiten.",
        "- Die **Meldungen** warnen vor überschrittenen/bald fälligen Fristen.",
        "- Das **Regelwerk** kann bei Fristablauf automatisch eskalieren (server-autoritativ).",
      ].join("\n"),
    },
  ],
};
