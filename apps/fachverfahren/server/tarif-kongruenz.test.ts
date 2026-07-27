// tarif-kongruenz — DERSELBE Satz steht an mehreren Orten. Zwei davon liest keiner vom anderen.
//
// GEMESSEN (2026-07-27), fuer die Kategorien standard/express/gebuehrenfrei:
//   1. `DEMO_TARIF` in leistung.config.ts — EURO. Speist `berechne()` und damit den BESCHEID-TENOR.
//   2. die Auswahl-Labels desselben Formulars — »Standard (50 €)«, freier Text im Dropdown.
//   3. `statusMachine.transitions[].stelltForderung.tarif` in DERSELBEN Datei — CENT. Speist die SOLLSTELLUNG.
//   4. die Server-Sicht (`antragProcedure`) — ABGELEITET aus dem Client-Vertrag, mit `MUSTER_ANTRAG` in
//      procedure.config.ts als Rueckfall.
//
// Zwischen 3 und 4 ist der Drift bereits STRUKTURELL geloest: die Ableitung konsumiert den Vertrag. Offen sind
// 1 gegen 3 — zwei Zahlen, zwei Einheiten, dieselbe Datei, kein Bezug. Ort 1 bestimmt, was im BESCHEID steht
// (der Tenor wird aus `case.data.berechnung` eingefroren), Ort 3, was die KASSE fordert (server-autoritativ aus
// dem Tarif). Wer einen Satz aendert und den anderen vergisst, erzeugt einen Bescheid ueber den einen Betrag
// und eine Forderung ueber den anderen — beide hash-gesichert. Der Hash belegt dann Unveraenderlichkeit, nie
// Richtigkeit: er konserviert den Widerspruch, statt ihn zu verhindern. Ort 2 ist die stille Variante desselben
// Fehlers: das Dropdown verspricht 50 €, gerechnet wird etwas anderes.
//
// Dieser Test behebt die Mehrfachpflege NICHT — der saubere Schnitt waere EINE Tarif-Quelle, aus der die
// anderen ableiten (so wie 4 es aus 3 schon tut). Bis dahin faellt jede Aenderung, die nur einen Ort trifft,
// hier auf und nicht erst im Bescheid. Der Rueckfall MUSTER_ANTRAG wird ausdruecklich mitgeprueft: eine
// veraltete Rueckfall-Maschine beisst genau dann, wenn der Vertrag ohnehin schon bricht.
import { describe, expect, it } from "vitest";
import type { TarifTabelle } from "@senticor/public-sector-sdk";
import { leistungConfig } from "../src/leistung.config.js";
import { antragProcedure } from "./procedure.config.js";

/** Cent je Einheit der natuerlichen Waehrungsangabe (EUR). Der Faktor ist die einzige erlaubte Uebersetzung. */
const CENT_JE_EUR = 100;

/** Der Tarif des ANTRAGS-Verfahrens (Ort 3) — aus der Statusmaschine, nicht aus einer Kopie im Test. */
function antragsTarif(): TarifTabelle {
  const t = (leistungConfig.statusMachine?.transitions ?? [])
    .map(
      (u) =>
        (u as { stelltForderung?: { tarif?: TarifTabelle } }).stelltForderung
          ?.tarif,
    )
    .find(Boolean);
  if (!t)
    throw new Error("kein stelltForderung.tarif im Antrags-Verfahren gefunden");
  return t;
}

/** Der Tarif, wie der SERVER das Antrags-Verfahren sieht (Ort 4) — nach der Ableitung aus dem Client-Vertrag
 *  bzw. aus der Rueckfall-Maschine MUSTER_ANTRAG, wenn der Vertrag fehlt oder bricht. */
function serverAntragsTarif(): TarifTabelle {
  const t = antragProcedure.allowedTransitions
    .map((u) => u.stelltForderung?.tarif)
    .find(Boolean);
  if (!t)
    throw new Error(
      "kein stelltForderung.tarif in der Server-Sicht des Antrags-Verfahrens gefunden",
    );
  return t;
}

/** Die vom Buerger WAEHLBAREN Kategorien (Ort 2) — die Menge, die wirklich vorkommen kann. */
function waehlbareKategorien(): { value: string; label: string }[] {
  for (const step of leistungConfig.antrag?.steps ?? []) {
    for (const feld of (step as { felder?: unknown[] }).felder ?? []) {
      const f = feld as {
        name?: string;
        options?: { value: string; label: string }[];
      };
      if (f.name === "anliegen.kategorie" && Array.isArray(f.options))
        return f.options;
    }
  }
  throw new Error(
    "kein Auswahlfeld anliegen.kategorie im Antragsformular gefunden",
  );
}

