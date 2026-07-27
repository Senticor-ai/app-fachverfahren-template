// cases-tenor-nachrechnung — der Beweis AM LAUFENDEN SERVER, dass die Behörde ihren Betrag selbst nachrechnet.
//
// Ohne diesen Test wäre `tenorNachrechnung` genau das, was in dieser Fabrik immer wieder auffällt: eine Naht,
// die vorgesehen, typisiert, dokumentiert und nie berührt wird. Die reine Prüffunktion ist anderswo bewiesen
// (tenor-nachrechnung.test.ts) — hier geht es allein um die VERDRAHTUNG: feuert sie am echten Übergang, und
// hält sie den Bescheid wirklich auf?
import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import { buildBffApp, caseworkerSession } from "../test-helpers.js";

/** Ein Verfahren, das seinen Tarif EINMAL deklariert (an stelltForderung) und den Tenor dagegen nachrechnet. */
const verfahren: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen", "in_pruefung", "festgesetzt", "rueckforderung"],
  allowedTransitions: [
    {
      from: "offen",
      to: "in_pruefung",
      action: "pruefen",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "in_pruefung",
      to: "festgesetzt",
      action: "festsetzen",
      requiredPermission: "case.decision.prepare",
      requiresFourEyes: true,
      closesCase: true,
      issuesVerwaltungsakt: true,
    },
    // DER TARIF STEHT HIER — die Nachrechnung bringt keinen zweiten mit, sie liest diesen.
    {
      from: "festgesetzt",
      to: "rueckforderung",
      action: "rueckfordern",
      requiredPermission: "case.decision.prepare",
      stelltForderung: {
        tarif: {
          positionen: [
            { kategorie: "standard", betragCent: 5000 },
            { kategorie: "express", betragCent: 9000 },
          ],
          defaultCent: 0,
        },
        diskriminator: "anliegen.kategorie",
      },
    },
  ],
  verwaltungsakt: {
    rechtsbehelf: {
      art: "widerspruch",
      fristWert: 1,
      fristEinheit: "monat",
      stelle: "der erlassenden Behörde",
      norm: "§ 68 ff. VwGO",
      sitz: "Rathausplatz 1, 12345 Musterstadt",
      form: "schriftlich, elektronisch oder zur Niederschrift",
    },
    fiktionTage: 4,
    fiktionNorm: "§ 41 Abs. 2 VwVfG",
  },
  verwaltungsaktInhalt: {
    tenorNachrechnung: {
      diskriminator: "anliegen.kategorie",
      betragPfad: "berechnung.betrag",
    },
  },
};

/** Dasselbe Verfahren OHNE Nachrechnung — der Paritäts-Zeuge für Muster A. */
const ohneNachrechnung: ProcedureVersion = {
  ...verfahren,
  verwaltungsaktInhalt: {},
};

function appFor(
  caseStore: InMemoryCaseStore,
  actorId: string,
  p: ProcedureVersion,
) {
  return buildBffApp({
    session: caseworkerSession({ actorId }),
    caseStore,
    procedureRegistry: createInMemoryProcedureRegistry([p]),
  });
}

/** Fall anlegen, vorprüfen (Akteur A) und festsetzen (Akteur B) — gibt die Festsetzungs-Antwort zurück. */
async function bisFestsetzung(
  p: ProcedureVersion,
  betrag: unknown,
  kategorie: string,
) {
  const caseStore = new InMemoryCaseStore();
  const { app: a } = await appFor(caseStore, "actor.a", p);
  const created = (
    await a.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        procedureId: "musterantrag",
        procedureVersion: "1",
        state: "offen",
        subjectIds: ["subject.1"],
        data: {
          anliegen: { kategorie },
          berechnung: { betrag, einheit: "EUR", label: "Gebühr" },
        },
      },
    })
  ).json();
  const vorgeprueft = await a.inject({
    method: "POST",
    url: `/api/cases/${created.caseId}/transitions`,
    payload: { action: "pruefen", expectedVersion: created.version },
  });
  expect(vorgeprueft.statusCode).toBe(200);
  await a.close();

  const { app: b } = await appFor(caseStore, "actor.b", p);
  const res = await b.inject({
    method: "POST",
    url: `/api/cases/${created.caseId}/transitions`,
    payload: {
      action: "festsetzen",
      expectedVersion: vorgeprueft.json().version,
    },
  });
  const audit = (
    await b.inject({ method: "GET", url: `/api/cases/${created.caseId}/audit` })
  ).json();
  await b.close();
  const va = audit.events.find(
    (e: { eventType: string; payload: Record<string, unknown> }) =>
      e.eventType === "case.transitioned" && e.payload["verwaltungsakt"],
  )?.payload?.verwaltungsakt;
  return { res, va };
}

describe("Tenor-Nachrechnung am festsetzenden Übergang", () => {
  it("stimmt der Betrag mit dem Tarif überein, wird er erlassen — und die Herkunft ist server-nachgerechnet", async () => {
    const { res, va } = await bisFestsetzung(verfahren, 50, "standard");
    expect(res.statusCode).toBe(200);
    expect(va?.content?.tenorHerkunft).toBe("server-nachgerechnet");
  });

  it("weicht der Betrag ab, wird der Bescheid NICHT erlassen — und der Grund nennt beide Zahlen", async () => {
    const { res, va } = await bisFestsetzung(verfahren, 55, "standard");
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/5500/);
    expect(res.json().error).toMatch(/5000/);
    // ENTSCHEIDEND: kein halb erlassener Bescheid. Die Sperre greift VOR dem Einfrieren.
    expect(va).toBeUndefined();
  });

  it("eine Kategorie, die der Tarif nicht kennt, trägt keine Festsetzung", async () => {
    const { res, va } = await bisFestsetzung(verfahren, 0, "gibt-es-nicht");
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/nicht hinterlegt/);
    expect(va).toBeUndefined();
  });

  it("fehlt der Betrag ganz, ist das keine Übereinstimmung — auch dann kein Bescheid", async () => {
    const { res, va } = await bisFestsetzung(verfahren, undefined, "standard");
    expect(res.statusCode).toBe(422);
    expect(va).toBeUndefined();
  });

  // ── MUSTER A: ohne Deklaration ändert sich NICHTS ─────────────────────────────────────────────────────────
  it("ohne tenorNachrechnung bleibt alles wie bisher — erlassen, Herkunft client-berechnet", async () => {
    const { res, va } = await bisFestsetzung(ohneNachrechnung, 55, "standard");
    expect(res.statusCode).toBe(200);
    expect(va?.content?.tenorHerkunft).toBe("client-berechnet");
  });

  it("ohne tenorNachrechnung sperrt auch eine unbekannte Kategorie nicht (kein Falsch-Blocker)", async () => {
    const { res } = await bisFestsetzung(ohneNachrechnung, 0, "gibt-es-nicht");
    expect(res.statusCode).toBe(200);
  });
});
