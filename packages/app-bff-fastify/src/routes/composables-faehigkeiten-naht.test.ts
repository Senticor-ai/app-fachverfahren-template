// S6 · NAHT 3+4 — die zwei Seiten ueberleben den DRAHT.
//
// WARUM DIESER TEST EIGENS EXISTIERT: `ComposableDetailDtoSchema` traegt `additionalProperties: false`, und
// Fastify wirft Undeklariertes beim Serialisieren STILL weg. Ein Feld, das der Mapper korrekt setzt und der
// Serializer schweigend entfernt, sieht auf der Flaeche exakt aus wie „gibt es nicht" — nur bemerkt es niemand.
// Fuer diese Naht gibt es keine generelle Zusicherung; sie braucht ihren eigenen Beweis.
//
// UND DIE GEGENPROBE MACHT DEN BEWEIS ERST ZU EINEM: ein Feld, das NICHT im Schema steht, verschwindet im
// selben Aufruf. Damit ist gezeigt, dass die Deklaration der Grund ist, warum die anderen ankommen — und nicht
// etwa, dass hier gar nicht gestrippt wuerde.
//
// IP-GRENZE: es reist der ANSPRUCH — Kennung, Klasse, Grundlagen, Erzeugungs-Provenienz. Der Programm-KOERPER
// (Tarif-Tabelle, DMN, Formel, Code) reist NIE: er liegt beim Herausgeber unter `.chos/business-logic`, das
// dieses Kit nicht hat und nicht haben soll.
import { describe, expect, it } from "vitest";
import {
  createInMemoryComposableRegistry,
  type AgenticComposable,
} from "@senticor/public-sector-sdk";
import { buildBffApp, caseworkerSession } from "../test-helpers.js";

function composable(over: Partial<AgenticComposable> = {}): AgenticComposable {
  return {
    id: "musterverfahren",
    version: "1.0.0",
    displayName: "Musterverfahren",
    klasse: "outcome",
    status: "certified",
    assurance: "CAL-2",
    outcome: { fuerWen: "Sachbearbeitung", ergebnis: "beschiedener Antrag", messung: "Durchlaufzeit", nichtScope: [] },
    owners: { capabilityOwner: "amt", serviceOwner: "fachbereich" },
    moduleId: "musterverfahren",
    spine: {
      role: "musterverfahren-spine",
      autonomy: "AAL-2",
      aufgaben: ["assistenz", "pruefung"],
      skills: ["unterlagen-lesen"],
      knowledgeDomains: ["musterverfahren"],
    },
    evals: ["eval:smoke"],
    replaceableBy: [],
    ...over,
  };
}

const detail = async (c: AgenticComposable) => {
  const { app } = await buildBffApp({
    session: caseworkerSession(),
    composableRegistry: createInMemoryComposableRegistry([c]),
  });
  const res = await app.inject({ method: "GET", url: `/api/composables/${c.id}` });
  const body = res.json();
  await app.close();
  return { status: res.statusCode, body };
};

describe("S6 · beide Faehigkeits-Seiten auf dem Draht", () => {
  it("die strukturierte Seite ueberlebt VOLLSTAENDIG — jedes Feld einzeln, nicht nur das Array", async () => {
    const { status, body } = await detail(
      composable({
        strukturiert: [
          {
            id: "steuer-tarif",
            ergebnis: "der festgesetzte Betrag",
            klasse: "tarif",
            programm: "tarif:staffel",
            grundlagen: ["§ 3 Satzung"],
            evalSuite: "eval:tarif",
            erzeugtVon: "unterlagen-lesen",
            freigegebenVon: "amtsleitung",
          },
        ],
        benutzt: [{ wissen: "unterlagen-lesen", werkzeug: "steuer-tarif" }],
      }),
    );
    expect(status).toBe(200);
    expect(body.strukturiert).toEqual([
      {
        id: "steuer-tarif",
        ergebnis: "der festgesetzte Betrag",
        klasse: "tarif",
        programm: "tarif:staffel",
        grundlagen: ["§ 3 Satzung"],
        evalSuite: "eval:tarif",
        erzeugtVon: "unterlagen-lesen",
        freigegebenVon: "amtsleitung",
      },
    ]);
    expect(body.benutzt).toEqual([{ wissen: "unterlagen-lesen", werkzeug: "steuer-tarif" }]);
  });

  it("GEGENPROBE zur Strip-Naht: ein NICHT deklariertes Feld verschwindet im selben Aufruf", async () => {
    const { body } = await detail(
      composable({
        strukturiert: [
          { id: "steuer-tarif", ergebnis: "der festgesetzte Betrag", tabelle: [[1, 2]] } as never,
        ],
      }),
    );
    // Der Anspruch kommt an …
    expect(body.strukturiert?.[0]?.id).toBe("steuer-tarif");
    // … der undeklarierte Koerper nicht. Ohne diese Zeile bewiese der Test oben nichts ueber die Deklaration.
    expect(body.strukturiert?.[0]?.tabelle).toBeUndefined();
  });

  it("die Provenienz-Marke ueberlebt OHNE Freigabe — der Betreiber muss sehen, was er betreibt", async () => {
    const { body } = await detail(
      composable({
        strukturiert: [
          { id: "erzeugte-regel", ergebnis: "geprüfter Tatbestand", programm: "regel:erzeugt", erzeugtVon: "unterlagen-lesen" },
        ],
      }),
    );
    expect(body.strukturiert?.[0]?.erzeugtVon).toBe("unterlagen-lesen");
    expect(body.strukturiert?.[0]?.freigegebenVon).toBeUndefined();
  });

  it("ohne strukturierte Seite fehlt das Feld GANZ — nicht als leeres Array", async () => {
    // Absenz ist eine Aussage. Ein leeres Array saehe aus wie „geprueft und nichts gefunden".
    const { body } = await detail(composable());
    expect(body.strukturiert).toBeUndefined();
    expect(body.benutzt).toBeUndefined();
    expect(body.id).toBe("musterverfahren"); // PARITAET: alles Uebrige unveraendert
  });

  it("die Liste bleibt unveraendert — die zweite Seite gehoert ins Detail, nicht in die Discovery", async () => {
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      composableRegistry: createInMemoryComposableRegistry([
        composable({ strukturiert: [{ id: "steuer-tarif", ergebnis: "Betrag" }] }),
      ]),
    });
    const res = await app.inject({ method: "GET", url: "/api/composables" });
    expect(res.statusCode).toBe(200);
    expect(res.json().composables[0].strukturiert).toBeUndefined();
    await app.close();
  });
});
