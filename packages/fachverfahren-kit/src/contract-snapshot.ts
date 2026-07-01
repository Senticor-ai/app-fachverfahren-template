// fachverfahren-kit/contract-snapshot — projiziert eine `LeistungConfig` in einen JSON-SAFE Struktur-Snapshot
// (`leistung.contract.json`). Funktionen (berechne/nachweise/seed) sind in JSON nicht serialisierbar → als
// Präsenz-Marker dargestellt; die STRUKTUR (Pflichtfelder · Status-Machine · Wire-through · Grounding) bleibt voll
// erhalten. Das governte Build-Gate der Fabrik (CHOS leistung-vertrag-gueltig) validiert genau diesen Snapshot —
// so kann der Vertrag einer GENERIERTEN Leistung deterministisch geprüft werden, ohne die .ts-Config zu importieren.
import type { LeistungConfig } from "./types.js";

export interface LeistungContractSnapshot {
  id: string;
  label: string;
  kommune: string;
  rechtsgrundlagen: LeistungConfig["rechtsgrundlagen"];
  fimLeistung?: LeistungConfig["fimLeistung"];
  antrag: { steps: LeistungConfig["antrag"]["steps"]; einleitung?: string };
  statusMachine: LeistungConfig["statusMachine"];
  register: LeistungConfig["register"];
  detailSektionen: LeistungConfig["detailSektionen"];
  ki?: LeistungConfig["ki"];
  berechne: "[function]"; // Präsenz-Marker (nicht JSON-serialisierbar) — der Validator akzeptiert ihn
  nachweise?: "[function]";
  seedCount: number;
  _snapshot: true;
}

/** Erzeugt den JSON-sicheren Struktur-Snapshot einer LeistungConfig (für `leistung.contract.json`). Rein. */
export function toContractSnapshot<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
): LeistungContractSnapshot {
  let seedCount: number;
  try {
    seedCount =
      config.seed?.({ vorgangsnummer: () => "FV-SNAP-0000" }).length ?? 0;
  } catch {
    seedCount = 0;
  }
  return {
    id: config.id,
    label: config.label,
    kommune: config.kommune,
    rechtsgrundlagen: config.rechtsgrundlagen,
    ...(config.fimLeistung ? { fimLeistung: config.fimLeistung } : {}),
    antrag: {
      steps: config.antrag.steps,
      ...(config.antrag.einleitung
        ? { einleitung: config.antrag.einleitung }
        : {}),
    },
    statusMachine: config.statusMachine,
    register: config.register,
    detailSektionen: config.detailSektionen,
    ...(config.ki ? { ki: config.ki } : {}),
    berechne: "[function]",
    ...(config.nachweise ? { nachweise: "[function]" as const } : {}),
    seedCount,
    _snapshot: true,
  };
}
