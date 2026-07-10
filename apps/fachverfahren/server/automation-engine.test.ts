import { describe, it, expect } from "vitest";
import {
  type AppCase,
  type AppTask,
  InMemoryAutomationStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import {
  DefaultDenyPolicyEngine,
  type ProcedureCatalog,
} from "@senticor/public-sector-sdk";
import {
  AUTOMATION_ACTOR,
  emitDueDeadlineEvents,
  processDueAutomationEvents,
  runAutomationTick,
  type AutomationEngineDeps,
} from "./automation-engine.js";

const NOW = "2026-07-10T12:00:00.000Z";
let seq = 0;
const uid = () => `id-${seq++}`;

const catalog: ProcedureCatalog = {
  transitionsFor: () => [
    {
      from: "eingegangen",
      to: "in-pruefung",
      action: "in-pruefung",
      requiredPermission: "case.transition",
    },
    {
      from: "eingegangen",
      to: "entschieden",
      action: "entschieden",
      requiredPermission: "case.decide",
      requiresFourEyes: true,
    },
  ],
};

function macheCase(over: Partial<AppCase> = {}): AppCase {
  return {
    caseId: `case-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    procedureVersion: "1",
    state: "eingegangen",
    version: 1,
    subjectIds: [],
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

function macheTask(caseId: string): AppTask {
  return {
    taskId: `task-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    caseId,
    title: "Aufgabe",
    priorityKey: null,
    assigneeActorId: null,
    labels: [],
    dueAt: null,
    sortRank: "V",
    parentTaskId: null,
    boardColumn: null,
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function makeDeps() {
  const caseStore = new InMemoryCaseStore();
  const taskStore = new InMemoryTaskStore({ caseStore });
  const automationStore = new InMemoryAutomationStore();
  const deps: AutomationEngineDeps = {
    automationStore,
    caseStore,
    taskStore,
    policy: new DefaultDenyPolicyEngine(),
    catalog,
    now: () => NOW,
    newId: uid,
    procedureVersion: "1",
  };
  return { deps, caseStore, taskStore, automationStore };
}

describe("automation engine — server-autoritative Ausführung", () => {
  it("wendet einen Metadaten-Effekt (Priorität) auf die Aufgabe an → run applied", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-prio",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      // Triviale, immer erfüllte Bedingung — mutierende Regeln brauchen fail-closed eine Bedingung.
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e1",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: task.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });

    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, applied: 1 });
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.priorityKey,
    ).toBe("hoch");
    const runs = await automationStore.listRuns({ ruleId: "r-prio" });
    expect(runs[0]?.status).toBe("applied");
  });

  it("FAIL-CLOSED: eine als mutierend deklarierte, aber nicht implementierte Aktion (setze-feld) wird NICHT still als applied verbucht → failed", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-setzefeld",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "setze-feld", feld: "vermerk", wert: "x" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e-sf",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: task.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });

    const res = await processDueAutomationEvents(deps);
    // Kein stiller Erfolg: der Lauf scheitert ehrlich, statt „applied" ohne Wirkung zu melden.
    expect(res).toMatchObject({ claimed: 1, applied: 0, failed: 1 });
    const runs = await automationStore.listRuns({ ruleId: "r-setzefeld" });
    expect(runs[0]?.status).toBe("failed");
    expect(String(runs[0]?.detail?.["error"] ?? "")).toContain(
      "nicht implementiert",
    );
  });

  it("BLOCKIERT einen Vier-Augen-Übergang HART (Automation ist nie das zweite Auge)", async () => {
    const { deps, caseStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    await automationStore.insertRule({
      ruleId: "r-4a",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "status-uebergang", nach: "entschieden" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e2",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });

    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, blocked: 1, applied: 0 });
    // Der Fall wurde NICHT festgesetzt.
    expect(
      (await caseStore.getCase({ tenantId: "t1", caseId: c.caseId }))?.state,
    ).toBe("eingegangen");
    const runs = await automationStore.listRuns({ ruleId: "r-4a" });
    expect(runs[0]?.status).toBe("blocked");
    expect(runs[0]?.detail).toMatchObject({
      reason: "four-eyes-requires-human",
    });
  });

  it("führt einen NICHT-Vier-Augen-Übergang durch die Policy-Kette aus → run applied + Audit", async () => {
    const { deps, caseStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    await automationStore.insertRule({
      ruleId: "r-move",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "status-uebergang", nach: "in-pruefung" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e3",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });

    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, applied: 1 });
    expect(
      (await caseStore.getCase({ tenantId: "t1", caseId: c.caseId }))?.state,
    ).toBe("in-pruefung");
    // Audit wuchs mit dem Service-Akteur.
    const audit = await caseStore.listAuditEvents({
      tenantId: "t1",
      caseId: c.caseId,
    });
    expect(audit.at(-1)?.actorId).toBe(AUTOMATION_ACTOR);
  });

  it("BEHÖRDEN-SCOPE: eine Regel der Behörde b1 feuert NICHT auf ein Event der Behörde b2", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-b1",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    // Event einer ANDEREN Behörde (b2) im selben Mandanten.
    await automationStore.enqueueEvent({
      eventId: "e-b2",
      tenantId: "t1",
      authorityId: "b2",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: task.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, applied: 0 });
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.priorityKey,
    ).toBeNull();
  });

  it("REKURSIONS-SPERRE: von der Automation erzeugte Events werden übersprungen", async () => {
    const { deps, automationStore } = makeDeps();
    await automationStore.insertRule({
      ruleId: "r-any",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: null,
      actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e4",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: null,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: { actor: AUTOMATION_ACTOR },
      createdAt: NOW,
      processedAt: null,
    });
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, applied: 0, blocked: 0 });
    expect(await automationStore.listRuns({})).toHaveLength(0);
  });

  it("FAIL-CLOSED: mutierende Regel OHNE Bedingung → run skipped (mutierend-ohne-wenn)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-nowenn",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: null,
      actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e6",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: task.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, skipped: 1, applied: 0 });
    const runs = await automationStore.listRuns({ ruleId: "r-nowenn" });
    expect(runs[0]?.detail).toMatchObject({ reason: "mutierend-ohne-wenn" });
  });

  it("FAIL-CLOSED: mutierende Regel mit nicht unterstützter Bedingung → run skipped", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-bad",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "x", op: "regex", wert: ".*" },
      actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e5",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: task.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, skipped: 1, applied: 0 });
    // Priorität UNVERÄNDERT (nicht gefeuert).
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.priorityKey,
    ).toBeNull();
  });
});

