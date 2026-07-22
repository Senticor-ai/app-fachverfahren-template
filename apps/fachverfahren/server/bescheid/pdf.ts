// bescheid/pdf — rendert den EINGEFRORENEN Verwaltungsakt (Issue #60) als PDF-Langzeitdokument, TEMPLATE-
// GETRIEBEN: die Struktur des Bescheids ist DATEN (`BescheidTemplate` = geordnete Sektionen), nicht Layout-
// Code — konsistent zur „Verfahren = DATEN"-Philosophie. Ein Verfahren kann ein eigenes Template mitgeben;
// ohne Template greift `defaultBescheidTemplate`. Reine, server-autoritative Funktion.
//
// KI-AGENTEN (Issue #59/#60): Freitext-Sektionen (z. B. eine Begründung) tragen bereits MENSCHLICH GEPRÜFTE
// Absätze. Der KI-Entwurf läuft davor über den AiAssistPort (chos-Agent, AAL-2 „Advise", limited-risk,
// reviewRequired) — siehe `bescheid/ki-entwurf.ts`. Der Renderer selbst ruft NIE die KI (Determinismus +
// keine Seiteneffekte beim Rendern): KI entwirft → Mensch gibt frei → Text wird Template-Daten → gerendert.
//
// PDF/A-STAND (ehrlich): wohlgeformtes PDF mit EINGEBETTETER Schrift (DejaVu, permissive Lizenz) → ein
// SELBSTTRAGENDES Dokument, das ohne systemseitige Schriften identisch rendert (Kern eines Langzeit-/
// Archivdokuments) + vollständige Metadaten + aus `issuedAt` abgeleitete (deterministische) Zeitstempel.
// Die formale PDF/A-1b-ZERTIFIZIERUNG verlangt DARÜBER HINAUS einen sRGB-ICC-OutputIntent und ein XMP-Paket
// (`pdfaid:part/conformance`) + veraPDF-Validierung als Gate — beides braucht Assets/Tooling, die im Repo/
// Umfeld nicht vorliegen (kein sRGB-ICC via npm, kein veraPDF); ehrlich als Folgearbeit auf #60 offen.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { VerwaltungsaktDto } from "@senticor/app-bff-contracts";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const nodeRequire = createRequire(import.meta.url);
let dejaVuCache: { regular: Uint8Array; bold: Uint8Array } | undefined;

/** Lädt die DejaVu-TTFs (permissive Lizenz) EINMALIG aus dem Paket `dejavu-fonts-ttf`. Eingebettet macht
 *  das Dokument selbsttragend (rendert ohne systemseitige Schriften) — Grundvoraussetzung für PDF/A. */
function ladeDejaVu(): { regular: Uint8Array; bold: Uint8Array } {
  if (!dejaVuCache) {
    dejaVuCache = {
      regular: new Uint8Array(
        readFileSync(
          nodeRequire.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
        ),
      ),
      bold: new Uint8Array(
        readFileSync(
          nodeRequire.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
        ),
      ),
    };
  }
  return dejaVuCache;
}

/** Eine Bescheid-Sektion als DATEN. Bekannte Kinds ziehen ihren Inhalt aus dem VA; `freitext` trägt (ggf.
 *  KI-entworfene, menschlich geprüfte) Absätze. So ist die Bescheid-Struktur pro Verfahren überschreibbar.
 *
 *  `begruendung` ist die GENERISCHE SUBSUMTIONS-NAHT: sie rendert die (rechtliche) Begründung + die
 *  §-belegten Rechenpositionen, die das `berechne`/Tarif-Ergebnis (der Kit-`Berechnung`-Typ) im
 *  eingefrorenen Tenor mitführt — der DETERMINISTISCHE Gegenpol zum `freitext` (KI-Entwurf, menschlich
 *  geprüft). So füllt die Generierung (CHOS) nur `berechne` → `Berechnung{begruendungRecht, positionen[].norm}`,
 *  und die Herleitung erscheint OHNE Renderer-Änderung im rechtsgültigen Bescheid. Trägt der Tenor keine
 *  solche Herleitung (nicht Berechnungs-förmig / keine Begründung), wird die Sektion sauber ausgelassen. */
export type BescheidSektion =
  | { kind: "kopf" }
  | { kind: "tenor"; ueberschrift?: string }
  | { kind: "begruendung"; ueberschrift?: string }
  | { kind: "bekanntgabe"; ueberschrift?: string }
  | { kind: "rechtsbehelf"; ueberschrift?: string }
  | { kind: "freitext"; ueberschrift?: string; absaetze: readonly string[] }
  | { kind: "integritaet"; ueberschrift?: string };

