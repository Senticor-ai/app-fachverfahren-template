// fachverfahren-kit/contract-snapshot — projiziert eine `LeistungConfig` in einen JSON-SAFE Struktur-Snapshot
// (`leistung.contract.json`). Die BUSINESS-LOGIK liegt jetzt als DATEN vor: Tarif-Staffeln, Codelisten (mit
// Provenienz), Feldregeln (in den Steps), Register-/FIM-Referenzen und Fristen-Typen werden als ECHTE ZEILEN
// serialisiert — nicht mehr als „[function]"-Marker versteckt. Nur die Escape-Hatches `berechne`/`nachweise` (falls
// ein Verfahren sie statt der Daten nutzt) bleiben JSON-untragbar und werden als Präsenz-Marker geführt. So kann ein
// externes Build-Gate den Vertrag — inklusive der subsumierbaren Business-Logik — deterministisch prüfen, ohne die
// .ts-Config zu importieren.
import type { LeistungConfig, Rechenprobe } from "./types.js";

// ⛔ WARUM `NonNullable<…>` UND NICHT NUR `LeistungConfig["x"]` (gemessen 2026-09-06, als `scripts/**`
// zum ersten Mal von einer tsconfig gedeckt wurde):
//
//   datenanbindung?: LeistungConfig["datenanbindung"]     ⇒  `Datenanbindung[] | undefined` OPTIONAL
//
// Das Quellfeld ist selbst optional, der indizierte Zugriff traegt das `| undefined` also MIT — und unter
// `exactOptionalPropertyTypes` (dieses Repo fuehrt es) ist `{ x?: T | undefined }` NICHT dasselbe wie
// `{ x?: T }`. Der Snapshot war damit an keine `Pick<LeistungConfig, "x">`-Signatur uebergebbar.
//
// Sichtbar wurde es an EINER Stelle (`check-leistung-contract.mts:134` → `verifyDatenanbindung`), aber ALLE
// ELF Felder dieser Form trugen den Defekt. Ein Einzelfix dort waere die Behandlung eines Symptoms gewesen.
// Der Empfaenger behandelt Abwesenheit ausdruecklich (`datenanbindungen`: „defensiv: fehlt/kein Array → []") —
// falsch war nie der Code, sondern was der Typ ueber ihn sagte.
export interface LeistungContractSnapshot {
  id: string;
  label: string;
  kommune: string;
  rechtsgrundlagen: LeistungConfig["rechtsgrundlagen"];
  fimLeistung?: NonNullable<LeistungConfig["fimLeistung"]>;
  /** `konditionierendesFeld` TRAVELS WITH the snapshot (2026-09-09). It was missing here — and so the field
   *  path that conditions the whole application was invisible to EVERY gate: the type demands it in `steps[0]`,
   *  and nobody checked that, because the snapshot did not carry it in the first place. Optional/additive: a
   *  seam without progressive disclosure produces the same snapshot as before. */
  antrag: {
    steps: LeistungConfig["antrag"]["steps"];
    einleitung?: string;
    konditionierendesFeld?: string;
  };
  /** Benannte Auswahl-Listen (schlank, value/label) — als echte Zeilen. */
  datenlisten?: NonNullable<LeistungConfig["datenlisten"]>;
  /** TARIF-/GEBÜHRENTABELLE als echte Staffel-Zeilen (statt „[function]"). */
  tarif?: NonNullable<LeistungConfig["tarif"]>;
  /** CODELISTEN mit Provenienz (Einträge + normRef/belege) als echte Zeilen. */
  codelisten?: NonNullable<LeistungConfig["codelisten"]>;
  /** REGISTER-REFERENZEN als echte Zeilen. */
  registerRefs?: NonNullable<LeistungConfig["registerRefs"]>;
  /** FIM-REFERENZEN als echte Zeilen. */
  fimRefs?: NonNullable<LeistungConfig["fimRefs"]>;
  /** FRISTEN-TYPEN als echte Zeilen. */
  fristenTypen?: NonNullable<LeistungConfig["fristenTypen"]>;
  /** GENERISCHE DATENANBINDUNG als echte Zeilen (Register/intern/extern, zweckgebunden + BSI-klassifiziert). */
  datenanbindung?: NonNullable<LeistungConfig["datenanbindung"]>;
  /**
   * DAS RECHTSBEHELFS-/BEKANNTGABE-REGIME als echte Zeilen — reine, JSON-sichere DATEN.
   *
   * WARUM (adversariales Fachaudit, Befund S1 · Wurzel W1): der Vertrag transportierte das VA-Regime NICHT.
   * Der Server kann `src/leistung.config.ts` nicht importieren (rootDir-Mauer) und liest allein diesen
   * Snapshot; fehlte `zustellung`, erbte er still das Muster-Regime der Vorlage (Widerspruch/§ 68 ff. VwGO/
   * § 41 Abs. 2 VwVfG). Ein GENERIERTES AO-Steuerverfahren bekam damit eine Belehrung aus der falschen
   * Verfahrensschiene — unrichtige Belehrung ⇒ Rechtsbehelfsfrist EIN JAHR (§ 356 Abs. 2 AO). Es gab ZWEI
   * Wahrheiten; das Drift-Gate sah sie, aber niemand transportierte die eine. Mit dieser Projektion ist der
   * Regime-Drift STRUKTURELL unmöglich statt nur bemerkbar.
   *
   * Rein additiv: eine Config ohne `zustellung` lässt das Feld weg (bestehende Snapshots bleiben gültig).
   */
  zustellung?: NonNullable<LeistungConfig["zustellung"]>;
  /**
   * DIE VA-PFLICHTANGABEN als echte Zeilen — der ZWILLING von `zustellung`, ein Feld weiter.
   *
   * ⛔ LIVE GEMESSEN 2026-09-07 an einem ERZEUGTEN Verfahren (Lauf `done`, Test-Report PASSED, 0 offene Befunde): `leistung.config.ts` DEKLARIERT `verwaltungsaktInhalt` — und
   * `leistung.contract.json` traegt den Schluessel NICHT (`'verwaltungsaktInhalt' in vertrag === false`).
   *
   * ⭐ UND DER SERVER LIEST IHN AUSDRUECKLICH. `verwaltungsaktInhaltAusVertrag` sagt in seinem eigenen
   * Kommentar: «alles Uebrige nur, wenn der Vertrag es unter `verwaltungsaktInhalt` DEKLARIERT. Schweigt
   * er, wird der Block ENTFERNT statt geerbt.» Der Vertrag schweigt IMMER — also entfernt der Server den
   * Block bei JEDEM erzeugten Verfahren.
   *
   * ⇒ RECHTSFOLGE: ein Bescheid ohne Inhaltsadressat (§ 119 Abs. 1 AO · § 157 Abs. 1 S. 2 AO —
   * Bestimmtheit, Nichtigkeitsrisiko § 125 AO) und ohne Leistungsgebot (§ 254 Abs. 1 AO — nicht
   * vollstreckbar, keine Kasse, keine Faelligkeit). Die Heilung vom 2026-08-31 («der Bescheid forderte
   * zur Zahlung an die Kasse einer FREMDEN Kommune») hat das ERBEN zu Recht abgeschaltet — und weil der
   * Transport fehlte, blieb seither NICHTS uebrig. Ein geheilter Zwilling ist kein geheiltes Haus.
   *
   * Rein additiv: eine Config ohne das Feld laesst es weg (bestehende Snapshots bleiben gueltig).
   */
  verwaltungsaktInhalt?: NonNullable<LeistungConfig["verwaltungsaktInhalt"]>;
  statusMachine: LeistungConfig["statusMachine"];
  register: LeistungConfig["register"];
  detailSektionen: LeistungConfig["detailSektionen"];
  ki?: NonNullable<LeistungConfig["ki"]>;
  /** WELLE 1c: die Zuständigkeiten (personas) mit ihren KI-Fähigkeiten je Zuständigkeit (faehigkeiten + AAL) — der
   *  Laufzeit-Spiegel der CHOS-governance.faehigkeiten; das nicht-JSON-fähige `icon` ist abgestreift. */
  personas?: NonNullable<LeistungConfig["personas"]>;
  /** ESCAPE-HATCH-Präsenz: nur gesetzt, wenn eine `berechne`-Funktion statt eines `tarif` genutzt wird. */
  berechne?: "[function]";
  /** RECHENPROBEN (Sollwert-Tabelle) als echte Zeilen — der maschinelle Beleg, dass der Tenor rechnerisch stimmt.
   *  Sie reisen bewusst MIT: der Server kann daraus nachrechnen (tenorHerkunft „server-nachgerechnet"), und ein
   *  externes Gate sieht ohne .ts-Import, ob jede Fallgruppe eine Probe hat. */
  rechenproben?: Rechenprobe[];
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
      ...(config.antrag.konditionierendesFeld
        ? { konditionierendesFeld: config.antrag.konditionierendesFeld }
        : {}),
    },
    // Business-Logik-DATEN als echte Zeilen (nur wenn deklariert — additiv, bestehende Snapshots bleiben gültig).
    ...(config.datenlisten ? { datenlisten: config.datenlisten } : {}),
    ...(config.tarif ? { tarif: config.tarif } : {}),
    ...(config.codelisten ? { codelisten: config.codelisten } : {}),
    ...(config.registerRefs ? { registerRefs: config.registerRefs } : {}),
    ...(config.fimRefs ? { fimRefs: config.fimRefs } : {}),
    ...(config.fristenTypen ? { fristenTypen: config.fristenTypen } : {}),
    ...(config.datenanbindung ? { datenanbindung: config.datenanbindung } : {}),
    // W1 — DAS REGIME REIST MIT: ohne diese Zeile erbt der Server das Muster-VA-Regime der Vorlage und die
    // Belehrung des generierten Verfahrens stammt aus der falschen Verfahrensschiene (Audit-Befund S1).
    // `bescheidUrl` ist eine LAUFZEIT-URL (kein Vertragsinhalt) und wird abgestreift — der Snapshot bleibt
    // deterministisch, sonst driftete der Vertrag mit jedem Deployment.
    ...(config.zustellung
      ? {
          zustellung: (({ bescheidUrl: _bescheidUrl, ...rest }) => rest)(
            config.zustellung,
          ),
        }
      : {}),
    // DER ZWILLING: ohne diese Zeile entfernt der Server die Pflichtangaben bei JEDEM Bescheid — er tut das
    // zu Recht (lieber ein sichtbarer Mangel als der Zahlungsempfaenger einer fremden Kommune), aber er
    // bekommt nie etwas zu behalten. Reine Daten, kein Laufzeit-Feld abzustreifen.
    ...(config.verwaltungsaktInhalt
      ? { verwaltungsaktInhalt: config.verwaltungsaktInhalt }
      : {}),
    statusMachine: config.statusMachine,
    register: config.register,
    detailSektionen: config.detailSektionen,
    ...(config.ki ? { ki: config.ki } : {}),
    // WELLE 1c: die Zuständigkeiten (personas) mit ihren KI-Fähigkeiten je Zuständigkeit (faehigkeiten + AAL) fließen in den
    // Contract — der Laufzeit-Spiegel der CHOS-governance.faehigkeiten. Das `icon` (LucideIcon) ist NICHT JSON-serialisierbar
    // und wird abgestreift; nur wenn die Config personas deklariert (sonst leitet die App generische Defaults ab).
    ...(config.personas
      ? { personas: config.personas.map(({ icon: _icon, ...rest }) => rest) }
      : {}),
    // Escape-Hatches nur als Präsenz-Marker (nicht JSON-serialisierbar) — und nur, wenn tatsächlich genutzt.
    ...(config.berechne ? { berechne: "[function]" as const } : {}),
    ...(config.rechenproben?.length
      ? { rechenproben: config.rechenproben as unknown as Rechenprobe[] }
      : {}),
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