/** Der client-gerechnete Betrag (Ort 1) fuer eine Kategorie — ueber die echte Funktion, nicht ueber die Konstante. */
function clientBetrag(kategorie: string): { betrag: number; einheit: string } {
  const b = leistungConfig.berechne?.({ anliegen: { kategorie } } as never) as
    { betrag?: unknown; einheit?: unknown } | undefined;
  return {
    betrag: typeof b?.betrag === "number" ? b.betrag : Number.NaN,
    einheit: typeof b?.einheit === "string" ? b.einheit : "",
  };
}

describe("tarif-kongruenz — mehrere Orte, ein Betrag", () => {
  it("die waehlbaren Kategorien sind ueberhaupt gefunden (sonst prueft der Rest nichts)", () => {
    expect(waehlbareKategorien().length).toBeGreaterThan(0);
    expect(antragsTarif().positionen.length).toBeGreaterThan(0);
  });

  // ── ORT 1 gegen ORT 3: Bescheid-Tenor gegen Sollstellung ──────────────────────────────────────────────────
  it("jede waehlbare Kategorie: client-gerechneter Tenor == server-autoritativer Tarif", () => {
    const tarif = antragsTarif();
    for (const { value } of waehlbareKategorien()) {
      const client = clientBetrag(value);
      const pos = tarif.positionen.find((p) => p.kategorie === value);
      expect(
        pos,
        `Kategorie »${value}« ist waehlbar, steht aber in keiner Tarif-Position — die Kasse wuerde ` +
          `${tarif.defaultCent ?? 0} Cent fordern, waehrend der Bescheid ${client.betrag} ${client.einheit} nennt`,
      ).toBeDefined();
      expect(
        client.einheit,
        `Kategorie »${value}«: die Einheit muss EUR sein, sonst traegt der Faktor nicht`,
      ).toBe("EUR");
      expect(
        client.betrag * CENT_JE_EUR,
        `Kategorie »${value}«: der Bescheid nennt ${client.betrag} EUR, die Kasse fordert ${pos!.betragCent} Cent`,
      ).toBe(pos!.betragCent);
    }
  });

  it("umgekehrt: keine Tarif-Position ohne waehlbare Kategorie (toter Satz, den niemand ausloest)", () => {
    const waehlbar = new Set(waehlbareKategorien().map((o) => o.value));
    for (const p of antragsTarif().positionen) {
      expect(
        waehlbar.has(p.kategorie),
        `Tarif-Position »${p.kategorie}« ist nicht waehlbar`,
      ).toBe(true);
    }
  });

  // ── ORT 2: das Label im Auswahlfeld ───────────────────────────────────────────────────────────────────────
  it("nennt ein Auswahl-Label einen Euro-Betrag, ist es DERSELBE Betrag", () => {
    for (const { value, label } of waehlbareKategorien()) {
      const treffer = /(\d+(?:[.,]\d+)?)\s*€/.exec(label);
      if (!treffer) continue; // ein Label ohne Betrag behauptet nichts — kein Falsch-Blocker
      const imLabel = Number(treffer[1]!.replace(",", "."));
      expect(
        imLabel,
        `das Label »${label}« verspricht ${imLabel} €, gerechnet werden ${clientBetrag(value).betrag} €`,
      ).toBe(clientBetrag(value).betrag);
    }
  });

  // ── ORT 4: der dokumentierte Spiegel ──────────────────────────────────────────────────────────────────────
  it("die SERVER-Sicht des Antrags-Verfahrens traegt denselben Tarif wie die Client-Config", () => {
    const a = antragsTarif();
    const d = serverAntragsTarif();
    const alsPaare = (t: TarifTabelle) =>
      [...t.positionen]
        .map((p) => `${p.kategorie}=${p.betragCent}`)
        .sort()
        .join(",");
    expect(
      alsPaare(d),
      "Server und Client sehen verschiedene Saetze — entweder die Vertrags-Ableitung greift nicht, oder die " +
        "Rueckfall-Maschine MUSTER_ANTRAG ist veraltet (sie beisst genau dann, wenn der Vertrag schon bricht)",
    ).toBe(alsPaare(a));
    expect(
      d.defaultCent ?? 0,
      "auch der Default fuer unbekannte Kategorien muss deckungsgleich sein",
    ).toBe(a.defaultCent ?? 0);
  });

  // ── DIE UNBEKANNTE KATEGORIE: die zwei Nullen ─────────────────────────────────────────────────────────────
  it("eine unbekannte Kategorie liefert 0 auf BEIDEN Seiten — sonst bedeutet dieselbe 0 zweierlei", () => {
    const client = clientBetrag("gibt-es-nicht");
    expect(client.betrag * CENT_JE_EUR).toBe(antragsTarif().defaultCent ?? 0);
  });
});
