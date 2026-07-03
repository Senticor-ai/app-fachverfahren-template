// fachverfahren-kit/lib/nachweis-pruefung — die EINE, testbare Wahrheit über die ANNAHME-REGELN eines Nachweis-Uploads.
//
// Pur (kein React/DOM): leitet aus den DATEN-getriebenen Einschränkungen eines `Nachweis` (erlaubte Typen, maximale
// Größe) das native `accept`-Attribut, einen menschenlesbaren Einschränkungs-Text und eine deterministische
// FAIL-FAST-Vorprüfung einer gewählten Datei ab. WICHTIG: Diese Prüfung ist NIE autoritativ — sie gibt der
// Bürger:in nur eine sofortige, freundliche Rückmeldung, BEVOR die Datei über den Port an den Server geht. Der
// Server prüft Format/Größe/Virenscan verbindlich (server-autoritativ, siehe `NachweisUploadStatus` in DateiUpload).
// Alle Grenzwerte kommen als DATEN aus dem Verfahren/der Config — der Kit trägt KEINE Domänen-Literale.
import type { Nachweis } from "../types.js";
import { formatDateiGroesse } from "../format.js";

/** Grund-Kategorie einer Ablehnung (steuert Icon/Wording; der Klartext steht in der `meldung`). Kanonisch HIER
 *  definiert, damit die reine Vorprüfung UND die server-autoritative Statusanzeige (DateiUpload) dieselbe
 *  Kategorien-Wahrheit teilen. */
export type NachweisAblehnungsGrund =
  | "format"
  | "groesse"
  | "virus"
  | "sonstiges";

/** Die Metadaten einer zu prüfenden Datei — nur was die reine Prüfung braucht (kein DOM-`File`). Der MIME-`typ`
 *  ist optional, weil manche Browser ihn leer lassen; dann greift die Endungs-Prüfung. */
export interface NachweisDateiMeta {
  name: string;
  groesse: number;
  typ?: string | undefined;
}

/** Das Ergebnis einer verletzten Einschränkung (null ⇒ Datei genügt den DATEN-Regeln bzw. es gibt keine Regeln). */
export interface NachweisPruefFehler {
  grund: NachweisAblehnungsGrund;
  meldung: string;
}

/** Baut das native `accept`-Attribut (kommagetrennt) aus `nachweis.akzeptierteTypen` — steuert im Datei-Dialog die
 *  vorausgewählten Typen. Fehlt die Liste (oder ist leer), gibt es kein `accept` (jeder Typ wählbar). */
export function nachweisAcceptAttribut(nachweis: Nachweis): string | undefined {
  const typen = nachweis.akzeptierteTypen?.map((t) => t.trim()).filter(Boolean);
  return typen && typen.length > 0 ? typen.join(",") : undefined;
}

/** Menschenlesbarer Hinweis auf die geltenden Einschränkungen (z. B. „Erlaubt: PDF, JPG · max. 10 MB"), damit die
 *  Bürger:in die Regeln VOR der Auswahl kennt. Rein aus DATEN; gibt `undefined`, wenn keine Einschränkung gesetzt ist. */
export function nachweisEinschraenkungenText(
  nachweis: Nachweis,
): string | undefined {
  const teile: string[] = [];
  const typen = nachweis.akzeptierteTypen?.map((t) => t.trim()).filter(Boolean);
  if (typen && typen.length > 0) {
    teile.push(`Erlaubt: ${typen.map(typLabel).join(", ")}`);
  }
  if (
    typeof nachweis.maxGroesseBytes === "number" &&
    nachweis.maxGroesseBytes > 0
  ) {
    teile.push(`max. ${formatDateiGroesse(nachweis.maxGroesseBytes)}`);
  }
  return teile.length > 0 ? teile.join(" · ") : undefined;
}

/** Kurz-Label für einen accept-Token in der Anzeige: „application/pdf" → „PDF", „image/*" → „Bilder", „.pdf" → „PDF". */
function typLabel(token: string): string {
  const t = token.toLowerCase();
  if (t === "image/*") return "Bilder";
  if (t === "application/pdf" || t === ".pdf") return "PDF";
  if (t.startsWith(".")) return t.slice(1).toUpperCase();
  const sub = t.split("/")[1];
  if (!sub || sub === "*") {
    const haupt = t.split("/")[0];
    return haupt ? haupt.toUpperCase() : token;
  }
  // "image/png" → "PNG", "application/vnd.…" → letzter sinnvoller Teil groß
  const kern = sub.split(/[.+]/).pop() ?? sub;
  return kern.toUpperCase();
}

/** Passt der MIME-Typ / die Endung der Datei zu EINEM accept-Token? (Standard-`accept`-Semantik). */
function tokenTrifft(token: string, datei: NachweisDateiMeta): boolean {
  const t = token.trim().toLowerCase();
  if (t === "") return true;
  const mime = (datei.typ ?? "").toLowerCase();
  const name = datei.name.toLowerCase();
  if (t.startsWith(".")) return name.endsWith(t); // Endung
  if (t.endsWith("/*")) return mime.startsWith(t.slice(0, -1)); // "image/*" → "image/"
  return mime !== "" && mime === t; // exakter MIME (nur wenn der Browser einen liefert)
}

/**
 * FAIL-FAST-Vorprüfung einer gewählten Datei gegen die DATEN-Einschränkungen des Nachweises (Typ, Größe).
 * Rein + deterministisch. Gibt den ERSTEN verletzten Grund zurück, sonst `null`. NIE autoritativ: der Server
 * bleibt die verbindliche Instanz (Format/Größe/Virenscan) — diese Funktion verhindert nur den offensichtlich
 * aussichtslosen Upload und erklärt der Nutzer:in sofort, warum.
 */
export function pruefeNachweisDatei(
  nachweis: Nachweis,
  datei: NachweisDateiMeta,
): NachweisPruefFehler | null {
  const typen = nachweis.akzeptierteTypen?.map((t) => t.trim()).filter(Boolean);
  if (typen && typen.length > 0 && !typen.some((t) => tokenTrifft(t, datei))) {
    return {
      grund: "format",
      meldung: `Dieses Dateiformat ist nicht zulässig. Erlaubt: ${typen
        .map(typLabel)
        .join(", ")}.`,
    };
  }
  const max = nachweis.maxGroesseBytes;
  if (typeof max === "number" && max > 0 && datei.groesse > max) {
    return {
      grund: "groesse",
      meldung: `Die Datei ist zu groß (${formatDateiGroesse(
        datei.groesse,
      )}). Zulässig sind höchstens ${formatDateiGroesse(max)}.`,
    };
  }
  return null;
}
