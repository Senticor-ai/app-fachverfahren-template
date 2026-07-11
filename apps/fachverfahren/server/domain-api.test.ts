import { describe, it, expect } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import {
  type AppCase,
  type AppIntakeItem,
  type AppTask,
  type AutomationStore,
  type CaseStore,
  type TaskStore,
  InMemoryAutomationStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
  PostgresCaseStore,
  PostgresTaskStore,
} from "@senticor/app-store-postgres";
import { DefaultDenyPolicyEngine } from "@senticor/public-sector-sdk";
import {
  catalogFromStatusMachines,
  headerSession,
  registerDomainApi,
} from "./domain-api.js";
import { processDueAutomationEvents } from "./automation-engine.js";
import { HeuristicKiAssist } from "./ai-assist.js";
import { InMemoryActorRoleStore } from "@senticor/app-store-postgres";

const STATUS_MACHINE = {
  states: [
    { key: "eingegangen" },
    { key: "vorgelegt" },
    { key: "festgesetzt", terminal: true },
    { key: "abgelehnt", terminal: true },
  ],
  transitions: [
    { from: "eingegangen", to: "vorgelegt", rollen: ["sachbearbeitung"] },
    {
      from: "vorgelegt",
      to: "festgesetzt",
      rollen: ["sachbearbeitung"],
      vierAugen: true,
    },
    {
      from: "vorgelegt",
      to: "abgelehnt",
      rollen: ["sachbearbeitung"],
      detailPflicht: true,
    },
  ],
};

const catalog = catalogFromStatusMachines([
  {
    procedureId: "leistung",
    procedureVersion: "1",
    statusMachine: STATUS_MACHINE,
  },
]);

const uid = () => globalThis.crypto.randomUUID();

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
    openedAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

function buildApp(caseStore: CaseStore): FastifyInstance {
  const app = fastify({ logger: false });
  registerDomainApi(app, {
    caseStore,
    catalog,
    resolveSession: headerSession,
    now: () => "2026-06-01T00:00:00.000Z",
    newAuditId: uid,
  });
  return app;
}

const SB = (
  actor: string,
  perms = "case.read,case.transition,case.decide",
) => ({
  "x-actor-id": actor,
  "x-tenant-id": "t1",
  "x-authority-id": "b1",
  "x-permissions": perms,
});

