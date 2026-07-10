import { describe, it, expect, beforeAll } from "vitest";
import type { AppCase } from "./case-store.js";
import { CaseVersionConflictError } from "./case-store.js";
import {
  type AppIntakeItem,
  type AppSavedView,
  type AppTask,
  type TaskStore,
  InMemoryTaskStore,
  IntakeNotFoundError,
  PostgresTaskStore,
  TaskNotFoundError,
  TaskRelationError,
} from "./task-store.js";

const uid = () => globalThis.crypto.randomUUID();

function macheTask(over: Partial<AppTask> = {}): AppTask {
  return {
    taskId: `task-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    caseId: null,
    title: "Aufgabe",
    priorityKey: null,
    assigneeActorId: null,
    labels: [],
    dueAt: null,
    sortRank: "V",
    parentTaskId: null,
    boardColumn: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function macheIntake(over: Partial<AppIntakeItem> = {}): AppIntakeItem {
  return {
    intakeId: `intake-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    source: "antrag",
    triageStatus: "pending",
    subject: "Neuer Antrag",
    rawData: { name: "Alex" },
    taskId: null,
    caseId: null,
    receivedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function macheCase(caseId: string): AppCase {
  return {
    caseId,
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
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: { name: string; make: () => TaskStore; enabled: boolean }[] = [
  {
    name: "InMemoryTaskStore",
    make: () =>
      new InMemoryTaskStore({ now: () => "2026-06-02T00:00:00.000Z" }),
    enabled: true,
  },
  {
    name: "PostgresTaskStore",
    make: () => new PostgresTaskStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`TaskStore contract — ${impl.name}`, () => {
    let store: TaskStore;
    beforeAll(() => {
      store = impl.make();
    });

    it("legt eine Aufgabe an und liest sie zurück (mandanten-scoped)", async () => {
      const t = macheTask();
      await store.insertTask(t);
      expect(
        (await store.getTask({ tenantId: "t1", taskId: t.taskId }))?.taskId,
      ).toBe(t.taskId);
      expect(
        await store.getTask({ tenantId: "fremd", taskId: t.taskId }),
      ).toBeUndefined();
    });

    it("patcht Zuweisung/Priorität/Labels und erhöht die Version", async () => {
      const t = macheTask();
      await store.insertTask(t);
      const p1 = await store.patchTask({
        tenantId: "t1",
        taskId: t.taskId,
        assigneeActorId: "sb.a",
      });
      expect(p1.assigneeActorId).toBe("sb.a");
      expect(p1.version).toBe(2);
      const p2 = await store.patchTask({
        tenantId: "t1",
        taskId: t.taskId,
        priorityKey: "hoch",
        labels: ["eilt"],
      });
      expect(p2.priorityKey).toBe("hoch");
      expect(p2.labels).toEqual(["eilt"]);
      expect(p2.version).toBe(3);
      // Zuweisung entfernen (null explizit)
      const p3 = await store.patchTask({
        tenantId: "t1",
        taskId: t.taskId,
        assigneeActorId: null,
      });
      expect(p3.assigneeActorId).toBeNull();
    });

    it("erzwingt Optimistic-Locking bei Board-Move (expectedVersion)", async () => {
      const t = macheTask();
      await store.insertTask(t);
      await store.patchTask({
        tenantId: "t1",
        taskId: t.taskId,
        sortRank: "a",
        expectedVersion: 1,
      });
      await expect(
        store.patchTask({
          tenantId: "t1",
          taskId: t.taskId,
          sortRank: "b",
          expectedVersion: 1,
        }),
      ).rejects.toBeInstanceOf(CaseVersionConflictError);
    });

    it("patchTask wirft für eine unbekannte Aufgabe", async () => {
      await expect(
        store.patchTask({ tenantId: "t1", taskId: "fehlt" }),
      ).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it("listet Aufgaben nach sortRank + filtert nach $none (unzugewiesen)", async () => {
      const a = macheTask({ sortRank: "1", assigneeActorId: "sb.x" });
      const b = macheTask({ sortRank: "0", assigneeActorId: null });
      await store.insertTask(a);
      await store.insertTask(b);
      const none = await store.listTasks({
        tenantId: "t1",
        authorityId: "b1",
        assigneeActorId: "$none",
      });
      expect(none.some((x) => x.taskId === b.taskId)).toBe(true);
      expect(none.some((x) => x.taskId === a.taskId)).toBe(false);
    });

    it("acceptIntake legt Vorgang + Aufgabe atomar an und markiert den Eingang als accepted", async () => {
      const intake = macheIntake();
      await store.insertIntake(intake);
      const caseId = `case-${uid()}`;
      const taskId = `task-${uid()}`;
      const { case: c, task } = await store.acceptIntake({
        tenantId: "t1",
        intakeId: intake.intakeId,
        case: macheCase(caseId),
        task: macheTask({ taskId, title: "Aus Eingang", caseId }),
      });
      expect(c.caseId).toBe(caseId);
      expect(task.caseId).toBe(caseId);
      const accepted = await store.listIntake({
        tenantId: "t1",
        authorityId: "b1",
        triageStatus: "accepted",
      });
      expect(
        accepted.some(
          (i) => i.intakeId === intake.intakeId && i.taskId === taskId,
        ),
      ).toBe(true);
      // die erzeugte Aufgabe ist abrufbar
      expect((await store.getTask({ tenantId: "t1", taskId }))?.caseId).toBe(
        caseId,
      );
    });

    it("setTriageStatus setzt declined/snoozed (behörden-scoped) und wirft bei unbekanntem Eingang", async () => {
      const intake = macheIntake();
      await store.insertIntake(intake);
      const upd = await store.setTriageStatus({
        tenantId: intake.tenantId,
        authorityId: intake.authorityId,
        intakeId: intake.intakeId,
        triageStatus: "declined",
      });
      expect(upd.triageStatus).toBe("declined");
      // Fremd-Behörde sieht den Eingang nicht → wirft.
      await expect(
        store.setTriageStatus({
          tenantId: intake.tenantId,
          authorityId: "fremde-behoerde",
          intakeId: intake.intakeId,
          triageStatus: "snoozed",
        }),
      ).rejects.toBeInstanceOf(IntakeNotFoundError);
      // Unbekannter Eingang → wirft.
      await expect(
        store.setTriageStatus({
          tenantId: intake.tenantId,
          authorityId: intake.authorityId,
          intakeId: "gibt-es-nicht",
          triageStatus: "snoozed",
        }),
      ).rejects.toBeInstanceOf(IntakeNotFoundError);
    });

    it("setTriageStatus verweigert einen bereits ANGENOMMENEN Eingang (accepted ist terminal)", async () => {
      const intake = macheIntake();
      await store.insertIntake(intake);
      const caseId = `case-${uid()}`;
      await store.acceptIntake({
        tenantId: intake.tenantId,
        intakeId: intake.intakeId,
        case: macheCase(caseId),
        task: macheTask({ taskId: `task-${uid()}`, caseId }),
      });
      // Zurücksetzen eines angenommenen Eingangs würde ihn von seinem Fall/Task desynchronisieren → verweigert.
      await expect(
        store.setTriageStatus({
          tenantId: intake.tenantId,
          authorityId: intake.authorityId,
          intakeId: intake.intakeId,
          triageStatus: "declined",
        }),
      ).rejects.toBeInstanceOf(IntakeNotFoundError);
    });

    it("hängt Vermerke append-only an und liest sie chronologisch (mandanten-scoped)", async () => {
      const task = macheTask();
      await store.insertTask(task);
      await store.insertTaskComment({
        commentId: `c-${uid()}`,
        taskId: task.taskId,
        tenantId: "t1",
        authorityId: "b1",
        authorActorId: "sb.a",
        body: "Erster Vermerk",
        createdAt: "2026-06-02T08:00:00.000Z",
      });
      await store.insertTaskComment({
        commentId: `c-${uid()}`,
        taskId: task.taskId,
        tenantId: "t1",
        authorityId: "b1",
        authorActorId: "sb.b",
        body: "Zweiter Vermerk",
        createdAt: "2026-06-02T09:00:00.000Z",
      });
      const list = await store.listTaskComments({
        tenantId: "t1",
        taskId: task.taskId,
      });
      expect(list.map((c) => c.body)).toEqual([
        "Erster Vermerk",
        "Zweiter Vermerk",
      ]);
      // Fremd-Mandant sieht nichts.
      expect(
        await store.listTaskComments({ tenantId: "t2", taskId: task.taskId }),
      ).toHaveLength(0);
    });

    it("protokolliert Aktivität append-only mit Payload", async () => {
      const task = macheTask();
      await store.insertTask(task);
      await store.insertTaskActivity({
        activityId: `a-${uid()}`,
        taskId: task.taskId,
        tenantId: "t1",
        actorId: "sb.a",
        activityType: "task.assigned",
        payload: { to: "sb.b" },
        occurredAt: "2026-06-02T10:00:00.000Z",
      });
      const feed = await store.listTaskActivity({
        tenantId: "t1",
        taskId: task.taskId,
      });
      expect(feed).toHaveLength(1);
      expect(feed[0]?.activityType).toBe("task.assigned");
      expect(feed[0]?.payload).toEqual({ to: "sb.b" });
    });

    it("speichert persönliche + geteilte Ansichten und löscht wieder (nicht append-only)", async () => {
      // Eindeutiger Mandant → volle Isolation gegen andere Testdateien in einer geteilten Postgres-DB.
      const tid = `t-${uid()}`;
      const personal: AppSavedView = {
        viewId: `v-${uid()}`,
        tenantId: tid,
        authorityId: "b1",
        ownerActorId: "sb.a",
        scope: "personal",
        label: "Meine offenen",
        layout: "board",
        definition: { filter: { status: "offen" } },
        createdAt: "2026-06-02T11:00:00.000Z",
      };
      const geteilt: AppSavedView = {
        ...personal,
        viewId: `v-${uid()}`,
        ownerActorId: null,
        scope: "geteilt",
        label: "Team-Board",
        createdAt: "2026-06-02T11:05:00.000Z",
      };
      await store.insertSavedView(personal);
      await store.insertSavedView(geteilt);

      // sb.a sieht die eigene + die geteilte.
      const forA = await store.listSavedViews({
        tenantId: tid,
        authorityId: "b1",
        ownerActorId: "sb.a",
      });
      expect(forA.map((v) => v.label).sort()).toEqual([
        "Meine offenen",
        "Team-Board",
      ]);
      // sb.b (ohne ownerActorId-Match) sieht nur die geteilte.
      const forB = await store.listSavedViews({
        tenantId: tid,
        authorityId: "b1",
        ownerActorId: "sb.b",
      });
      expect(forB.map((v) => v.label)).toEqual(["Team-Board"]);

      // Ein FREMDER Akteur darf die persönliche Ansicht NICHT löschen.
      await store.deleteSavedView({
        tenantId: tid,
        authorityId: "b1",
        actorId: "sb.b",
        viewId: personal.viewId,
      });
      expect(
        (
          await store.listSavedViews({
            tenantId: tid,
            authorityId: "b1",
            ownerActorId: "sb.a",
          })
        ).map((v) => v.label),
      ).toContain("Meine offenen");

      // Der Eigentümer löscht sie.
      await store.deleteSavedView({
        tenantId: tid,
        authorityId: "b1",
        actorId: "sb.a",
        viewId: personal.viewId,
      });
      const afterDelete = await store.listSavedViews({
        tenantId: tid,
        authorityId: "b1",
        ownerActorId: "sb.a",
      });
      expect(afterDelete.map((v) => v.label)).toEqual(["Team-Board"]);
    });

    it("Beziehungen: anlegen/lesen/löschen; Selbstreferenz + Duplikat werfen", async () => {
      const tid = `t-${uid()}`;
      const rel = {
        relationId: `rel-${uid()}`,
        tenantId: tid,
        authorityId: "b1",
        taskId: "task-A",
        relatedTaskId: "task-B",
        relationType: "blocks" as const,
        createdAt: "2026-06-02T12:00:00.000Z",
      };
      await store.insertTaskRelation(rel);
      const list = await store.listTaskRelations({
        tenantId: tid,
        taskId: "task-A",
      });
      expect(list).toHaveLength(1);
      expect(list[0]?.relationType).toBe("blocks");

      // Selbstreferenz unzulässig.
      await expect(
        store.insertTaskRelation({
          ...rel,
          relationId: `rel-${uid()}`,
          relatedTaskId: "task-A",
        }),
      ).rejects.toBeInstanceOf(TaskRelationError);
      // Duplikat (gleiche Aufgaben + Typ) unzulässig.
      await expect(
        store.insertTaskRelation({ ...rel, relationId: `rel-${uid()}` }),
      ).rejects.toBeInstanceOf(TaskRelationError);

      // Fremde Behörde darf NICHT löschen (Scope) — bleibt bestehen.
      await store.deleteTaskRelation({
        tenantId: tid,
        authorityId: "b-fremd",
        taskId: "task-A",
        relationId: rel.relationId,
      });
      expect(
        await store.listTaskRelations({ tenantId: tid, taskId: "task-A" }),
      ).toHaveLength(1);
      // Korrekte Behörde + Task → gelöscht.
      await store.deleteTaskRelation({
        tenantId: tid,
        authorityId: "b1",
        taskId: "task-A",
        relationId: rel.relationId,
      });
      expect(
        await store.listTaskRelations({ tenantId: tid, taskId: "task-A" }),
      ).toHaveLength(0);
    });
  });
}
