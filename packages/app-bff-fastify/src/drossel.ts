// drossel — die Missbrauchs-Bremse der ÖFFENTLICHEN Schreibwege (Antrag einreichen, Nachweis hochladen).
//
// WARUM NICHT DER VORHANDENE IN-MEMORY-LIMITER: der zählt im Prozess. Zwei BFF-Instanzen hinter einem
// Load-Balancer drosseln dann jede für sich — die Grenze ist faktisch doppelt so hoch, ohne dass es
// jemand sieht. Ein Schutz, dessen Wirkung von der Instanzzahl abhängt, ist kein Schutz.
//
// DIESE DROSSEL ZÄHLT AUS DEM STORE, den sich alle Instanzen ohnehin teilen — und zwar aus den bereits
// vorhandenen, append-only Spuren des Vorgangs selbst (`openedAt` der eigenen Fälle bzw. die
// `nachweis.uploaded`-Ereignisse). Kein zweiter Zähler, keine Migration, EINE Wahrheit: was gezählt
// wird, ist genau das, was tatsächlich entstanden ist.
//
// GRENZE, ehrlich: die Drossel greift je AKTEUR (Sitzung), nicht je IP — die Bürger-Schreibwege sind
// konto-gebunden, eine anonyme Einreichung gibt es bewusst nicht. Eine IP-Drossel vor dem Konto gehört
// an den Ingress (NetworkPolicy/WAF) und ist eine Betriebs-, keine Anwendungs-Entscheidung.
//
// Limits sind DATEN (`ProcedureVersion.drossel`), keine Code-Konstanten.

/** Der Default, wenn ein Verfahren nichts deklariert. Bewusst großzügig — eine Drossel, die echte
 *  Nutzung behindert, wird abgeschaltet und schützt dann gar nicht mehr. */
export const DROSSEL_DEFAULT = {
  proAkteur: 20,
  fensterSekunden: 3600,
} as const;

export interface DrosselRegeln {
  proAkteur: number;
  fensterSekunden: number;
}

export function drosselRegelnAus(
  deklariert: { proAkteur?: number; fensterSekunden?: number } | undefined,
): DrosselRegeln {
  return {
    proAkteur: deklariert?.proAkteur ?? DROSSEL_DEFAULT.proAkteur,
    fensterSekunden:
      deklariert?.fensterSekunden ?? DROSSEL_DEFAULT.fensterSekunden,
  };
}

export interface DrosselErgebnis {
  erlaubt: boolean;
  /** Sekunden bis zum frühesten nächsten Versuch (für den `Retry-After`-Header). */
  retryAfterSekunden: number;
}

/**
 * Zählt die Zeitstempel im Fenster und entscheidet. REIN: Zeit kommt herein, nichts wird gelesen —
 * die Store-Abfrage macht der Aufrufer (er weiß, welche Spur die richtige ist).
 */
export function pruefeDrossel(
  zeitstempelIso: readonly string[],
  regeln: DrosselRegeln,
  jetztIso: string,
): DrosselErgebnis {
  const jetzt = Date.parse(jetztIso);
  const fensterMs = regeln.fensterSekunden * 1000;
  const imFenster = zeitstempelIso
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t) && jetzt - t < fensterMs)
    .sort((a, b) => a - b);
  if (imFenster.length < regeln.proAkteur)
    return { erlaubt: true, retryAfterSekunden: 0 };
  // Der ÄLTESTE Eintrag im Fenster bestimmt, wann wieder Platz ist.
  const aeltester = imFenster[0] as number;
  const frei = aeltester + fensterMs - jetzt;
  return {
    erlaubt: false,
    retryAfterSekunden: Math.max(1, Math.ceil(frei / 1000)),
  };
}
