import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";
import { canonicalSha256 } from "../canonical-hash.js";

// Verfahren, das beim festsetzenden Übergang einen VERWALTUNGSAKT erlässt: offen → festgesetzt,
// Vier-Augen, closesCase, issuesVerwaltungsakt, mit Rechtsbehelf-/Fiktions-Fachlichkeit.
const procedure: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen", "festgesetzt"],
  allowedTransitions: [
    {
      from: "offen",
      to: "festgesetzt",
      action: "festsetzen",
      requiredPermission: "case.decision.prepare",
      requiresFourEyes: true,
      closesCase: true,
      issuesVerwaltungsakt: true,
    },
  ],
  verwaltungsakt: {
    rechtsbehelf: {
      art: "widerspruch",
      fristWert: 1,
      fristEinheit: "monat",
      stelle: "der erlassenden Behörde",
      norm: "§ 68 ff. VwGO",
    },
    fiktionTage: 4,
    fiktionNorm: "§ 41 Abs. 2 VwVfG",
  },
};

const berechnung = {
  betrag: 50,
  einheit: "EUR",
  label: "Bearbeitungsgebühr",
  begruendung: "Standardsatz",
};

function appFor(caseStore: InMemoryCaseStore, actorId: string) {
  return buildBffApp({
    session: caseworkerSession({ actorId }),
    caseStore,
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

describe("Verwaltungsakt einfrieren am festsetzenden Übergang", () => {
  it("friert den Bescheid in die Audit-payload — Tenor aus case.data, Hash über die BYTES, issuedBy server-autoritativ", async () => {
    const caseStore = new InMemoryCaseStore();
    // Akteur A legt den Fall an (case.opened durch A) — mit der client-gerechneten Berechnung in data.
    const { app: appA } = await appFor(caseStore, "actor.a");
    const created = (
      await appA.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "musterantrag",
          procedureVersion: "1",
          state: "offen",
          subjectIds: ["subject.1"],
          data: { berechnung },
        },
      })
    ).json();
    await appA.close();

    // Akteur B (≠ A) setzt fest → Vier-Augen erfüllt, Bescheid wird eingefroren.
    const { app: appB } = await appFor(caseStore, "actor.b");
    const res = await appB.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "festsetzen", expectedVersion: created.version },
    });
    expect(res.statusCode).toBe(200);

    // Das eingefrorene VA liegt in der payload des case.transitioned-Ereignisses.
    const audit = (
      await appB.inject({
        method: "GET",
        url: `/api/cases/${created.caseId}/audit`,
      })
    ).json();
    const festsetzung = audit.events.find(
      (e: { eventType: string }) => e.eventType === "case.transitioned",
    );
    const va = festsetzung?.payload?.verwaltungsakt as
      { content: Record<string, unknown>; checksumSha256: string } | undefined;
    expect(va).toBeDefined();

    // Der Hash BEWEIST die Bytes: re-hashen der gelieferten content ergibt exakt den gespeicherten Hash.
    expect(canonicalSha256(va!.content)).toBe(va!.checksumSha256);

    // Tenor kommt aus case.data.berechnung (nicht aus dem Body); issuedBy ist der festsetzende Akteur.
    expect(va!.content["tenor"]).toEqual(berechnung);
    expect(va!.content["issuedBy"]).toBe("actor.b");
    expect(va!.content["aktenzeichen"]).toBe(created.caseId);
    // Rechtsbehelf/Fiktion sind eingefroren (nicht live aus einer Config).
    expect(va!.content["rechtsbehelf"]).toEqual(
      procedure.verwaltungsakt!.rechtsbehelf,
    );
    expect(va!.content["fiktionNorm"]).toBe("§ 41 Abs. 2 VwVfG");
    await appB.close();
  });

  it("BÜRGER-DOWNLOAD: Eigentümer:in lädt den eingefrorenen Bescheid (Hash im Body), Abruf wird als case.disclosed auditiert, Fremd-Session → 404", async () => {
    const caseStore = new InMemoryCaseStore();
    const registry = createInMemoryProcedureRegistry([procedure]);
    // Bürgerin Anna reicht ein (owner = anna); Zustand = allowedStates[0] = "offen".
    const { app: anna } = await buildBffApp({
      session: citizenSession({ actorId: "actor.anna" }),
      caseStore,
      procedureRegistry: registry,
    });
    const antrag = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: {
          procedureId: "musterantrag",
          procedureVersion: "1",
          data: { berechnung },
        },
      })
    ).json();

    // Die Sachbearbeitung setzt fest → Bescheid wird eingefroren (kein vorheriger Bearbeitungsschritt,
    // Vier-Augen greift nicht: die Einreichung ist case.submitted, nicht four-eyes-relevant).
    const { app: amt } = await buildBffApp({
      session: caseworkerSession({ actorId: "actor.sb" }),
      caseStore,
      procedureRegistry: registry,
    });
    const festsetzung = await amt.inject({
      method: "POST",
      url: `/api/cases/${antrag.antragId}/transitions`,
      payload: { action: "festsetzen", expectedVersion: antrag.version },
    });
    expect(festsetzung.statusCode).toBe(200);
    await amt.close();

    // Anna lädt IHREN Bescheid.
    const res = await anna.inject({
      method: "GET",
      url: `/api/buerger/antraege/${antrag.antragId}/bescheid`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toBe("inline");
    const dto = res.json();
    // Der Hash ist im Body (nicht von removeAdditional verschluckt) UND beweist die Bytes.
    expect(dto.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    const { checksumSha256: _h, ...content } = dto;
    expect(canonicalSha256(content)).toBe(dto.checksumSha256);
    expect(dto.tenor).toEqual(berechnung);
    expect(dto.rechtsbehelf.art).toBe("widerspruch");
    // EHRLICHE HERKUNFT: der Betrag wurde client-berechnet (berechne-Escape), server NICHT nachgerechnet.
    expect(dto.tenorHerkunft).toBe("client-berechnet");

    // Der Abruf ist bekanntgabe-relevant → case.disclosed im Audit (Fristlauf-Anker).
    const { app: amtLese } = await buildBffApp({
      session: caseworkerSession({ actorId: "actor.sb" }),
      caseStore,
      procedureRegistry: registry,
    });
    const auditTypes = (
      await amtLese.inject({
        method: "GET",
        url: `/api/cases/${antrag.antragId}/audit`,
      })
    )
      .json()
      .events.map((e: { eventType: string }) => e.eventType);
    expect(auditTypes).toContain("case.disclosed");
    await amtLese.close();
    await anna.close();

    // Eine FREMDE Bürgerin (Bodo) bekommt 404 — kein Existenz-Orakel.
    const { app: bodo } = await buildBffApp({
      session: citizenSession({ actorId: "actor.bodo" }),
      caseStore,
      procedureRegistry: registry,
    });
    const fremd = await bodo.inject({
      method: "GET",
      url: `/api/buerger/antraege/${antrag.antragId}/bescheid`,
    });
    expect(fremd.statusCode).toBe(404);
    await bodo.close();
  });

  it("gibt 404, wenn der Fall noch nicht festgesetzt ist (KEIN Live-Render-Fallback)", async () => {
    const caseStore = new InMemoryCaseStore();
    const registry = createInMemoryProcedureRegistry([procedure]);
    const { app: anna } = await buildBffApp({
      session: citizenSession({ actorId: "actor.anna" }),
      caseStore,
      procedureRegistry: registry,
    });
    const antrag = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: {
          procedureId: "musterantrag",
          procedureVersion: "1",
          data: { berechnung },
        },
      })
    ).json();
    // Noch nicht festgesetzt → kein eingefrorener Bescheid → 404.
    const res = await anna.inject({
      method: "GET",
      url: `/api/buerger/antraege/${antrag.antragId}/bescheid`,
    });
    expect(res.statusCode).toBe(404);
    await anna.close();
  });

  it("Manipulations-Nachweis: eine Änderung am content bricht die Hash-Verifikation", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app: appA } = await appFor(caseStore, "actor.a");
    const created = (
      await appA.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "musterantrag",
          procedureVersion: "1",
          state: "offen",
          subjectIds: ["s"],
          data: { berechnung },
        },
      })
    ).json();
    await appA.close();
    const { app: appB } = await appFor(caseStore, "actor.b");
    await appB.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "festsetzen", expectedVersion: created.version },
    });
    const audit = (
      await appB.inject({
        method: "GET",
        url: `/api/cases/${created.caseId}/audit`,
      })
    ).json();
    const va = audit.events.find(
      (e: { eventType: string }) => e.eventType === "case.transitioned",
    ).payload.verwaltungsakt;
    // Ein Angreifer setzt den Betrag herab — der Hash passt nicht mehr.
    const manipuliert = {
      ...va.content,
      tenor: { ...berechnung, betrag: 5 },
    };
    expect(canonicalSha256(manipuliert)).not.toBe(va.checksumSha256);
    await appB.close();
  });
});
