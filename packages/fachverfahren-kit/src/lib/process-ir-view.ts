// process-ir-view — REINE Projektionen einer ProzessDefinition auf zwei Sichten DERSELBEN Daten:
//  (a) `prozessDefZuMermaid` → ein Mermaid-`flowchart`-Quelltext (grafische ANZEIGE read-only via der bestehenden
//      MermaidView; keine neue Dep — mermaid ist MIT). Knotenform kodiert den Typ, Kanten tragen Guard/Default.
//  (b) `prozessDefZuTabelle` → eine Tabellen-Struktur (die BITV-primaere, tastatur-/screenreaderbedienbare Sicht,
//      auf der das spaetere ProzessTabelle-CRUD aufsetzt).
// Tabelle und Diagramm koennen so nie auseinanderlaufen. Rein: kein React/DOM/Datum/Random, vendor-neutral (alle
// Beschriftungen kommen aus der Definition). Muster wie lib/status-mermaid.
import type { Bedingung, BedingungOperator } from "../types.js";
import type { ProzessDefinition, ProzessKnoten } from "./process-ir.js";

export interface ProzessMermaidOptions {
  /** Layout-Richtung (Mermaid `flowchart`): oben→unten (Default) oder links→rechts. */
  richtung?: "TD" | "LR";
}

