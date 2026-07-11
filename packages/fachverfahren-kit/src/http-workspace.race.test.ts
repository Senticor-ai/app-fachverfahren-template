import { describe, it, expect } from "vitest";
import { createHttpWorkspacePort } from "./http-workspace.js";
import type { LeistungConfig, WorkspaceConfig } from "./types.js";

// Deterministische Nebenläufigkeits-Tests für den HttpWorkspacePort: ein injizierter `fetch` gibt die Antworten
// über manuell auflösbare Deferreds zurück, sodass wir Antwort-REORDERING erzwingen können (die Wurzel der drei
// Cache-Kohärenz-Defekte aus Reflection-Loop 13). Ohne die Fixes würde je eine ältere/verzögerte Antwort einen
// bereits neueren Cache-Stand überschreiben.

const leistung: LeistungConfig = {
  id: "leistung",
  label: "Musterleistung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [{ norm: "§ 1", titel: "Demo" }],
  antrag: { steps: [] },
  statusMachine: {
    initial: "eingegangen",
    states: [{ key: "eingegangen", label: "Eingegangen", tone: "neu" }],
    transitions: [],
  },
  register: { suchfelder: [] },
  detailSektionen: [],
};

const config: WorkspaceConfig = {
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  verfahren: [{ procedureId: "leistung", config: leistung }],
  prioritaeten: [
    { key: "hoch", label: "Hoch", tone: "warn", ordinal: 0 },
    { key: "normal", label: "Normal", tone: "info", ordinal: 1 },
  ],
  labels: [{ key: "eilt", label: "Eilt", tone: "warn" }],
};

const taskDTO = (over: Record<string, unknown> = {}) => ({
  taskId: "t1",
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  procedureId: "leistung",
  caseId: null,
  title: "Aufgabe",
  priorityKey: null,
  assigneeActorId: null,
  labels: [] as string[],
  dueAt: null,
  sortRank: "V",
  parentTaskId: null,
  boardColumn: null,
  version: 1,
  ...over,
});

const viewDTO = (viewId: string, label: string) => ({
  viewId,
  label,
  layout: "liste",
  scope: "personal" as const,
  definition: {},
  createdAt: "2026-07-01T00:00:00.000Z",
});

const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => JSON.stringify(data),
});
const fail = (status: number) => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => "fehler",
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Mehrere Makrotask-Ticks, damit die verschachtelten await-Ketten (fetch→ok→json→Cache-Update) durchlaufen.
const flush = async (n = 4): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const pfad = (url: string): string => new URL(url).pathname;

