// fehler-ursache — WELCHEN Satz die Fehlergrenze über einem Wurf schreibt. Rein, ohne React, ohne DOM.
//
// ⛔ DER BEFUND (gemessen 2026-09-13, an drei ausgelieferten Verfahren gleichzeitig). Die Fehlergrenze trug
// EINEN festen Erklärsatz:
//
//     «Ein Baustein ist beim Rendern auf einen Fehler gelaufen — häufig, weil die generierte
//      `leistung.config.ts` nicht zum Kit-Vertrag passt (z. B. fehlt `antrag.steps` oder `register`).»
//
// Der Wurf, der in DREI gleichzeitig ausgelieferten Verfahren wirklich darüber stand, war ein anderer: «Rendered more hooks than during the previous render» — die Aufrufregel
// von React, verletzt von `LandingPage.tsx`, einer Datei der VORLAGE, die im Kit längst geheilt war und die
// diese Verfahren nie nachgezogen hatten. Wer dem Satz folgte, las `leistung.config.ts` — eine Datei, die
// damit nichts zu tun hat.
//
// ⭐ EIN ERKLÄRSATZ, DER EINE UNSCHULDIGE DATEI NENNT, IST SCHLECHTER ALS KEINER: er verbraucht die
// Aufmerksamkeit des Menschen an der falschen Stelle, und er tut es mit der Autorität einer Diagnose.
// Deshalb entscheidet ab hier der WURF, welcher Satz erscheint — nicht eine Konstante.
//
// ⛔ UND NUR ZWEI KLASSEN, KEINE DRITTE AUF VERDACHT. Die React-Aufrufregel ist als Wortlaut stabil und
// eindeutig (sie kommt aus React selbst, nicht aus unserem Code); alles andere bleibt beim bisherigen,
// bezahlten Satz. Eine dritte Klasse „vielleicht ist es X" wäre wieder ein Zeigefinger ohne Messung.

/** Die Klasse eines Wurfs — sie entscheidet den Erklärsatz, sonst nichts. */
export type FehlerKlasse = "react-aufrufregel" | "vertrag";

/**
 * Wortlaute, die React selbst für eine verletzte Aufrufregel schreibt.
 *
 * Sie stehen hier als KLEINGESCHRIEBENE Teilzeichenketten und werden gegen die kleingeschriebene Meldung
 * geprüft: React formuliert je nach Version leicht anders («Rendered more hooks …», «Rendered fewer hooks
 * …», «Invalid hook call …»), und ein Vergleich auf den genauen Satz wäre beim nächsten Versionssprung
 * still falsch — die Klasse fiele lautlos in den Vertrags-Satz zurück.
 */
const REACT_AUFRUFREGEL = [
  "rendered more hooks",
  "rendered fewer hooks",
  "invalid hook call",
  "rendered more hooks than during the previous render",
  "change in the order of hooks",
] as const;

/** Die Klasse eines Wurfs. Ohne lesbare Meldung gilt der bisherige Satz — nie eine geratene Diagnose. */
export function fehlerKlasse(message: unknown): FehlerKlasse {
  const m = String(message ?? "").toLowerCase();
  return REACT_AUFRUFREGEL.some((w) => m.includes(w))
    ? "react-aufrufregel"
    : "vertrag";
}

/**
 * Der Erklärsatz für den Menschen vor dem Bildschirm.
 *
 * Er nennt bei der Aufrufregel die VORLAGE als Ursache und den Weg dorthin («Vorlagen-Abgleich» in der
 * Builder-Konsole) — den es seit dem 2026-09-13 wirklich gibt. Ein genannter Weg ohne Ausführer wäre die
 * Klasse, die dieses Haus am häufigsten bezahlt hat.
 */
export function fehlerErklaerung(message: unknown): string {
  return fehlerKlasse(message) === "react-aufrufregel"
    ? "Ein Baustein der VORLAGE ist in diesem Verfahren veraltet: er verletzt die Aufrufregel von React " +
        "(ein Hook hinter einem frühen Ausstieg). Das liegt nicht an den Daten dieses Verfahrens — in der " +
        "Builder-Konsole «Vorlagen-Abgleich» prüfen und die betroffene Datei übernehmen."
    : "Ein Baustein ist beim Rendern auf einen Fehler gelaufen — häufig, weil die generierte " +
        "leistung.config.ts nicht zum Kit-Vertrag passt (z. B. fehlt antrag.steps oder register).";
}
