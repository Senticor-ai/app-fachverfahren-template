// DIE EINE Dossier-Naht dieser App — das Fall-/Dossier-Verfahren als DATEN. Das server-seitige Gegenstück
// zu src/leistung.config.ts (der Antrag-Naht): so wie die Antrag-UX allein aus `LeistungConfig` rendert,
// treibt EINE `ProcedureVersion` die Fall-Zustandsmaschine (allowedStates/allowedTransitions + Rechtsgrundlagen +
// Vier-Augen), die der reine `transitionCase`-Reducer ausführt. Kein verfahrens-spezifischer Server-Code sonst.
//
// DEFAULT: ein NEUTRALES, verfahrens-UNSPEZIFISCHES „Musterverfahren", NUR damit die Vorlage eigenständig läuft
// (pnpm dev, APP_STORE_MODE=memory) und den vollen Dossier-Flow zeigt (Akte · Ziele/Schritte · Übergänge ·
// Vier-Augen · Verlauf). Es sind bewusst KEINE echten Fachdaten: Zustände, Rechtsgrundlagen und Fristen eines
// realen Verfahrens stehen NICHT hier — sie kommen aus dem FACHKONZEPT (bzw. der FIM/KGSt-BPMN).
//
// GENERIERT: ein generierender Build (Agent / chos-code governed build / gtc-builder) ÜBERSCHREIBT GENAU DIESE
// DATEI mit der aus dem Fachkonzept (BPMN → `bpmnToProcedureVersion`) abgeleiteten `ProcedureVersion` des
// jeweiligen Verfahrens. Dieselbe App, dieselben Bausteine, anderes Verfahren — ohne dass eine weitere Datei der
// App sich ändert. Das ist die EINE Naht zwischen Generierung und laufender Fall-/Dossier-App.
//
// Ein vollständiges reales Beispiel (Integrationsmanagement mit §§ AufenthG/FlüAG) liegt als AGENT-VORLAGE in der
// dossier-fallmanagement-Skill + docs/examples/integrationsberatung/ — es gehört NICHT in diese neutrale Vorlage.
import {
  builtInPermissions,
  statusMachineToProcedureVersion,
} from "@senticor/public-sector-sdk";
import type { ProcedureVersion } from "@senticor/public-sector-sdk";

/** Feinere RBAC lebt in der Governance-/BFF-Schicht; die Übergänge tragen die Schreib-Permission
 *  case.decision.prepare (wie die aus BPMN abgeleiteten Übergänge). */
const PREPARE = builtInPermissions.casePrepareDecision.permission;

/**
 * Das Dossier-Verfahren (Zustandsmaschine + Rechtsgrundlagen als DATEN) — DER EINE Austausch-Punkt.
 * Neutrales Musterverfahren: eingegangen → in-bearbeitung ⇄ pausiert → abgeschlossen ⇄ wiederaufnehmen,
 * mit Vier-Augen-Abschluss (der Abschluss schließt den Fall: `closesCase`). Ein reales Verfahren führt seine
 * echten Zustände/Rechtsgrundlagen; die Generierung überschreibt genau dieses Objekt.
 */
export const dossierProcedure: ProcedureVersion = {
  procedureId: "musterverfahren",
  version: "1.0.0",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  // Platzhalter-Rechtsgrundlage — ein reales Verfahren trägt hier seine echten §§ (nie erfunden).
  legalBasisIds: ["muster-satzung-1"],
  allowedStates: ["eingegangen", "in-bearbeitung", "pausiert", "abgeschlossen"],
  allowedTransitions: [
    {
      from: "eingegangen",
      to: "in-bearbeitung",
      action: "annehmen",
      requiredPermission: PREPARE,
    },
    {
      from: "in-bearbeitung",
      to: "pausiert",
      action: "pausieren",
      requiredPermission: PREPARE,
    },
    {
      from: "pausiert",
      to: "in-bearbeitung",
      action: "fortsetzen",
      requiredPermission: PREPARE,
    },
    {
      from: "in-bearbeitung",
      to: "abgeschlossen",
      action: "abschließen",
      requiredPermission: PREPARE,
      requiresFourEyes: true,
      closesCase: true,
    },
    {
      from: "abgeschlossen",
      to: "in-bearbeitung",
      action: "wiederaufnehmen",
      requiredPermission: PREPARE,
    },
  ],
};

/**
 * Das ANTRAGS-Verfahren als server-seitige `ProcedureVersion` — das server-importierbare Gegenstück zur
 * Antrags-Zustandsmaschine in src/leistung.config.ts.
 *
 * WARUM DUPLIZIERT (und wie gegen Drift gesichert): leistung.config.ts ist Client-Wahrheit und liegt
 * ausserhalb des Server-rootDir (server/ vs. src/) — der Server KANN sie nicht importieren. Damit ein
 * eingereichter Antrag zur server-persistierten Akte werden kann (POST /api/buerger/antraege), braucht der
 * Server dieselbe Zustandsmaschine hier. Die untenstehende Quelle SPIEGELT leistung.config.statusMachine;
 * das Gate `check:antrag-procedure` verifiziert die Übereinstimmung, indem es aus BEIDEN ableitet und
 * vergleicht (Präzedenz: check:bpmn-example gegen die BPMN). Weicht eine Kopie ab, schlägt das Gate an.
 *
 * `procedureId` MUSS `leistung.config.id` entsprechen — der Client sendet ihn beim Einreichen.
 */