function runContract(
  name: string,
  makeStore: () => CaseStore,
  enabled: boolean,
) {
  describe.skipIf(!enabled)(`Domain-API (HTTP inject) — ${name}`, () => {
    it("401 ohne Session-Header", async () => {
      const store = makeStore();
      const c = macheCase();
      await store.insertCase(c);
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        payload: { action: "vorgelegt", expectedVersion: 1 },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("403 ohne die nötige Berechtigung", async () => {
      const store = makeStore();
      const c = macheCase();
      await store.insertCase(c);
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.a", "case.read"),
        payload: { action: "vorgelegt", expectedVersion: 1 },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("200 führt einen Übergang aus + Audit wächst", async () => {
      const store = makeStore();
      const c = macheCase();
      await store.insertCase(c);
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.a"),
        payload: { action: "vorgelegt", expectedVersion: 1 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().case.state).toBe("vorgelegt");
      const audit = await app.inject({
        method: "GET",
        url: `/api/cases/${c.caseId}/audit`,
        headers: SB("sb.a", "audit.read"),
      });
      expect(audit.json().events.length).toBe(1);
      await app.close();
    });

    it("403 Vier-Augen: derselbe Akteur darf nach Vorlage nicht festsetzen; ein anderer schon", async () => {
      const store = makeStore();
      const c = macheCase();
      await store.insertCase(c);
      const app = buildApp(store);
      await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.a"),
        payload: { action: "vorgelegt", expectedVersion: 1 },
      });
      const selbst = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.a"),
        payload: { action: "festgesetzt", expectedVersion: 2 },
      });
      expect(selbst.statusCode).toBe(403);
      const andere = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.b"),
        payload: { action: "festgesetzt", expectedVersion: 2 },
      });
      expect(andere.statusCode).toBe(200);
      expect(andere.json().case.state).toBe("festgesetzt");
      await app.close();
    });

    it("400 wenn eine begründungspflichtige Aktion ohne detail kommt", async () => {
      const store = makeStore();
      const c = macheCase({ state: "vorgelegt", version: 2 });
      await store.insertCase(c);
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.b"),
        payload: { action: "abgelehnt", expectedVersion: 2 },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("409 bei veralteter erwarteter Version", async () => {
      const store = makeStore();
      const c = macheCase({ version: 3 });
      await store.insertCase(c);
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/${c.caseId}/transitions`,
        headers: SB("sb.a"),
        payload: { action: "vorgelegt", expectedVersion: 1 },
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    });

    it("404 für einen unbekannten Fall", async () => {
      const store = makeStore();
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/does-not-exist/transitions`,
        headers: SB("sb.a"),
        payload: { action: "vorgelegt", expectedVersion: 1 },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("400 bei schema-ungültigem Body (fehlendes expectedVersion) — vor dem Handler", async () => {
      const store = makeStore();
      const app = buildApp(store);
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/x/transitions`,
        headers: SB("sb.a"),
        payload: { action: "vorgelegt" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("GET /api/cases listet die Fälle im Session-Scope", async () => {
      const store = makeStore();
      const c = macheCase();
      await store.insertCase(c);
      const app = buildApp(store);
      const res = await app.inject({
        method: "GET",
        url: `/api/cases`,
        headers: SB("sb.a"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().cases.some((x: AppCase) => x.caseId === c.caseId)).toBe(
        true,
      );
      // Fremder Mandant sieht nichts.
      const fremd = await app.inject({
        method: "GET",
        url: `/api/cases`,
        headers: { ...SB("sb.x"), "x-tenant-id": "fremd" },
      });
      expect(
        fremd.json().cases.some((x: AppCase) => x.caseId === c.caseId),
      ).toBe(false);
      await app.close();
    });
  });
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];

runContract("InMemoryCaseStore", () => new InMemoryCaseStore(), true);
runContract(
  "PostgresCaseStore (echtes Postgres)",
  () => new PostgresCaseStore(pgUrl!),
  Boolean(pgUrl),
);

// ── Tasks + Triage-Inbox ──────────────────────────────────────────────────────────────────────────
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
    rawData: {},
    taskId: null,
    caseId: null,
    receivedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function buildTaskApp(
  caseStore: CaseStore,
  taskStore: TaskStore,
  automationStore?: AutomationStore,
): FastifyInstance {
  const app = fastify({ logger: false });
  registerDomainApi(app, {
    caseStore,
    taskStore,
    ...(automationStore ? { automationStore } : {}),
    catalog,
    resolveSession: headerSession,
    procedureInitialState: () => "eingegangen",
    now: () => "2026-06-02T00:00:00.000Z",
    newId: uid,
    newAuditId: uid,
  });
  return app;
}

const SBT = (
  actor: string,
  perms = "task.read,task.write,inbox.read,inbox.triage",
) => ({
  "x-actor-id": actor,
  "x-tenant-id": "t1",
  "x-authority-id": "b1",
  "x-permissions": perms,
});

function runTaskContract(
  name: string,
  makeStores: () => { caseStore: CaseStore; taskStore: TaskStore },
  enabled: boolean,
) {
  describe.skipIf(!enabled)(
    `Domain-API Tasks/Inbox (HTTP inject) — ${name}`,
    () => {
      it("403 ohne task.read", async () => {
        const { caseStore, taskStore } = makeStores();
        const app = buildTaskApp(caseStore, taskStore);
        const res = await app.inject({
          method: "GET",
          url: "/api/tasks",
          headers: SBT("sb.a", "case.read"),
        });
        expect(res.statusCode).toBe(403);
        await app.close();
      });

      it("Inbox annehmen erzeugt Vorgang + Aufgabe; danach sichtbar in /api/tasks", async () => {
        const { caseStore, taskStore } = makeStores();
        const intake = macheIntake();
        await taskStore.insertIntake(intake);
        const app = buildTaskApp(caseStore, taskStore);

        const inbox = await app.inject({
          method: "GET",
          url: "/api/inbox",
          headers: SBT("sb.a"),
        });
        expect(
          inbox
            .json()
            .items.some((i: AppIntakeItem) => i.intakeId === intake.intakeId),
        ).toBe(true);

        const accept = await app.inject({
          method: "POST",
          url: `/api/inbox/${intake.intakeId}/accept`,
          headers: SBT("sb.a"),
        });
        expect(accept.statusCode).toBe(201);
        const { case: c, task } = accept.json();
        expect(c.state).toBe("eingegangen");
        expect(task.caseId).toBe(c.caseId);

        const tasks = await app.inject({
          method: "GET",
          url: "/api/tasks",
          headers: SBT("sb.a"),
        });
        expect(
          tasks
            .json()
            .tasks.some((t: { taskId: string }) => t.taskId === task.taskId),
        ).toBe(true);
        await app.close();
      });

      it("Ingest: POST /api/inbox reiht einen neuen Eingang ein (Scope aus Session), sichtbar in GET /api/inbox", async () => {
        const { caseStore, taskStore } = makeStores();
        const app = buildTaskApp(caseStore, taskStore);
        const created = await app.inject({
          method: "POST",
          url: "/api/inbox",
          headers: SBT("sb.a"),
          payload: {
            procedureId: "leistung",
            source: "formular",
            subject: "Neuer Antrag",
          },
        });
        expect(created.statusCode).toBe(201);
        const intakeId = created.json().item.intakeId;
        const list = await app.inject({
          method: "GET",
          url: "/api/inbox",
          headers: SBT("sb.a"),
        });
        expect(
          list
            .json()
            .items.some(
              (i: AppIntakeItem) =>
                i.intakeId === intakeId && i.triageStatus === "pending",
            ),
        ).toBe(true);
        await app.close();
      });

      it("Triage: POST /api/inbox/:id/triage setzt declined, OHNE einen Vorgang zu erzeugen", async () => {
        const { caseStore, taskStore } = makeStores();
        const intake = macheIntake();
        await taskStore.insertIntake(intake);
        const app = buildTaskApp(caseStore, taskStore);
        const res = await app.inject({
          method: "POST",
          url: `/api/inbox/${intake.intakeId}/triage`,
          headers: SBT("sb.a"),
          payload: { status: "declined" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().item.triageStatus).toBe("declined");
        await app.close();
      });

      it("Doppel-Accept → 409 (kein Duplikat-Vorgang, erster bleibt gültig)", async () => {
        const { caseStore, taskStore } = makeStores();
        const intake = macheIntake();
        await taskStore.insertIntake(intake);
        const app = buildTaskApp(caseStore, taskStore);
        const first = await app.inject({
          method: "POST",
          url: `/api/inbox/${intake.intakeId}/accept`,
          headers: SBT("sb.a"),
        });
        expect(first.statusCode).toBe(201);
        const second = await app.inject({
          method: "POST",
          url: `/api/inbox/${intake.intakeId}/accept`,
          headers: SBT("sb.a"),
        });
        expect(second.statusCode).toBe(409);
        await app.close();
      });

      it("Triage: 404 auf unbekannten Eingang", async () => {
        const { caseStore, taskStore } = makeStores();
        const app = buildTaskApp(caseStore, taskStore);
        const res = await app.inject({
          method: "POST",
          url: "/api/inbox/gibt-es-nicht/triage",
          headers: SBT("sb.a"),
          payload: { status: "snoozed" },
        });
        expect(res.statusCode).toBe(404);
        await app.close();
      });

      it("Ingest: 403 ohne inbox.triage", async () => {
        const { caseStore, taskStore } = makeStores();
        const app = buildTaskApp(caseStore, taskStore);
        const res = await app.inject({
          method: "POST",
          url: "/api/inbox",
          headers: SBT("sb.a", "inbox.read"),
          payload: { procedureId: "leistung", source: "email" },
        });
        expect(res.statusCode).toBe(403);
        await app.close();
      });

      it("PATCH setzt Priorität/Zuweisung; Board-Move mit veralteter Version → 409", async () => {
        const { caseStore, taskStore } = makeStores();
        const intake = macheIntake();
        await taskStore.insertIntake(intake);
        const app = buildTaskApp(caseStore, taskStore);
        const accept = await app.inject({
          method: "POST",
          url: `/api/inbox/${intake.intakeId}/accept`,
          headers: SBT("sb.a"),
        });
        const taskId = accept.json().task.taskId;

        const patched = await app.inject({
          method: "PATCH",
          url: `/api/tasks/${taskId}`,
          headers: SBT("sb.a"),
          payload: { priorityKey: "hoch", assigneeActorId: "sb.a" },
        });
        expect(patched.statusCode).toBe(200);
        expect(patched.json().task.priorityKey).toBe("hoch");
        expect(patched.json().task.assigneeActorId).toBe("sb.a");

        // Board-Move mit veralteter Version (Task ist jetzt v2) → 409
        const conflict = await app.inject({
          method: "PATCH",
          url: `/api/tasks/${taskId}`,
          headers: SBT("sb.a"),
          payload: { sortRank: "M", expectedVersion: 1 },
        });
        expect(conflict.statusCode).toBe(409);
        await app.close();
      });

      it("Split-Brain-Regression: accept → transition auf DEMSELBEN Fall funktioniert (nicht 404) + Audit-Kette", async () => {
        const { caseStore, taskStore } = makeStores();
        const intake = macheIntake();
        await taskStore.insertIntake(intake);
        const app = buildTaskApp(caseStore, taskStore);
        // annehmen → Fall + Aufgabe entstehen (state eingegangen)
        const accept = await app.inject({
          method: "POST",
          url: `/api/inbox/${intake.intakeId}/accept`,
          headers: SBT("sb.a"),
        });
        expect(accept.statusCode).toBe(201);
        const caseId = accept.json().case.caseId;
        // Der ANGENOMMENE Fall MUSS für executeCaseTransition sichtbar sein (kein 404 durch Split-Brain).
        const trans = await app.inject({
          method: "POST",
          url: `/api/cases/${caseId}/transitions`,
          headers: {
            ...SBT("sb.a", "case.read,case.transition,case.decide"),
          },
          payload: { action: "vorgelegt", expectedVersion: 1 },
        });
        expect(trans.statusCode).toBe(200);
        expect(trans.json().case.state).toBe("vorgelegt");
        // Audit-Wurzel (case.eingegangen) + Übergang (case.vorgelegt) — lückenlos ab dem ersten Zustand.
        const audit = await app.inject({
          method: "GET",
          url: `/api/cases/${caseId}/audit`,
          headers: SBT("sb.a", "audit.read"),
        });
        expect(
          audit.json().events.map((e: { eventType: string }) => e.eventType),
        ).toEqual(["case.eingegangen", "case.vorgelegt"]);
        await app.close();
      });

      it("PATCH auf eine unbekannte Aufgabe → 404", async () => {
        const { caseStore, taskStore } = makeStores();
        const app = buildTaskApp(caseStore, taskStore);
        const res = await app.inject({
          method: "PATCH",
          url: `/api/tasks/does-not-exist`,
          headers: SBT("sb.a"),
          payload: { priorityKey: "hoch" },
        });
        expect(res.statusCode).toBe(404);
        await app.close();
      });

      it("Vermerk anlegen (append-only) + Aktivitäts-Feed wächst; Bürger ohne comment.read sieht 403", async () => {
        const { caseStore, taskStore } = makeStores();
        const task = macheTaskFixture();
        await taskStore.insertTask(task);
        const app = buildTaskApp(caseStore, taskStore);

        // Ohne comment.write kein Anlegen.
        const denied = await app.inject({
          method: "POST",
          url: `/api/tasks/${task.taskId}/comments`,
          headers: SBT("sb.a", "task.read"),
          payload: { body: "Verdeckt" },
        });
        expect(denied.statusCode).toBe(403);

        // Mit comment.write anlegen.
        const created = await app.inject({
          method: "POST",
          url: `/api/tasks/${task.taskId}/comments`,
          headers: SBT("sb.a", "comment.write"),
          payload: { body: "Bitte Nachweis prüfen." },
        });
        expect(created.statusCode).toBe(201);

        // Lesen erfordert task.read UND comment.read.
        const list = await app.inject({
          method: "GET",
          url: `/api/tasks/${task.taskId}/comments`,
          headers: SBT("sb.a", "task.read,comment.read"),
        });
        expect(list.statusCode).toBe(200);
        expect(list.json().comments).toHaveLength(1);
        expect(list.json().comments[0].body).toBe("Bitte Nachweis prüfen.");

        // Ein Vermerk erzeugt einen Aktivitäts-Eintrag.
        const activity = await app.inject({
          method: "GET",
          url: `/api/tasks/${task.taskId}/activity`,
          headers: SBT("sb.a", "task.read"),
        });
        expect(
          activity
            .json()
            .activity.map((a: { activityType: string }) => a.activityType),
        ).toContain("task.commented");
      });

      it("Change-Log: PATCH (Zuweisung + Priorität) protokolliert je eine Aktivität mit Akteur", async () => {
        const { caseStore, taskStore } = makeStores();
        const task = macheTaskFixture();
        await taskStore.insertTask(task);
        const app = buildTaskApp(caseStore, taskStore);

        const zug = await app.inject({
          method: "PATCH",
          url: `/api/tasks/${task.taskId}`,
          headers: SBT("sb.eins", "task.write"),
          payload: { assigneeActorId: "sb.zwei" },
        });
        expect(zug.statusCode).toBe(200);
        const prio = await app.inject({
          method: "PATCH",
          url: `/api/tasks/${task.taskId}`,
          headers: SBT("sb.eins", "task.write"),
          payload: { priorityKey: "hoch" },
        });
        expect(prio.statusCode).toBe(200);

        const activity = await app.inject({
          method: "GET",
          url: `/api/tasks/${task.taskId}/activity`,
          headers: SBT("sb.eins", "task.read"),
        });
        const eintraege = activity.json().activity as {
          activityType: string;
          actorId: string;
          payload?: Record<string, unknown>;
        }[];
        const typen = eintraege.map((a) => a.activityType);
        expect(typen).toContain("task.zugewiesen");
        expect(typen).toContain("task.prioritaet-geaendert");
        const zuw = eintraege.find((a) => a.activityType === "task.zugewiesen");
        expect(zuw?.actorId).toBe("sb.eins");
        expect(zuw?.payload).toEqual({ zugewiesenAn: "sb.zwei" });
        await app.close();
      });

      it("gespeicherte Ansichten: persönlich ohne, geteilt nur mit view.share; löschbar", async () => {
        const { caseStore, taskStore } = makeStores();
        const app = buildTaskApp(caseStore, taskStore);
        // Eindeutiges Label → robust gegen (geteilte) Alt-Ansichten in einer geteilten Postgres-DB.
        const label = `Meine-${uid()}`;

        // Persönliche Ansicht mit view.write.
        const personal = await app.inject({
          method: "POST",
          url: "/api/views",
          headers: SBT("sb.a", "view.write,view.read"),
          payload: { label, layout: "board" },
        });
        expect(personal.statusCode).toBe(201);
        const viewId = personal.json().view.viewId;

        // Geteilte Ansicht OHNE view.share → 403.
        const sharedDenied = await app.inject({
          method: "POST",
          url: "/api/views",
          headers: SBT("sb.a", "view.write"),
          payload: { label: "Team", layout: "board", scope: "geteilt" },
        });
        expect(sharedDenied.statusCode).toBe(403);

        // Lesen enthält die persönliche.
        const list = await app.inject({
          method: "GET",
          url: "/api/views",
          headers: SBT("sb.a", "view.read"),
        });
        expect(list.statusCode).toBe(200);
        expect(
          list.json().views.map((v: { label: string }) => v.label),
        ).toContain(label);

        // Löschen (204) → danach nicht mehr enthalten.
        const del = await app.inject({
          method: "DELETE",
          url: `/api/views/${viewId}`,
          headers: SBT("sb.a", "view.write"),
        });
        expect(del.statusCode).toBe(204);
        const afterDelete = await app.inject({
          method: "GET",
          url: "/api/views",
          headers: SBT("sb.a", "view.read"),
        });
        expect(
          afterDelete.json().views.map((v: { label: string }) => v.label),
        ).not.toContain(label);
        await app.close();
      });
    },
  );
}

function macheTaskFixture(): AppTask {
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
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

runTaskContract(
  "InMemory",
  () => {
    // Geteilter CaseStore — sonst Split-Brain (accept schreibt in eine private Map, transition liest den CaseStore).
    const caseStore = new InMemoryCaseStore();
    return { caseStore, taskStore: new InMemoryTaskStore({ caseStore }) };
  },
  true,
);
runTaskContract(
  "Postgres (echtes Postgres)",
  () => ({
    caseStore: new PostgresCaseStore(pgUrl!),
    taskStore: new PostgresTaskStore(pgUrl!),
  }),
  Boolean(pgUrl),
);

// ── Behörden-Scope: Cross-Authority-Isolation (Reflection-Loop-Härtung) ────────────────────────────
// Ressourcen der FREMDEN Behörde b2 im SELBEN Mandanten t1 — eine b1-Session darf sie weder lesen noch mutieren.
// Ohne diese Regressionen konnten mehrere Routen (nur mandanten-, nicht behörden-scoped) fremde Akten/Aufgaben/
// Vermerke/Regeln lesen oder ändern.
describe("Domain-API Behörden-Scope — Cross-Authority → 404", () => {
  function aufbau() {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore({ caseStore });
    const automationStore = new InMemoryAutomationStore();
    const app = buildTaskApp(caseStore, taskStore, automationStore);
    return { caseStore, taskStore, automationStore, app };
  }
  // SBT setzt tenant=t1, authority=b1; die Ressourcen liegen in authority=b2.
  const b1 = (perms: string) => SBT("sb.b1", perms);

  it("GET /api/cases/:id — Fremd-Behörde → 404", async () => {
    const { caseStore, app } = aufbau();
    await caseStore.insertCase(
      macheCase({ caseId: "case-b2", authorityId: "b2" }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/cases/case-b2",
      headers: b1("case.read"),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("GET /api/cases/:id/audit — Fremd-Behörde → 404 (keine Audit-Leak)", async () => {
    const { caseStore, app } = aufbau();
    await caseStore.insertCase(
      macheCase({ caseId: "case-b2", authorityId: "b2" }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/cases/case-b2/audit",
      headers: b1("audit.read"),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("PATCH /api/tasks/:id — Fremd-Behörde → 404 (keine Fremd-Mutation)", async () => {
    const { taskStore, app } = aufbau();
    await taskStore.insertTask({
      ...macheTaskFixture(),
      taskId: "task-b2",
      authorityId: "b2",
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/api/tasks/task-b2",
      headers: b1("task.write"),
      payload: { assigneeActorId: "eindringling", dueAt: null },
    });
    expect(res.statusCode).toBe(404);
    const t = await taskStore.getTask({ tenantId: "t1", taskId: "task-b2" });
    expect(t?.assigneeActorId).toBeNull();
    await app.close();
  });

  it("GET /api/tasks/:id/comments — Fremd-Behörde → 404 (keine Vermerke-Leak)", async () => {
    const { taskStore, app } = aufbau();
    await taskStore.insertTask({
      ...macheTaskFixture(),
      taskId: "task-b2",
      authorityId: "b2",
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks/task-b2/comments",
      headers: b1("task.read,comment.read"),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("POST /api/tasks/:id/comments — Fremd-Behörde → 404 (kein Fremd-Vermerk)", async () => {
    const { taskStore, app } = aufbau();
    await taskStore.insertTask({
      ...macheTaskFixture(),
      taskId: "task-b2",
      authorityId: "b2",
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/tasks/task-b2/comments",
      headers: b1("comment.write"),
      payload: { body: "leak" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("GET /api/tasks/:id/activity — Fremd-Behörde → 404", async () => {
    const { taskStore, app } = aufbau();
    await taskStore.insertTask({
      ...macheTaskFixture(),
      taskId: "task-b2",
      authorityId: "b2",
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/tasks/task-b2/activity",
      headers: b1("task.read"),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("Automations-Routen (PATCH aktiv / simulate / runs) — Fremd-Behörde → 404", async () => {
    const { automationStore, app } = aufbau();
    await automationStore.insertRule({
      ruleId: "rule-b2",
      tenantId: "t1",
      authorityId: "b2",
      procedureId: "leistung",
      triggerEvent: "beim-eingang",
      condition: null,
      actions: [],
      requiresFourEyes: false,
      active: true,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const perms = "automation.read,automation.write";
    const patch = await app.inject({
      method: "PATCH",
      url: "/api/automations/rule-b2",
      headers: b1(perms),
      payload: { active: false },
    });
    expect(patch.statusCode).toBe(404);
    const sim = await app.inject({
      method: "POST",
      url: "/api/automations/rule-b2/simulate",
      headers: b1(perms),
      payload: {},
    });
    expect(sim.statusCode).toBe(404);
    const runs = await app.inject({
      method: "GET",
      url: "/api/automations/rule-b2/runs",
      headers: b1(perms),
    });
    expect(runs.statusCode).toBe(404);
    await app.close();
  });
});

// ── Automations-Routen + End-to-End-Roundtrip ──────────────────────────────────────────────────────
const SBA = (
  actor: string,
  perms = "automation.read,automation.write,inbox.read,inbox.triage,task.read",
) => ({
  "x-actor-id": actor,
  "x-tenant-id": "t1",
  "x-authority-id": "b1",
  "x-permissions": perms,
});

describe("Domain-API Automationen (HTTP inject) — InMemory", () => {
  it("legt eine Regel an, simuliert REIN (keine Mutation) und listet Läufe", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore({ caseStore });
    const automationStore = new InMemoryAutomationStore();
    const app = buildTaskApp(caseStore, taskStore, automationStore);

    // 403 ohne automation.write.
    const denied = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: SBA("sb.a", "automation.read"),
      payload: {
        procedureId: "leistung",
        triggerEvent: "beim-eingang",
        actions: [],
      },
    });
    expect(denied.statusCode).toBe(403);

    // Anlegen (201) — mutierend mit Bedingung → keine Konfig-Probleme.
    const created = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: SBA("sb.a"),
      payload: {
        procedureId: "leistung",
        triggerEvent: "beim-eingang",
        condition: { feld: "$procedureId", op: "==", wert: "leistung" },
        actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().probleme).toEqual([]);
    const ruleId = created.json().rule.ruleId;

    // Simulate ist REIN: liefert wuerdefeuern + effekte, ändert nichts.
    const sim = await app.inject({
      method: "POST",
      url: `/api/automations/${ruleId}/simulate`,
      headers: SBA("sb.a"),
      payload: { daten: { $procedureId: "leistung" } },
    });
    expect(sim.statusCode).toBe(200);
    expect(sim.json().wuerdefeuern).toBe(true);
    expect(sim.json().effekte).toHaveLength(1);

    // Läufe sind (noch) leer.
    const runs = await app.inject({
      method: "GET",
      url: `/api/automations/${ruleId}/runs`,
      headers: SBA("sb.a"),
    });
    expect(runs.json().runs).toEqual([]);
    await app.close();
  });

  it("runs sind mandanten-scoped: fremde ruleId → 404 (kein cross-tenant Leak)", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore({ caseStore });
    const automationStore = new InMemoryAutomationStore();
    const app = buildTaskApp(caseStore, taskStore, automationStore);

    // Regel gehört Mandant t1 (aus der Session beim Anlegen).
    const created = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: SBA("sb.a"),
      payload: {
        procedureId: "leistung",
        triggerEvent: "beim-eingang",
        condition: { feld: "$procedureId", op: "==", wert: "leistung" },
        actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    });
    const ruleId = created.json().rule.ruleId;

    // Ein Nutzer aus Mandant t2 (andere x-tenant-id) darf die Läufe NICHT sehen → 404.
    const fremd = await app.inject({
      method: "GET",
      url: `/api/automations/${ruleId}/runs`,
      headers: {
        "x-actor-id": "sb.x",
        "x-tenant-id": "t2",
        "x-authority-id": "b1",
        "x-permissions": "automation.read",
      },
    });
    expect(fremd.statusCode).toBe(404);
    await app.close();
  });

  it("simulate warnt bei mutierender Regel OHNE Bedingung (fail-closed) → wuerdefeuern=false", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore({ caseStore });
    const automationStore = new InMemoryAutomationStore();
    const app = buildTaskApp(caseStore, taskStore, automationStore);
    const created = await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: SBA("sb.a"),
      payload: {
        procedureId: "leistung",
        triggerEvent: "beim-eingang",
        actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    });
    expect(created.json().probleme).toContain("mutierend-ohne-wenn");
    const sim = await app.inject({
      method: "POST",
      url: `/api/automations/${created.json().rule.ruleId}/simulate`,
      headers: SBA("sb.a"),
      payload: { daten: {} },
    });
    expect(sim.json().wuerdefeuern).toBe(false);
    expect(sim.json().effekte).toEqual([]);
    await app.close();
  });

  it("ROUNDTRIP: Eingang annehmen reiht ein Event ein → Engine wendet den Effekt an", async () => {
    // automationStore ZUERST + geteilt in beide Stores, damit das in-TX emittierte beim-eingang-Event dort landet,
    // aus dem die Engine liest (sonst claimed:0).
    const automationStore = new InMemoryAutomationStore();
    const caseStore = new InMemoryCaseStore({ automationStore });
    const taskStore = new InMemoryTaskStore({ caseStore, automationStore });
    const app = buildTaskApp(caseStore, taskStore, automationStore);

    // Regel: beim-eingang → Priorität "hoch" (mit trivialer Bedingung).
    await app.inject({
      method: "POST",
      url: "/api/automations",
      headers: SBA("sb.a"),
      payload: {
        procedureId: "leistung",
        triggerEvent: "beim-eingang",
        condition: { feld: "$procedureId", op: "==", wert: "leistung" },
        actions: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    });

    // Eingang annehmen → erzeugt Vorgang + Aufgabe UND reiht ein beim-eingang-Event ein.
    const intake = macheIntake();
    await taskStore.insertIntake(intake);
    const accepted = await app.inject({
      method: "POST",
      url: `/api/inbox/${intake.intakeId}/accept`,
      headers: SBA("sb.a"),
    });
    expect(accepted.statusCode).toBe(201);
    const taskId = accepted.json().task.taskId;

    // Engine-Tick verarbeitet das fällige Event.
    const res = await processDueAutomationEvents({
      automationStore,
      caseStore,
      taskStore,
      policy: new DefaultDenyPolicyEngine(),
      catalog,
      now: () => "2026-06-02T00:00:00.000Z",
      newId: uid,
      procedureVersion: "1",
    });
    expect(res).toMatchObject({ claimed: 1, applied: 1 });

    // Die Aufgabe trägt jetzt die von der Automation gesetzte Priorität.
    const task = await taskStore.getTask({ tenantId: "t1", taskId });
    expect(task?.priorityKey).toBe("hoch");
    await app.close();
  });
});

// ── Aufgaben-Beziehungen ────────────────────────────────────────────────────────────────────────────
describe("Domain-API Beziehungen (HTTP inject)", () => {
  it("legt eine Beziehung an, liest + löscht sie; Selbstreferenz → 409, fremde Aufgabe → 404", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore({ caseStore });
    const a = macheTaskFixture();
    const b = macheTaskFixture();
    await taskStore.insertTask(a);
    await taskStore.insertTask(b);
    const app = buildTaskApp(caseStore, taskStore);
    const H = SBT("sb.a", "task.read,task.write");

    // Selbstreferenz → 409.
    const selbst = await app.inject({
      method: "POST",
      url: `/api/tasks/${a.taskId}/relations`,
      headers: H,
      payload: { relatedTaskId: a.taskId, relationType: "blocks" },
    });
    expect(selbst.statusCode).toBe(409);

    // Beziehung auf eine unbekannte Aufgabe → 404.
    const fremd = await app.inject({
      method: "POST",
      url: `/api/tasks/${a.taskId}/relations`,
      headers: H,
      payload: { relatedTaskId: "gibt-es-nicht", relationType: "blocks" },
    });
    expect(fremd.statusCode).toBe(404);

    // Gültige Beziehung → 201.
    const created = await app.inject({
      method: "POST",
      url: `/api/tasks/${a.taskId}/relations`,
      headers: H,
      payload: { relatedTaskId: b.taskId, relationType: "blocks" },
    });
    expect(created.statusCode).toBe(201);
    const relationId = created.json().relation.relationId;

    // Duplikat → 409.
    const dup = await app.inject({
      method: "POST",
      url: `/api/tasks/${a.taskId}/relations`,
      headers: H,
      payload: { relatedTaskId: b.taskId, relationType: "blocks" },
    });
    expect(dup.statusCode).toBe(409);

    // Lesen.
    const list = await app.inject({
      method: "GET",
      url: `/api/tasks/${a.taskId}/relations`,
      headers: H,
    });
    expect(list.json().relations).toHaveLength(1);
    expect(list.json().relations[0].relationType).toBe("blocks");

    // Löschen → 204 → leer.
    const del = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${a.taskId}/relations/${relationId}`,
      headers: H,
    });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({
      method: "GET",
      url: `/api/tasks/${a.taskId}/relations`,
      headers: H,
    });
    expect(after.json().relations).toHaveLength(0);
    await app.close();
  });

  it("Behörden-Scope: DELETE einer Beziehung einer FREMDEN Behörde → 404, Beziehung bleibt", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore({ caseStore });
    // Aufgabe + Beziehung gehören Behörde b2.
    const b2a = macheTaskFixture();
    b2a.authorityId = "b2";
    const b2b = macheTaskFixture();
    b2b.authorityId = "b2";
    await taskStore.insertTask(b2a);
    await taskStore.insertTask(b2b);
    const rel = await taskStore.insertTaskRelation({
      relationId: "rel-b2",
      tenantId: "t1",
      authorityId: "b2",
      taskId: b2a.taskId,
      relatedTaskId: b2b.taskId,
      relationType: "blocks",
      createdAt: "2026-07-08T00:00:00.000Z",
    });
    const app = buildTaskApp(caseStore, taskStore);
    // Session in b1 versucht die b2-Beziehung zu löschen.
    const del = await app.inject({
      method: "DELETE",
      url: `/api/tasks/${b2a.taskId}/relations/${rel.relationId}`,
      headers: SBT("sb.a", "task.read,task.write"),
    });
    expect(del.statusCode).toBe(404);
    // Die Beziehung besteht weiter.
    expect(
      await taskStore.listTaskRelations({ tenantId: "t1", taskId: b2a.taskId }),
    ).toHaveLength(1);
    await app.close();
  });
});

