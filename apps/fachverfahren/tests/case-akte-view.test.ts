// case-akte-view.test.ts — die PURE Abbildung der Fall/Task-API auf die DossierAkte360-Props:
// Ziele mit Schritten + server-gerechnetem Fortschritt, Termine, Stammdaten. Kein React, kein Netz
// (der case-client bleibt die Netz-Naht) — hier wird nur die Transformation geprüft.
import { describe, expect, it } from "vitest";
import type { CaseSummary, CaseTask } from "../src/case-client.js";
import { formatDate, toAkteProps } from "../src/pages/case-akte-view.js";

const caseSummary: CaseSummary = {
  caseId: "case.1",
  procedureId: "integrationsmanagement",
  procedureVersion: "1",
  state: "aktiv",
  version: 3,
  subjectIds: ["subject.1"],
  openedAt: "2026-01-02T10:00:00.000Z",
  closedAt: null,
};

function task(
  overrides: Partial<CaseTask> & Pick<CaseTask, "taskId">,
): CaseTask {
  return {
    caseId: "case.1",
    title: overrides.taskId,
    state: "open",
    assignedTo: null,
    dueAt: null,
    taskKind: "aufgabe",
    parentTaskId: null,
    data: {},
    sortRank: "",
    version: 1,
    ...overrides,
  };
}

const tasks: CaseTask[] = [
  // Absichtlich unsortiert eingespeist — die Abbildung muss über sortRank ordnen.
  task({ taskId: "z2", taskKind: "ziel", title: "Ziel B", sortRank: "b" }),
  task({
    taskId: "z1",
    taskKind: "ziel",
    title: "Ziel A",
    sortRank: "a",
    dueAt: "2026-03-01T00:00:00.000Z",
  }),
  task({
    taskId: "s2",
    taskKind: "checkliste-item",
    parentTaskId: "z1",
    title: "Schritt 2",
    sortRank: "b",
  }),
  task({
    taskId: "s1",
    taskKind: "checkliste-item",
    parentTaskId: "z1",
    title: "Schritt 1",
    sortRank: "a",
    data: { erledigt: true },
  }),
  task({
    taskId: "t1",
    taskKind: "termin",
    title: "Erstgespräch",
    dueAt: "2026-02-01T09:00:00.000Z",
    assignedTo: "sb.1",
  }),
  task({ taskId: "u1", taskKind: "aufgabe", title: "Interne Aufgabe" }),
];

const progress = [
  { taskId: "z1", title: "Ziel A", total: 2, done: 1, percent: 50 },
];

describe("toAkteProps", () => {
  const props = toAkteProps(caseSummary, tasks, progress);

  it("Kopf: Titel = erstes Subjekt, Untertitel = caseId, Merkmale = Zustand + Verfahren", () => {
    expect(props.titel).toBe("subject.1");
    expect(props.untertitel).toBe("case.1");
    expect(props.merkmale).toEqual([
      { label: "Zustand", value: "aktiv", tone: "info" },
      { label: "Verfahren", value: "integrationsmanagement" },
    ]);
  });

  it("Ziele: über sortRank geordnet, Schritte gruppiert, erledigt aus data.erledigt", () => {
    expect(props.ziele?.map((z) => z.id)).toEqual(["z1", "z2"]);
    const [zielA, zielB] = props.ziele ?? [];
    expect(zielA?.titel).toBe("Ziel A");
    expect(zielA?.fortschrittProzent).toBe(50); // server-gerechnet, nicht aus Schritten abgeleitet
    expect(zielA?.frist).toBeTruthy();
    expect(zielA?.schritte).toEqual([
      { id: "s1", label: "Schritt 1", erledigt: true },
      { id: "s2", label: "Schritt 2" },
    ]);
    // Ziel B: kein Fortschritt (nicht im progress), keine Schritte, keine Frist.
    expect(zielB?.fortschrittProzent).toBeUndefined();
    expect(zielB?.schritte).toBeUndefined();
    expect(zielB?.frist).toBeUndefined();
  });

  it("Termine: nur taskKind=termin, Fälligkeit als Date, Zuständigkeit als Beschreibung", () => {
    expect(props.termine).toHaveLength(1);
    const termin = props.termine?.[0];
    expect(termin?.id).toBe("t1");
    expect(termin?.titel).toBe("Erstgespräch");
    expect(termin?.zeit).toBeInstanceOf(Date);
    expect((termin?.zeit as Date).getTime()).toBe(
      new Date("2026-02-01T09:00:00.000Z").getTime(),
    );
    expect(termin?.beschreibung).toBe("Zuständig: sb.1");
  });

  it("Stammdaten: Verfahren/Zustand/Beteiligte gesetzt, geschlossen bleibt leer bei closedAt=null", () => {
    const byLabel = new Map(
      props.stammdaten?.map((row) => [row.label, row.value]),
    );
    expect(byLabel.get("Verfahren")).toBe("integrationsmanagement");
    expect(byLabel.get("Zustand")).toBe("aktiv");
    expect(byLabel.get("Beteiligte")).toBe("subject.1");
    expect(byLabel.get("Geschlossen am")).toBeNull();
  });
});

describe("formatDate", () => {
  it("lokalisiert parsebare ISO-Werte und reicht Unparsebares unverändert durch", () => {
    expect(formatDate("2026-03-01T00:00:00.000Z")).not.toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(formatDate("kein-datum")).toBe("kein-datum");
  });
});
