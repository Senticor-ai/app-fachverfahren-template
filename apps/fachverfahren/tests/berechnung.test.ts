// berechnung.test.ts — der GENERISCHE, mitgelieferte Naht-Tabellen-Test der Berechnung.
//
// WARUM mitgeliefert (Fabrik statt Agenten-Vertrauen): das CHOS-Gate `test-real-vorhanden` verlangt an
// apps/fachverfahren/tests/ mindestens EINEN echten Tabellen-Test der `leistungConfig.berechne` gegen Beispielwerte.
// Wird er erst vom Agenten im ERSTEN Durchlauf erwartet, reisst der Output-Vertrag → phase-redelivery (Repair). Dieser
// Test kommt DETERMINISTISCH aus der Vorlage: er liest die GENERIERTE `leistungConfig` und prueft die Berechnung
// verfahrens-agnostisch — kein Domaenen-Literal, er funktioniert fuer JEDES generierte Verfahren.
//
// ── PHASE 5 / WURZEL W4: DER BETRAG WIRD JETZT GEPRUEFT, NICHT NUR DER VERTRAG ────────────────────────────────
// Bis Phase 5 pruefte diese Datei ausschliesslich „aufrufbar / deterministisch / nicht-negativ" — es wurde NIE ein
// Betrag assertiert. Ein adversariales Fachaudit fand deshalb unbemerkt: eine gewaehrte Minderung senkte den
// festgesetzten Betrag GAR NICHT (Begruendung und Positionstabelle wiesen sie aus, der Tenor setzte den vollen
// Betrag fest), die Positionen summierten nicht auf die Festsetzung, und ein Minderungsbetrag stand als
// `-9.999999999999998` im Bescheid. Ein Bescheid mit falschem Betrag ist ein materiell rechtswidriger, aber
// WIRKSAMER Verwaltungsakt — er nimmt echtes Geld. Deshalb drei GENERISCHE Invarianten (ohne jedes Fachwissen)
// plus die verfahrens-eigenen `rechenproben` (Sollwerte als DATEN der Naht).
import { describe, expect, it } from "vitest";

import {
  pruefeCentFormat,
  pruefeSumme,
  pruefeWirkung,
  type BerechnungsForm,
} from "@senticor/fachverfahren-kit";

import { leistungConfig } from "../src/leistung.config.js";

// Defensiver, struktur-agnostischer Zugriff (die Config-Form variiert je Verfahren): wir pruefen nur den Vertrag.
type TestBerechnung = BerechnungsForm;
const cfg = leistungConfig as unknown as {
  berechne?: (antragsdaten: unknown) => TestBerechnung;
  tarif?: unknown;
  tarife?: unknown;
  antrag?: {
    steps?: {
      felder?: {
        name?: unknown;
        typ?: unknown;
        options?: { value?: unknown }[];
      }[];
    }[];
  };
  rechenproben?: {
    name?: unknown;
    antragsdaten?: unknown;
    erwartet?: { betrag?: unknown; positionen?: { betrag?: unknown }[] };
    herleitung?: unknown;
    quelle?: unknown;
  }[];
  seed?: (ctx: {
    vorgangsnummer: () => string;
  }) => Array<{ antragsdaten?: unknown; berechnung?: unknown }>;
};

/** Sammelt alle numerischen Betraege aus einer tarif/tarife-Struktur (Zahl, {..:Zahl}, verschachtelt). */
function tarifBetraege(t: unknown): number[] {
  if (typeof t === "number") return Number.isFinite(t) ? [t] : [];
  if (Array.isArray(t)) return t.flatMap(tarifBetraege);
  if (t && typeof t === "object")
    return Object.values(t).flatMap(tarifBetraege);
  return [];
}

/** Die Seed-Eingaben der Naht als Basis-Beispiele (leeres Objekt als Rueckfall — der Aufruf-Vertrag zaehlt). */
function seedEingaben(): unknown[] {
  const seed =
    typeof cfg.seed === "function"
      ? cfg.seed({ vorgangsnummer: () => "FV-TEST-0001" })
      : [];
  const beispiele = (Array.isArray(seed) ? seed : [])
    .map((v) => v?.antragsdaten)
    .filter((a) => a && typeof a === "object")
    .slice(0, 5);
  return beispiele.length ? beispiele : [{}];
}

