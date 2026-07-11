// fachverfahren-kit/lib/antrag-felder — die EINE, testbare Wahrheit über die WERTE eines geführten Antrags.
//
// Pur (kein React/DOM): Pfad-Zugriff, TYPISIERUNG je FeldTyp (String / Zahl / Boolean / Datei), Auflösung der
// Auswahl-Optionen (inline ODER data-driven aus `config.datenlisten`), Feld-Validierung und Anzeige-Aufbereitung.
// Der `AntragStepper` RENDERT nur und delegiert jede fachliche Entscheidung hierher — so ist die Subsumtion
// deterministisch prüfbar (und die Klasse „getippte Zahl kommt als String an, `switch` matcht nie" strukturell
// ausgeschlossen).
import type { Codeliste, FeldDef, FeldOption, StepDef } from "../types.js";

export type Antragsdaten = Record<string, unknown>;
// `FeldOption` ist EINE Wahrheit in ../types (schlank value/label + optionale M1-Codelisten-Signale
// markierung/merkmale) — hier re-exportiert, damit bestehende Importe aus `lib/antrag-felder` gültig bleiben.
export type { FeldOption };
/** Benannte Auswahl-Listen: die schlanke `datenliste` (nur value/label) UND die geerdete `codeliste` (mit
 *  Provenienz) teilen sich EINE Auflösung über `FeldDef.optionsRef`. */
export type Datenlisten = Record<string, FeldOption[]>;
export type Codelisten = Record<string, Codeliste>;
/** Datei-Metadaten eines `file`-Felds — der echte Inhalt wandert in PROD über den Port. */
export type DateiWert = { name: string; groesse: number };

// ── Pfad-Zugriff auf das verschachtelte Antragsdaten-Objekt über "a.b.c"- UND "a[0].b"-Feldpfade ───────────────
// WURZEL-FIX (Live-Audit): Feldpfade tragen ARRAY-INDIZES der Form "posten[0].wert" — der Antrag erhebt je LISTEN-
// EINTRAG (je Objekt) mehrere Felder. Ein reines split(".") speicherte/las den LITERAL-Key "posten[0]" statt posten[0]
// → a.posten blieb undefined, die Eingabe erreichte die Berechnung nie (immer 0/provisional). parsePath zerlegt jeden
// Pfad in Tokens (String-Key | numerischer Index), sodass get/set Objekte UND Arrays korrekt traversieren + aufbauen.
type PathToken = string | number;
/** Zerlegt "posten[0].wert" → ["posten", 0, "wert"]; "a.b" → ["a","b"]; "x[1][2]" → ["x",1,2]. Rein, testbar. */
export function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  for (const seg of path.split(".")) {
    const m = seg.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      tokens.push(seg);
      continue;
    } // untypisches Segment → als Literal-Key (rückwärtskompatibel)
    if (m[1]) tokens.push(m[1]);
    for (const idx of m[2].match(/\d+/g) ?? []) tokens.push(Number(idx));
  }
  return tokens;
}

/** Liest einen Wert aus dem verschachtelten Objekt/Array anhand des Feldpfads (z. B. "posten[0].wert"). `obj` ist
 *  `unknown` (nicht nur `Antragsdaten`), damit die EINE Wahrheit auch die SB-Sichten (VorgangDetail/Arbeitsvorrat/
 *  ReviewWorkspace) bedient, die generische `T`-Antragsdaten halten — die Traversierung guarded jeden Nicht-Objekt-Knoten. */
export function getPath(obj: unknown, path: string): unknown {
  return parsePath(path).reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    if (typeof key === "number")
      return Array.isArray(acc) ? (acc as unknown[])[key] : undefined;
    return (acc as Antragsdaten)[key];
  }, obj);
}

/** Setzt einen Wert im verschachtelten Objekt/Array (immutabel) anhand des Feldpfads — legt Zwischen-Knoten je
 *  Token-Typ an (numerischer Token → Array, String-Token → Objekt). */
