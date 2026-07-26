// cases-va-regime-failclosed.test — DIE GEGENPROBE ZU W1 (Phase 5, Audit-Befund S1).
//
// RECHTSFOLGE, die hier getestet wird: ein Verfahren, dessen Rechtsbehelfs-Regime unvollständig (oder gar nicht)
// deklariert ist, darf KEINEN Verwaltungsakt erlassen. Vorher erbte der Server still das Regime der Vorlage und
// fror einen Bescheid mit der Belehrung einer FREMDEN Verfahrensschiene ein — eine unrichtige Belehrung
// verlängert die Rechtsbehelfsfrist auf EIN JAHR (§ 356 Abs. 2 AO / § 58 Abs. 2 VwGO), für JEDEN Bescheid.
//
// Der Test ist bewusst als GEGENPROBE gebaut: dieselbe Kette, einmal mit vollständigem Regime (200, VA eingefroren)
// und einmal mit je EINEM fehlenden Pflicht-Slot (422, KEIN VA). Ohne den Fix wäre der 422-Fall ein 200 mit
// stillschweigend geerbtem Muster-Regime.
import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
  type RechtsbehelfConfig,
} from "@senticor/public-sector-sdk";
import { buildBffApp, caseworkerSession } from "../test-helpers.js";

const VOLLSTAENDIG: RechtsbehelfConfig = {
  art: "einspruch",
  fristWert: 1,
  fristEinheit: "monat",
  stelle: "der Stadt Musterstadt — Steueramt",
  sitz: "Rathausplatz 1, 12345 Musterstadt",
  form: "schriftlich, elektronisch oder zur Niederschrift",
  norm: "§ 355 Abs. 1 AO",
};

function verfahren(
  verwaltungsakt: ProcedureVersion["verwaltungsakt"],
): ProcedureVersion {
  return {
    procedureId: "regime-probe",
    version: "1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    legalBasisIds: ["§ 1 Demo-Satzung"],
    allowedStates: ["offen", "in_pruefung", "festgesetzt"],
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
    ],
    ...(verwaltungsakt ? { verwaltungsakt } : {}),
  };
}

/** Fährt die Kette anlegen → prüfen → festsetzen und liefert den Status des Festsetzungs-Übergangs. */
async function festsetzen(
  procedure: ProcedureVersion,
): Promise<{ status: number; body: Record<string, unknown>; hatVa: boolean }> {
  const caseStore = new InMemoryCaseStore();
  const registry = createInMemoryProcedureRegistry([procedure]);
  const mk = (actorId: string) =>
    buildBffApp({
      session: caseworkerSession({ actorId }),
      caseStore,
      procedureRegistry: registry,
    });

  const { app: a } = await mk("actor.a");
  const created = (
    await a.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        procedureId: procedure.procedureId,
        procedureVersion: "1",
        state: "offen",
        subjectIds: ["subject.1"],
        data: { berechnung: { betrag: 50, einheit: "EUR" } },
      },
    })
  ).json();
  const vorgeprueft = await a.inject({
    method: "POST",
    url: `/api/cases/${created.caseId}/transitions`,
    payload: { action: "pruefen", expectedVersion: created.version },
  });
  await a.close();

  const { app: b } = await mk("actor.b");
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
  const hatVa = (audit.events as { payload: Record<string, unknown> }[]).some(
    (e) => Boolean(e.payload["verwaltungsakt"]),
  );
  await b.close();
  return { status: res.statusCode, body: res.json(), hatVa };
}

describe("Erlass eines Verwaltungsakts — fail-closed ohne vollständiges Rechtsbehelfs-Regime (W1)", () => {
  it("GRÜN: vollständiges Regime ⇒ 200 und der Bescheid wird eingefroren (Überblockungs-Schutz)", async () => {
    const r = await festsetzen(
      verfahren({
        rechtsbehelf: VOLLSTAENDIG,
        fiktionTage: 4,
        fiktionNorm: "§ 122 Abs. 2 AO",
      }),
    );
    expect(r.status).toBe(200);
    expect(r.hatVa).toBe(true);
  });

  it("ROT: GAR KEIN Regime ⇒ 422, KEIN Verwaltungsakt (vorher: stilles Erben des Muster-Regimes)", async () => {
    const r = await festsetzen(verfahren(undefined));
    expect(r.status).toBe(422);
    expect(String(r.body["error"])).toMatch(/Rechtsbehelfs-Regime/);
    expect(r.hatVa).toBe(false);
  });

  it.each([
    ["sitz", "§ 356 Abs. 1 AO"],
    ["form", "§ 357 Abs. 1 AO"],
    ["stelle", "§ 357 Abs. 2 AO"],
    ["norm", "Rechtsgrundlage des Rechtsbehelfs"],
  ])(
    'ROT: fehlender Pflicht-Slot „%s" (%s) ⇒ 422, KEIN Verwaltungsakt',
    async (slot) => {
      const rb = { ...VOLLSTAENDIG } as Record<string, unknown>;
      delete rb[slot];
      const r = await festsetzen(
        verfahren({
          rechtsbehelf: rb as unknown as RechtsbehelfConfig,
          fiktionTage: 4,
          fiktionNorm: "§ 122 Abs. 2 AO",
        }),
      );
      expect(r.status).toBe(422);
      expect(String(r.body["error"])).toContain(slot);
      expect(r.hatVa).toBe(false);
    },
  );

  it("ROT: fehlende Bekanntgabe-Fiktionsnorm ⇒ 422 (die Fristberechnung wäre sonst unbelegt)", async () => {
    const r = await festsetzen(
      verfahren({
        rechtsbehelf: VOLLSTAENDIG,
        fiktionTage: 4,
        fiktionNorm: "",
      }),
    );
    expect(r.status).toBe(422);
    expect(String(r.body["error"])).toContain("bekanntgabe-fiktionsnorm");
    expect(r.hatVa).toBe(false);
  });

  it("ÜBERBLOCKUNG: ein Übergang OHNE issuesVerwaltungsakt läuft auch ohne jedes Regime durch", async () => {
    const p = verfahren(undefined);
    const caseStore = new InMemoryCaseStore();
    const { app } = await buildBffApp({
      session: caseworkerSession({ actorId: "actor.a" }),
      caseStore,
      procedureRegistry: createInMemoryProcedureRegistry([p]),
    });
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: p.procedureId,
          procedureVersion: "1",
          state: "offen",
          subjectIds: ["subject.1"],
          data: {},
        },
      })
    ).json();
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "pruefen", expectedVersion: created.version },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