/** Setzt einen Punkt-Pfad („anliegen.kategorie") in einer TIEFEN KOPIE. Rein. */
function mitFeld(basis: unknown, pfad: string, wert: unknown): unknown {
  const kopie = JSON.parse(JSON.stringify(basis ?? {})) as Record<
    string,
    unknown
  >;
  const teile = pfad.split(".");
  let ziel = kopie;
  for (const t of teile.slice(0, -1)) {
    if (typeof ziel[t] !== "object" || ziel[t] === null) ziel[t] = {};
    ziel = ziel[t] as Record<string, unknown>;
  }
  ziel[teile[teile.length - 1]!] = wert;
  return kopie;
}

/** Alle erhobenen Auswahl-Felder mit ihren Optionswerten (die kandidatischen Rechtsfolgen-Schalter). */
function auswahlFelder(): { name: string; werte: unknown[] }[] {
  const out: { name: string; werte: unknown[] }[] = [];
  for (const step of cfg.antrag?.steps ?? []) {
    for (const feld of step.felder ?? []) {
      const name = typeof feld.name === "string" ? feld.name : "";
      const werte = (feld.options ?? [])
        .map((o) => o?.value)
        .filter((v) => v !== undefined);
      if (!name) continue;
      if (werte.length >= 2) out.push({ name, werte });
      else if (feld.typ === "jaNein" || feld.typ === "checkbox")
        out.push({ name, werte: [true, false] });
    }
  }
  return out;
}

const zahl = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

// ── POSITIVE CONTROL: IS ANYTHING MEASURED HERE AT ALL? ─────────────────────────────────────────────
//
// ── THE MEASUREMENT THAT FORCED THIS BLOCK (2026-09-09) ─────────────────────────────────────────────
// Three generated procedures from the same build path shipped `antrag.steps: []` and `rechenproben: []`.
// This file ran GREEN for all three — 117 passing witnesses over an application without a single
// input field, and without a single amount ever being asserted: EVERY loop body below iterated a
// set that was empty. A head of office reads "passed" on top of it.
//
// This is the leading defect class of this house — "witnesses that stand green and check nothing". The
// remedy is the pattern ALREADY IN USE HERE (`security-header.test.ts`: "POSITIVE CONTROL: the list is
// not empty, otherwise everything below checks nothing"), not a new one: an assertion BEFORE the loops
// that makes "0 cases passed" distinguishable from "all cases passed".
//
// ⛔ THIS BLOCK INVENTS NO CASES. It names the emptiness, it does not fill it. What a procedure
// collects and which amounts it knows is worked out procedure-specifically in the Fachkonzept; a
// substitute example shipped here would be a false statement about a Fachverfahren.
describe("POSITIVE CONTROL — does this file measure anything at all?", () => {
  it("the procedure collects at least ONE field (otherwise every loop below runs zero times)", () => {
    const fields = (cfg.antrag?.steps ?? []).flatMap((s) => s.felder ?? []);
    expect(
      fields.length,
      "This procedure declares NOT A SINGLE application field (antrag.steps is empty or has no fields). " +
        "Every assertion in this file therefore iterates an empty set and stands green without checking " +
        "anything — and the shipped application has no input form. That is not a passed test but one " +
        "that was never carried out.",
    ).toBeGreaterThan(0);
  });

  it("the procedure declares at least ONE entry in rechenproben (otherwise no amount is machine-checked)", () => {
    expect(
      (cfg.rechenproben ?? []).length,
      "This procedure declares no rechenproben — NO amount is machine-checked. The three invariants " +
        "below only check the internal consistency of the calculation (sum, effect, cent format); whether " +
        "the amount is the RIGHT one is said only by an expected value with derivation and source from " +
        "the Fachkonzept. A Bescheid with a wrong amount is a materially unlawful but EFFECTIVE " +
        "Verwaltungsakt.",
    ).toBeGreaterThan(0);
  });

  it("the seam's seed examples are real inputs, not an empty fallback", () => {
    // `seedEingaben()` falls back to `[{}]` when the seam brings no seed cases. The invariants below
    // then run over ONE empty object — formally green, blind in substance.
    const inputs = seedEingaben();
    const genuine = inputs.filter(
      (e) => e && typeof e === "object" && Object.keys(e).length > 0,
    );
    expect(
      genuine.length,
      "The seam delivers no seed inputs (leistungConfig.seed is missing or carries no antragsdaten). " +
        "The sum/effect/format invariants therefore run over an empty object and do not measure " +
        "this procedure's calculation.",
    ).toBeGreaterThan(0);
  });
});

