// public-sector-sdk/rules — die EINE, browser-neutrale Wahrheit über data-driven BEDINGUNGEN.
//
// Warum im SDK (Domain-Kern) und nicht im Kit (Browser-UI): dieselbe reine Bedingungs-Auswertung wird an ZWEI
// Stellen gebraucht — im Client (Antrags-UX: bedingte Pflichtfelder, Tarif-Staffeln) UND server-autoritativ im
// Fall-Motor (`transitionCase`-Guard gegen `case.data`). Der Kit ist ein Browser-Paket, das der Server nicht
// importieren darf; das SDK ist browser-neutral (0 node:/DOM). Also lebt der Kernel HIER, der Kit re-exportiert
// ihn an seinen bisherigen Pfaden (Client bitidentisch), und der Server nutzt ihn direkt.
//
// REIN: kein React/DOM/node/Date/Random — deterministisch aus den übergebenen Daten.

/** Vergleichsoperator einer Feld-Bedingung. `gesetzt`/`nicht-gesetzt` prüfen nur Anwesenheit (ohne `wert`). */
export type BedingungOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "nicht-in"
  | "gesetzt"
  | "nicht-gesetzt";

/** Prädikat über EIN Feld (Feldpfad wie "a.b" oder "posten[0].wert"). Tolerant ausgewertet (Zahl/String/Boolean-
 *  Koerzierung), sodass die Subsumtion — z. B. Schwelle `>= 3` — auch bei string-getippten Eingaben greift. */
export interface FeldBedingung {
  feld: string;
  op: BedingungOperator;
  /** Vergleichswert (bei `in`/`nicht-in` eine Menge); entfällt bei `gesetzt`/`nicht-gesetzt`. */
  wert?: string | number | boolean | (string | number)[];
}

/** Boolesche Verknüpfung von Bedingungen (rekursiv). Genau EINE Kombinator-Angabe je Gruppe. */
export interface BedingungGruppe {
  /** UND — alle Teil-Bedingungen müssen erfüllt sein. */
  alle?: Bedingung[];
  /** ODER — mindestens eine Teil-Bedingung muss erfüllt sein. */
  eine?: Bedingung[];
  /** NICHT — die Teil-Bedingung muss NICHT erfüllt sein. */
  nicht?: Bedingung;
}

/** Generische, verfahrensfreie Bedingung — Blatt (`FeldBedingung`) oder Gruppe. */
export type Bedingung = FeldBedingung | BedingungGruppe;

/** Datei-Metadaten eines `file`-Felds (der echte Inhalt wandert in PROD über einen Port). */
export type DateiWert = { name: string; groesse: number };

// ── Pfad-Zugriff (verschachtelte Objekte/Arrays über "a.b.c"- UND "a[0].b"-Feldpfade) ────────────────────────
type PathToken = string | number;

/** Zerlegt "posten[0].wert" → ["posten", 0, "wert"]; "a.b" → ["a","b"]; "x[1][2]" → ["x",1,2]. Rein, testbar. */
export function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  for (const seg of path.split(".")) {
    const m = seg.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      tokens.push(seg);
      continue;
    }
    if (m[1]) tokens.push(m[1]);
    for (const idx of (m[2] ?? "").match(/\d+/g) ?? [])
      tokens.push(Number(idx));
  }
  return tokens;
}

/** Liest einen Wert aus dem verschachtelten Objekt/Array anhand des Feldpfads (z. B. "posten[0].wert"). */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  return parsePath(path).reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    if (typeof key === "number")
      return Array.isArray(acc) ? (acc as unknown[])[key] : undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
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

/** Feldwert als String — undefined/null → "", boolean → "true"/"false", Datei-Wert → Dateiname, sonstige
 *  Objekte → "" (nie "[object Object]"). */
export function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return istDateiWert(v) ? v.name : "";
  return String(v);
}

// ── Bedingungs-Auswertung ────────────────────────────────────────────────────────────────────────────────────

