// fachverfahren-kit/contract-snapshot — projiziert eine `LeistungConfig` in einen JSON-SAFE Struktur-Snapshot
// (`leistung.contract.json`). Die BUSINESS-LOGIK liegt jetzt als DATEN vor: Tarif-Staffeln, Codelisten (mit
// Provenienz), Feldregeln (in den Steps), Register-/FIM-Referenzen und Fristen-Typen werden als ECHTE ZEILEN
// serialisiert — nicht mehr als „[function]"-Marker versteckt. Nur die Escape-Hatches `berechne`/`nachweise` (falls
// ein Verfahren sie statt der Daten nutzt) bleiben JSON-untragbar und werden als Präsenz-Marker geführt. So kann ein
// externes Build-Gate den Vertrag — inklusive der subsumierbaren Business-Logik — deterministisch prüfen, ohne die
// .ts-Config zu importieren.
import type { LeistungConfig } from "./types.js";

export interface LeistungContractSnapshot {
  id: string;
  label: string;
  kommune: string;
  rechtsgrundlagen: LeistungConfig["rechtsgrundlagen"];
  fimLeistung?: LeistungConfig["fimLeistung"];
  antrag: { steps: LeistungConfig["antrag"]["steps"]; einleitung?: string };
  /** Benannte Auswahl-Listen (schlank, value/label) — als echte Zeilen. */
  datenlisten?: LeistungConfig["datenlisten"];
  /** TARIF-/GEBÜHRENTABELLE als echte Staffel-Zeilen (statt „[function]"). */
  tarif?: LeistungConfig["tarif"];
  /** CODELISTEN mit Provenienz (Einträge + normRef/belege) als echte Zeilen. */
  codelisten?: LeistungConfig["codelisten"];
  /** REGISTER-REFERENZEN als echte Zeilen. */
  registerRefs?: LeistungConfig["registerRefs"];
  /** FIM-REFERENZEN als echte Zeilen. */
  fimRefs?: LeistungConfig["fimRefs"];
  /** FRISTEN-TYPEN als echte Zeilen. */
  fristenTypen?: LeistungConfig["fristenTypen"];
  /** Deklarative Automationsregeln als echte Zeilen; keine Laufzeitausführung. */
  automationsregeln?: LeistungConfig["automationsregeln"];
  statusMachine: LeistungConfig["statusMachine"];
  register: LeistungConfig["register"];
  detailSektionen: LeistungConfig["detailSektionen"];
  ki?: LeistungConfig["ki"];
  /** ESCAPE-HATCH-Präsenz: nur gesetzt, wenn eine `berechne`-Funktion statt eines `tarif` genutzt wird. */
  berechne?: "[function]";
  /** ESCAPE-HATCH-Präsenz: nur gesetzt, wenn eine `nachweise`-Funktion statt der Codelisten-Ableitung genutzt wird. */
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
    // Business-Logik-DATEN als echte Zeilen (nur wenn deklariert — additiv, bestehende Snapshots bleiben gültig).
    ...(config.datenlisten ? { datenlisten: config.datenlisten } : {}),
    ...(config.tarif ? { tarif: config.tarif } : {}),
    ...(config.codelisten ? { codelisten: config.codelisten } : {}),
    ...(config.registerRefs ? { registerRefs: config.registerRefs } : {}),
    ...(config.fimRefs ? { fimRefs: config.fimRefs } : {}),
    ...(config.fristenTypen ? { fristenTypen: config.fristenTypen } : {}),
    ...(config.automationsregeln
      ? { automationsregeln: config.automationsregeln }
      : {}),
    statusMachine: config.statusMachine,
    register: config.register,
    detailSektionen: config.detailSektionen,
    ...(config.ki ? { ki: config.ki } : {}),
    // Escape-Hatches nur als Präsenz-Marker (nicht JSON-serialisierbar) — und nur, wenn tatsächlich genutzt.
    ...(config.berechne ? { berechne: "[function]" as const } : {}),
    ...(config.nachweise ? { nachweise: "[function]" as const } : {}),
    seedCount,
    _snapshot: true,
  };
}

const EINFACHE_SPRACHE_SCHLUESSEL = ["leichteSprache", "hintEinfach"] as const;
type EinfacheSpracheSchluessel = (typeof EINFACHE_SPRACHE_SCHLUESSEL)[number];

export interface EinfacheSpracheDrift {
  /** `FeldDef.name`, z. B. "antragsteller.vorname". */
  feld: string;
  schluessel: EinfacheSpracheSchluessel;
  committed: string | undefined;
  frisch: string | undefined;
}

function ohneEinfacheSprache(snap: LeistungContractSnapshot): string {
  return JSON.stringify(snap, function (key, value) {
    if (
      (EINFACHE_SPRACHE_SCHLUESSEL as readonly string[]).includes(key) &&
      this &&
      typeof this === "object" &&
      "name" in this &&
      "typ" in this
    ) {
      return undefined;
    }
    return value;
  });
}

/**
 * Vergleicht zwei Contract-Snapshots. Liefert `null`, wenn IRGENDEIN Unterschied AUSSERHALB der additiven
 * Einfache-Sprache-Felder (`leichteSprache`/`hintEinfach`) eines `FeldDef` liegt (= echte Drift — der Aufrufer
 * zeigt dann die generische FRISCHE-Fehlermeldung). Liefert sonst die Liste der konkret geänderten
 * Feld/Schlüssel-Paare (leer, wenn beide Snapshots identisch sind). Rein / seiteneffektfrei.
 */
export function diffNurEinfacheSprache(
  committed: LeistungContractSnapshot,
  frisch: LeistungContractSnapshot,
): EinfacheSpracheDrift[] | null {
  if (ohneEinfacheSprache(committed) !== ohneEinfacheSprache(frisch))
    return null;

  const drifts: EinfacheSpracheDrift[] = [];
  const cSteps = committed.antrag?.steps ?? [];
  const fSteps = frisch.antrag?.steps ?? [];
  for (let i = 0; i < Math.max(cSteps.length, fSteps.length); i++) {
    const cFelder = cSteps[i]?.felder ?? [];
    const fFelder = fSteps[i]?.felder ?? [];
    for (let j = 0; j < Math.max(cFelder.length, fFelder.length); j++) {
      const cFeld = cFelder[j];
      const fFeld = fFelder[j];
      const feld = fFeld?.name ?? cFeld?.name ?? `steps[${i}].felder[${j}]`;
      for (const schluessel of EINFACHE_SPRACHE_SCHLUESSEL) {
        const cWert = cFeld?.[schluessel];
        const fWert = fFeld?.[schluessel];
        if (cWert !== fWert)
          drifts.push({ feld, schluessel, committed: cWert, frisch: fWert });
      }
    }
  }
  return drifts;
}
