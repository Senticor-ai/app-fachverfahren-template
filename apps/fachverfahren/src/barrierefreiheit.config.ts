import type { BarrierefreiheitserklaerungProps } from "@senticor/fachverfahren-kit";

export interface BarrierefreiheitConfig extends Pick<
  BarrierefreiheitserklaerungProps,
  "stand" | "nichtKonformeInhalte" | "feedbackEmail" | "schlichtungsstelle"
> {
  /** Muss vor einem produktiven Consumer-Release auf `false` gesetzt werden. */
  provisional: boolean;
}

/** Vorläufige, sichtbar als Muster markierte Deployment-Daten. Ein generierter
 *  Konsument ersetzt sie vor dem Release; der Release-Check blockiert Platzhalter. */
export const barrierefreiheitConfig: BarrierefreiheitConfig = {
  provisional: true,
  stand: {
    datumIso: "2026-07-14",
    status: "teilweise-konform",
  },
  nichtKonformeInhalte: [
    "Die vollständige Prüfung dieser Anwendung nach BITV 2.0 ist noch nicht abgeschlossen.",
  ],
  feedbackEmail: "barrierefreiheit@example.org",
  schlichtungsstelle: {
    name: "Zuständige Schlichtungsstelle — im Deployment zu ersetzen",
    url: "https://example.org/schlichtungsstelle",
  },
};
