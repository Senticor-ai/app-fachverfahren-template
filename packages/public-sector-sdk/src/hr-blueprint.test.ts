// hr-blueprint.test — P0-1-BEWEIS (2. Domaene): ein HR-Einstellungsverfahren (fachbereich/personalstelle/
// vorgesetzter) laeuft auf DEMSELBEN domaenen-neutralen Dossier-Kern. Zusammen mit dem Beschaffungs-Blueprint
// belegt das: das Template traegt BELIEBIGE Fachverfahren — nicht nur Buerger<->Behoerde. Nur andere DATEN.
import { describe, expect, it } from "vitest";
import {
  transitionCase,
  type Case,
  type ProcedureVersion,
} from "./domain-kernel.js";

const einstellung: ProcedureVersion = {
  procedureId: "hr-einstellung",
  version: "1.0.0",
  effectiveFrom: "2026-01-01",
  legalBasisIds: ["dienstvereinbarung-personal-1"],
  allowedStates: [
    "beantragt",
    "budget_pruefung",
    "freigegeben",
    "ausgeschrieben",
    "im_auswahlverfahren",
    "besetzt",
    "abgelehnt",
  ],
  allowedTransitions: [
    {
      from: "beantragt",
      to: "budget_pruefung",
      action: "zur-pruefung",
      requiredPermission: "case.decision.prepare",
    },
    {
      // Budget-Freigabe: Vier-Augen (dieselbe Governance wie ein Verwaltungsakt / eine Beschaffungs-Freigabe).
      from: "budget_pruefung",
      to: "freigegeben",
      action: "freigeben",
      requiredPermission: "case.decision.prepare",
      requiresFourEyes: true,
    },
    {
      from: "budget_pruefung",
      to: "abgelehnt",
      action: "ablehnen",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "freigegeben",
      to: "ausgeschrieben",
      action: "ausschreiben",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "ausgeschrieben",
      to: "im_auswahlverfahren",
      action: "auswahl-starten",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "im_auswahlverfahren",
      to: "besetzt",
      action: "besetzen",
      requiredPermission: "case.decision.prepare",
      closesCase: true,
    },
  ],
};

function antrag(): Case {
  return {
    caseId: "case.stelle-1",
    procedureId: "hr-einstellung",
    procedureVersion: "1.0.0",
    tenantId: "t",
    authorityId: "personalstelle",
    jurisdictionId: "de",
    state: "beantragt",
    version: 1,
    subjectIds: ["stelle.sachbearbeitung-2026"],
    openedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("HR-Blueprint (P0-1: 2. Nicht-Buerger-Domaene auf dem Dossier-Kern)", () => {
  it("faehrt den Einstellungs-Lebenszyklus: Antrag → Budget → Freigabe → Ausschreibung → Auswahl → besetzt", () => {
    let k = antrag();
    k = transitionCase(k, einstellung, "zur-pruefung", k.version);
    expect(k.state).toBe("budget_pruefung");
    k = transitionCase(k, einstellung, "freigeben", k.version);
    expect(k.state).toBe("freigegeben");
    k = transitionCase(k, einstellung, "ausschreiben", k.version);
    k = transitionCase(k, einstellung, "auswahl-starten", k.version);
    expect(k.state).toBe("im_auswahlverfahren");
    k = transitionCase(k, einstellung, "besetzen", k.version);
    expect(k.state).toBe("besetzt");
    expect(k.closedAt).toBeTruthy();
  });

  it("die Budget-Freigabe trägt requiresFourEyes", () => {
    expect(
      einstellung.allowedTransitions.find((t) => t.action === "freigeben")
        ?.requiresFourEyes,
    ).toBe(true);
  });
});
