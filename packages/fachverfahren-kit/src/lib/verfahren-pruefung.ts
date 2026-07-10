// lib/verfahren-pruefung — die REINE strukturelle Prüfung EINER `LeistungConfig` (die Naht) + ein paar Kennzahlen.
//
// Baustein für den Verfahren-Inspektor: hilft beim ENTWICKELN neuer und beim INTEGRIEREN bestehender Fachverfahren,
// indem die Config vor/nach der Generierung auf strukturelle Wohlgeformtheit geprüft wird. Die Prüfung bleibt auf
// dem bestehenden `LeistungConfig`-Vertrag und ergänzt zwei Config-Ebene-Hinweise.
// Rein/deterministisch — kein Netz, kein Domänen-Literal.
import type { LeistungConfig, StatusMachine } from "../types.js";

export interface VerfahrenBefund {
  bereich: "statusmachine" | "antrag" | "detail";
  schwere: "fehler" | "hinweis";
  meldung: string;
}

/** Aggregierte Kennzahlen einer `LeistungConfig` — für die Inspektor-Übersicht. */
export interface VerfahrenKennzahlen {
  schritte: number;
  felder: number;
  status: number;
  uebergaenge: number;
  fristen: number;
  detailSektionen: number;
  rechtsgrundlagen: number;
}

/** Zählt die Struktur-Elemente der Config (rein). Generisch über die Antragsdaten (T-unabhängig). */
export function verfahrenKennzahlen<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
): VerfahrenKennzahlen {
  const steps = config.antrag?.steps ?? [];
  return {
    schritte: steps.length,
    felder: steps.reduce((n, s) => n + (s.felder?.length ?? 0), 0),
    status: config.statusMachine?.states?.length ?? 0,
    uebergaenge: config.statusMachine?.transitions?.length ?? 0,
    fristen: config.fristenTypen?.length ?? 0,
    detailSektionen: config.detailSektionen?.length ?? 0,
    rechtsgrundlagen: config.rechtsgrundlagen?.length ?? 0,
  };
}

/**
 * Prüft die `LeistungConfig` strukturell und liefert die Befunde (leer = wohlgeformt). `fehler` sind strukturelle
 * Verstöße der StatusMachine, `hinweis` sind schwächere Vollständigkeits-Hinweise (fehlende Antrags-
 * schritte/Detail-Sektionen).
 */
export function pruefeLeistungConfig<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
): VerfahrenBefund[] {
  const out: VerfahrenBefund[] = [];
  for (const p of validiereStatusMachine(config.statusMachine))
    out.push({
      bereich: "statusmachine",
      schwere: "fehler",
      meldung: p.meldung,
    });
  if ((config.antrag?.steps?.length ?? 0) === 0)
    out.push({
      bereich: "antrag",
      schwere: "hinweis",
      meldung: "Kein Antragsschritt definiert — die Bürger-Sicht bleibt leer.",
    });
  if ((config.detailSektionen?.length ?? 0) === 0)
    out.push({
      bereich: "detail",
      schwere: "hinweis",
      meldung:
        "Keine Detail-Sektion definiert — die Sachbearbeitung sieht keine strukturierten Antragsfelder.",
    });
  return out;
}

function validiereStatusMachine(
  statusMachine: StatusMachine,
): { meldung: string }[] {
  const probleme: { meldung: string }[] = [];
  const stateKeys = new Set<string>();

  for (const state of statusMachine.states) {
    if (stateKeys.has(state.key)) {
      probleme.push({ meldung: `Status "${state.key}" ist doppelt definiert.` });
    }
    stateKeys.add(state.key);
  }

  if (!stateKeys.has(statusMachine.initial)) {
    probleme.push({
      meldung: `Initialstatus "${statusMachine.initial}" ist nicht definiert.`,
    });
  }

  for (const transition of statusMachine.transitions) {
    if (!stateKeys.has(transition.from)) {
      probleme.push({
        meldung: `Übergang "${transition.label}" startet im unbekannten Status "${transition.from}".`,
      });
    }
    if (!stateKeys.has(transition.to)) {
      probleme.push({
        meldung: `Übergang "${transition.label}" endet im unbekannten Status "${transition.to}".`,
      });
    }
  }

  return probleme;
}
