import { describe, expect, it } from "vitest";
import type { ResolvedSession } from "@senticor/app-runtime-fastify";
import {
  InMemoryCaseStore,
  InMemoryTaskStore,
  type CaseStore,
  type TaskStore,
} from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

// Verfahren als DATEN — der Initialzustand `aufgenommen` genügt fürs Anlegen der Akte (ADR-0002).
const procedure: ProcedureVersion = {
  procedureId: "integrationsberatung",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["VwV-IGM-2023"],
  allowedStates: ["aufgenommen", "aktiv", "abgeschlossen"],
  allowedTransitions: [],
};

function buildApp(
  caseStore: CaseStore,
  taskStore: TaskStore,
  session: ResolvedSession = caseworkerSession(),
) {
  return buildBffApp({
    session,
    caseStore,
    taskStore,
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

async function createCase(app: Awaited<ReturnType<typeof buildBffApp>>["app"]) {
  const res = await app.inject({
    method: "POST",
    url: "/api/cases",
    payload: {
      procedureId: "integrationsberatung",
      procedureVersion: "1",
      state: "aufgenommen",
      subjectIds: ["subject.1"],
    },
  });
  return (res.json() as { caseId: string }).caseId;
}

describe("BFF Task-Routen", () => {
  it("Ziel + Schritte anlegen, Schritt patchen und Fortschritt 2/3 = 67% lesen", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore();
    const { app } = await buildApp(caseStore, taskStore);
    const caseId = await createCase(app);

    // Ein Ziel.
    const ziel = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/tasks`,
      payload: { title: "Beispiel-Ziel", taskKind: "ziel", sortRank: "a" },
    });
    expect(ziel.statusCode).toBe(201);
    const zielId = (ziel.json() as { taskId: string; state: string }).taskId;
    expect(ziel.json().state).toBe("open");

    // Drei Schritte (checkliste-item) unter dem Ziel.
    const schritte: string[] = [];
    for (const i of [1, 2, 3]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/cases/${caseId}/tasks`,
        payload: {
          title: `Schritt ${i}`,
          taskKind: "checkliste-item",
          parentTaskId: zielId,
          sortRank: `a${i}`,
        },
      });
      expect(res.statusCode).toBe(201);
      schritte.push((res.json() as { taskId: string }).taskId);
    }

    // Zwei der drei Schritte auf erledigt patchen (dataPatch: flacher Merge in data).
    for (const taskId of [schritte[0], schritte[1]]) {
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/tasks/${taskId}`,
        payload: { state: "completed", dataPatch: { erledigt: true } },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json().state).toBe("completed");
      expect(patched.json().data.erledigt).toBe(true);
      expect(patched.json().version).toBe(2);
    }

    // Aufgaben der Akte lesen: 1 Ziel + 3 Schritte = 4.
    const list = await app.inject({
      method: "GET",
      url: `/api/cases/${caseId}/tasks`,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().tasks).toHaveLength(4);

    // Filter auf checkliste-item.
    const nurSchritte = await app.inject({
      method: "GET",
      url: `/api/cases/${caseId}/tasks?taskKind=checkliste-item`,
    });
    expect(nurSchritte.json().tasks).toHaveLength(3);

    // Fortschritt: 2 von 3 erledigt → 67 %.
    const progress = await app.inject({
      method: "GET",
      url: `/api/cases/${caseId}/progress`,
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().ziele).toEqual([
      {
        taskId: zielId,
        title: "Beispiel-Ziel",
        total: 3,
        done: 2,
        percent: 67,
      },
    ]);
    await app.close();
  });

  it("409 bei veralteter expectedVersion (Optimistic-Locking)", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore();
    const { app } = await buildApp(caseStore, taskStore);
    const caseId = await createCase(app);
    const created = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/tasks`,
      payload: { title: "Beispiel-Aufgabe" },
    });
    const taskId = (created.json() as { taskId: string }).taskId;
    const res = await app.inject({
      method: "PATCH",
      url: `/api/tasks/${taskId}`,
      payload: { title: "geändert", expectedVersion: 99 },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("404 für eine Akte einer FREMDEN Behörde (kein Existenz-Leak)", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore();
    // Akte + Aufgabe in authority-1 anlegen.
    const { app: app1 } = await buildApp(caseStore, taskStore);
    const caseId = await createCase(app1);
    await app1.inject({
      method: "POST",
      url: `/api/cases/${caseId}/tasks`,
      payload: { title: "Beispiel-Ziel", taskKind: "ziel" },
    });
    await app1.close();

    // Dieselben Stores, aber eine Sachbearbeitung einer anderen Behörde (gleicher Mandant).
    const { app: app2 } = await buildApp(
      caseStore,
      taskStore,
      caseworkerSession({ authorityId: "authority-2" }),
    );
    for (const url of [
      `/api/cases/${caseId}/tasks`,
      `/api/cases/${caseId}/progress`,
    ]) {
      const res = await app2.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(404);
    }
    await app2.close();
  });

  it("403 ohne case-Recht (citizen darf keine Aufgabe anlegen)", async () => {
    const caseStore = new InMemoryCaseStore();
    const taskStore = new InMemoryTaskStore();
    const { app } = await buildApp(caseStore, taskStore, citizenSession());
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/case.egal/tasks`,
      payload: { title: "Beispiel-Aufgabe" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