/**
 * Wertet eine Bedingung gegen einen frei-formigen Datenkontext aus (Antragsdaten ODER `case.data`). Eine fehlende
 * Bedingung ist neutral erfüllt (`true`). Rein, deterministisch.
 *
 * WICHTIG zur SEMANTIK, wenn als Fall-Guard genutzt: der Datenkontext (`case.data`) ist client-geliefert und
 * server-seitig NICHT als Faktum validiert. Ein Guard erzwingt damit WORKFLOW-KONSISTENZ über die DEKLARIERTE
 * Datenlage — er ist KEINE Autorisierungs-/Betrugsschranke. Echte Server-Autorität bräuchte guard-relevante
 * Werte aus verifizierten Quellen (Register-Abruf, geprüfter Nachweis, Task-Ergebnis).
 */
export function evalBedingung(
  bedingung: Bedingung | undefined,
  daten: Record<string, unknown>,
): boolean {
  if (!bedingung) return true;
  if (istFeldBedingung(bedingung)) return evalFeldBedingung(bedingung, daten);
  // BedingungGruppe: genau EIN Kombinator; leere Gruppe ist neutral erfüllt.
  if (bedingung.alle)
    return bedingung.alle.every((c) => evalBedingung(c, daten));
  if (bedingung.eine)
    return bedingung.eine.some((c) => evalBedingung(c, daten));
  if (bedingung.nicht) return !evalBedingung(bedingung.nicht, daten);
  return true;
}

function istFeldBedingung(b: Bedingung): b is FeldBedingung {
  return "feld" in b && "op" in b;
}

function evalFeldBedingung(
  b: FeldBedingung,
  daten: Record<string, unknown>,
): boolean {
  const wert = getPath(daten, b.feld);
  switch (b.op) {
    case "gesetzt":
      return asString(wert).trim().length > 0;
    case "nicht-gesetzt":
      return asString(wert).trim().length === 0;
    case "==":
      return gleich(wert, b.wert);
    case "!=":
      return !gleich(wert, b.wert);
    case ">":
      return zahlVergleich(wert, b.wert, (a, c) => a > c);
    case ">=":
      return zahlVergleich(wert, b.wert, (a, c) => a >= c);
    case "<":
      return zahlVergleich(wert, b.wert, (a, c) => a < c);
    case "<=":
      return zahlVergleich(wert, b.wert, (a, c) => a <= c);
    case "in":
      return alsMenge(b.wert).some((z) => gleich(wert, z));
    case "nicht-in":
      return !alsMenge(b.wert).some((z) => gleich(wert, z));
    default:
      return false;
  }
}

function alsMenge(wert: FeldBedingung["wert"]): (string | number | boolean)[] {
  return Array.isArray(wert) ? wert : wert === undefined ? [] : [wert];
}

/** Gleichheit typ-tolerant: Boolean gegen Boolean, sonst numerisch wenn beide zu Zahlen werden, sonst String.
 *  Exportiert, weil auch die Tarif-Staffel-Auswertung (Kit-Interpreter) dieselbe Koerzierung braucht — EINE Wahrheit. */
export function gleich(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    return alsBool(a) === alsBool(b);
  }
  const na = alsZahl(a);
  const nb = alsZahl(b);
  if (na !== undefined && nb !== undefined) return na === nb;
  return asString(a) === asString(b);
}

function zahlVergleich(
  wert: unknown,
  ziel: unknown,
  cmp: (a: number, c: number) => boolean,
): boolean {
  const a = alsZahl(wert);
  const c = alsZahl(ziel);
  if (a === undefined || c === undefined) return false;
  return cmp(a, c);
}

/** Wert → Zahl oder `undefined` (leerer String / NaN / null zählen NICHT als Zahl). Toleriert de-DE-Dezimalkomma.
 *  Exportiert (geteilte Koerzierung, s. `gleich`). */
export function alsZahl(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  if (typeof v === "boolean" || v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (s === "") return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

function alsBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return v === "true" || v === "ja" || v === 1 || v === "1";
}
