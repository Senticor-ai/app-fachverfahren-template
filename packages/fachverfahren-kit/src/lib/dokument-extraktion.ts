// fachverfahren-kit/lib/dokument-extraktion — der GENERISCHE, vendor-neutrale KI-Extraktions-PORT.
//
// Ein hochgeladenes Dokument (Nachweis) wird zu FELD-VORSCHLAEGEN mit Konfidenz, die der Mensch bestaetigt oder
// korrigiert — analog zur transparenten KI-Assistenz in der Sachbearbeitung (KiAssistPanel). Hier ist NUR der PORT
// definiert: das Interface + ein deterministischer Stub-Default. KEINE konkrete OCR-/KI-Bindung, kein externer
// Dienst hartverdrahtet (oeffentlich/vendor-neutral) — in PROD dockt ein Verfahren seine echte Extraktion an dieses
// Interface an, ohne eine Zeile Kit-Code zu aendern. Rein (kein React/DOM), damit die Vorschlags-Ableitung
// deterministisch testbar ist.
import type { FeldTyp, StepDef } from "../types.js";
import type { DateiWert } from "./antrag-felder.js";

/** Ein Zielfeld der Extraktion: welches Antragsfeld aus einem Dokument befuellt werden koennte. Data-driven aus den
 *  Schritten abgeleitet (siehe `extraktionsZielFelder`) — der Kit erfindet KEINE Felder. */
export interface ExtraktionsZielFeld {
  /** Feldpfad wie `FeldDef.name` (z. B. "person.nachname"). */
  feld: string;
  /** Anzeige-Label des Feldes (fuer die Bestaetigungs-UI + Screenreader-Ansage). */
  label: string;
  /** FeldTyp des Ziels (informativ; eine echte Extraktion kann daraus ihr Parsing waehlen). */
  typ?: FeldTyp;
}

/** Ein extrahiertes Feld: der KI-Vorschlag fuer EIN Antragsfeld MIT Transparenz (Konfidenz + Fundstelle). */
export interface ExtrahiertesFeld {
  /** Feldpfad, in den der bestaetigte Wert uebernommen wird. */
  feld: string;
  /** Anzeige-Label (aus dem Zielfeld uebernommen). */
  label: string;
  /** Vorgeschlagener Wert als String — der Stepper TYPISIERT ihn an der Naht (Zahl/Boolean/…) beim Uebernehmen. */
  wert: string;
  /** Konfidenz 0..1 — Transparenzelement „confidence" (als Balken UND Textwert gezeigt). */
  konfidenz: number;
  /** Optionale Fundstelle/Begruendung im Dokument — Transparenzelement „why". */
  fundstelle?: string;
}

/** Das Ergebnis einer Dokument-Extraktion: Feld-Vorschlaege + Provenienz + optionale, generische Hinweise. */
export interface ExtraktionsErgebnis {
  /** Herkunft/Modell — Transparenzelement „source" (z. B. „OCR-Dienst X", „Stub"). */
  quelle: string;
  /** Die extrahierten Feld-Vorschlaege (nur erkannte Felder; nicht erkannte Ziele fehlen). */
  felder: ExtrahiertesFeld[];
  /** Optionale, generische Hinweise (z. B. „Dokument unscharf — bitte pruefen"). Nie Domaenen-Literale im Kit. */
  hinweise?: string[];
}

/** Der PORT: nimmt eine hochgeladene Datei + die gewuenschten Zielfelder und liefert Vorschlaege. Die EINE
 *  Schnittstelle, an die eine echte OCR-/KI-Extraktion in PROD andockt; der Kit liefert nur den Stub-Default. */
export interface DokumentExtraktionPort {
  extrahiere(
    datei: DateiWert,
    zielFelder: ExtraktionsZielFeld[],
  ): Promise<ExtraktionsErgebnis>;
}

/** Ein Muster-Eintrag fuer den Stub: der Beispiel-Vorschlag eines Feldes als DATEN. */
export interface ExtraktionsMusterEintrag {
  wert: string;
  /** Konfidenz 0..1 (Default `standardKonfidenz`). */
  konfidenz?: number;
  fundstelle?: string;
}

