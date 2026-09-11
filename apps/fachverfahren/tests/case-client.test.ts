// case-client.test.ts — die Schreibpfade des Fall/Dossier-HTTP-Clients (createCase/transitionCase/
// createTask/patchTask). Kernzusicherung: jede Methode sendet die richtige HTTP-Methode/URL/Body und
// parst die Antwort-DTO; ein Nicht-2xx-Status wirft einen `CaseRequestError` mit Statuscode.
import { afterEach, describe, expect, it, vi } from "vitest";

import { CaseRequestError, createHttpCasePort } from "../src/case-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
  credentials: RequestCredentials | undefined;
}

/** fetch-Shim: fängt die Request-Argumente ab und liefert eine feste JSON-Antwort. */
function stubFetchJson(
  payload: unknown,
  status = 200,
): { calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  vi.stubGlobal("fetch", (input: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(init.headers ?? {})) {
      headers[key] = String(value);
    }
    calls.push({
      url: input,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers,
      credentials: init.credentials,
    });
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );
  });
  return { calls };
}

describe("case-client Schreibpfade", () => {
  it("createCase → POST /api/cases mit Body, parst CaseDto", async () => {
    const dto = {
      caseId: "case.1",
      procedureId: "integration",
      procedureVersion: "1.0.0",
      state: "eroeffnet",
      version: 1,
      subjectIds: ["subj.1"],
      openedAt: "2026-07-15T00:00:00.000Z",
      closedAt: null,
    };
    const { calls } = stubFetchJson(dto, 201);
    const result = await createHttpCasePort().createCase({
      procedureId: "integration",
      procedureVersion: "1.0.0",
      state: "eroeffnet",
      subjectIds: ["subj.1"],
    });
    expect(result).toEqual(dto);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("/api/cases");
    expect(calls[0]?.credentials).toBe("include");
    expect(calls[0]?.headers["content-type"]).toContain("application/json");
    expect(calls[0]?.body).toEqual({
      procedureId: "integration",
      procedureVersion: "1.0.0",
      state: "eroeffnet",
      subjectIds: ["subj.1"],
    });
  });

  it("transitionCase → POST /api/cases/:id/transitions (id encodiert)", async () => {
    const dto = {
      caseId: "case a/b",
      procedureId: "integration",
      procedureVersion: "1.0.0",
      state: "geprueft",
      version: 2,
      subjectIds: [],
      openedAt: "2026-07-15T00:00:00.000Z",
      closedAt: null,
    };
    const { calls } = stubFetchJson(dto, 200);
    const result = await createHttpCasePort().transitionCase("case a/b", {
      action: "pruefen",
      expectedVersion: 1,
      detail: "Vermerk",
    });
    expect(result).toEqual(dto);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("/api/cases/case%20a%2Fb/transitions");
    expect(calls[0]?.body).toEqual({
      action: "pruefen",
      expectedVersion: 1,
      detail: "Vermerk",
    });
  });

  it("createTask → POST /api/cases/:id/tasks, parst TaskDto", async () => {
    const dto = {
      taskId: "task.1",
      caseId: "case.1",
      title: "Ziel A",
      state: "open",
      assignedTo: null,
      dueAt: null,
      taskKind: "ziel",
      parentTaskId: null,
      data: {},
      sortRank: "",
      version: 1,
    };
    const { calls } = stubFetchJson(dto, 201);
    const result = await createHttpCasePort().createTask("case.1", {
      title: "Ziel A",
      taskKind: "ziel",
    });
    expect(result).toEqual(dto);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("/api/cases/case.1/tasks");
    expect(calls[0]?.body).toEqual({ title: "Ziel A", taskKind: "ziel" });
  });

  it("patchTask → PATCH /api/tasks/:id, parst TaskDto", async () => {
    const dto = {
      taskId: "task.1",
      caseId: "case.1",
      title: "Ziel A",
      state: "completed",
      assignedTo: "actor.1",
      dueAt: null,
      taskKind: "ziel",
      parentTaskId: null,
      data: { erledigt: true },
      sortRank: "",
      version: 2,
    };
    const { calls } = stubFetchJson(dto, 200);
    const result = await createHttpCasePort().patchTask("task.1", {
      state: "completed",
      assignedTo: "actor.1",
      expectedVersion: 1,
    });
    expect(result).toEqual(dto);
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe("/api/tasks/task.1");
    expect(calls[0]?.body).toEqual({
      state: "completed",
      assignedTo: "actor.1",
      expectedVersion: 1,
    });
  });

  it("listAllowedActions → GET /api/cases/:id/allowed-actions, parst {state,version,actions}", async () => {
    const payload = {
      state: "aufgenommen",
      version: 1,
      actions: [
        {
          action: "aktivieren",
          to: "aktiv",
          requiredPermission: "case.decision.prepare",
          requiresFourEyes: false,
        },
      ],
    };
    const { calls } = stubFetchJson(payload, 200);
    const result = await createHttpCasePort().listAllowedActions("case.1");
    expect(result).toEqual(payload);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("/api/cases/case.1/allowed-actions");
    expect(calls[0]?.credentials).toBe("include");
  });

  it("listProcedures → GET /api/procedures, parst die Kurzform", async () => {
    const payload = {
      procedures: [
        {
          procedureId: "musterverfahren",
          version: "1.0.0",
          allowedStates: ["eingegangen", "in-bearbeitung"],
        },
      ],
    };
    const { calls } = stubFetchJson(payload, 200);
    const result = await createHttpCasePort().listProcedures();
    expect(result).toEqual(payload.procedures);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe("/api/procedures");
    expect(calls[0]?.credentials).toBe("include");
  });

  it("Nicht-2xx-Status (409 Konflikt) → CaseRequestError mit Statuscode", async () => {
    stubFetchJson({ error: "case version conflict" }, 409);
    const rejection = expect(
      createHttpCasePort().transitionCase("case.1", {
        action: "pruefen",
        expectedVersion: 1,
      }),
    ).rejects;
    await rejection.toBeInstanceOf(CaseRequestError);
    await rejection.toMatchObject({ status: 409 });
  });
});