describe("HttpWorkspacePort — Nebenläufigkeit / Cache-Kohärenz", () => {
  it("PATCH-Monotonie-Guard: eine verspätete ÄLTERE Antwort setzt einen neueren Cache-Stand NICHT zurück (#1)", async () => {
    const patches: {
      body: Record<string, unknown>;
      resolve: (r: unknown) => void;
    }[] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      const p = pfad(url);
      if (init.method === "GET" && p === "/api/tasks")
        return ok({ tasks: [taskDTO()] });
      if (init.method === "GET" && p === "/api/cases") return ok({ cases: [] });
      if (init.method === "GET" && p === "/api/inbox") return ok({ items: [] });
      if (init.method === "GET" && p === "/api/views") return ok({ views: [] });
      if (init.method === "PATCH" && p === "/api/tasks/t1") {
        const d = deferred<unknown>();
        patches.push({
          body: JSON.parse(String(init.body)),
          resolve: d.resolve,
        });
        return d.promise;
      }
      throw new Error(`unerwartet: ${init.method} ${p}`);
    }) as unknown as typeof fetch;

    const port = createHttpWorkspacePort(config, {
      baseUrl: "http://test",
      fetch: fetchMock,
    });
    await port.refresh();

    // Zwei rasche Metadaten-Mutationen: Server verarbeitet Priorität (→v2), dann Label (→v3).
    port.setPrioritaet("t1", "hoch");
    port.addLabel("t1", "eilt");
    await flush();
    expect(patches).toHaveLength(2);

    // Antwort-REORDERING: die NEUERE (v3, mit Label) trifft ZUERST ein, danach die ältere (v2, ohne Label).
    patches[1]!.resolve(
      ok({
        task: taskDTO({ priorityKey: "hoch", labels: ["eilt"], version: 3 }),
      }),
    );
    await flush();
    patches[0]!.resolve(
      ok({ task: taskDTO({ priorityKey: "hoch", labels: [], version: 2 }) }),
    );
    await flush();

    const t = port.listTasks().find((x) => x.id === "t1");
    // Ohne Guard fiele der Cache auf v2 zurück und verlöre das Label. Mit Guard bleibt v3 (mit Label) erhalten.
    expect(t?.version).toBe(3);
    expect(t?.labels).toEqual(["eilt"]);
  });

  it("deleteView-Rollback ist GEZIELT: ein fehlgeschlagenes DELETE verwirft keine nebenläufig gespeicherte Ansicht (#3)", async () => {
    let delDef: ReturnType<typeof deferred<unknown>> | undefined;
    const fetchMock = (async (url: string, init: RequestInit) => {
      const p = pfad(url);
      if (init.method === "GET" && p === "/api/tasks") return ok({ tasks: [] });
      if (init.method === "GET" && p === "/api/cases") return ok({ cases: [] });
      if (init.method === "GET" && p === "/api/inbox") return ok({ items: [] });
      if (init.method === "GET" && p === "/api/views")
        return ok({
          views: [viewDTO("A", "Ansicht A"), viewDTO("B", "Ansicht B")],
        });
      if (init.method === "POST" && p === "/api/views")
        return ok({ view: viewDTO("C", "Ansicht C") });
      if (init.method === "DELETE" && p === "/api/views/A") {
        delDef = deferred<unknown>();
        return delDef.promise;
      }
      throw new Error(`unerwartet: ${init.method} ${p}`);
    }) as unknown as typeof fetch;

    const port = createHttpWorkspacePort(config, {
      baseUrl: "http://test",
      fetch: fetchMock,
    });
    await port.refresh();
    expect(
      port
        .listSavedViews()
        .map((v) => v.id)
        .sort(),
    ).toEqual(["A", "B"]);

    port.deleteView("A"); // optimistisch entfernt → [B], DELETE hängt
    port.saveView({ label: "Ansicht C", layout: "liste" }); // POST erfolgreich → [B, C]
    await flush();
    expect(
      port
        .listSavedViews()
        .map((v) => v.id)
        .sort(),
    ).toEqual(["B", "C"]);

    // DELETE scheitert jetzt (Netz/403) → Rollback darf NUR A zurücklegen, NICHT C mit verwerfen.
    delDef!.resolve(fail(500));
    await flush();

    const ids = port
      .listSavedViews()
      .map((v) => v.id)
      .sort();
    expect(ids).toContain("C"); // die nebenläufig gespeicherte Ansicht überlebt
    expect(ids).toContain("A"); // die fälschlich entfernte kehrt zurück
    expect(ids).toEqual(["A", "B", "C"]);
  });

  it("Detail-Generations-Guard: eine verspätete ÄLTERE Detail-Ladung überschreibt den frisch nachgeladenen Vermerk NICHT (#2)", async () => {
    const commentGets: { resolve: (r: unknown) => void }[] = [];
    const fetchMock = (async (url: string, init: RequestInit) => {
      const p = pfad(url);
      if (init.method === "GET" && p === "/api/tasks")
        return ok({ tasks: [taskDTO()] });
      if (init.method === "GET" && p === "/api/cases") return ok({ cases: [] });
      if (init.method === "GET" && p === "/api/inbox") return ok({ items: [] });
      if (init.method === "GET" && p === "/api/views") return ok({ views: [] });
      if (init.method === "GET" && p === "/api/tasks/t1/comments") {
        const d = deferred<unknown>();
        commentGets.push({ resolve: d.resolve });
        return d.promise;
      }
      if (init.method === "GET" && p === "/api/tasks/t1/activity")
        return ok({ activity: [] });
      if (init.method === "GET" && p === "/api/tasks/t1/relations")
        return ok({ relations: [] });
      if (init.method === "POST" && p === "/api/tasks/t1/comments")
        return ok({});
      throw new Error(`unerwartet: ${init.method} ${p}`);
    }) as unknown as typeof fetch;

    const port = createHttpWorkspacePort(config, {
      baseUrl: "http://test",
      fetch: fetchMock,
    });
    await port.refresh();

    port.listKommentare("t1"); // löst Detail-Ladung #1 aus (comments-GET #1 hängt)
    await flush();
    port.addKommentar("t1", "neuer Vermerk"); // POST ok → neuLadenDetail → Ladung #2 (comments-GET #2)
    await flush();
    expect(commentGets.length).toBe(2);

    const kommentarDTO = (body: string) => ({
      commentId: `c-${body}`,
      taskId: "t1",
      authorActorId: "sb.eins",
      body,
      createdAt: "2026-07-01T09:00:00.000Z",
    });

    // Reordering: die NEUERE Ladung #2 (mit dem Vermerk) trifft zuerst ein, danach die ältere #1 (leer).
    commentGets[1]!.resolve(ok({ comments: [kommentarDTO("neuer Vermerk")] }));
    await flush();
    commentGets[0]!.resolve(ok({ comments: [] }));
    await flush();

    const texte = port.listKommentare("t1").map((k) => k.text);
    // Ohne Generations-Guard überschriebe die leere Alt-Antwort den Vermerk. Mit Guard bleibt er erhalten.
    expect(texte).toContain("neuer Vermerk");
  });
});
