// fachverfahren-kit/lib/antrag-felder — die EINE, testbare Wahrheit über die WERTE eines geführten Antrags.
//
// Pur (kein React/DOM): Pfad-Zugriff, TYPISIERUNG je FeldTyp (String / Zahl / Boolean / Datei), Auflösung der
// Auswahl-Optionen (inline ODER data-driven aus `config.datenlisten`), Feld-Validierung und Anzeige-Aufbereitung.
// Der `AntragStepper` RENDERT nur und delegiert jede fachliche Entscheidung hierher — so ist die Subsumtion
// deterministisch prüfbar (und die Klasse „getippte Zahl kommt als String an, `switch` matcht nie" strukturell
// ausgeschlossen).
import type { FeldDef, StepDef } from "../types.js";

export type Antragsdaten = Record<string, unknown>;
export type FeldOption = { value: string; label: string };
/** Datei-Metadaten eines `file`-Felds — der echte Inhalt wandert in PROD über den Port. */
export type DateiWert = { name: string; groesse: number };

// ── Pfad-Zugriff auf das verschachtelte Antragsdaten-Objekt über "a.b.c"-Feldpfade ───────────────
/** Liest einen Wert aus dem verschachtelten Objekt anhand des Feldpfads (z. B. "person.nachname"). */
export function getPath(obj: Antragsdaten, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Antragsdaten)[key];
    return undefined;
  }, obj);
}

/** Setzt einen Wert im verschachtelten Objekt (immutabel) anhand des Feldpfads. */
export function setPath(
  obj: Antragsdaten,
  path: string,
  value: unknown,
): Antragsdaten {
  const keys = path.split(".");
  const [head, ...rest] = keys;
  if (head === undefined) return obj;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const childObj =
    child && typeof child === "object" ? (child as Antragsdaten) : {};
  return { ...obj, [head]: setPath(childObj, rest.join("."), value) };
}

/** Feldwert als String (für Text-Inputs/Validierung) — undefined/null → "", boolean → "true"/"false",
 *  Datei-Wert → Dateiname, sonstige Objekte → "" (nie "[object Object]"). */
export function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return istDateiWert(v) ? v.name : "";
  return String(v);
}

/** Type-Guard: ist der Wert ein Datei-Wert ({ name, groesse })? */
export function istDateiWert(v: unknown): v is DateiWert {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as { name?: unknown }).name === "string" &&
    typeof (v as { groesse?: unknown }).groesse === "number"
  );
}

// ── Auswahl-Optionen auflösen: inline (`options`) ODER data-driven (`optionsRef` → config.datenlisten) ──
/** Die effektiven Optionen eines Felds: inline hat Vorrang, sonst die referenzierte Datenliste. */
export function feldOptionen(
  feld: FeldDef,
  datenlisten?: Record<string, FeldOption[]> | undefined,
): FeldOption[] | undefined {
  if (feld.options) return feld.options;
  if (feld.optionsRef) return datenlisten?.[feld.optionsRef];
  return undefined;
}

/** Materialisiert die Optionen eines Felds (aus `optionsRef`) in `options`, damit ALLE nachgelagerten
 *  Funktionen (Rendering, Typisierung, Anzeige) nur noch `feld.options` lesen — eine Wahrheit. */
export function resolveFeld(
  feld: FeldDef,
  datenlisten?: Record<string, FeldOption[]> | undefined,
): FeldDef {
  if (feld.options) return feld; // inline: nichts zu tun
  const opts = feldOptionen(feld, datenlisten);
  return opts ? { ...feld, options: opts } : feld;
}

/** Wendet `resolveFeld` auf alle Felder aller Schritte an (Options-Referenzen einmalig materialisieren). */
export function resolveSteps(
  steps: StepDef[],
  datenlisten?: Record<string, FeldOption[]> | undefined,
): StepDef[] {
  return steps.map((step) => ({
    ...step,
    felder: step.felder.map((feld) => resolveFeld(feld, datenlisten)),
  }));
}

/** Sind ALLE Options-Werte eines Selects numerisch? (dann wird der Wert als Zahl geführt, nicht als String). */
function alleOptionsNumerisch(opts: FeldOption[]): boolean {
  return (
    opts.length > 0 &&
    opts.every((o) => o.value.trim() !== "" && !Number.isNaN(Number(o.value)))
  );
}

/** TYPISIERT einen rohen (DOM-)Feldwert gemäß `feld.typ` — GENERISCH je FeldTyp, damit die fachliche Subsumtion
 *  (numerische Vergleiche/Staffeln `=== 1`, boolesche Tatbestände) deterministisch greift statt an `"1" === 1`
 *  (false) zu scheitern. Erwartet ein bereits mit `resolveFeld` aufgelöstes Feld (für die Numerisch-Erkennung von
 *  Selects). Leere/unbeantwortete Werte bleiben `undefined`. */
