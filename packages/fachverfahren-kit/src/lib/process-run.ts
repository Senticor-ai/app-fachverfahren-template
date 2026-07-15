// process-run — reiner Token-Planer: an welchem/welchen Knoten geht es vom aktuellen Knoten weiter? Kein Zustand,
// kein Netz, keine Zeit — nur Graph + Variablen. Guards werden ueber den EINEN vorhandenen `evalBedingung`-Evaluator
// ausgewertet (dieselbe Wahrheit wie die Antrags-Subsumtion). Setzt einen validierten Graph voraus
// (process-graph); bei fehlerhaftem/unbekanntem Knoten liefert er defensiv keinen Schritt.
import type { Antragsdaten } from "./antrag-felder.js";
import { evalBedingung } from "./interpreter.js";
import type { ProzessDefinition, ProzessKante } from "./process-ir.js";

/** Plant die naechsten Knoten ab `aktuellerKnotenId`. Exclusive-Gateway: erster erfuellter Guard (Kanten-Reihenfolge
 *  = deterministisch), sonst der Default-Flow. Nicht-Gateway: alle ausgehenden Ziele (in V1 genau eines). Ende bzw.
 *  unbekannter Knoten: leer. Reine Funktion. */
export function planTokenSchritt(
  def: ProzessDefinition,
  aktuellerKnotenId: string,
  variablen: Antragsdaten = {},
): string[] {
  const knoten = def.knoten.find((k) => k.id === aktuellerKnotenId);
  if (!knoten || knoten.typ === "ende") return [];
  const raus = def.kanten.filter((e) => e.von === aktuellerKnotenId);
  if (raus.length === 0) return [];

  if (knoten.typ === "exclusiveGateway") {
    const nichtDefault = raus.filter((e) => e.default !== true);
    const treffer = nichtDefault.find((e) => evalBedingung(e.guard, variablen));
    const gewaehlt: ProzessKante | undefined =
      treffer ?? raus.find((e) => e.default === true);
    return gewaehlt ? [gewaehlt.nach] : [];
  }

  // start / userTask / serviceTask: sequentieller Fortschritt (V1: genau eine ausgehende Kante).
  return raus.map((e) => e.nach);
}
