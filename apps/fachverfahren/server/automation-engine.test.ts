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

  it("MEHR-AKTIONS-REGEL: eine spätere Aktion wirft → Lauf `failed`, aber bereits committete Teil-Effekte werden EHRLICH protokolliert (`partiell`/`teilEffekte`) statt verschwiegen", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-partiell",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      // „zuweisen" committet (patchTask); danach wirft „setze-feld" fail-closed → der Vor-Effekt bleibt bestehen.
      actions: [
        { art: "zuweisen", an: "sb.auto" },
        { art: "setze-feld", feld: "x", wert: "y" },
      ],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    await automationStore.enqueueEvent({
      eventId: "e-partiell",
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
    expect(res).toMatchObject({ claimed: 1, applied: 0, failed: 1 });
    // Der Teil-Effekt (Zuweisung) IST persistiert ...
    const nach = await taskStore.getTask({
      tenantId: "t1",
      taskId: task.taskId,
    });
    expect(nach?.assigneeActorId).toBe("sb.auto");
    // ... und wird im fehlgeschlagenen Lauf EHRLICH ausgewiesen (keine stille, nicht-protokollierte Mutation).
    const runs = await automationStore.listRuns({ ruleId: "r-partiell" });
    expect(runs[0]?.status).toBe("failed");
    expect(runs[0]?.detail?.["partiell"]).toBe(true);
    expect(runs[0]?.detail?.["teilEffekte"]).toEqual(["zuweisen:sb.auto"]);
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

  it("dead-lettert ein POISON-Event nach Überschreiten von maxAttempts (kein Re-Claim, poison-Lauf sichtbar)", async () => {
    const { deps, automationStore } = makeDeps();
    deps.maxAttempts = 2;
    await automationStore.enqueueEvent({
      eventId: "poison-1",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: null,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: "2026-07-10T00:00:00.000Z",
      processedAt: null,
    });
    // Simulierter wiederholter Prozess-Crash: 2x claimen OHNE markProcessed, Lease jeweils vor NOW (12:00) abgelaufen
    // → attempts steigt auf 2, das Event ist bei NOW wieder claimbar.
    await automationStore.claimDueEvents({
      now: "2026-07-10T10:00:00.000Z",
      limit: 10,
      visibilityMs: 1000,
    });
    await automationStore.claimDueEvents({
      now: "2026-07-10T11:00:00.000Z",
      limit: 10,
      visibilityMs: 1000,
    });

    // Der Engine-Claim macht attempts=3 > maxAttempts=2 → DEAD-LETTER statt Verarbeitung (der attempts-Check steht
    // vor jeder Payload-Verarbeitung, bricht also den Crash-Loop).
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({
      claimed: 1,
      deadLettered: 1,
      applied: 0,
      failed: 0,
    });

    // Sichtbar/auswertbar: ein failed-Lauf mit reason=poison-max-attempts (+ attempts) statt stillem Verlust.
    const runs = await automationStore.listRuns({});
    const poison = runs.find(
      (r) => r.detail?.["reason"] === "poison-max-attempts",
    );
    expect(poison?.status).toBe("failed");
    expect(poison?.detail?.["attempts"]).toBe(3);

    // Terminal quarantänt: ein weiterer Tick claimt NICHTS mehr (kein Endlos-Re-Claim).
    const res2 = await processDueAutomationEvents(deps);
    expect(res2.claimed).toBe(0);
  });

  it("verarbeitet ein Event UNTER der Obergrenze normal (kein fälschliches Dead-Letter)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    deps.maxAttempts = 2;
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-prio-cap",
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
    await automationStore.enqueueEvent({
      eventId: "unter-cap",
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
    // Erster Engine-Claim → attempts=1 (< 2) → normale Verarbeitung, KEIN Dead-Letter.
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 1, applied: 1, deadLettered: 0 });
  });

  it("dead-lettert ein Poison-Event, verschont aber ein co-fälliges GESUNDES Event (limit-1-Claim → Crash eindeutig zugeordnet)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    deps.maxAttempts = 2;
    const c = macheCase();
    await caseStore.insertCase(c);
    const task = macheTask(c.caseId);
    await taskStore.insertTask(task);
    await automationStore.insertRule({
      ruleId: "r-prio-collat",
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
    // Poison-Event, FRÜHER erstellt → steht in der created_at-Ordnung VORN.
    await automationStore.enqueueEvent({
      eventId: "poison",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: "2026-07-10T00:00:00.000Z",
      processedAt: null,
    });
    // GESUNDES Event, SPÄTER erstellt, mit passender Regel (soll Priorität setzen).
    await automationStore.enqueueEvent({
      eventId: "gesund",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: c.caseId,
      taskId: task.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: "2026-07-10T00:00:01.000Z",
      processedAt: null,
    });

    // Simulierte Crash-Zyklen — GENAU wie der limit-1-Consumer sie fährt: jeder Claim greift das ÄLTESTE claimbare
    // Event = „poison". „gesund" wird NIE co-geclaimt → sein attempts bleibt 0 (das ist der Kern des Fixes).
    for (const t of [
      "2026-07-10T08:00:00.000Z",
      "2026-07-10T09:00:00.000Z",
      "2026-07-10T10:00:00.000Z",
    ]) {
      const cl = await automationStore.claimDueEvents({
        now: t,
        limit: 1,
        visibilityMs: 1000,
      });
      expect(cl.map((e) => e.eventId)).toEqual(["poison"]);
    }

    // Der Tick (limit-1-Loop) bei NOW: dead-lettert „poison", verarbeitet DANACH „gesund" normal.
    const res = await processDueAutomationEvents(deps);
    expect(res).toMatchObject({ claimed: 2, deadLettered: 1, applied: 1 });
    // „gesund" wurde VERARBEITET (Priorität gesetzt), NICHT fälschlich quarantänt.
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: task.taskId }))
        ?.priorityKey,
    ).toBe("hoch");
    const runs = await automationStore.listRuns({});
    expect(
      runs.find(
        (r) =>
          r.eventId === "gesund" &&
          r.detail?.["reason"] === "poison-max-attempts",
      ),
    ).toBeUndefined();
    expect(
      runs.find(
        (r) =>
          r.eventId === "poison" &&
          r.detail?.["reason"] === "poison-max-attempts",
      ),
    ).toBeDefined();
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

  it("PER-EVENT-ISOLATION: ein getCase-Wurf bei EINEM Event bricht den Batch NICHT ab und wird als failed auditiert (kein stiller Verlust)", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const cGift = macheCase();
    const cOk = macheCase();
    await caseStore.insertCase(cGift);
    await caseStore.insertCase(cOk);
    const taskGift = macheTask(cGift.caseId);
    const taskOk = macheTask(cOk.caseId);
    await taskStore.insertTask(taskGift);
    await taskStore.insertTask(taskOk);
    // getCase für den Gift-Fall transient werfen lassen (simulierter DB-Fehler mitten in der Verarbeitung).
    const echtesGetCase = caseStore.getCase.bind(caseStore);
    caseStore.getCase = async (input) => {
      if (input.caseId === cGift.caseId)
        throw new Error("transienter DB-Fehler (getCase)");
      return echtesGetCase(input);
    };
    await automationStore.insertRule({
      ruleId: "r-prio",
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
    for (const [eventId, c, task] of [
      ["e-gift", cGift, taskGift],
      ["e-ok", cOk, taskOk],
    ] as const) {
      await automationStore.enqueueEvent({
        eventId,
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
    }

    const res = await processDueAutomationEvents(deps);

    // Batch NICHT abgebrochen: das OK-Event lief trotz des Wurfs beim Gift-Event.
    expect(res.claimed).toBe(2);
    expect(res.applied).toBe(1);
    expect(res.failed).toBe(1);
    expect(
      (await taskStore.getTask({ tenantId: "t1", taskId: taskOk.taskId }))
        ?.priorityKey,
    ).toBe("hoch");
    // Gift-Event ist NICHT still verloren, sondern ehrlich als failed protokolliert.
    const runs = await automationStore.listRuns({ ruleId: "r-prio" });
    expect(runs.find((r) => r.eventId === "e-gift")?.status).toBe("failed");
  });

  it("PER-EVENT-ISOLATION: ein listRules-Wurf reißt den restlichen Batch nicht mit und wird als orchestration-error auditiert", async () => {
    const { deps, caseStore, taskStore, automationStore } = makeDeps();
    const cOk = macheCase();
    await caseStore.insertCase(cOk);
    const taskOk = macheTask(cOk.caseId);
    await taskStore.insertTask(taskOk);
    // listRules für die „Gift"-Behörde transient werfen lassen (vor jeder Regel → Orchestrierungs-Fehler).
    const echtesListRules = automationStore.listRules.bind(automationStore);
    automationStore.listRules = async (q) => {
      if (q.authorityId === "b-gift")
        throw new Error("transienter DB-Fehler (listRules)");
      return echtesListRules(q);
    };
    await automationStore.insertRule({
      ruleId: "r-prio",
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
    // Gift-Event (andere Behörde, caseId null) + OK-Event.
    await automationStore.enqueueEvent({
      eventId: "e-gift",
      tenantId: "t1",
      authorityId: "b-gift",
      procedureId: "leistung",
      caseId: null,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });
    await automationStore.enqueueEvent({
      eventId: "e-ok",
      tenantId: "t1",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: cOk.caseId,
      taskId: taskOk.taskId,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });

    const res = await processDueAutomationEvents(deps);

    expect(res.claimed).toBe(2);
    expect(res.applied).toBe(1); // e-ok trotz des Wurfs bei e-gift
    expect(res.failed).toBe(1); // e-gift
    // Der Orchestrierungs-Fehler ist sichtbar auditiert (Sentinel-run), kein stiller Verlust.
    const alle = await automationStore.listRuns({});
    const orch = alle.find(
      (r) =>
        r.eventId === "e-gift" && r.detail["reason"] === "orchestration-error",
    );
    expect(orch?.status).toBe("failed");
  });
});

describe("automation engine — Mandanten-Isolation (adversarial, Skalierungsplan #2)", () => {
  it("eine Regel eines FREMDEN Mandanten feuert NICHT auf ein Event (Regel-Suche via event.tenantId)", async () => {
    const { deps, automationStore } = makeDeps();
    // `claimDueEvents` ist mandanten-ÜBERGREIFEND (ein Worker); die Isolation entsteht dadurch, dass die Engine die
    // passenden Regeln mit event.tenantId sucht. Diese Regel gehört Mandant t-b (gleicher Trigger/Verfahren).
    await automationStore.insertRule({
      ruleId: "regel-fremd",
      tenantId: "t-b",
      authorityId: "b1",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: { feld: "$procedureId", op: "==", wert: "leistung" },
      actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      requiresFourEyes: false,
      active: true,
      createdAt: NOW,
    });
    // Das Event gehört Mandant t-a — die t-b-Regel darf NICHT darauf feuern.
    await automationStore.enqueueEvent({
      eventId: "evt-ta",
      tenantId: "t-a",
      authorityId: "b1",
      procedureId: "leistung",
      caseId: null,
      taskId: null,
      triggerEvent: "beim-eingang",
      payload: {},
      createdAt: NOW,
      processedAt: null,
    });

    const res = await processDueAutomationEvents(deps);
    // Geclaimt, aber die FREMDE Regel feuerte NICHT (mandanten-scopte Regel-Suche) → kein applied.
    expect(res).toMatchObject({ claimed: 1, applied: 0, deadLettered: 0 });
    expect(
      await automationStore.listRuns({ ruleId: "regel-fremd" }),
    ).toHaveLength(0);
  });
});
