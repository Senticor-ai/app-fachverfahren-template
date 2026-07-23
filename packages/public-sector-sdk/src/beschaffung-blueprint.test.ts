// beschaffung-blueprint.test — P0-1-BEWEIS auf Kernel-Ebene: ein BESCHAFFUNGS-Verfahren (Nicht-Buerger-Domaene:
// requester/approver/einkauf/lieferant) laeuft auf DEMSELBEN domaenen-neutralen Dossier-Kern wie ein
// Behoerden-Verfahren — beliebige Zustaende/Uebergaenge als DATEN, Vier-Augen-Freigabe (Wertgrenze), closesCase.
// Beweist: das Template traegt Beschaffung/HR, nicht nur Buerger<->Behoerde. Kein neuer Server-Code noetig —
// nur eine andere `ProcedureVersion`. (Die Personas-Seite ist in apps/.../personas.test bewiesen.)
import { describe, expect, it } from "vitest";
import {
  transitionCase,
  type Case,
  type ProcedureVersion,
} from "./domain-kernel.js";

const beschaffung: ProcedureVersion = {
  procedureId: "beschaffung",
  version: "1.0.0",
  effectiveFrom: "2026-01-01",
  legalBasisIds: ["vergabe-richtlinie-1"],
  allowedStates: [
    "angefordert",
    "in_pruefung",
    "genehmigt",
    "bestellt",
    "geliefert",
    "abgeschlossen",
    "abgelehnt",
  ],
  allowedTransitions: [
    {
      from: "angefordert",
      to: "in_pruefung",
      action: "pruefen",
      requiredPermission: "case.decision.prepare",
    },
    {
      // Freigabe oberhalb der Wertgrenze: Vier-Augen — dieselbe Governance wie ein Verwaltungsakt.
      from: "in_pruefung",
      to: "genehmigt",
      action: "genehmigen",
      requiredPermission: "case.decision.prepare",
      requiresFourEyes: true,
    },
    {
      from: "in_pruefung",
      to: "abgelehnt",
      action: "ablehnen",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "genehmigt",
      to: "bestellt",
      action: "bestellen",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "bestellt",
      to: "geliefert",
      action: "wareneingang",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "geliefert",
      to: "abgeschlossen",
      action: "abschliessen",
      requiredPermission: "case.decision.prepare",
      closesCase: true,
    },
  ],
};

function anforderung(): Case {
  return {
    caseId: "case.beschaffung-1",
    procedureId: "beschaffung",
    procedureVersion: "1.0.0",
    tenantId: "t",
    authorityId: "einkauf",
    jurisdictionId: "de",
    state: "angefordert",
    version: 1,
    subjectIds: ["lieferant.acme"],
    openedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("Beschaffungs-Blueprint (P0-1: Nicht-Buerger-Verfahren auf dem Dossier-Kern)", () => {
  it("faehrt den vollen Lebenszyklus: Anforderung → Prüfung → Freigabe → Bestellung → Wareneingang → Abschluss", () => {
    let k = anforderung();
    k = transitionCase(k, beschaffung, "pruefen", k.version);
    expect(k.state).toBe("in_pruefung");
    k = transitionCase(k, beschaffung, "genehmigen", k.version);
    expect(k.state).toBe("genehmigt");
    k = transitionCase(k, beschaffung, "bestellen", k.version);
    expect(k.state).toBe("bestellt");
    k = transitionCase(k, beschaffung, "wareneingang", k.version);
    expect(k.state).toBe("geliefert");
    k = transitionCase(k, beschaffung, "abschliessen", k.version);
    expect(k.state).toBe("abgeschlossen");
    // closesCase stempelt closedAt (data-driven, kein hart kodierter Zielzustand).
    expect(k.closedAt).toBeTruthy();
  });

  it("die Freigabe trägt requiresFourEyes (Wertgrenzen-Governance greift wie beim Verwaltungsakt)", () => {
    const genehmigen = beschaffung.allowedTransitions.find(
      (t) => t.action === "genehmigen",
    );
    expect(genehmigen?.requiresFourEyes).toBe(true);
  });

  it("ein ungültiger Übergang (Bestellen ohne Freigabe) wird abgewiesen", () => {
    expect(() =>
      transitionCase(anforderung(), beschaffung, "bestellen", 1),
    ).toThrow();
  });
});
