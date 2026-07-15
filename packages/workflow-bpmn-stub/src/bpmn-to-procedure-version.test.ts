import { describe, expect, it } from "vitest";
import {
  createInMemoryProcedureRegistry,
  transitionCase,
  type Case,
} from "@senticor/public-sector-sdk";
import {
  bpmnToProcedureVersion,
  DEFAULT_EFFECTIVE_FROM,
} from "./bpmn-to-procedure-version.js";

// Synthetische, FIM-artige Integrationsmanagement-BPMN (DGCC-Regelkreis, wiederaufnehmbar). Rein erfunden,
// keine echten Personen/PII. Deckt ab: Start-/End-Event, userTasks, exclusiveGateway (Flachziehen),
// unbenannte Flüsse (Default-Aktion), benannte Flüsse, Rücksprung-Schleife und einen Vier-Augen-Übergang
// via Namenskonvention ("entscheiden …").
const FIM_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:senticor="https://senticor.ai/bpmn">
  <bpmn:process id="integrationsmanagement" isExecutable="true">
    <bpmn:startEvent id="start" name="Neuzugang" />
    <bpmn:userTask id="aufnahme" name="Aufnahme" />
    <bpmn:userTask id="assessment" name="Assessment" />
    <bpmn:userTask id="zielplanung" name="Zielplanung" />
    <bpmn:userTask id="leistungssteuerung" name="Leistungssteuerung" />
    <bpmn:exclusiveGateway id="gw_ergebnis" name="Ergebnis?" />
    <bpmn:userTask id="abschluss" name="Abschluss" />
    <bpmn:endEvent id="end" name="Abgeschlossen" />

    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="aufnahme" />
    <bpmn:sequenceFlow id="f2" sourceRef="aufnahme" targetRef="assessment" />
    <bpmn:sequenceFlow id="f3" sourceRef="assessment" targetRef="zielplanung" />
    <bpmn:sequenceFlow id="f4" sourceRef="zielplanung" targetRef="leistungssteuerung" />
    <bpmn:sequenceFlow id="f5" sourceRef="leistungssteuerung" targetRef="gw_ergebnis" />
    <bpmn:sequenceFlow id="f6" name="entscheiden Abschluss" sourceRef="gw_ergebnis" targetRef="abschluss" />
    <bpmn:sequenceFlow id="f7" name="Re-Assessment" sourceRef="gw_ergebnis" targetRef="assessment" />
    <bpmn:sequenceFlow id="f8" name="abschliessen" sourceRef="abschluss" targetRef="end" />
  </bpmn:process>