export function typisiereFeldwert(feld: FeldDef, roh: unknown): unknown {
  switch (feld.typ) {
    case "number": {
      if (typeof roh === "number") return roh;
      if (typeof roh !== "string") return roh;
      const s = roh.trim();
      if (s === "") return undefined;
      const n = Number(s.replace(",", ".")); // de-DE-Dezimalkomma tolerieren
      return Number.isNaN(n) ? roh : n;
    }
    case "ja-nein":
    case "checkbox": {
      if (typeof roh === "boolean") return roh;
      if (roh === "true" || roh === "ja") return true;
      if (roh === "false" || roh === "nein") return false;
      return roh; // undefined/unbeantwortet bleibt unbeantwortet
    }
    case "select": {
      if (typeof roh !== "string" || roh === "") return roh;
      return alleOptionsNumerisch(feld.options ?? []) ? Number(roh) : roh;
    }
    default:
      return roh; // text/plz/date/tel/email/textarea/file → unverändert
  }
}

/** TYPISIERT ALLE Feldwerte der Antragsdaten (an der EINEN Naht, bevor `daten` in die fachliche Logik — `berechne`
 *  oder `einreichen` — übergeben werden). Erwartet aufgelöste Schritte. Rein additiv/immutabel. */
export function typisiereAntragsdaten(
  steps: StepDef[],
  daten: Antragsdaten,
): Antragsdaten {
  let out = daten;
  for (const step of steps) {
    for (const feld of step.felder) {
      const roh = getPath(out, feld.name);
      if (roh === undefined) continue;
      const typ = typisiereFeldwert(feld, roh);
      if (typ !== roh) out = setPath(out, feld.name, typ);
    }
  }
  return out;
}

// ── Validierung eines Einzelfelds (required + pattern + min/max, je FeldTyp) ─────────────────────
export function feldFehler(feld: FeldDef, wert: unknown): string | null {
  if (feld.required) {
    if (feld.typ === "checkbox") {
      // Zustimmungs-/Bestätigungs-Semantik: muss angehakt sein (Einwilligung, AGB).
      if (wert !== true) return "Bitte bestätigen.";
    } else if (feld.typ === "ja-nein") {
      // Tatbestand: muss BEANTWORTET sein (Ja ODER Nein) — „Nein" ist eine gültige Pflicht-Antwort.
      if (typeof wert !== "boolean") return "Bitte Ja oder Nein auswählen.";
    } else if (feld.typ === "file") {
      if (!istDateiWert(wert)) return "Bitte eine Datei auswählen.";
    } else if (asString(wert).trim().length === 0) {
      return "Pflichtangabe — bitte ausfüllen.";
    }
  }
  // Boolesche/Datei-Felder haben keine weiteren Format-/Wertprüfungen.
  if (feld.typ === "checkbox" || feld.typ === "ja-nein" || feld.typ === "file")
    return null;

  const s = asString(wert).trim();
  // Leere optionale Felder sind gültig (required ist oben behandelt).
  if (s.length === 0) return null;

  if (feld.pattern) {
    try {
      if (!new RegExp(feld.pattern).test(s))
        return "Eingabe entspricht nicht dem erwarteten Format.";
    } catch {
      // Defekte Pattern dürfen den Antrag nicht blockieren.
    }
  }
  if (feld.typ === "number") {
    const n = Number(s.replace(",", "."));
    if (Number.isNaN(n)) return "Bitte eine Zahl eingeben.";
    if (feld.min !== undefined && n < feld.min)
      return `Mindestens ${feld.min}.`;
    if (feld.max !== undefined && n > feld.max) return `Höchstens ${feld.max}.`;
  }
  return null;
}

/** Ein Schritt ist gültig, wenn keines seiner Felder einen Fehler meldet. */
export function stepGueltig(step: StepDef, daten: Antragsdaten): boolean {
  return step.felder.every(
    (f) => feldFehler(f, getPath(daten, f.name)) === null,
  );
}

/** Feldwert für die Review-Anzeige aufbereiten (Select → Options-Label, Ja/Nein → „Ja"/„Nein", Datei → Name). */
export function feldAnzeige(feld: FeldDef, wert: unknown): string {
  if (feld.typ === "checkbox") return wert === true ? "Ja" : "";
  if (feld.typ === "ja-nein")
    return wert === true ? "Ja" : wert === false ? "Nein" : "";
  if (feld.typ === "file") return istDateiWert(wert) ? wert.name : "";
  const s = asString(wert).trim();
  if (s.length === 0) return "";
  if (feld.typ === "select") {
    return feld.options?.find((o) => o.value === s)?.label ?? s;
  }
  return s;
}