// ── KI-Assistenz-Routen (assistiv, Mensch entscheidet) ──────────────────────────────────────────────
function buildAiApp(
  taskStore: TaskStore,
  actorRoleStore: InMemoryActorRoleStore,
): FastifyInstance {
  const app = fastify({ logger: false });
  registerDomainApi(app, {
    caseStore: new InMemoryCaseStore(),
    taskStore,
    actorRoleStore,
    aiAssist: new HeuristicKiAssist(() => "2026-07-10T00:00:00.000Z"),
    catalog,
    resolveSession: headerSession,
    now: () => "2026-07-10T00:00:00.000Z",
    newId: uid,
  });
  return app;
}

const SBK = (actor: string, perms: string) => ({
  "x-actor-id": actor,
  "x-tenant-id": "t1",
  "x-authority-id": "b1",
  "x-permissions": perms,
});

describe("Domain-API KI-Assistenz (HTTP inject)", () => {
  it("assist liefert einen transparenten Vorschlag (marking + reviewRequired); 403 ohne ai.assist", async () => {
    const taskStore = new InMemoryTaskStore({});
    const task = macheTaskFixture();
    task.dueAt = "2026-07-12T00:00:00.000Z"; // 2 Tage → hoch
    await taskStore.insertTask(task);
    const app = buildAiApp(taskStore, new InMemoryActorRoleStore());

    const denied = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/ai/assist`,
      headers: SBK("sb.a", "task.read"),
      payload: {},
    });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/ai/assist`,
      headers: SBK("sb.a", "task.read,ai.assist"),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const v = res.json().vorschlag;
    expect(v.marking).toBe("ki-vorschlag");
    expect(v.reviewRequired).toBe(true);
    expect(v.vorschlag.prioritaet).toBe("hoch");
    await app.close();
  });

  it("Behörden-Scope: KI-Routen verweigern eine Aufgabe einer FREMDEN Behörde (404)", async () => {
    const taskStore = new InMemoryTaskStore({});
    const task = macheTaskFixture();
    task.authorityId = "b2"; // gehört Behörde b2
    await taskStore.insertTask(task);
    const app = buildAiApp(taskStore, new InMemoryActorRoleStore());
    // Session in b1 → darf die b2-Aufgabe nicht sehen.
    const assist = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/ai/assist`,
      headers: SBK("sb.a", "task.read,ai.assist"),
      payload: {},
    });
    expect(assist.statusCode).toBe(404);
    const apply = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/ai/apply`,
      headers: SBK("sb.a", "task.write,ai.assist"),
      payload: { prioritaet: "hoch" },
    });
    expect(apply.statusCode).toBe(404);
    await app.close();
  });

  it("apply weist NUR einem zuständigen Akteur zu (sonst 422) und protokolliert die KI-Herkunft", async () => {
    const taskStore = new InMemoryTaskStore({});
    const task = macheTaskFixture();
    await taskStore.insertTask(task);
    const actorRoleStore = new InMemoryActorRoleStore();
    await actorRoleStore.insertActorRole({
      tenantId: "t1",
      actorId: "sb.zustaendig",
      roleKey: "caseworker",
      authorityId: "b1",
      jurisdictionId: "de",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: null,
    });
    const app = buildAiApp(taskStore, actorRoleStore);

    // Zuweisung an einen NICHT zuständigen Akteur → 422.
    const fremd = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/ai/apply`,
      headers: SBK("sb.a", "task.write,ai.assist"),
      payload: { zuweisenAn: "sb.unbekannt" },
    });
    expect(fremd.statusCode).toBe(422);

    // Zuweisung an den zuständigen Akteur → 200 + Aufgabe zugewiesen.
    const ok = await app.inject({
      method: "POST",
      url: `/api/tasks/${task.taskId}/ai/apply`,
      headers: SBK("sb.a", "task.write,ai.assist"),
      payload: { zuweisenAn: "sb.zustaendig", prioritaet: "hoch" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().task.assigneeActorId).toBe("sb.zustaendig");

    // Die KI-Herkunft ist protokolliert.
    const activity = await taskStore.listTaskActivity({
      tenantId: "t1",
      taskId: task.taskId,
    });
    const ki = activity.find((a) => a.activityType === "task.ki-uebernommen");
    expect(ki?.payload).toMatchObject({ marking: "ki-vorschlag" });
    await app.close();
  });
});