</bpmn:definitions>`;

describe("bpmnToProcedureVersion", () => {
  it("leitet allowedStates aus Task-/Event-Knoten in Dokumentreihenfolge ab (Gateways ausgeschlossen)", () => {
    const procedureVersion = bpmnToProcedureVersion(FIM_BPMN, {
      procedureId: "procedure.integrationsmanagement",
      version: "1.0.0",
      legalBasisIds: ["legal.example.sgbviii"],
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    });

    expect(procedureVersion.procedureId).toBe(
      "procedure.integrationsmanagement",
    );
    expect(procedureVersion.version).toBe("1.0.0");
    expect(procedureVersion.effectiveFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(procedureVersion.legalBasisIds).toEqual(["legal.example.sgbviii"]);
    // "Ergebnis?" (Gateway) ist bewusst KEIN Zustand.
    expect(procedureVersion.allowedStates).toEqual([
      "Neuzugang",
      "Aufnahme",
      "Assessment",
      "Zielplanung",
      "Leistungssteuerung",
      "Abschluss",
      "Abgeschlossen",
    ]);
  });

  it("leitet Transitionen inkl. Gateway-Flachziehen, Default-Aktion und requiresFourEyes ab", () => {
    const { allowedTransitions } = bpmnToProcedureVersion(FIM_BPMN, {
      procedureId: "procedure.integrationsmanagement",
      version: "1.0.0",
      legalBasisIds: ["legal.example.sgbviii"],
    });

    expect(allowedTransitions).toEqual([
      // Unbenannte Flüsse → Default-Aktion `${from}->${to}`, kein Vier-Augen.
      {
        from: "Neuzugang",
        to: "Aufnahme",
        action: "Neuzugang->Aufnahme",
        requiredPermission: "case.decision.prepare",
      },
      {
        from: "Aufnahme",
        to: "Assessment",
        action: "Aufnahme->Assessment",
        requiredPermission: "case.decision.prepare",
      },
      {
        from: "Assessment",
        to: "Zielplanung",
        action: "Assessment->Zielplanung",
        requiredPermission: "case.decision.prepare",
      },
      {
        from: "Zielplanung",
        to: "Leistungssteuerung",
        action: "Zielplanung->Leistungssteuerung",
        requiredPermission: "case.decision.prepare",
      },
      // Über das exclusiveGateway flachgezogen: Leistungssteuerung -> (gw) -> Abschluss.
      // Aktion = Name des Entscheidungs-Flusses; requiresFourEyes via "entscheiden …"-Konvention.
      {
        from: "Leistungssteuerung",
        to: "Abschluss",
        action: "entscheiden Abschluss",
        requiredPermission: "case.decision.prepare",
        requiresFourEyes: true,
      },
      // Rücksprung-Schleife (DGCC-Re-Assessment), ebenfalls über das Gateway flachgezogen.
      {
        from: "Leistungssteuerung",
        to: "Assessment",
        action: "Re-Assessment",
        requiredPermission: "case.decision.prepare",
      },
      {
        from: "Abschluss",
        to: "Abgeschlossen",
        action: "abschliessen",
        requiredPermission: "case.decision.prepare",
      },
    ]);
  });

  it("setzt requiresFourEyes auch über das Extension-Attribut (Local-Name requiresFourEyes)", () => {
    // "genehmigen" beginnt NICHT mit "entscheiden" — Vier-Augen kommt hier allein aus dem Attribut.
    const xml = `<bpmn:definitions xmlns:bpmn="x" xmlns:senticor="y">
      <bpmn:process id="p">
        <bpmn:userTask id="pruefung" name="Pruefung" />
        <bpmn:userTask id="bewilligt" name="Bewilligt" />
        <bpmn:sequenceFlow id="a" name="genehmigen" senticor:requiresFourEyes="true"
                           sourceRef="pruefung" targetRef="bewilligt" />
      </bpmn:process>
    </bpmn:definitions>`;

    const { allowedTransitions } = bpmnToProcedureVersion(xml, {
      procedureId: "procedure.example",
      version: "1.0.0",
      legalBasisIds: [],
    });

    expect(allowedTransitions).toEqual([
      {
        from: "Pruefung",
        to: "Bewilligt",
        action: "genehmigen",
        requiredPermission: "case.decision.prepare",
        requiresFourEyes: true,
      },
    ]);
  });

  it("nutzt @id als Zustands-Label, wenn @name fehlt, und setzt den effectiveFrom-Sentinel", () => {
    const xml = `<process id="p">
      <task id="erfassen" />
      <task id="pruefen" name="Pruefen" />
      <sequenceFlow id="a" sourceRef="erfassen" targetRef="pruefen" />
    </process>`;

    const procedureVersion = bpmnToProcedureVersion(xml, {
      procedureId: "procedure.example",
      version: "2.0.0",
      legalBasisIds: [],
    });

    expect(procedureVersion.effectiveFrom).toBe(DEFAULT_EFFECTIVE_FROM);
    expect(procedureVersion.allowedStates).toEqual(["erfassen", "Pruefen"]);
    expect(procedureVersion.allowedTransitions).toEqual([
      {
        from: "erfassen",
        to: "Pruefen",
        action: "erfassen->Pruefen",
        requiredPermission: "case.decision.prepare",
      },
    ]);
  });

  it("wirft fail-closed ohne <process> bzw. ohne Zustands-Knoten", () => {
    expect(() =>
      bpmnToProcedureVersion("<definitions></definitions>", {
        procedureId: "procedure.example",
        version: "1.0.0",
        legalBasisIds: [],
      }),
    ).toThrow(/kein <process>/);

    expect(() =>
      bpmnToProcedureVersion('<process id="p"></process>', {
        procedureId: "procedure.example",
        version: "1.0.0",
        legalBasisIds: [],
      }),
    ).toThrow(/keine Task-\/Event-Knoten/);
  });

  it("treibt eine Akte über die ProcedureRegistry-Naht mit dem reinen transitionCase-Reducer", () => {
    const procedureVersion = bpmnToProcedureVersion(FIM_BPMN, {
      procedureId: "procedure.integrationsmanagement",
      version: "1.0.0",
      legalBasisIds: ["legal.example.sgbviii"],
    });
    const registry = createInMemoryProcedureRegistry([procedureVersion]);
    const resolved = registry.get("procedure.integrationsmanagement", "1.0.0");
    expect(resolved).toBe(procedureVersion);

    let current: Case = {
      caseId: "case.1",
      procedureId: "procedure.integrationsmanagement",
      procedureVersion: "1.0.0",
      tenantId: "tenant.example",
      authorityId: "authority.example",
      jurisdictionId: "de",
      state: "Neuzugang",
      version: 0,
      subjectIds: ["subject.1"],
      openedAt: "2026-01-02T00:00:00.000Z",
    };

    // Der abgeleitete Prozess läuft über die exakt aus der BPMN gewonnenen Aktionen.
    const steps: Array<[string, string]> = [
      ["Neuzugang->Aufnahme", "Aufnahme"],
      ["Aufnahme->Assessment", "Assessment"],
      ["Assessment->Zielplanung", "Zielplanung"],
      ["Zielplanung->Leistungssteuerung", "Leistungssteuerung"],
      ["entscheiden Abschluss", "Abschluss"],
      ["abschliessen", "Abgeschlossen"],
    ];
    for (const [action, expectedState] of steps) {
      const expectedVersion = current.version;
      current = transitionCase(
        current,
        procedureVersion,
        action,
        expectedVersion,
      );
      expect(current.state).toBe(expectedState);
      expect(current.version).toBe(expectedVersion + 1);
    }

    // Nicht abgeleitete Aktionen sind fail-closed.
    expect(() =>
      transitionCase(
        current,
        procedureVersion,
        "nicht-existent",
        current.version,
      ),
    ).toThrow(/invalid case transition/);
  });

  it("treibt die DGCC-Rücksprung-Schleife (Leistungssteuerung -> Assessment)", () => {
    const procedureVersion = bpmnToProcedureVersion(FIM_BPMN, {
      procedureId: "procedure.integrationsmanagement",
      version: "1.0.0",
      legalBasisIds: ["legal.example.sgbviii"],
    });
    const current: Case = {
      caseId: "case.2",
      procedureId: "procedure.integrationsmanagement",
      procedureVersion: "1.0.0",
      tenantId: "tenant.example",
      authorityId: "authority.example",
      jurisdictionId: "de",
      state: "Leistungssteuerung",
      version: 4,
      subjectIds: ["subject.2"],
      openedAt: "2026-01-02T00:00:00.000Z",
    };

    const looped = transitionCase(
      current,
      procedureVersion,
      "Re-Assessment",
      4,
    );
    expect(looped.state).toBe("Assessment");
    expect(looped.version).toBe(5);
  });
});