export function setPath(
  obj: Antragsdaten,
  path: string,
  value: unknown,
): Antragsdaten {
  const tokens = parsePath(path);
  if (tokens.length === 0) return obj;
  const setAt = (node: unknown, i: number): unknown => {
    const key = tokens[i];
    const last = i === tokens.length - 1;
    if (typeof key === "number") {
      const arr = Array.isArray(node) ? [...(node as unknown[])] : [];
      arr[key] = last ? value : setAt(arr[key], i + 1);
      return arr;
    }
    const base: Antragsdaten =
      node && typeof node === "object" && !Array.isArray(node)
        ? { ...(node as Antragsdaten) }
        : {};
    base[key] = last ? value : setAt(base[key], i + 1);
    return base;
  };
  return setAt(obj, 0) as Antragsdaten;
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

// ── Auswahl-Optionen auflösen: inline (`options`) ODER data-driven (`optionsRef` → datenlisten|codelisten) ──
/** Projiziert eine geerdete `Codeliste` auf schlanke Auswahl-Optionen (value/label) — die Provenienz
 *  (`normRef`/`belege`) bleibt in der Codeliste und wird vom Interpreter genutzt, nicht im Selektor. */
export function codelisteOptionen(codeliste: Codeliste): FeldOption[] {
  return codeliste.eintraege.map((e) => ({
    value: e.value,
    label: e.label,
    // M1 — Markierung/Merkmale durchreichen (der Selektor rendert das Badge/die Farbe; die volle Provenienz
    // — normRef/belege/ableitungen — bleibt in der Codeliste beim Interpreter). Nur setzen, wenn vorhanden.
    ...(e.markierung ? { markierung: e.markierung } : {}),
    ...(e.merkmale ? { merkmale: e.merkmale } : {}),
  }));
}

/** Die effektiven Optionen eines Felds: inline (`options`) hat Vorrang, sonst die über `optionsRef` referenzierte
 *  Liste — zuerst aus `datenlisten`, dann aus `codelisten` (eine Auflösung für beide Listen-Arten). */
export function feldOptionen(
  feld: FeldDef,
  datenlisten?: Datenlisten | undefined,
  codelisten?: Codelisten | undefined,
): FeldOption[] | undefined {
  if (feld.options) return feld.options;
  if (!feld.optionsRef) return undefined;
  const ausDaten = datenlisten?.[feld.optionsRef];
  if (ausDaten) return ausDaten;
  const codeliste = codelisten?.[feld.optionsRef];
  return codeliste ? codelisteOptionen(codeliste) : undefined;
}

/** Materialisiert die Optionen eines Felds (aus `optionsRef`) in `options`, damit ALLE nachgelagerten
 *  Funktionen (Rendering, Typisierung, Anzeige) nur noch `feld.options` lesen — eine Wahrheit. */
export function resolveFeld(
  feld: FeldDef,
  datenlisten?: Datenlisten | undefined,
  codelisten?: Codelisten | undefined,
): FeldDef {
  if (feld.options) return feld; // inline: nichts zu tun
  const opts = feldOptionen(feld, datenlisten, codelisten);
  return opts ? { ...feld, options: opts } : feld;
}

/** Wendet `resolveFeld` auf alle Felder aller Schritte an (Options-Referenzen einmalig materialisieren). */
export function resolveSteps(
  steps: StepDef[],
  datenlisten?: Datenlisten | undefined,
  codelisten?: Codelisten | undefined,
): StepDef[] {
  return steps.map((step) => ({
    ...step,
    felder: step.felder.map((feld) =>
      resolveFeld(feld, datenlisten, codelisten),
    ),
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

/** Ist das Feld sachlich BEANTWORTET? (checkbox → angehakt, ja-nein → Ja/Nein gewählt, file → Datei vorhanden,
 *  sonst → nicht-leerer Wert). Die presence-Wahrheit hinter Pflicht-Prüfungen — auch für bedingte Pflicht-Regeln
 *  („required-wenn") im Interpreter, damit „Pflicht" überall gleich bedeutet. */
export function istBeantwortet(feld: FeldDef, wert: unknown): boolean {
  if (feld.typ === "checkbox") return wert === true;
  if (feld.typ === "ja-nein") return typeof wert === "boolean";
  if (feld.typ === "file") return istDateiWert(wert);
  return asString(wert).trim().length > 0;
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
  } else {
    // OHNE explizites `pattern`: intrinsische Formatprüfung je Feldtyp, damit ein nicht-leeres PFLICHT-Feld auch
    // WOHLGEFORMT sein muss — sonst passierte z. B. „12" als PLZ oder „keinemail" den Schritt und würde abgesendet
    // (`required` prüft nur „nicht leer"). Ein explizites `feld.pattern` (oben) überschreibt diese Defaults.
    if (feld.typ === "plz" && !/^\d{5}$/.test(s))
      return "Bitte eine gültige Postleitzahl (5 Ziffern) eingeben.";
    if (feld.typ === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
      return "Bitte eine gültige E-Mail-Adresse eingeben.";
    if (feld.typ === "tel" && !/^[+()/\d\s-]{3,}$/.test(s))
      return "Bitte eine gültige Telefonnummer eingeben.";
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

// ── M2: Amts-/Bürger-/Leichte-Sprache-Projektion je Feld ─────────────────────────────────────────
/** Optionen der Sprach-Projektion: `leicht` = Leichte-Sprache-Modus aktiv (nutzt `leichteSprache`/`hintEinfach`,
 *  falls vorhanden). Additiv — ohne die neuen Felder liefert alles die bisherige Bürger-Sicht (`label`/`hint`). */
export interface SprachProjektion {
  leicht?: boolean | undefined;
}

/** Das anzuzeigende FELD-LABEL für den/die Bürger:in — im Leichte-Sprache-Modus die `leichteSprache`-Fassung
 *  (falls gesetzt), sonst das reguläre `label`. NIE die Amts-/Fachbezeichnung (die ist die Sachbearbeiter-Sicht). */
export function feldLabel(feld: FeldDef, opts?: SprachProjektion): string {
  if (opts?.leicht && feld.leichteSprache) return feld.leichteSprache;
  return feld.label;
}

/** Der anzuzeigende HILFETEXT — im Leichte-Sprache-Modus `hintEinfach` (falls gesetzt), sonst `hint`. */
export function feldHint(
  feld: FeldDef,
  opts?: SprachProjektion,
): string | undefined {
  if (opts?.leicht && feld.hintEinfach) return feld.hintEinfach;
  return feld.hint;
}

/** Die AMTS-/FACHBEZEICHNUNG (Sachbearbeiter-/Detailsicht) — `labelFachlich`, falls gesetzt, sonst `undefined`
 *  (der Kit blendet sie nur ein, wenn vorhanden UND die fachliche Sicht angefordert ist). */
export function feldLabelFachlich(feld: FeldDef): string | undefined {
  return feld.labelFachlich;
}
