// composables.muster — die HAND-DEKLARIERTEN Muster-Composables dieses Templates (der NEUTRALE Fallback).
// REIN (keine I/O, keine Laufzeit-Naht): ein fahrbares Beispielverfahren, das greift, solange KEIN CHOS-Build
// adressierbare Stellen-Manifeste emittiert hat (`.chos/mesh/composables/*.json`). Sobald der Build sie erzeugt,
// MOUNTET `createComposableRegistry` (composables.config) diese generierte Wahrheit statt der Muster.
//
// Diese Datei ist bewusst I/O-FREI, damit das precommit-Gate `check:composables` sie über
// `node --experimental-strip-types` laden kann (der fs-gestützte Mount-Loader lebt getrennt in composables-mounted).
//
// KONSUMENTEN-HOHEIT (wie procedure.config): template:update überschreibt diese Datei NICHT.
import type { AgenticComposable } from "@senticor/public-sector-sdk";

/**
 * Das Muster-OUTCOME-Composable: es liefert den fachlichen Outcome „beschiedener Vorgang" und trägt den
 * vollen Spine — von einfacher Assistenz bis zur rechtsnahen Subsumtion/Review. Weil es rechtsnahe Aufgaben
 * anfasst, ist der Spine auf AAL-2 „Advise" begrenzt (assertSpineAgent erzwingt das): die KI liefert Entwürfe,
 * die Sachbearbeitung entscheidet (Vier-Augen serverseitig).
 */
export const musterverfahrenComposable: AgenticComposable = {
  id: "musterverfahren",
  version: "1.0.0",
  displayName: "Musterverfahren (Dossier)",
  klasse: "outcome",
  status: "certified",
  assurance: "CAL-2",
  outcome: {
    fuerWen: "Sachbearbeitung im Fachverfahren",
    ergebnis: "ein auditierter, beschiedener Vorgang",
    messung:
      "Durchlaufzeit + Vier-Augen-Konformität + Evidence-Vollständigkeit",
    nichtScope: [
      "autonome rechtsnahe Entscheidung (bleibt menschlich)",
      "Zahlungsausführung",
    ],
  },
  owners: {
    capabilityOwner: "fachbereich",
    serviceOwner: "fachverfahren-team",
    knowledgeSteward: "wissensredaktion",
    assuranceSteward: "revision",
    agentOwner: "fachbereich",
  },
  moduleId: "musterverfahren",
  spine: {
    role: "musterverfahren-spine",
    autonomy: "AAL-2",
    // Der volle Eskalationspfad des Nutzer-Mandats: von Assistenz bis Intelligenz.
    aufgaben: [
      "assistenz",
      "strukturierung",
      "pruefung",
      "subsumtion",
      "review",
    ],
    skills: [
      "vollstaendigkeitspruefung",
      "sachverhalts-strukturierung",
      "normbezogene-pruefung",
      "entscheidungs-entwurf",
    ],
    knowledgeDomains: ["musterverfahren", "verwaltungsverfahren"],
  },
  evals: ["eval:musterverfahren-smoke", "eval:spine-hitl-konformitaet"],
  replaceableBy: [],
};

/**
 * Das Muster-ANTRAG-Composable (Leistungs-/Antrags-Verfahren). Noch `candidate`: als Beispiel deklariert,
 * aber nicht zertifiziert — es zeigt einen Spine, der (zunächst) nur assistiert und strukturiert.
 */
export const musterantragComposable: AgenticComposable = {
  id: "musterantrag",
  version: "1",
  displayName: "Musterantrag (Leistung)",
  klasse: "outcome",
  status: "candidate",
  assurance: "CAL-1",
  outcome: {
    fuerWen: "Antragstellende + Sachbearbeitung",
    ergebnis: "ein beschiedener Antrag mit Bescheid",
    messung: "Durchlaufzeit + Nachforderungsquote",
    nichtScope: ["autonome Festsetzung"],
  },
  owners: {
    capabilityOwner: "fachbereich",
    serviceOwner: "fachverfahren-team",
  },
  moduleId: "musterantrag",
  spine: {
    role: "musterantrag-spine",
    autonomy: "AAL-2",
    aufgaben: ["assistenz", "strukturierung"],
    skills: ["vollstaendigkeitspruefung", "nachforderungs-entwurf"],
    knowledgeDomains: ["musterantrag"],
  },
  evals: ["eval:musterantrag-smoke"],
  replaceableBy: [],
};

/** Alle Muster-Composables dieses Templates (der Fallback, wenn kein CHOS-Build gelaufen ist). */
export const composables: AgenticComposable[] = [
  musterverfahrenComposable,
  musterantragComposable,
];