function einzeilig(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Mermaid-sichere Beschriftung: einzeilig, Zeichen entschaerfen, die den Parser brechen (`"` `|` `<` `>`), gekappt. */
function labelSicher(text: string): string {
  return einzeilig(text)
    .replace(/"/g, "'")
    .replace(/\|/g, "/")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .slice(0, 60);
}

function sichereId(key: string): string {
  const bereinigt = (key ?? "").replace(/[^A-Za-z0-9_]/g, "_");
  const nichtLeer = bereinigt.length > 0 ? bereinigt : "n";
  return /^[A-Za-z_]/.test(nichtLeer) ? nichtLeer : `n_${nichtLeer}`;
}

/** Eindeutige, Mermaid-sichere id je Knoten (Kollisionen deterministisch mit Suffix aufgeloest). */
function baueIdMap(def: ProzessDefinition): Map<string, string> {
  const map = new Map<string, string>();
  const vergeben = new Set<string>();
  for (const k of def.knoten) {
    if (map.has(k.id)) continue;
    const basis = sichereId(k.id);
    let kandidat = basis;
    let n = 1;
    while (vergeben.has(kandidat)) kandidat = `${basis}_${n++}`;
    vergeben.add(kandidat);
    map.set(k.id, kandidat);
  }
  return map;
}

const OP_SYMBOL: Record<BedingungOperator, string> = {
  "==": "=",
  "!=": "≠",
  ">": "›",
  ">=": "≥",
  "<": "‹",
  "<=": "≤",
  in: "∈",
  "nicht-in": "∉",
  gesetzt: "gesetzt",
  "nicht-gesetzt": "leer",
};

/** Kurze, menschenlesbare Zusammenfassung einer (rekursiven) Bedingung — fuer Guard-Beschriftungen. */
export function bedingungKurz(b: Bedingung): string {
  if ("feld" in b && "op" in b) {
    const sym = OP_SYMBOL[b.op] ?? b.op;
    if (b.op === "gesetzt" || b.op === "nicht-gesetzt")
      return `${b.feld} ${sym}`;
    return `${b.feld} ${sym} ${String(b.wert ?? "")}`;
  }
  if (b.alle) return b.alle.map(bedingungKurz).join(" ∧ ");
  if (b.eine) return b.eine.map(bedingungKurz).join(" ∨ ");
  if (b.nicht) return `¬(${bedingungKurz(b.nicht)})`;
  return "";
}

/** Anzeige-Beschriftung eines Knotens (eigenes `label` bevorzugt, sonst ein sprechender Default je Typ). */
function knotenLabel(k: ProzessKnoten): string {
  if (k.label) return k.label;
  switch (k.typ) {
    case "start":
      return "Start";
    case "ende":
      return "Ende";
    case "userTask":
      return `Aufgabe → ${k.catalogAction}`;
    case "serviceTask":
      return `Dienst → ${k.catalogAction}`;
    case "exclusiveGateway":
      return "XOR";
    default:
      return k.typ;
  }
}

/** Mermaid-Knotenform je Typ: Start/Ende Kreis `(( ))`, Gateway Raute `{ }`, Task/sonst Rechteck `[ ]`. */
function knotenForm(k: ProzessKnoten, id: string): string {
  const l = labelSicher(knotenLabel(k));
  if (k.typ === "start" || k.typ === "ende") return `${id}(("${l}"))`;
  if (k.typ === "exclusiveGateway") return `${id}{"${l}"}`;
  return `${id}["${l}"]`;
}

/**
 * Projiziert eine ProzessDefinition deterministisch in Mermaid-`flowchart`-Quelltext (dieselbe Robustheits-Kette wie
 * status-mermaid: sichere ids, entschaerfte Labels). Die bestehende MermaidView rendert ihn read-only. Gleiche
 * Eingabe → gleiche Ausgabe.
 */
export function prozessDefZuMermaid(
  def: ProzessDefinition,
  options: ProzessMermaidOptions = {},
): string {
  const { richtung = "TD" } = options;
  const idVon = baueIdMap(def);
  const zeilen: string[] = [`flowchart ${richtung}`];
  for (const k of def.knoten) {
    const id = idVon.get(k.id);
    if (id) zeilen.push(`  ${knotenForm(k, id)}`);
  }
  for (const e of def.kanten) {
    const from = idVon.get(e.von);
    const to = idVon.get(e.nach);
    if (!from || !to) continue;
    const label = e.default
      ? "sonst"
      : e.guard
        ? labelSicher(bedingungKurz(e.guard))
        : "";
    zeilen.push(
      label ? `  ${from} -->|"${label}"| ${to}` : `  ${from} --> ${to}`,
    );
  }
  return zeilen.join("\n");
}

/** Ein ausgehender Zweig eines Knotens in der Tabellen-Sicht. */
export interface ProzessTabellenAusgang {
  kanteId: string;
  nach: string;
  guard?: string;
  default?: boolean;
}

/** Eine Zeile der BITV-primaeren Tabellen-Sicht: EIN Knoten mit seinen ausgehenden Kanten. */
export interface ProzessTabellenZeile {
  knotenId: string;
  typ: ProzessKnoten["typ"];
  label: string;
  rollen?: string[];
  catalogAction?: string;
  vierAugen?: boolean;
  ausgaenge: ProzessTabellenAusgang[];
}

/** Projiziert die Definition auf eine flache, tastatur-/screenreaderbedienbare Tabellen-Struktur (DIESELBEN Daten
 *  wie das Diagramm). Rein — keine Sortierung/Filterung (das macht die UI-Schicht). */
export function prozessDefZuTabelle(
  def: ProzessDefinition,
): ProzessTabellenZeile[] {
  return def.knoten.map((k) => {
    const ausgaenge: ProzessTabellenAusgang[] = def.kanten
      .filter((e) => e.von === k.id)
      .map((e) => ({
        kanteId: e.id,
        nach: e.nach,
        ...(e.guard ? { guard: bedingungKurz(e.guard) } : {}),
        ...(e.default ? { default: true } : {}),
      }));
    return {
      knotenId: k.id,
      typ: k.typ,
      label: knotenLabel(k),
      ...(k.typ === "userTask" ? { rollen: k.rollen } : {}),
      ...(k.typ === "userTask" || k.typ === "serviceTask"
        ? { catalogAction: k.catalogAction }
        : {}),
      ...((k.typ === "userTask" || k.typ === "serviceTask") &&
      k.vierAugen !== undefined
        ? { vierAugen: k.vierAugen }
        : {}),
      ausgaenge,
    };
  });
}