/** Das Bescheid-Template = geordnete Sektionen. Verfahrens-neutral; ein Verfahren kann es ersetzen. */
export interface BescheidTemplate {
  titel: string;
  sektionen: readonly BescheidSektion[];
}

/** Das neutrale Standard-Template: Kopf → Tenor → Begründung (Subsumtion, falls im Tenor mitgeführt) →
 *  Bekanntgabe → Rechtsbehelf → Integrität. Die `begruendung`-Sektion degradiert sauber (rendert nichts),
 *  wenn der Tenor keine Berechnungs-Herleitung trägt — so bleibt das Default-Template für JEDES Verfahren gültig. */
export const defaultBescheidTemplate: BescheidTemplate = {
  titel: "Bescheid (Verwaltungsakt)",
  sektionen: [
    { kind: "kopf" },
    { kind: "tenor", ueberschrift: "Verfügungssatz (Tenor)" },
    { kind: "begruendung", ueberschrift: "Begründung" },
    { kind: "bekanntgabe", ueberschrift: "Bekanntgabe" },
    { kind: "rechtsbehelf", ueberschrift: "Rechtsbehelfsbelehrung" },
    {
      kind: "integritaet",
      ueberschrift: "Integritätsnachweis (fälschungssicher)",
    },
  ],
};

export interface BescheidPdfInput {
  /** Der eingefrorene Verwaltungsakt (selbsttragende Bytes + checksumSha256), wie im Bürger-Abruf. */
  va: VerwaltungsaktDto;
  /** Anzeigename der erlassenden Behörde (aus dem Fall-/Session-Kontext, nicht aus dem Client-Body). */
  behoerde: string;
  /** Optionales Verfahrens-Template; ohne Angabe `defaultBescheidTemplate`. */
  template?: BescheidTemplate;
}

const A4: readonly [number, number] = [595.28, 841.89];
const MARGIN = 56; // ~2 cm
const PRODUCER = "Fachverfahren-Template Bescheid-Renderer";

const FRIST_EINHEIT: Record<string, string> = {
  monat: "Monat(en)",
  woche: "Woche(n)",
  tag: "Tag(en)",
};