export interface StubExtraktionOptions {
  /** Herkunft (Transparenz „source"). Default macht sichtbar, dass kein echtes Modell laeuft. */
  quelle?: string;
  /** DATEN-Muster je Feldpfad → Vorschlag. So liefert ein Verfahren/eine Story realistische Beispielwerte, OHNE dass
   *  der Kit-Code Domaenen-Werte traegt. Nicht getroffene Zielfelder gelten als „nicht erkannt" (fehlen im Ergebnis). */
  muster?: Record<string, ExtraktionsMusterEintrag>;
  /** Voll eigener Generator (Vorrang vor `muster`) — Rueckgabe `null` ⇒ Feld nicht erkannt. Ermoeglicht z. B. eine
   *  Ableitung aus dem Dateinamen, ohne Werte im Kit zu hartkodieren. */
  generator?: (
    ziel: ExtraktionsZielFeld,
    datei: DateiWert,
  ) => ExtraktionsMusterEintrag | null;
  /** Optionale, generische Hinweise ans Ergebnis. */
  hinweise?: string[];
  /** Standard-Konfidenz, wenn ein Muster-Eintrag keine traegt (Default 0.8). */
  standardKonfidenz?: number;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Der Stub-DEFAULT des Extraktions-PORTs: deterministisch, ohne Modell, ohne Netz. Er „erkennt" genau die Felder,
 * fuer die `muster`/`generator` einen Vorschlag liefern — der Kit bleibt so domaenenfrei (Werte kommen als DATEN aus
 * dem Verfahren/der Story). Ideal, um den Fluss Upload → Vorschlag → Bestaetigung → Feld befuellt vollstaendig
 * klickbar zu zeigen, bevor ein echter OCR-/KI-Dienst andockt.
 */
export function createStubExtraktionPort(
  options: StubExtraktionOptions = {},
): DokumentExtraktionPort {
  const quelle = options.quelle ?? "Stub-Extraktion (kein echtes Modell)";
  const standard = clamp01(options.standardKonfidenz ?? 0.8);
  return {
    extrahiere(datei, zielFelder) {
      const felder: ExtrahiertesFeld[] = [];
      for (const ziel of zielFelder) {
        const treffer = options.generator
          ? options.generator(ziel, datei)
          : (options.muster?.[ziel.feld] ?? null);
        if (!treffer) continue;
        felder.push({
          feld: ziel.feld,
          label: ziel.label,
          wert: treffer.wert,
          konfidenz: clamp01(treffer.konfidenz ?? standard),
          ...(treffer.fundstelle ? { fundstelle: treffer.fundstelle } : {}),
        });
      }
      const ergebnis: ExtraktionsErgebnis = {
        quelle,
        felder,
        ...(options.hinweise && options.hinweise.length > 0
          ? { hinweise: options.hinweise }
          : {}),
      };
      return Promise.resolve(ergebnis);
    },
  };
}

/** Feldtypen, die NICHT sinnvoll aus einem Dokument extrahiert werden (Datei-Uploads, Zustimmungs-Checkbox,
 *  Ja/Nein-Tatbestand) — deren Wert ist eine bewusste Nutzer-Handlung, kein aus Text ablesbarer Wert. */
const NICHT_EXTRAHIERBAR: ReadonlySet<FeldTyp> = new Set<FeldTyp>([
  "file",
  "checkbox",
  "ja-nein",
]);

/** Leitet die EXTRAHIERBAREN Zielfelder generisch aus den Antrags-Schritten ab (Feldpfad + Label + Typ),
 *  ohne die nicht-extrahierbaren Typen. Die data-driven Quelle fuer den Extraktions-PORT — kein Domaenen-Wissen. */
export function extraktionsZielFelder(steps: StepDef[]): ExtraktionsZielFeld[] {
  const out: ExtraktionsZielFeld[] = [];
  for (const step of steps) {
    for (const feld of step.felder) {
      if (NICHT_EXTRAHIERBAR.has(feld.typ)) continue;
      out.push({ feld: feld.name, label: feld.label, typ: feld.typ });
    }
  }
  return out;
}
