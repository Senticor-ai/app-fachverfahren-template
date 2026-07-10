// server/automation-eval — die NODE-SAFE Wiederholung der reinen Automations-Auswertung (Trigger + Bedingung).
//
// Der kompilierte Server kann den src-only-Kit zur LAUFZEIT nicht importieren (er hat kein .js-Build). Deshalb wird
// die reine Auswertung hier — wie `catalogFromStatusMachines` und `vier-augen.ts` — SERVER-SEITIG wiederholt, statt
// den Kit hereinzuziehen. Ein Paritäts-Test (`automation-eval.test.ts`) prüft diese Wiederholung gegen die ECHTE
// `evalBedingung` des Kits, damit es genau EINE Wahrheit bleibt (verifiziert, nicht behauptet).
//
// FAIL-CLOSED: Trifft der Evaluator auf eine Bedingungs-FORM, die er nicht vollständig versteht, gilt sie als NICHT
// erfüllt (die Regel feuert nicht). Lieber eine Automation weniger als eine unbeabsichtigte Mutation.

/** Vergleichsoperator (gespiegelt zu `BedingungOperator` im Kit). */
export type EvalOperator =
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

const OPERATOREN: ReadonlySet<string> = new Set<EvalOperator>([
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "in",
  "nicht-in",
  "gesetzt",
  "nicht-gesetzt",
]);

type Daten = Record<string, unknown>;

function getPath(daten: Daten, feld: string): unknown {
  // Kit-`getPath`: Punkt-Pfade; wir unterstützen flache + einfache verschachtelte Pfade.
  if (feld in daten) return daten[feld];
  let cur: unknown = daten;
  for (const teil of feld.split(".")) {
    if (cur && typeof cur === "object" && teil in (cur as Daten)) {
      cur = (cur as Daten)[teil];
    } else {
      return undefined;
    }
  }
  return cur;
}

// Die folgenden Koerzierungen spiegeln EXAKT den Kit-Interpreter (interpreter.ts alsZahl/alsBool/asString/gleich),
// damit eine Regel server-seitig NICHT anders entscheidet als in der Client-Vorschau (verifiziert im Paritäts-Test).

/** Wert → Zahl oder `undefined`. Toleriert de-DE-Dezimalkomma (`"3,5"` → 3.5) — wie der Kit. */
function alsZahl(v: unknown): number | undefined {
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

/** Datei-Wert-Form (aus dem Kit): `{ name: string, groesse: number }`. */
function istDateiWert(v: object): v is { name: string; groesse: number } {
  const o = v as { name?: unknown; groesse?: unknown };
  return typeof o.name === "string" && typeof o.groesse === "number";
}

function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return istDateiWert(v) ? v.name : "";
  return String(v);
}

/** Gleichheit typ-tolerant wie im Kit: Boolean gegen Boolean, sonst numerisch, sonst String. */
function gleich(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    return alsBool(a) === alsBool(b);
  }
  const na = alsZahl(a);
  const nb = alsZahl(b);
  if (na !== undefined && nb !== undefined) return na === nb;
  return asString(a) === asString(b);
}

/** Vergleichsmenge (aus `wert`): Array bleibt, Skalar wird `[wert]`, `undefined` → `[]` — wie `alsMenge` im Kit. */
function alsMenge(wert: unknown): unknown[] {
  return Array.isArray(wert) ? wert : wert === undefined ? [] : [wert];
}

function evalFeld(
  feld: string,
  op: EvalOperator,
  wert: unknown,
  daten: Daten,
): boolean {
  const ist = getPath(daten, feld);
  switch (op) {
    case "gesetzt":
      return asString(ist).trim().length > 0;
    case "nicht-gesetzt":
      return asString(ist).trim().length === 0;
    case "==":
      return gleich(ist, wert);
    case "!=":
      return !gleich(ist, wert);
    case "in":
      return alsMenge(wert).some((z) => gleich(ist, z));
    case "nicht-in":
      return !alsMenge(wert).some((z) => gleich(ist, z));
    case ">":
    case ">=":
    case "<":
    case "<=": {
      const a = alsZahl(ist);
      const b = alsZahl(wert);
      if (a === undefined || b === undefined) return false;
      if (op === ">") return a > b;
      if (op === ">=") return a >= b;
      if (op === "<") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

/**
 * Wertet eine (aus jsonb geladene, daher `unknown`) Bedingung gegen die Daten aus. Blatt = `{ feld, op, wert? }`,
 * Gruppe = `{ alle?: [] }` (UND) / `{ eine?: [] }` (ODER) / `{ nicht: … }`. Fehlt die Bedingung (`undefined`/`null`),
 * gilt sie als erfüllt (wie im Kit — die fail-closed-Sperre gegen mutierende Regeln OHNE `wenn` sitzt in der Engine).
 * FAIL-CLOSED bei unbekannter Form.
 */
export function evalBedingungNodeSafe(
  bedingung: unknown,
  daten: Daten,
): boolean {
  if (bedingung === undefined || bedingung === null) return true;
  if (typeof bedingung !== "object") return false;
  const b = bedingung as Record<string, unknown>;

  // Gruppe: genau EINE Kombinator-Angabe.
  if (Array.isArray(b["alle"]))
    return (b["alle"] as unknown[]).every((t) =>
      evalBedingungNodeSafe(t, daten),
    );
  if (Array.isArray(b["eine"]))
    return (b["eine"] as unknown[]).some((t) =>
      evalBedingungNodeSafe(t, daten),
    );
  if ("nicht" in b) return !evalBedingungNodeSafe(b["nicht"], daten);

  // Blatt.
  if (typeof b["feld"] === "string" && typeof b["op"] === "string") {
    const op = b["op"] as string;
    if (!OPERATOREN.has(op)) return false; // fail-closed: unbekannter Operator
    return evalFeld(b["feld"], op as EvalOperator, b["wert"], daten);
  }

  // Unbekannte Form → fail-closed.
  return false;
}

/** Ist die (aus jsonb geladene) Bedingung eine Form, die dieser Evaluator vollständig versteht? Sonst darf eine
 *  mutierende Regel NICHT feuern (die Engine protokolliert dann `skipped`/unsupported-condition). */
export function bedingungUnterstuetzt(bedingung: unknown): boolean {
  if (bedingung === undefined || bedingung === null) return true;
  if (typeof bedingung !== "object") return false;
  const b = bedingung as Record<string, unknown>;
  if (Array.isArray(b["alle"]))
    return (b["alle"] as unknown[]).every(bedingungUnterstuetzt);
  if (Array.isArray(b["eine"]))
    return (b["eine"] as unknown[]).every(bedingungUnterstuetzt);
  if ("nicht" in b) return bedingungUnterstuetzt(b["nicht"]);
  if (typeof b["feld"] === "string" && typeof b["op"] === "string")
    return OPERATOREN.has(b["op"] as string);
  return false;
}