describe("Berechnung — Naht-Vertrag (leistungConfig.berechne)", () => {
  it("berechne() ist eine aufrufbare Funktion", () => {
    expect(typeof cfg.berechne).toBe("function");
  });

  it("die Tarif-/Betrags-DATEN (falls deklariert) sind endliche, nicht-negative Zahlen", () => {
    const betraege = [
      ...tarifBetraege(cfg.tarif),
      ...tarifBetraege(cfg.tarife),
    ];
    // Kein Tarif deklariert (z. B. reines Ja/Nein-Verfahren) ist zulaessig — dann nichts zu pruefen.
    for (const b of betraege) {
      expect(Number.isFinite(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });

  it("berechne() liefert fuer die eigenen Seed-Beispiele der Naht eine konsistente Berechnung (wirft nicht, gleicher Input → gleicher Betrag)", () => {
    if (typeof cfg.berechne !== "function") return;
    for (const antragsdaten of seedEingaben()) {
      const berechnung = cfg.berechne(antragsdaten);
      const wieder = cfg.berechne(antragsdaten);
      expect(wieder.betrag).toStrictEqual(berechnung.betrag);
    }
  });

  // ── W4-INVARIANTE 1: DIE POSITIONEN SUMMIEREN AUF DIE FESTSETZUNG ────────────────────────────────────────
  // RECHTSFOLGE: § 157 Abs. 1 Satz 2 AO verlangt einen bestimmten Tenor (Art + Betrag + Schuldner). Eine
  // Positionstabelle, die NICHT auf den festgesetzten Betrag fuehrt, ist fuer die Empfaengerin nicht
  // nachpruefbar — der Bescheid widerspricht sich selbst. Live gefunden: Festsetzung 238, Positionssumme 231,2.
  // UEBERBLOCKUNG: geprueft wird nur bei >= 2 vollstaendig numerischen Positionen und `status: "final"` —
  // ein vorlaeufiges Ergebnis oder eine einzeilige Zusammenfassung loest nichts aus.
  it("INVARIANTE Summe: die Positionen summieren auf den festgesetzten Betrag", () => {
    if (typeof cfg.berechne !== "function") return;
    for (const antragsdaten of seedEingaben()) {
      const befunde = pruefeSumme(cfg.berechne(antragsdaten));
      expect(befunde.map((b) => b.meldung)).toEqual([]);
    }
  });

  // ── W4-INVARIANTE 2: EINE AUSGEWIESENE WIRKUNG MUSS DEN BETRAG BEWEGEN ───────────────────────────────────
  // RECHTSFOLGE: weist die Berechnung fuer eine Eingabe eine zusaetzliche/geaenderte Rechenposition mit einem
  // Betrag != 0 aus (z. B. eine Minderung), der festgesetzte Betrag aber bleibt gleich, dann ist ENTWEDER die
  // Position falsch ODER der Tenor. Beides macht den Verwaltungsakt materiell rechtswidrig — und zwar wirksam.
  // Genau das war der Live-Befund: „Minderung (10 %) = -10" in der Tabelle, Festsetzung unveraendert 350.
  // VOELLIG DOMAENENFREI: der Test kennt weder Minderungen noch §§ — er vergleicht nur zwei Varianten, die
  // sich in EINEM erhobenen Feld unterscheiden.
  // UEBERBLOCKUNG: identische Positionen ⇒ keine Aussage. Verfahren ohne Auswahlfelder/Geld-Modifikatoren
  // (Festgebuehr, reine Feststellung) laufen leer-gruen durch.
  it("INVARIANTE Wirkung: aendert eine Eingabe die Rechenpositionen wertmaessig, aendert sie auch den Betrag", () => {
    if (typeof cfg.berechne !== "function") return;
    const basis = seedEingaben()[0];
    const befunde: string[] = [];
    for (const feld of auswahlFelder()) {
      let referenz: { b: TestBerechnung; wert: unknown } | undefined;
      for (const wert of feld.werte) {
        let b: TestBerechnung;
        try {
          b = cfg.berechne(mitFeld(basis, feld.name, wert));
        } catch {
          continue; // eine ungueltige Kombination ist kein Befund dieses Tests
        }
        if (!referenz) {
          referenz = { b, wert };
          continue;
        }
        befunde.push(
          ...pruefeWirkung(
            referenz.b,
            b,
            `Feld "${feld.name}" (${JSON.stringify(referenz.wert)} vs. ${JSON.stringify(wert)})`,
          ).map((x) => x.meldung),
        );
      }
    }
    expect(befunde).toEqual([]);
  });

  // ── W4-INVARIANTE 3: GELD-BETRAEGE SIND AUF CENT GERUNDET ───────────────────────────────────────────────
  // Ein Bescheid, der „-9.999999999999998" ausweist, ist kein amtliches Dokument. Float-Artefakte gehoeren
  // gerundet, bevor sie in den Tenor wandern.
  it("INVARIANTE Format: Betrag und Positionen sind auf Cent gerundet (keine Float-Artefakte)", () => {
    if (typeof cfg.berechne !== "function") return;
    const befunde: string[] = [];
    for (const antragsdaten of seedEingaben())
      befunde.push(
        ...pruefeCentFormat(cfg.berechne(antragsdaten)).map((b) => b.meldung),
      );
    expect(befunde).toEqual([]);
  });

  // ── W4: DIE SOLLWERTE DER NAHT (rechenproben) ───────────────────────────────────────────────────────────
  // KEINE Zahl ohne Rechenweg: die Naht deklariert je Fallgruppe eine Probe mit erwartetem Betrag, `herleitung`
  // (Rechenweg mit §-Belegen aus dem Fachkonzept) und `quelle` (Fundstelle). Das AUSFUEHRENDE Programm ist
  // dieser Test — niemand rechnet im Kopf. Fehlen die Proben, laeuft der Block leer-gruen (die Verfassung
  // fordert sie ab Bau-Tiefe mvp; hier ist es der Vollzug, nicht die Pflicht).
  it("RECHENPROBEN: berechne() trifft jeden deklarierten Sollwert", () => {
    if (typeof cfg.berechne !== "function") return;
    for (const probe of cfg.rechenproben ?? []) {
      const soll = zahl(probe?.erwartet?.betrag);
      if (soll === undefined) continue;
      const ist = cfg.berechne(probe.antragsdaten);
      expect(
        zahl(ist.betrag),
        `Rechenprobe "${String(probe?.name ?? "?")}": erwartet ${soll}, berechnet ${String(ist.betrag)}. Herleitung: ${String(probe?.herleitung ?? "-")} (Quelle: ${String(probe?.quelle ?? "-")})`,
      ).toBe(soll);
      const sollPos = probe?.erwartet?.positionen;
      if (Array.isArray(sollPos) && sollPos.length > 0) {
        const istPos = (ist.positionen ?? []).map((p) => zahl(p?.betrag));
        expect(istPos).toEqual(sollPos.map((p) => zahl(p?.betrag)));
      }
    }
  });

  it("RECHENPROBEN: jede Probe traegt Herleitung UND Quelle (keine Zahl ohne Rechenweg)", () => {
    for (const probe of cfg.rechenproben ?? []) {
      expect(
        String(probe?.herleitung ?? "").trim().length,
        `Rechenprobe "${String(probe?.name ?? "?")}" ohne Herleitung — ein Sollwert ohne Rechenweg ist eine Behauptung.`,
      ).toBeGreaterThan(0);
      expect(
        String(probe?.quelle ?? "").trim().length,
        `Rechenprobe "${String(probe?.name ?? "?")}" ohne Quelle — der Sollwert muss im Fachkonzept belegt sein.`,
      ).toBeGreaterThan(0);
    }
  });
});