/**
 * DAS URTEIL UEBER DIE AUDIT-KETTE — es reiste auf der Leitung und starb am Client-TYP.
 *
 * ⛔ GEMESSEN 2026-09-07: `GET /api/cases/:id/audit` sendet `{ events, chain: { ok, brokenAt?, reason? } }`
 * (die Route rechnet `verifyAuditChain(full)`). Der Client typisierte die Antwort als `{ events }` und gab
 * `body.events` zurueck — das Urteil war am Ziel nicht mehr vorhanden. Folge: bei GEBROCHENER Kette sah die
 * Aufsicht exakt dieselbe unauffaellige Timeline wie bei intakter. Die teure Verifikation lief, ihr Ergebnis
 * verpuffte.
 *
 * ⭐ Der Defekt war eine DEKLARATION, keine Zeile: ein untererklaerter Typ macht ein geliefertes Feld
 * unerreichbar — am Bildschirm nicht zu unterscheiden von «der Server hat es nie geschickt».
 */
describe("Audit-Kette — das Urteil des Servers erreicht den Client", () => {
  it("SCHARF: ein gebrochenes Ketten-Urteil kommt VOLLSTAENDIG an (ok, brokenAt, reason)", async () => {
    stubFetchJson({
      events: [],
      chain: { ok: false, brokenAt: "evt-17", reason: "prevHash stimmt nicht" },
    });
    const port = createHttpCasePort();
    const r = await port.listAudit("fall-1");
    expect(r.chain?.ok).toBe(false);
    expect(r.chain?.brokenAt).toBe("evt-17");
    expect(r.chain?.reason).toBe("prevHash stimmt nicht");
  });

  it("die Ereignisse kommen unveraendert mit (der Zusatz verdraengt nichts)", async () => {
    stubFetchJson({ events: [{ id: "a" }, { id: "b" }], chain: { ok: true } });
    const r = await createHttpCasePort().listAudit("fall-1");
    expect(r.events).toHaveLength(2);
    expect(r.chain?.ok).toBe(true);
  });

  it("GEGENPROBE: eine Antwort OHNE `chain` wird NICHT zu «in Ordnung» gemacht", async () => {
    // ⛔ DIE GEFAEHRLICHE RICHTUNG. Ein `?? { ok: true }` waere bequem und falsch: «nicht geprueft» als
    // «bestanden» zu lesen ist genau die Klasse, gegen die dieser ganze Schnitt gebaut ist — und eine
    // aeltere Gegenstelle sendet das Feld nicht.
    stubFetchJson({ events: [{ id: "a" }] });
    const r = await createHttpCasePort().listAudit("fall-1");
    expect(r.chain).toBeUndefined();
  });
});