/** ISO → deutsches Datum (TT.MM.JJJJ); ungültiger Wert → Rohwert. */
function formatDatum(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const tag = String(date.getUTCDate()).padStart(2, "0");
  const monat = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${tag}.${monat}.${date.getUTCFullYear()}`;
}

/** Eine (frozen) Rechenposition, wie der Kit-`Berechnung`-Typ sie im Tenor mitführt — defensiv getippt
 *  (der Tenor ist server-opak, deshalb alles `unknown`). */
interface TenorPosition {
  label?: unknown;
  betrag?: unknown;
  norm?: unknown;
}

/** Die well-known Felder des Kit-`Berechnung`-Ergebnisses, wie sie im eingefrorenen Tenor liegen. Die GENERISCHE
 *  Naht zwischen Subsumtion (CHOS füllt `berechne`) und Bescheid: der Renderer liest NUR diese Vertrags-Schlüssel
 *  aus dem opaken Tenor — kein Domänen-Literal. */
interface TenorBerechnung {
  betrag: number;
  einheit: string;
  label?: string;
  begruendung?: string;
  begruendungRecht?: string;
  positionen: TenorPosition[];
}

/** Liest — rein defensiv — die `Berechnung`-Vertragsfelder aus dem opaken, eingefrorenen Tenor. Gibt `undefined`
 *  zurück, wenn der Tenor NICHT Berechnungs-förmig ist (numerischer `betrag` + `einheit`-String) — dann greift die
 *  generische key:value-Darstellung (Rückwärtskompatibilität für frei-formige Tenöre). */
function berechnungAusTenor(
  tenor: VerwaltungsaktDto["tenor"],
): TenorBerechnung | undefined {
  if (!tenor || typeof tenor !== "object") return undefined;
  const t = tenor as Record<string, unknown>;
  if (typeof t["betrag"] !== "number" || typeof t["einheit"] !== "string")
    return undefined;
  const positionen = Array.isArray(t["positionen"])
    ? (t["positionen"] as TenorPosition[])
    : [];
  return {
    betrag: t["betrag"],
    einheit: t["einheit"],
    ...(typeof t["label"] === "string" ? { label: t["label"] } : {}),
    ...(typeof t["begruendung"] === "string"
      ? { begruendung: t["begruendung"] }
      : {}),
    ...(typeof t["begruendungRecht"] === "string"
      ? { begruendungRecht: t["begruendungRecht"] }
      : {}),
    positionen,
  };
}

/** Eine Rechenposition als lesbare Zeile: „Label: Betrag (Norm)" — die Norm nur, wenn belegt. */
function positionZeile(p: TenorPosition): string | undefined {
  const label = typeof p.label === "string" ? p.label : undefined;
  const betrag =
    typeof p.betrag === "number" || typeof p.betrag === "string"
      ? String(p.betrag)
      : undefined;
  if (!label && betrag === undefined) return undefined;
  const norm = typeof p.norm === "string" && p.norm ? ` (${p.norm})` : "";
  return `${label ?? "Position"}: ${betrag ?? "—"}${norm}`;
}

/** Ein Tenor-Eintrag als lesbare Zeile. Ist der Tenor Berechnungs-förmig, wird der FESTGESETZTE Betrag sauber als
 *  „Label: Betrag Einheit" gezeigt (statt jedes interne Berechnungs-Feld zu dumpen); sonst opake key:value-Zeilen
 *  (frei-formiger Tenor, kompakt als JSON für Nicht-Skalare). */
function tenorZeilen(tenor: VerwaltungsaktDto["tenor"]): string[] {
  if (!tenor) return ["(kein Tenor eingefroren)"];
  const berechnung = berechnungAusTenor(tenor);
  if (berechnung) {
    const kopf = `${berechnung.label ?? "Festgesetzter Betrag"}: ${berechnung.betrag} ${berechnung.einheit}`;
    // Mehrposten-Aufschlüsselung nur zeigen, wenn sie über den Gesamtbetrag hinausgeht (≥ 2 Positionen).
    const posten =
      berechnung.positionen.length >= 2
        ? berechnung.positionen
            .map(positionZeile)
            .filter((z): z is string => z !== undefined)
        : [];
    return [kopf, ...posten];
  }
  const entries = Object.entries(tenor);
  if (entries.length === 0) return ["(kein Tenor eingefroren)"];
  return entries.map(([key, value]) => {
    const dargestellt =
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
    return `${key}: ${dargestellt}`;
  });
}

/** Zerlegt einen Absatz an Wortgrenzen in Zeilen, die in `maxWidth` (Punkt) passen. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * Rendert den Bescheid template-getrieben und liefert die PDF-Bytes. Deterministisch bezüglich Inhalt:
 * gleiche VA-Bytes + gleiches Template → gleiche sichtbare Seiten + gleicher eingebetteter Hash
 * (Zeitstempel aus `issuedAt`, nicht aus der Uhr).
 */
export async function renderBescheidPdf(
  input: BescheidPdfInput,
): Promise<Uint8Array> {
  const { va, behoerde } = input;
  const template = input.template ?? defaultBescheidTemplate;
  const doc = await PDFDocument.create();
  // Eingebettete DejaVu-Schrift (subset) → selbsttragendes, langzeit-stabiles Dokument (kein Standard-14).
  doc.registerFontkit(fontkit);
  const dejaVu = ladeDejaVu();
  const font = await doc.embedFont(dejaVu.regular, { subset: true });
  const bold = await doc.embedFont(dejaVu.bold, { subset: true });

  // Selbstbeschreibende Metadaten: der Hash liegt in den Keywords → das Dokument trägt sein Beweis-Token.
  const erlassDatum = new Date(va.issuedAt);
  const issued = Number.isNaN(erlassDatum.getTime()) ? undefined : erlassDatum;
  doc.setTitle(`Bescheid ${va.aktenzeichen}`);
  doc.setAuthor(behoerde);
  doc.setSubject(`Verwaltungsakt ${va.aktenzeichen} — Bekanntgabe`);
  doc.setKeywords([
    `aktenzeichen:${va.aktenzeichen}`,
    `sha256:${va.checksumSha256}`,
    `tenorHerkunft:${va.tenorHerkunft}`,
  ]);
  doc.setProducer(PRODUCER);
  doc.setCreator(behoerde);
  if (issued) {
    doc.setCreationDate(issued);
    doc.setModificationDate(issued);
  }

  const contentWidth = A4[0] - 2 * MARGIN;
  let currentPage: PDFPage = doc.addPage([A4[0], A4[1]]);
  let y = A4[1] - MARGIN;

  const write = (
    text: string,
    opts: {
      size?: number;
      font?: PDFFont;
      gap?: number;
      color?: ReturnType<typeof rgb>;
    } = {},
  ): void => {
    const size = opts.size ?? 11;
    const useFont = opts.font ?? font;
    for (const line of wrap(text, useFont, size, contentWidth)) {
      if (y < MARGIN + 24) {
        currentPage = doc.addPage([A4[0], A4[1]]);
        y = A4[1] - MARGIN;
      }
      currentPage.drawText(line, {
        x: MARGIN,
        y,
        size,
        font: useFont,
        color: opts.color ?? rgb(0.1, 0.1, 0.1),
      });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  const grau = rgb(0.4, 0.4, 0.4);

  for (const sektion of template.sektionen) {
    switch (sektion.kind) {
      case "kopf":
        write(behoerde, { size: 13, font: bold, gap: 2 });
        write(template.titel, { size: 18, font: bold, gap: 6 });
        write(`Aktenzeichen: ${va.aktenzeichen}`);
        write(`Erlassen am: ${formatDatum(va.issuedAt)}`);
        write(`Festgesetzt durch: ${va.issuedBy}`, { gap: 10 });
        break;
      case "tenor": {
        write(sektion.ueberschrift ?? "Verfügungssatz (Tenor)", {
          size: 13,
          font: bold,
          gap: 2,
        });
        for (const zeile of tenorZeilen(va.tenor)) write(zeile);
        write(`Herkunft des Tenor: ${va.tenorHerkunft}`, {
          size: 9,
          color: grau,
          gap: 12,
        });
        break;
      }
      case "begruendung": {
        // DETERMINISTISCHE Subsumtions-Herleitung aus dem eingefrorenen Berechnungs-Tenor (CHOS füllt `berechne`).
        const berechnung = berechnungAusTenor(va.tenor);
        if (!berechnung) break; // kein Berechnungs-förmiger Tenor → keine Herleitung (sauberer Degrade)
        const text = berechnung.begruendungRecht ?? berechnung.begruendung;
        const postenZeilen =
          berechnung.positionen.length >= 2
            ? berechnung.positionen
                .map(positionZeile)
                .filter((z): z is string => z !== undefined)
            : [];
        // Wenn WEDER eine Begründung NOCH mehr als eine §-belegte Position vorliegt, ist nichts herzuleiten.
        const belegtePosten = berechnung.positionen.some(
          (p) => typeof p.norm === "string" && p.norm,
        );
        if (!text && !belegtePosten) break;
        write(sektion.ueberschrift ?? "Begründung", {
          size: 13,
          font: bold,
          gap: 2,
        });
        if (text) write(text, { gap: 4 });
        for (const zeile of postenZeilen)
          write(zeile, { size: 9, color: grau });
        y -= 8;
        break;
      }
      case "freitext":
        if (sektion.ueberschrift)
          write(sektion.ueberschrift, { size: 13, font: bold, gap: 2 });
        for (const absatz of sektion.absaetze) write(absatz, { gap: 4 });
        y -= 8;
        break;
      case "bekanntgabe":
        write(sektion.ueberschrift ?? "Bekanntgabe", {
          size: 13,
          font: bold,
          gap: 2,
        });
        write(
          `Die Bekanntgabe gilt am ${va.fiktionTage}. Tag nach der Aufgabe zur Post als bewirkt (${va.fiktionNorm}).`,
          { gap: 12 },
        );
        break;
      case "rechtsbehelf": {
        write(sektion.ueberschrift ?? "Rechtsbehelfsbelehrung", {
          size: 13,
          font: bold,
          gap: 2,
        });
        const rb = va.rechtsbehelf;
        const einheit = FRIST_EINHEIT[rb.fristEinheit] ?? rb.fristEinheit;
        write(
          `Gegen diesen Bescheid kann innerhalb von ${rb.fristWert} ${einheit} nach Bekanntgabe ${rb.art} ` +
            `bei ${rb.stelle} erhoben werden (${rb.norm}).`,
          { gap: 16 },
        );
        break;
      }
      case "integritaet":
        write(
          sektion.ueberschrift ?? "Integritätsnachweis (fälschungssicher)",
          {
            size: 10,
            font: bold,
            gap: 2,
          },
        );
        write(
          "Dieser Bescheid ist über die kanonischen Bytes des eingefrorenen Verwaltungsakts durch einen " +
            "SHA-256-Hash gesichert. Jede nachträgliche Änderung verändert den Hash.",
          { size: 8, color: grau },
        );
        write(`SHA-256: ${va.checksumSha256}`, {
          size: 8,
          font: bold,
          color: rgb(0.2, 0.2, 0.2),
        });
        break;
    }
  }

  return doc.save();
}