describe("Deadline-Scanner — zeitgetriebener frist-erreicht-Trigger", () => {
  const UEBERFAELLIG = "2026-07-10T09:00:00.000Z"; // < NOW (12:00)
  const ZUKUNFT = "2026-07-11T09:00:00.000Z"; // > NOW

  async function fristRegel(
    automationStore: InMemoryAutomationStore,
    over: { authorityId?: string; ruleId?: string } = {},
  ) {
    await automationStore.insertRule({
      ruleId: over.ruleId ?? "r-frist",
      tenantId: "t1",
      authorityId: over.authorityId ?? "b1",
      procedureId: "leistung",
      triggerEvent: "frist-erreicht",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "setze-prioritaet", wert: "dringend" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
  }

  it("emittiert eine ERREICHTE Frist und die frist-erreicht-Regel feuert danach (scan → process → applied)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = { ...macheTask(c.caseId), dueAt: UEBERFAELLIG };
    await taskStore.insertTask(task);
    await fristRegel(automationStore);

    const scan = await emitDueDeadlineEvents(deps);
    expect(scan.scanned).toBe(1);
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, applied: 1 });
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.priorityKey,
    ).toBe("dringend");
  });

  it("ignoriert fällige Aufgaben in Verfahren OHNE frist-erreicht-Regel (kein Event-Rauschen)", async () => {
    const { deps, caseStore, taskStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    await taskStore.insertTask({ ...macheTask(c.caseId), dueAt: UEBERFAELLIG });
    const scan = await emitDueDeadlineEvents(deps);
    expect(scan.scanned).toBe(0);
    expect((await processDueAutomationEvents(deps)).claimed).toBe(0);
  });

  it("emittiert NICHT für eine noch nicht erreichte Frist (dueAt > now)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    await taskStore.insertTask({ ...macheTask(c.caseId), dueAt: ZUKUNFT });
    await fristRegel(automationStore);
    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(0);
    expect((await processDueAutomationEvents(deps)).claimed).toBe(0);
  });

  it("ist IDEMPOTENT — zweiter Scan feuert dieselbe Frist NICHT erneut (deterministische event_id)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    await taskStore.insertTask({ ...macheTask(c.caseId), dueAt: UEBERFAELLIG });
    await fristRegel(automationStore);

    await emitDueDeadlineEvents(deps);
    expect((await processDueAutomationEvents(deps)).claimed).toBe(1);
    // Zweiter Durchlauf: dieselbe Frist ist bereits verarbeitet → kein erneutes Claimen.
    await emitDueDeadlineEvents(deps);
    expect((await processDueAutomationEvents(deps)).claimed).toBe(0);
  });

  it("BEHÖRDEN-SCOPE: eine b1-Fristregel emittiert NICHT für eine fällige b2-Aufgabe", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase({ authorityId: "b2" });
    await caseStore.insertCase(c);
    // Aufgabe der Behörde b2, aber Fristregel nur für b1.
    await taskStore.insertTask({
      ...macheTask(c.caseId),
      authorityId: "b2",
      dueAt: UEBERFAELLIG,
    });
    await fristRegel(automationStore, { authorityId: "b1" });
    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(0);
  });

  it("runAutomationTick: Deadline-Scan + Outbox-Verarbeitung in EINEM Aufruf (die geteilte Worker/Poller-Einheit)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = { ...macheTask(c.caseId), dueAt: UEBERFAELLIG };
    await taskStore.insertTask(task);
    await fristRegel(automationStore);
    const r = await runAutomationTick(deps);
    expect(r.scanned).toBe(1);
    expect(r).toMatchObject({ claimed: 1, applied: 1 });
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.priorityKey,
    ).toBe("dringend");
  });

  it("re-scannt eine bereits emittierte Frist NICHT (Marker gesetzt) — kein Event-/Write-Sturm überfälliger Aufgaben", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = { ...macheTask(c.caseId), dueAt: UEBERFAELLIG };
    await taskStore.insertTask(task);
    await fristRegel(automationStore);

    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(1);
    // Marker ist gesetzt → die überfällige Aufgabe fällt aus dem fälligen-Ergebnis, obwohl dueAt weiter in der
    // Vergangenheit liegt (kein Re-Scan bei jedem Tick).
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.deadlineEmittedAt,
    ).toBe(UEBERFAELLIG);
    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(0);
  });

  it("re-emittiert eine VERSCHOBENE Frist (dueAt über die letzte Emission hinaus verschoben)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = { ...macheTask(c.caseId), dueAt: UEBERFAELLIG };
    await taskStore.insertTask(task);
    await fristRegel(automationStore);

    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(1);
    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(0);
    // Frist auf einen späteren (aber weiter überfälligen) Zeitpunkt verschieben → über deadlineEmittedAt hinaus.
    await taskStore.patchTask({
      tenantId: "t1",
      taskId: task.taskId,
      dueAt: "2026-07-10T11:00:00.000Z",
    });
    expect((await emitDueDeadlineEvents(deps)).scanned).toBe(1);
  });
});
