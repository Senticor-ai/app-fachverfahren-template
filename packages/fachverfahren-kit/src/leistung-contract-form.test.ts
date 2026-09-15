// leistung-contract-form.test — GEGENPROBE der EINEN Pflicht-Form.
//
// Diese Suite haelt DREI Seiten deckungsgleich, ohne dass eine von ihnen die Pflichtmenge zweimal
// nennt: die Konstante (Daten) · den PRUEFER (scripts/check-leistung-contract.mts, der sie ausfuehrt) ·
// das SCHEMA (schemas/leistung-config.schema.json, das sie projiziert). Sie bezieht ihren Gegenstand
// zur LAUFZEIT aus der Quelle — kein abgeschriebener Feldname, kein abgeschriebener Verstosstext.
//
// POSITIV-KONTROLLE: waere `LEISTUNG_CONTRACT_FORM` leer, liefe jede Mutations-Schleife null Mal und
// die Suite stuende gruen, ohne etwas zu pruefen. Der erste Test schliesst genau das aus.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEISTUNG_CONTRACT_FORM,
  pruefeForm,
  zuJsonSchema,
  type FormPflicht,
} from "./leistung-contract-form.js";

const repoWurzel = new URL("../../../", import.meta.url);
const schemaUrl = new URL("schemas/leistung-config.schema.json", repoWurzel);
const prueferUrl = new URL("scripts/check-leistung-contract.mts", repoWurzel);

/** Setzt einen Punkt-Pfad in einer tiefen Kopie; `undefined` loescht das Glied. */
function mitPfad(
  wurzel: Record<string, unknown>,
  pfad: string,
  wert: unknown,
): Record<string, unknown> {
  const kopie = structuredClone(wurzel);
  const glieder = pfad.split(".");
  let knoten = kopie;
  for (const glied of glieder.slice(0, -1))
    knoten = knoten[glied] as Record<string, unknown>;
  const letztes = glieder[glieder.length - 1]!;
  if (wert === undefined) delete knoten[letztes];
  else knoten[letztes] = wert;
  return kopie;
}

/** Ein Snapshot, der GENAU die Pflicht-Form erfuellt — aus der Quelle gebaut, nicht abgeschrieben. */
function gueltigerSnapshot(): Record<string, unknown> {
  let snap: Record<string, unknown> = {};
  for (const pflicht of LEISTUNG_CONTRACT_FORM) {
    const wert =
      pflicht.art === "string"
        ? "x"
        : Array.from({ length: pflicht.minItems ?? 0 }, (_, i) => ({ i }));
    const glieder = pflicht.pfad.split(".");
    if (glieder.length === 2 && !snap[glieder[0]!]) snap[glieder[0]!] = {};
    snap = mitPfad(snap, pflicht.pfad, wert);
  }
  return snap;
}

/** Der Wert, mit dem eine Pflicht MINIMAL verletzt wird (leer statt fehlend). */
function zuKlein(pflicht: FormPflicht): unknown {
  return pflicht.art === "string"
    ? ""
    : Array.from(
        { length: Math.max((pflicht.minItems ?? 1) - 1, 0) },
        () => ({}),
      );
}

describe("LEISTUNG_CONTRACT_FORM — die Pflicht-Form ist ausfuehrbar", () => {
  it("POSITIV-KONTROLLE: die Form ist nicht leer und ein gueltiger Snapshot ist mangelfrei", () => {
    expect(LEISTUNG_CONTRACT_FORM.length).toBeGreaterThanOrEqual(8);
    expect(new Set(LEISTUNG_CONTRACT_FORM.map((p) => p.pfad)).size).toBe(
      LEISTUNG_CONTRACT_FORM.length,
    );
    expect(pruefeForm(gueltigerSnapshot())).toEqual([]);
  });

  it.each(LEISTUNG_CONTRACT_FORM.map((p) => [p.pfad, p] as const))(
    "%s: fehlend UND zu klein fallen je mit GENAU dem eigenen Verstoss",
    (_pfad, pflicht) => {
      expect(
        pruefeForm(mitPfad(gueltigerSnapshot(), pflicht.pfad, undefined)),
      ).toEqual([pflicht.verstoss]);
      expect(
        pruefeForm(
          mitPfad(gueltigerSnapshot(), pflicht.pfad, zuKlein(pflicht)),
        ),
      ).toEqual([pflicht.verstoss]);
    },
  );
});

describe("Schema und Pruefer bleiben deckungsgleich", () => {
  it("die committete Schema-Datei ist byte-gleich zur Projektion (Frische-Gate)", () => {
    expect(readFileSync(schemaUrl, "utf8")).toBe(
      JSON.stringify(zuJsonSchema(), null, 2) + "\n",
    );
  });

  it("das Schema behauptet KEINE Pflicht, die die Form nicht kennt", () => {
    const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as Record<
      string,
      unknown
    >;
    // Alle Pflicht-Pfade, die das Schema (als Datei) fordert — aus der DATEI gelesen, nicht projiziert.
    const ausSchema: string[] = [];
    for (const wurzel of schema["required"] as string[]) {
      const knoten = (schema["properties"] as Record<string, SchemaKnotenLese>)[
        wurzel
      ]!;
      if (knoten.required)
        for (const kind of knoten.required) ausSchema.push(`${wurzel}.${kind}`);
      else ausSchema.push(wurzel);
    }
    expect(ausSchema.sort()).toEqual(
      LEISTUNG_CONTRACT_FORM.map((p) => p.pfad).sort(),
    );
  });

  it("der PRUEFER traegt die Form nicht mehr selbst — er fuehrt sie aus", () => {
    const quelle = readFileSync(prueferUrl, "utf8");
    // Aus der QUELLE abgeleitet: kein Verstosstext der Form steht noch einmal im Pruefer.
    for (const pflicht of LEISTUNG_CONTRACT_FORM)
      expect(quelle).not.toContain(pflicht.verstoss);
    // Anti-Rueckfall auf die GRAMMATIK der Form (Anwesenheit/Mindestzahl): so entsteht keine neue
    // handgeschriebene Pflicht am Schema vorbei. Bewusst UEBRIG bleibt der GRAPH-Satz
    // `contract.statusMachine hat keinen Endzustand …` — eine Aussage ueber den Zustandsgraphen,
    // die diese Projektion nicht traegt und die deshalb im Pruefer zu Hause ist.
    expect(
      quelle.match(/"contract\.[^"]* (fehlt\/leer|muss mind\.)/g),
    ).toBeNull();
    expect(quelle).toContain("pruefeForm(snap)");
    expect(quelle).toContain("zuJsonSchema()");
  });
});

interface SchemaKnotenLese {
  required?: string[];
}
