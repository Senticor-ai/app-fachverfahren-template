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
      // Ziel ist das <endEvent> „Abgeschlossen" → closesCase (Auslöser (a) der Konvention): der Reducer
      // stempelt bei diesem Übergang closedAt.
      {
        from: "Abschluss",
        to: "Abgeschlossen",
        action: "abschliessen",
        requiredPermission: "case.decision.prepare",
        closesCase: true,
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

  it("leitet N-AUGEN ab (Extension-Attribut requiredApprovals=3) — grafisch im BPMN konfigurierbar", () => {
    const xml = `<bpmn:definitions xmlns:bpmn="x" xmlns:senticor="y">
      <bpmn:process id="p">
        <bpmn:userTask id="pruefung" name="Pruefung" />
        <bpmn:userTask id="bewilligt" name="Bewilligt" />
        <bpmn:sequenceFlow id="a" name="genehmigen" senticor:requiredApprovals="3"
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
        requiredApprovals: 3,
      },
    ]);
  });

  it("ignoriert eine ungültige requiredApprovals-Angabe (< 2 / keine Zahl)", () => {
    const xml = `<bpmn:definitions xmlns:bpmn="x" xmlns:senticor="y">
      <bpmn:process id="p">
        <bpmn:userTask id="a" name="A" />
        <bpmn:userTask id="b" name="B" />
        <bpmn:sequenceFlow id="f" name="weiter" senticor:requiredApprovals="eins"
                           sourceRef="a" targetRef="b" />
      </bpmn:process>
    </bpmn:definitions>`;
    const { allowedTransitions } = bpmnToProcedureVersion(xml, {
      procedureId: "p",
      version: "1",
      legalBasisIds: [],
    });
    expect(allowedTransitions[0]).not.toHaveProperty("requiredApprovals");
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

// ── Akzeptanz für die synthetische Beispiel-BPMN (docs/examples/integrationsberatung) ──
// Belegt „generierbar / eine Wahrheit": dieser <process> ist der Kern der ausgelieferten
// docs/examples/integrationsberatung/integrationsmanagement.bpmn und muss die in
// integrationsmanagement.config.yaml dokumentierte ProcedureVersion ergeben. Deckt den wiederaufnehmbaren,
// ZYKLISCHEN Fall (pausiert->aktiv, abgeschlossen->aktiv) sowie einen Vier-Augen-Übergang via
// Extension-Attribut ab. Rechtsgrundlagen kommen aus der Konfiguration, NICHT aus der BPMN.
const EXAMPLE_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:senticor="https://senticor.ai/schema/bpmn-ext"
  id="integrationsmanagement-definitions"
  targetNamespace="https://senticor.ai/example/integrationsmanagement">
  <bpmn:process id="integrationsmanagement" name="Integrationsmanagement" isExecutable="true">
    <bpmn:startEvent id="s_aufgenommen" name="aufgenommen" />
    <bpmn:userTask id="s_aktiv" name="aktiv" />
    <bpmn:userTask id="s_pausiert" name="pausiert" />
    <bpmn:userTask id="s_abgeschlossen" name="abgeschlossen" />

    <bpmn:sequenceFlow id="f_aktivieren" name="aktivieren" sourceRef="s_aufgenommen" targetRef="s_aktiv" />
    <bpmn:sequenceFlow id="f_pausieren" name="pausieren" sourceRef="s_aktiv" targetRef="s_pausiert" />
    <bpmn:sequenceFlow id="f_fortsetzen" name="fortsetzen" sourceRef="s_pausiert" targetRef="s_aktiv" />
    <bpmn:sequenceFlow id="f_abschliessen" name="abschließen" sourceRef="s_aktiv" targetRef="s_abgeschlossen" senticor:requiresFourEyes="true" senticor:closesCase="true" />
    <bpmn:sequenceFlow id="f_wiederaufnehmen" name="wiederaufnehmen" sourceRef="s_abgeschlossen" targetRef="s_aktiv" />
  </bpmn:process>
</bpmn:definitions>`;
const EXAMPLE_LEGAL_BASIS_IDS = [
  "de-aufenthg-43",
  "de-aufenthg-44",
  "de-aufenthg-44a",
  "de-aufenthg-45a",
  "de-vwv-integrationsmanagement-2023",
  "de-flueag-17",
  "de-flueag-18",
];

describe("closesCase-Konvention", () => {
  it("leitet closesCase NICHT ab, wenn weder <endEvent>-Ziel noch closesCase-Attribut vorliegen", () => {
    const xml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <bpmn:process id="p">
        <bpmn:userTask id="a" name="a" />
        <bpmn:userTask id="b" name="b" />
        <bpmn:sequenceFlow id="f" name="weiter" sourceRef="a" targetRef="b" />
      </bpmn:process>
    </bpmn:definitions>`;
    const pv = bpmnToProcedureVersion(xml, {
      procedureId: "p",
      version: "1",
      legalBasisIds: ["x"],
    });
    expect(pv.allowedTransitions[0]?.closesCase).toBeUndefined();
  });

  it("treibt den WIEDERAUFNEHMBAREN Abschluss durch den echten Reducer: closesCase stempelt closedAt, die Wiederaufnahme räumt es ab", () => {
    const procedureVersion = bpmnToProcedureVersion(EXAMPLE_BPMN, {
      procedureId: "integrationsmanagement",
      version: "2026.1",
      legalBasisIds: EXAMPLE_LEGAL_BASIS_IDS,
    });
    const registry = createInMemoryProcedureRegistry([procedureVersion]);
    const geladen = registry.get("integrationsmanagement", "2026.1");
    expect(geladen).toBeDefined();
    if (geladen === undefined) return;

    const akte: Case = {
      caseId: "case.1",
      procedureId: "integrationsmanagement",
      procedureVersion: "2026.1",
      tenantId: "t",
      authorityId: "a",
      jurisdictionId: "de",
      state: "aktiv",
      version: 1,
      subjectIds: ["s"],
      openedAt: "2026-01-02T00:00:00.000Z",
    };

    // Abschluss (aus der BPMN abgeleitet: requiresFourEyes + closesCase) → closedAt gestempelt.
    const geschlossen = transitionCase(akte, geladen, "abschließen", 1);
    expect(geschlossen.state).toBe("abgeschlossen");
    expect(typeof geschlossen.closedAt).toBe("string");

    // Wiederaufnahme (nicht-schließender Übergang) → closedAt wieder entfernt.
    const wieder = transitionCase(geschlossen, geladen, "wiederaufnehmen", 2);
    expect(wieder.state).toBe("aktiv");
    expect(wieder.closedAt).toBeUndefined();
  });
});

describe("integrationsmanagement-Beispiel (docs/examples)", () => {
  it("leitet die dokumentierte, wiederaufnehmbare Zustandsmaschine aus der versendeten BPMN ab", () => {
    const procedureVersion = bpmnToProcedureVersion(EXAMPLE_BPMN, {
      procedureId: "integrationsmanagement",
      version: "2026.1",
      legalBasisIds: EXAMPLE_LEGAL_BASIS_IDS,
    });

    expect(procedureVersion.effectiveFrom).toBe(DEFAULT_EFFECTIVE_FROM);
    expect(procedureVersion.legalBasisIds).toEqual(EXAMPLE_LEGAL_BASIS_IDS);
    expect(procedureVersion.allowedStates).toEqual([
      "aufgenommen",
      "aktiv",
      "pausiert",
      "abgeschlossen",
    ]);
    expect(procedureVersion.allowedTransitions).toEqual([
      {
        from: "aufgenommen",
        to: "aktiv",
        action: "aktivieren",
        requiredPermission: "case.decision.prepare",
      },
      {
        from: "aktiv",
        to: "pausiert",
        action: "pausieren",
        requiredPermission: "case.decision.prepare",
      },
      // Fall-Abschluss ist ein Vier-Augen-Übergang (senticor:requiresFourEyes="true").
      {
        from: "aktiv",
        to: "abgeschlossen",
        action: "abschließen",
        requiredPermission: "case.decision.prepare",
        requiresFourEyes: true,
        // Auslöser (b): der Abschluss-Zustand ist wiederaufnehmbar (hat einen ausgehenden Fluss) und darf
        // daher kein <endEvent> sein — das Modell sagt den Abschluss via senticor:closesCase="true" an.
        closesCase: true,
      },
      {
        from: "pausiert",
        to: "aktiv",
        action: "fortsetzen",
        requiredPermission: "case.decision.prepare",
      },
      {
        from: "abgeschlossen",
        to: "aktiv",
        action: "wiederaufnehmen",
        requiredPermission: "case.decision.prepare",
      },
    ]);
  });

  it("treibt den vollständigen Lebenszyklus inkl. Pause und Wiederaufnahme über transitionCase", () => {
    const procedureVersion = bpmnToProcedureVersion(EXAMPLE_BPMN, {
      procedureId: "integrationsmanagement",
      version: "2026.1",
      legalBasisIds: EXAMPLE_LEGAL_BASIS_IDS,
    });

    let current: Case = {
      caseId: "case.integration.1",
      procedureId: "integrationsmanagement",
      procedureVersion: "2026.1",
      tenantId: "tenant.example",
      authorityId: "authority.example",
      jurisdictionId: "de",
      state: "aufgenommen",
      version: 0,
      subjectIds: ["subject.1"],
      openedAt: "2026-06-01T00:00:00.000Z",
    };

    const lifecycle: Array<[string, string]> = [
      ["aktivieren", "aktiv"],
      ["pausieren", "pausiert"],
      ["fortsetzen", "aktiv"],
      ["abschließen", "abgeschlossen"],
      ["wiederaufnehmen", "aktiv"],
    ];
    for (const [action, expectedState] of lifecycle) {
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
  });
});