export const antragProcedure: ProcedureVersion =
  statusMachineToProcedureVersion({
    procedureId: "musterantrag",
    version: "1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    legalBasisIds: ["§ 1 Demo-Satzung"],
    requiredPermission: PREPARE,
    // Verwaltungsakt-Fachlichkeit — SPIEGEL von leistung.config.zustellung (der Server kann leistung.config
    // nicht importieren, rootDir-Mauer). Das Drift-Gate check:antrag-procedure sichert die Deckung.
    verwaltungsakt: {
      rechtsbehelf: {
        art: "widerspruch",
        fristWert: 1,
        fristEinheit: "monat",
        stelle: "der erlassenden Behörde",
        norm: "§ 68 ff. VwGO",
      },
      fiktionTage: 4,
      fiktionNorm: "§ 41 Abs. 2 VwVfG",
    },
    states: [
      { key: "eingegangen" },
      { key: "in_pruefung" },
      { key: "review_noetig" },
      // Wiederaufnehmbar-geschlossen (nicht terminal) — der Widerspruch öffnet den Fall wieder (ADR-0006).
      { key: "festgesetzt" },
      { key: "abgelehnt", terminal: true },
      { key: "widerspruch_in_pruefung" },
      { key: "abgeholfen", terminal: true },
      { key: "widerspruch_zurueckgewiesen", terminal: true },
    ],
    transitions: [
      { from: "eingegangen", to: "in_pruefung", label: "In Prüfung nehmen" },
      { from: "in_pruefung", to: "review_noetig", label: "Zur Zweitprüfung" },
      {
        from: "in_pruefung",
        to: "festgesetzt",
        label: "Festsetzen",
        vierAugen: true,
        erlaesstBescheid: true,
        closesCase: true,
      },
      {
        from: "review_noetig",
        to: "festgesetzt",
        label: "Festsetzen (Zweitfreigabe)",
        vierAugen: true,
        erlaesstBescheid: true,
        closesCase: true,
      },
      { from: "in_pruefung", to: "abgelehnt", label: "Ablehnen" },
      // Widerspruchs-Verfahren (ADR-0006) — Spiegel von leistung.config, Drift-Gate check:antrag-procedure.
      {
        from: "festgesetzt",
        to: "widerspruch_in_pruefung",
        label: "Widerspruch bearbeiten",
      },
      {
        from: "widerspruch_in_pruefung",
        to: "abgeholfen",
        label: "Abhilfe",
        vierAugen: true,
      },
      {
        from: "widerspruch_in_pruefung",
        to: "widerspruch_zurueckgewiesen",
        label: "Widerspruch zurückweisen",
        vierAugen: true,
      },
    ],
  });

/** Ein Ziel des Demo-Dossiers: Titel, optionale Frist/Kategorie/Status + Checklisten-Schritte. */
export interface DossierDemoZiel {
  id: string;
  titel: string;
  faelligAm?: string;
  kategorie?: string;
  status?: string;
  schritte: { id: string; titel: string; erledigt: boolean }[];
}

/** Die synthetischen Inhalte des Preview-Demo-Dossiers (nur In-Memory/DEV). Keine echten Personen/PII. */
export interface DossierDemo {
  caseId: string;
  subjectId: string;
  /** Startzustand des Demo-Falls — muss in `dossierProcedure.allowedStates` liegen. */
  initialState: string;
  openedAt: string;
  openedSummary: string;
  ziele: DossierDemoZiel[];
  termine: { id: string; titel: string; faelligAm: string }[];
}

/**
 * Neutrales Demo-Dossier für die Preview (APP_STORE_MODE=memory). Der Fall startet in „in-bearbeitung", damit
 * ein:e Prüfer:in die Übergänge — inkl. des Vier-Augen-Abschlusses — an der laufenden Akte ausprobieren kann.
 * Alles synthetisch. Wird von der Generierung zusammen mit `dossierProcedure` überschrieben (oder weggelassen).
 */
export const dossierDemo: DossierDemo = {
  caseId: "case.demo-0001",
  subjectId: "subject.1",
  initialState: "in-bearbeitung",
  openedAt: "2026-06-01T08:00:00.000Z",
  openedSummary: "Muster-Fall FALL-2026-0001 eröffnet (musterverfahren)",
  ziele: [
    {
      id: "ziel.1",
      titel: "Erstes Ziel bearbeiten",
      faelligAm: "2026-09-30T00:00:00.000Z",
      kategorie: "muster-handlungsfeld-a",
      status: "laufend",
      schritte: [
        { id: "s.1", titel: "Erster Schritt", erledigt: true },
        { id: "s.2", titel: "Zweiter Schritt", erledigt: true },
        { id: "s.3", titel: "Dritter Schritt", erledigt: false },
        { id: "s.4", titel: "Vierter Schritt", erledigt: false },
      ],
    },
    {
      id: "ziel.2",
      titel: "Zweites Ziel bearbeiten",
      kategorie: "muster-handlungsfeld-b",
      status: "neu",
      schritte: [{ id: "s.5", titel: "Erster Schritt", erledigt: false }],
    },
  ],
  termine: [
    {
      id: "t.1",
      titel: "Gesprächstermin",
      faelligAm: "2026-07-20T10:00:00.000Z",
    },
    {
      id: "t.2",
      titel: "Nachweis vorlegen",
      faelligAm: "2026-07-05T00:00:00.000Z",
    },
  ],
};
