// fachverfahren-kit/lib/status-mermaid — die REINE Ableitung eines Mermaid-`stateDiagram-v2` aus einer StatusMachine.
//
// Der Vertrag `StatusMachine` (Zustände + erlaubte Übergänge mit Rollen/Vier-Augen) IST der Verfahrensablauf. Diese
// Funktion projiziert ihn deterministisch in Mermaid-Quelltext, den die BESTEHENDE `MermaidView` robust rendert
// (WorkflowDiagramm) — so ist das Ablaufdiagramm keine handgepflegte Zweitquelle, sondern eine Sicht auf DIESELBEN
// Daten. Rein: kein React/DOM/Datum/Random, damit die Erzeugung testbar und stabil ist. Generisch/vendor-neutral —
// alle Beschriftungen kommen aus der Config, der Kit trägt keine Domänen-Literale.
import type { StatusMachine, Transition } from "../types.js";

/** Optionen der Diagramm-Erzeugung — alle mit sinnvollem Default (ein Aufruf ohne Optionen liefert ein volles Bild). */
export interface StatusMermaidOptions {
  /** Layout-Richtung (Mermaid `direction`): oben→unten (Default) oder links→rechts. */
  richtung?: "TB" | "LR";
  /** Die auslösenden Rollen an die Kanten-Beschriftung hängen (z. B. „Festsetzen · Sachbearbeitung"). Default: true. */
  zeigeRollen?: boolean;
  /** Vier-Augen- bzw. Begründungs-Pflicht als Text-Marker an die Kante hängen (nie nur visuell). Default: true. */
  zeigeMarker?: boolean;
}

/** Whitespace vereinheitlichen und trimmen — eine einzeilige, stabile Beschriftung erzeugen. */
function einzeilig(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Beschriftung für eine in Anführungszeichen gesetzte Zustands-Deklaration (` state "…" as id`): Quotes entschärfen. */
function zustandsBeschriftung(text: string): string {
  return einzeilig(text).replace(/"/g, "'");
}

/** Beschriftung einer Kante (steht nach dem `:` bis Zeilenende): einzeilig halten, damit keine Zeile bricht. */
function kantenBeschriftung(text: string): string {
  return einzeilig(text);
}

/**
 * Bildet für jeden Zustands-Schlüssel eine Mermaid-sichere, EINDEUTIGE id: Nicht-Wort-Zeichen → `_`, führende Ziffer
 * wird mit `s_` präfixiert (Mermaid-ids beginnen mit einem Buchstaben/`_`). Kollisionen (zwei Schlüssel, die auf
 * dieselbe id normalisieren) werden durch ein Suffix aufgelöst — deterministisch und stabil. Defensiv werden auch in
 * Übergängen referenzierte, aber nicht deklarierte Zustände berücksichtigt, damit keine Kante ins Leere zeigt.
 */
function baueIdMap(machine: StatusMachine): Map<string, string> {
  const map = new Map<string, string>();
  const vergeben = new Set<string>();
  const schluessel: string[] = machine.states.map((s) => s.key);
  for (const t of machine.transitions) schluessel.push(t.from, t.to);
  for (const key of schluessel) {
    if (map.has(key)) continue;
    const basis = sichereId(key);
    let kandidat = basis;
    let n = 1;
    while (vergeben.has(kandidat)) kandidat = `${basis}_${n++}`;
    vergeben.add(kandidat);
    map.set(key, kandidat);
  }
  return map;
}

function sichereId(key: string): string {
  const bereinigt = (key ?? "").replace(/[^A-Za-z0-9_]/g, "_");
  const nichtLeer = bereinigt.length > 0 ? bereinigt : "state";
  return /^[A-Za-z_]/.test(nichtLeer) ? nichtLeer : `s_${nichtLeer}`;
}

/** Setzt das Kanten-Label aus Handlungs-Beschriftung + (optional) Rollen + (optional) Vier-Augen-/Begründungs-Marker. */
function baueKantenLabel(
  t: Transition,
  opts: Required<Pick<StatusMermaidOptions, "zeigeRollen" | "zeigeMarker">>,
): string {
  const teile: string[] = [];
  const basis = kantenBeschriftung(t.label);
  if (basis) teile.push(basis);
  if (opts.zeigeRollen && t.rollen && t.rollen.length > 0) {
    teile.push(t.rollen.join("/"));
  }
  const marker: string[] = [];
  if (opts.zeigeMarker && t.vierAugen) marker.push("4-Augen");
  if (opts.zeigeMarker && t.detailPflicht) marker.push("Begründung");
  const kopf = teile.join(" · ");
  if (marker.length === 0) return kopf;
  return kopf ? `${kopf} [${marker.join(", ")}]` : `[${marker.join(", ")}]`;
}

/**
 * Erzeugt aus einer `StatusMachine` einen Mermaid-`stateDiagram-v2`-Quelltext: der Initialzustand als `[*] --> …`,
 * jeder deklarierte Zustand mit lesbarer Beschriftung, jede erlaubte Transition als beschriftete Kante (Rollen +
 * Vier-Augen-/Begründungs-Marker) und jeder Terminalzustand als `… --> [*]`. Deterministisch — gleiche Eingabe,
 * gleiche Ausgabe.
 */
export function statusMachineZuMermaid(
  machine: StatusMachine,
  options: StatusMermaidOptions = {},
): string {
  const { richtung = "TB", zeigeRollen = true, zeigeMarker = true } = options;
  const idVon = baueIdMap(machine);
  const zeilen: string[] = ["stateDiagram-v2", `  direction ${richtung}`];

  // Lesbare Zustands-Deklarationen (Label ≠ id), damit das Diagramm die Bürger-/Fach-Beschriftung zeigt.
  for (const s of machine.states) {
    const id = idVon.get(s.key);
    if (!id) continue;
    zeilen.push(`  state "${zustandsBeschriftung(s.label)}" as ${id}`);
  }

  // Initialzustand markieren.
  const initialId = idVon.get(machine.initial);
  if (initialId) zeilen.push(`  [*] --> ${initialId}`);

  // Übergänge als beschriftete Kanten.
  for (const t of machine.transitions) {
    const from = idVon.get(t.from);
    const to = idVon.get(t.to);
    if (!from || !to) continue;
    const label = baueKantenLabel(t, { zeigeRollen, zeigeMarker });
    zeilen.push(label ? `  ${from} --> ${to} : ${label}` : `  ${from} --> ${to}`);
  }

  // Terminalzustände markieren.
  for (const s of machine.states) {
    if (!s.terminal) continue;
    const id = idVon.get(s.key);
    if (id) zeilen.push(`  ${id} --> [*]`);
  }

  return zeilen.join("\n");
}
