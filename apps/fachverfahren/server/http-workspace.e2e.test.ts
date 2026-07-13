// e2e — der Kit-`HttpWorkspacePort` gegen die ECHTE Fastify-Domain-API (kein Mock der Routen). Ein Fetch-Shim
// übersetzt `fetch()` → `app.inject()`, sodass der Client-Port über den echten `registerDomainApi`-Handler + die
// echten In-Memory-Stores (dieselbe Logik wie Postgres) läuft: RBAC-Session, Optimistic-Locking, append-only Audit.
// Beweist die async→sync-Brücke ende-zu-ende: Lesen (Aufgaben/Fälle/Inbox), optimistische Metadaten-Mutationen,
// server-autoritative Übergänge, Triage/Annahme, Vermerke, Reaktivität.
import { describe, it, expect } from "vitest";
import fastify from "fastify";
import {
  type AppCase,
  type AppIntakeItem,
  type AppTask,
  type WikiStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
  InMemoryWikiStore,
} from "@senticor/app-store-postgres";
import {
  createHttpWorkspacePort,
  createWorkspacePortFromEnv,
  type LeistungConfig,
  type WorkspaceConfig,
} from "@senticor/fachverfahren-kit";
import {
  catalogFromStatusMachines,
  headerSession,
  registerDomainApi,
} from "./domain-api.js";
import { HeuristicKiAssist } from "./ai-assist.js";

const STATUS_MACHINE = {
  states: [
    { key: "eingegangen" },
    { key: "vorgelegt" },
    { key: "festgesetzt", terminal: true },
  ],
  transitions: [
    { from: "eingegangen", to: "vorgelegt", rollen: ["sachbearbeitung"] },
    {
      from: "vorgelegt",
      to: "festgesetzt",
      rollen: ["sachbearbeitung"],
      vierAugen: true,
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

// Die CLIENT-seitige Config (treibt das Rendern; die DATEN kommen vom Server). Minimal, aber typ-valide.
const leistung: LeistungConfig = {
  id: "leistung",
  label: "Musterleistung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [{ norm: "§ 1", titel: "Demo" }],
  antrag: { steps: [] },
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "vorgelegt", label: "Vorgelegt", tone: "info" },
      { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "vorgelegt",
        label: "Vorlegen",
        rollen: ["sachbearbeitung"],
      },
      {
        from: "vorgelegt",
        to: "festgesetzt",
        label: "Festsetzen",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
      },
    ],
  },
  register: { suchfelder: [] },
  detailSektionen: [],
};

const workspaceConfig: WorkspaceConfig = {
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  verfahren: [{ procedureId: "leistung", config: leistung }],
  prioritaeten: [
    { key: "hoch", label: "Hoch", tone: "warn", ordinal: 0 },
    { key: "normal", label: "Normal", tone: "info", ordinal: 1 },
  ],
  labels: [{ key: "eilt", label: "Eilt", tone: "warn" }],
  // Statisches Config-Wissen — der Seed, den das /api/wiki-Overlay (#20) ersetzt (bzw. bei 404 beibehält).
  wissen: [
    { id: "config-seed", titel: "Nur aus Config", markdown: "statisch" },
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
    openedAt: "2026-07-01T00:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

function macheTask(caseId: string, over: Partial<AppTask> = {}): AppTask {
  return {
    taskId: `task-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "leistung",
    caseId,
    title: "Muster-Vorgang",
    priorityKey: null,
    assigneeActorId: null,
    labels: [],
    dueAt: null,
    sortRank: "V",
    parentTaskId: null,
    boardColumn: null,
    version: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
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
    rawData: { name: "Muster" },
    taskId: null,
    caseId: null,
    receivedAt: "2026-07-02T00:00:00.000Z",
    ...over,
  };
}

const PERMS =
  "task.read,task.write,case.read,case.transition,case.decide,inbox.read,inbox.triage,comment.read,comment.write,audit.read,view.read,view.write,wiki.read,wiki.write,ai.assist";

const SB = (actor: string) => ({
  "x-actor-id": actor,
  "x-tenant-id": "t1",
  "x-authority-id": "b1",
  "x-jurisdiction-id": "de",
  "x-permissions": PERMS,
});

interface Aufbau {
  caseStore: InMemoryCaseStore;
  taskStore: InMemoryTaskStore;
  app: ReturnType<typeof fastify>;
  fetchShim: typeof fetch;
}

function baueServer(opts: { wikiStore?: WikiStore } = {}): Aufbau {
  const caseStore = new InMemoryCaseStore();
  const taskStore = new InMemoryTaskStore();
  const app = fastify({ logger: false });
  registerDomainApi(app, {
    caseStore,
    taskStore,
    catalog,
    resolveSession: headerSession,
    procedureInitialState: () => "eingegangen",
    now: () => "2026-07-05T00:00:00.000Z",
    newAuditId: uid,
    newId: uid,
    // Wie der reale Server (index.ts): mit KI-Assist-Port, damit /api/tasks/:id/ai/{assist,apply} registriert sind.
    aiAssist: new HeuristicKiAssist(),
    ...(opts.wikiStore ? { wikiStore: opts.wikiStore } : {}),
  });
  // Fetch-Shim: fetch(url, init) → app.inject(...) → Response-ähnliches Objekt (nur .ok/.status/.text/.json genutzt).
  const fetchShim = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const res = await app.inject({
      method: (init?.method ?? "GET") as "GET",
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      ...(init?.body ? { payload: init.body as string } : {}),
    });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
      json: async () => res.json(),
    } as Response;
  }) as typeof fetch;
  return { caseStore, taskStore, app, fetchShim };
}

async function warteBis(pred: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("warteBis: Timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

// Wartet auf eine ASYNCHRONE Bedingung (z. B. den SERVER-Store direkt pollen) — nötig, weil eine optimistische
// Client-Mutation synchron sichtbar wird, die Server-Bestätigung aber erst nach dem Round-Trip eintrifft.
async function warteBisAsync(
  pred: () => Promise<boolean>,
  ms = 2000,
): Promise<void> {
  const start = Date.now();
  while (!(await pred())) {
    if (Date.now() - start > ms) throw new Error("warteBisAsync: Timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function machePort(aufbau: Aufbau, extra: Record<string, unknown> = {}) {
  return createHttpWorkspacePort(workspaceConfig, {
    baseUrl: "",
    fetch: aufbau.fetchShim,
    headers: SB("sb.eins"),
    ...extra,
  });
}

describe("HttpWorkspacePort e2e — Lesen (Aufgaben/Fälle/Inbox über die echten Routen)", () => {
  it("lädt Aufgaben + leitet den Status aus dem Fall-Cache ab (portFor().get().status)", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    await aufbau.taskStore.insertTask(macheTask(c.caseId, { title: "Fall A" }));
    const port = machePort(aufbau);

    await warteBis(() => port.listTasks().length === 1);
    const [a] = port.listTasks();
    expect(a?.titel).toBe("Fall A");
    expect(a?.vorgangId).toBe(c.caseId);
    // Status kommt NICHT aus der Task (die trägt ihn nicht), sondern aus dem Fall — die Read-Through-Projektion.
    expect(port.portFor("leistung")?.get(c.caseId)?.status).toBe("eingegangen");
    await aufbau.app.close();
  });

  it("listInbox() liefert die pending-Eingänge", async () => {
    const aufbau = baueServer();
    await aufbau.taskStore.insertIntake(macheIntake({ subject: "Antrag X" }));
    const port = machePort(aufbau);
    await warteBis(() => port.listInbox().length === 1);
    expect(port.listInbox()[0]?.betreff).toBe("Antrag X");
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Metadaten-Mutationen (optimistisch + server-bestätigt)", () => {
  it("assign: sofort optimistisch, danach vom Server bestätigt", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    const t = macheTask(c.caseId);
    await aufbau.taskStore.insertTask(t);
    const port = machePort(aufbau);
    await warteBis(() => port.listTasks().length === 1);

    port.assign(t.taskId, "sb.zwei");
    // Optimistisch: sofort sichtbar, noch bevor der PATCH zurück ist.
    expect(port.getTask(t.taskId)?.zugewiesenAn).toBe("sb.zwei");
    // Server-bestätigt: die Version steigt (patchTask erhöht sie).
    await warteBis(() => (port.getTask(t.taskId)?.version ?? 1) > 1);
    const serverTask = await aufbau.taskStore.getTask({
      tenantId: "t1",
      taskId: t.taskId,
    });
    expect(serverTask?.assigneeActorId).toBe("sb.zwei");
    await aufbau.app.close();
  });

  it("setPrioritaet + addLabel schreiben durch zum Server", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    const t = macheTask(c.caseId);
    await aufbau.taskStore.insertTask(t);
    const port = machePort(aufbau);
    await warteBis(() => port.listTasks().length === 1);

    port.setPrioritaet(t.taskId, "hoch");
    port.addLabel(t.taskId, "eilt");
    // Beide PATCHes server-bestätigt = zwei Versions-Sprünge (1 → 3). Danach ist die Server-Wahrheit durchgeschrieben.
    await warteBis(() => (port.getTask(t.taskId)?.version ?? 1) >= 3);
    const s = await aufbau.taskStore.getTask({
      tenantId: "t1",
      taskId: t.taskId,
    });
    expect(s?.priorityKey).toBe("hoch");
    expect(s?.labels).toContain("eilt");
    await aufbau.app.close();
  });

  it("uebernehmeKiVorschlag schreibt Metadaten durch UND der Server protokolliert die KI-Herkunft", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    const t = macheTask(c.caseId);
    await aufbau.taskStore.insertTask(t);
    const fehler: string[] = [];
    const port = machePort(aufbau, {
      onError: (e: unknown, k: string) =>
        fehler.push(`${k}: ${(e as Error)?.message ?? String(e)}`),
    });
    await warteBis(() => port.listTasks().length === 1);

    // Client ruft NICHT setPrioritaet, sondern POST /ai/apply → Versions-Sprung (1 → 2) bei Server-Bestätigung.
    port.uebernehmeKiVorschlag(t.taskId, { prioritaet: "hoch" });
    await warteBis(() => (port.getTask(t.taskId)?.version ?? 1) >= 2);
    expect(fehler).toEqual([]);

    const s = await aufbau.taskStore.getTask({
      tenantId: "t1",
      taskId: t.taskId,
    });
    expect(s?.priorityKey).toBe("hoch");
    // Der server-autoritative Nachweis: die KI-Herkunft ist als Aktivität protokolliert (nicht nur UI-Badge).
    const feed = await aufbau.taskStore.listTaskActivity({
      tenantId: "t1",
      taskId: t.taskId,
    });
    const marke = feed.find((a) => a.activityType === "task.ki-uebernommen");
    expect(marke).toBeDefined();
    expect(marke!.payload).toMatchObject({
      marking: "ki-vorschlag",
      prioritaet: "hoch",
    });
    await aufbau.app.close();
  });

  it("assign auf unbekannte Aufgabe meldet über onError (kein Wurf)", async () => {
    const aufbau = baueServer();
    const fehler: string[] = [];
    const port = machePort(aufbau, {
      onError: (_e: unknown, k: string) => fehler.push(k),
    });
    port.assign("task-existiert-nicht", "sb.zwei");
    expect(fehler).toContain("assign");
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — server-autoritativer Übergang", () => {
  it("taskUebergang läuft durch die echte Transition + der Fall-Status folgt", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    const t = macheTask(c.caseId);
    await aufbau.taskStore.insertTask(t);
    const port = machePort(aufbau);
    await warteBis(
      () => port.portFor("leistung")?.get(c.caseId)?.status === "eingegangen",
    );

    port.taskUebergang(t.taskId, "vorgelegt", "sachbearbeitung");
    await warteBis(
      () => port.portFor("leistung")?.get(c.caseId)?.status === "vorgelegt",
    );
    const serverCase = await aufbau.caseStore.getCase({
      tenantId: "t1",
      caseId: c.caseId,
    });
    expect(serverCase?.state).toBe("vorgelegt");
    expect(serverCase?.version).toBe(2);
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Inbox/Triage + Annahme", () => {
  it("triageInbox setzt den Status (snoozed)", async () => {
    const aufbau = baueServer();
    const intake = macheIntake();
    await aufbau.taskStore.insertIntake(intake);
    const port = machePort(aufbau);
    await warteBis(() => port.listInbox("pending").length === 1);

    port.triageInbox(intake.intakeId, "snoozed");
    await warteBis(() => port.listInbox("snoozed").length === 1);
    expect(port.listInbox("pending").length).toBe(0);
    await aufbau.app.close();
  });

  it("acceptInbox erzeugt Vorgang + Aufgabe (Id über onAccepted)", async () => {
    const aufbau = baueServer();
    const intake = macheIntake();
    await aufbau.taskStore.insertIntake(intake);
    let neueId: string | undefined;
    const port = machePort(aufbau, {
      onAccepted: (id: string) => {
        neueId = id;
      },
    });
    await warteBis(() => port.listInbox("pending").length === 1);

    port.acceptInbox(intake.intakeId);
    await warteBis(() => neueId !== undefined);
    // Die neue Aufgabe ist im Cache; der Eingang gilt als angenommen.
    expect(port.getTask(neueId as string)).toBeDefined();
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Vermerke + Reaktivität", () => {
  it("addKommentar → listKommentare (lazy read-through)", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    const t = macheTask(c.caseId);
    await aufbau.taskStore.insertTask(t);
    const port = machePort(aufbau);
    await warteBis(() => port.listTasks().length === 1);

    port.addKommentar(t.taskId, "Interner Vermerk");
    await warteBis(() =>
      port.listKommentare(t.taskId).some((k) => k.text === "Interner Vermerk"),
    );
    await aufbau.app.close();
  });

  it("subscribe feuert bei jeder Änderung (Snapshot steigt monoton)", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    const t = macheTask(c.caseId);
    await aufbau.taskStore.insertTask(t);
    const port = machePort(aufbau);
    await warteBis(() => port.listTasks().length === 1);

    let feuerte = 0;
    const ab = port.subscribe(() => {
      feuerte += 1;
    });
    const vorher = port.snapshot();
    port.assign(t.taskId, "sb.zwei");
    expect(port.snapshot()).toBeGreaterThan(vorher);
    expect(feuerte).toBeGreaterThan(0);
    ab();
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Filter-Parität zum In-Memory-Store (Reflection-Loop-Fixes)", () => {
  it("labels-Filter ist AND (alle geforderten Labels), nicht OR", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    await aufbau.taskStore.insertTask(
      macheTask(c.caseId, { title: "A", labels: ["eilt"] }),
    );
    const c2 = macheCase();
    await aufbau.caseStore.insertCase(c2);
    await aufbau.taskStore.insertTask(
      macheTask(c2.caseId, { title: "B", labels: ["eilt", "extern"] }),
    );
    const port = machePort(aufbau);
    await warteBis(() => port.listTasks().length === 2);
    // Nur B trägt ALLE geforderten Labels — wie der In-Memory-Store (.every), nicht .some.
    const treffer = port.listTasks({ labels: ["eilt", "extern"] });
    expect(treffer.map((t) => t.titel)).toEqual(["B"]);
    await aufbau.app.close();
  });

  it("suche matcht auch über den Vorgangs-Status (nicht nur den Titel)", async () => {
    const aufbau = baueServer();
    const c = macheCase({ state: "vorgelegt", version: 2 });
    await aufbau.caseStore.insertCase(c);
    await aufbau.taskStore.insertTask(
      macheTask(c.caseId, { title: "Ohne Statuswort im Titel" }),
    );
    const port = machePort(aufbau);
    await warteBis(
      () => port.portFor("leistung")?.get(c.caseId)?.status === "vorgelegt",
    );
    // Der Begriff steht nur im Status, nicht im Titel — die Heuristik (Titel+Vorgangsnummer+Status) muss greifen.
    expect(port.listTasks({ suche: "vorgelegt" }).length).toBe(1);
    await aufbau.app.close();
  });

  it("leeres Filter-Array = unbeschränkt (schließt nicht alles aus)", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    await aufbau.taskStore.insertTask(macheTask(c.caseId));
    const port = machePort(aufbau);
    await warteBis(() => port.listTasks().length === 1);
    expect(port.listTasks({ procedureId: [], status: [] }).length).toBe(1);
    await aufbau.app.close();
  });

  it("acceptInbox ist idempotent (zweiter Aufruf → undefined, kein zweiter Vorgang)", async () => {
    const aufbau = baueServer();
    const intake = macheIntake();
    await aufbau.taskStore.insertIntake(intake);
    let anzahlAngenommen = 0;
    const port = machePort(aufbau, {
      onAccepted: () => {
        anzahlAngenommen += 1;
      },
    });
    await warteBis(() => port.listInbox("pending").length === 1);

    port.acceptInbox(intake.intakeId);
    await warteBis(
      () => anzahlAngenommen === 1 && port.listTasks().length === 1,
    );
    // Zweiter Aufruf: bereits angenommen → sofort undefined, kein weiterer POST → keine zweite Aufgabe, onAccepted
    // feuert nicht erneut.
    expect(port.acceptInbox(intake.intakeId)).toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
    expect(anzahlAngenommen).toBe(1);
    expect(port.listTasks().length).toBe(1);
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Gespeicherte Ansichten (echte /api/views-Routen)", () => {
  it("saveView → POST /api/views → listSavedViews; deleteView entfernt", async () => {
    const aufbau = baueServer();
    const port = machePort(aufbau);
    await port.refresh(); // initialen Load (inkl. ladeViews) deterministisch abwarten
    expect(port.listSavedViews()).toEqual([]);
    port.saveView({
      label: "Dringend",
      layout: "liste",
      definition: { prioritaet: ["hoch"] },
    });
    await warteBis(() => port.listSavedViews().length === 1);
    const v = port.listSavedViews()[0];
    expect(v?.label).toBe("Dringend");
    expect(v?.definition).toEqual({ prioritaet: ["hoch"] });
    port.deleteView(v!.id);
    await warteBis(() => port.listSavedViews().length === 0);
    await aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Antragsdaten über HTTP (portFor lazy single-case-load)", () => {
  it("GET /api/cases/:id reichert antragsdaten aus dem Wurzel-Audit an → portFor().get() zeigt sie", async () => {
    const aufbau = baueServer();
    const c = macheCase();
    await aufbau.caseStore.insertCase(c);
    // Wurzel-Audit mit den Antragsdaten (wie die accept-Route es anlegt).
    await aufbau.caseStore.appendAuditEvent({
      auditEventId: "audit-1",
      caseId: c.caseId,
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      actorId: "buerger",
      eventType: "case.eingegangen",
      purpose: "intake-accepted",
      legalBasisId: "inbox.triage",
      requestId: "req",
      payload: { rohdaten: { antragsteller: { name: "Muster" } } },
      occurredAt: "2026-07-01T00:00:00.000Z",
    });
    const port = machePort(aufbau);
    await port.refresh();
    // Vor dem Detail-Zugriff: reine Status-Projektion (leere antragsdaten).
    expect(port.portFor("leistung")?.get(c.caseId)?.antragsdaten).toEqual({});
    // Der Zugriff triggert den Lazy-Load; nach der Ankunft sind die Antragsdaten angereichert.
    await warteBis(() => {
      const a = port.portFor("leistung")?.get(c.caseId)?.antragsdaten as
        | Record<string, unknown>
        | undefined;
      return a !== undefined && "antragsteller" in a;
    });
    const antrag = port.portFor("leistung")?.get(c.caseId)?.antragsdaten as {
      antragsteller?: { name?: string };
    };
    expect(antrag.antragsteller?.name).toBe("Muster");
    await aufbau.app.close();
  });
});

describe("createWorkspacePortFromEnv — die austauschbare Naht", () => {
  it("ohne apiBaseUrl → In-Memory-Store (kein refresh)", () => {
    const port = createWorkspacePortFromEnv(workspaceConfig, {});
    expect("refresh" in port).toBe(false);
  });

  it("mit apiBaseUrl → HTTP-Port (hat refresh)", () => {
    const aufbau = baueServer();
    const port = createWorkspacePortFromEnv(workspaceConfig, {
      apiBaseUrl: "http://example.test",
      fetch: aufbau.fetchShim,
      headers: SB("sb.eins"),
    });
    expect("refresh" in port).toBe(true);
    void aufbau.app.close();
  });
});

describe("HttpWorkspacePort e2e — Wissensbasis/Wiki-Overlay (#20, echte /api/wiki-Route)", () => {
  it("ersetzt das Config-Wissen nach refresh durch die server-persistierten Artikel", async () => {
    const wikiStore = new InMemoryWikiStore();
    await wikiStore.upsertArticle({
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      articleId: "handbuch",
      title: "Server-Handbuch",
      markdown: "vom Server, versioniert",
      category: "Handbuch",
      editorActorId: "sb.a",
      expectedVersion: 0,
    });
    const { app, fetchShim } = baueServer({ wikiStore });
    try {
      const port = createHttpWorkspacePort(workspaceConfig, {
        baseUrl: "",
        fetch: fetchShim,
        headers: SB("sb.a"),
      });
      // SEED sofort (kein Leerflackern): synchron das Config-Wissen, bevor /api/wiki geladen hat.
      expect(port.listWissen().map((a) => a.id)).toEqual(["config-seed"]);
      // Nach dem Laden: die server-persistierten Artikel ersetzen den Seed.
      await port.refresh();
      const artikel = port.listWissen();
      expect(artikel.map((a) => a.id)).toEqual(["handbuch"]); // kein "config-seed" mehr
      expect(artikel[0]?.titel).toBe("Server-Handbuch");
      expect(artikel[0]?.kategorie).toBe("Handbuch");
      expect(artikel[0]?.standIso).toBeTruthy(); // updatedAt → standIso
    } finally {
      await app.close();
    }
  });

  it("ohne wikiStore (GET /api/wiki → 404) bleibt das Config-Wissen erhalten", async () => {
    const { app, fetchShim } = baueServer(); // kein wikiStore
    try {
      const port = createHttpWorkspacePort(workspaceConfig, {
        baseUrl: "",
        fetch: fetchShim,
        headers: SB("sb.a"),
      });
      // Ein voller refresh (inkl. des 404 auf /api/wiki) darf den Config-Seed NICHT leeren.
      await port.refresh();
      expect(port.listWissen().map((a) => a.id)).toEqual(["config-seed"]);
    } finally {
      await app.close();
    }
  });
});

describe("HttpWorkspacePort e2e — Wiki-Authoring (#20 Phase 3a, echte POST/PATCH)", () => {
  it("speichert einen NEUEN Artikel (POST) — optimistisch sofort, nach Server-Bestätigung Version 1", async () => {
    const wikiStore = new InMemoryWikiStore();
    const { app, fetchShim } = baueServer({ wikiStore });
    try {
      const port = createHttpWorkspacePort(workspaceConfig, {
        baseUrl: "",
        fetch: fetchShim,
        headers: SB("sb.a"),
      });
      await port.refresh(); // Server ist leer → Config-Seed wird durch [] ersetzt
      port.speichereWissen({
        id: "handbuch",
        titel: "Handbuch",
        markdown: "erste Fassung",
      });
      // Optimistisch SOFORT sichtbar (kein await).
      expect(port.listWissen().some((a) => a.id === "handbuch")).toBe(true);
      // Server-Bestätigung ABWARTEN (den Store direkt pollen — der optimistische Wert wäre schon vor dem POST da).
      await warteBisAsync(
        async () =>
          (
            await wikiStore.getArticle({
              tenantId: "t1",
              articleId: "handbuch",
            })
          )?.version === 1,
      );
      const persistiert = await wikiStore.getArticle({
        tenantId: "t1",
        articleId: "handbuch",
      });
      expect(persistiert?.markdown).toBe("erste Fassung");
      expect(persistiert?.authorityId).toBe("b1"); // Scope aus der Session
      // Der Client hat nun den bestätigten Stand (standIso vom Server → nur nach Reconcile gesetzt).
      await warteBis(
        () =>
          port.listWissen().find((a) => a.id === "handbuch")?.standIso !==
          undefined,
      );
      expect(port.listWissen().find((a) => a.id === "handbuch")?.version).toBe(
        1,
      );
    } finally {
      await app.close();
    }
  });

  it("versioniert einen bestehenden Artikel per PATCH (expectedVersion) hoch und führt die Historie", async () => {
    const wikiStore = new InMemoryWikiStore();
    await wikiStore.upsertArticle({
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      articleId: "doc",
      title: "V1",
      markdown: "eins",
      editorActorId: "sb.a",
      expectedVersion: 0,
    });
    const { app, fetchShim } = baueServer({ wikiStore });
    try {
      const port = createHttpWorkspacePort(workspaceConfig, {
        baseUrl: "",
        fetch: fetchShim,
        headers: SB("sb.a"),
      });
      await warteBis(
        () => port.listWissen().find((a) => a.id === "doc")?.version === 1,
      );
      port.speichereWissen({
        id: "doc",
        titel: "V2",
        markdown: "zwei",
        expectedVersion: 1,
      });
      // Server-Bestätigung (v2) ABWARTEN — den Store direkt pollen (optimistisch wäre v2 schon vor dem PATCH da).
      await warteBisAsync(
        async () =>
          (await wikiStore.getArticle({ tenantId: "t1", articleId: "doc" }))
            ?.version === 2,
      );
      expect(
        (
          await wikiStore.listRevisions({ tenantId: "t1", articleId: "doc" })
        ).map((r) => r.version),
      ).toEqual([2, 1]);
      await warteBis(
        () => port.listWissen().find((a) => a.id === "doc")?.titel === "V2",
      );
    } finally {
      await app.close();
    }
  });

  it("Versionskonflikt: veraltete expectedVersion → optimistische Änderung wird rückgängig gemacht (Server-Stand siegt)", async () => {
    const wikiStore = new InMemoryWikiStore();
    await wikiStore.upsertArticle({
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      articleId: "doc",
      title: "V1",
      markdown: "eins",
      editorActorId: "sb.a",
      expectedVersion: 0,
    });
    // Ein anderer Bearbeiter hat den Artikel bereits auf v2 gehoben (Server-Stand).
    await wikiStore.upsertArticle({
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      articleId: "doc",
      title: "server-v2",
      markdown: "server zwei",
      editorActorId: "sb.b",
      expectedVersion: 1,
    });
    const kontexte: string[] = [];
    const { app, fetchShim } = baueServer({ wikiStore });
    try {
      const port = createHttpWorkspacePort(workspaceConfig, {
        baseUrl: "",
        fetch: fetchShim,
        headers: SB("sb.a"),
        onError: (_e, kontext) => kontexte.push(kontext),
      });
      await warteBis(
        () => port.listWissen().find((a) => a.id === "doc")?.version === 2,
      );
      // Der Client speichert mit VERALTETER expectedVersion 1 → Server 409 → Revert + Reload.
      port.speichereWissen({
        id: "doc",
        titel: "client-stale",
        markdown: "client",
        expectedVersion: 1,
      });
      await warteBis(() => kontexte.includes("speichereWissen"));
      // Nach dem Reload zeigt der Client den SERVER-Stand (server-v2, v2) — nicht die verworfene Client-Fassung.
      await warteBis(
        () =>
          port.listWissen().find((a) => a.id === "doc")?.titel === "server-v2",
      );
      expect(port.listWissen().find((a) => a.id === "doc")?.version).toBe(2);
    } finally {
      await app.close();
    }
  });

  it("lädt die Revisionshistorie LAZY (GET /api/wiki/:id/revisions) und invalidiert sie nach dem Speichern (#20 Phase 4)", async () => {
    const wikiStore = new InMemoryWikiStore();
    const { app, fetchShim } = baueServer({ wikiStore });
    try {
      const port = createHttpWorkspacePort(workspaceConfig, {
        baseUrl: "",
        fetch: fetchShim,
        headers: SB("sb.a"),
      });
      await port.refresh();
      // Artikel anlegen + Server-Bestätigung abwarten.
      port.speichereWissen({ id: "doc", titel: "Doc", markdown: "eins" });
      await warteBisAsync(
        async () =>
          (await wikiStore.getArticle({ tenantId: "t1", articleId: "doc" }))
            ?.version === 1,
      );
      // Erster Zugriff ist LAZY: synchron noch leer, stößt aber den GET an.
      expect(port.listWissenRevisionen("doc")).toEqual([]);
      await warteBis(() => port.listWissenRevisionen("doc").length === 1);
      expect(port.listWissenRevisionen("doc").map((r) => r.version)).toEqual([
        1,
      ]);
      // Neue Version speichern → die Historie ist invalidiert → wird beim nächsten Zugriff neu geladen.
      port.speichereWissen({
        id: "doc",
        titel: "Doc",
        markdown: "zwei",
        expectedVersion: 1,
      });
      await warteBisAsync(
        async () =>
          (await wikiStore.getArticle({ tenantId: "t1", articleId: "doc" }))
            ?.version === 2,
      );
      await warteBis(() => port.listWissenRevisionen("doc").length === 2);
      const revs = port.listWissenRevisionen("doc");
      expect(revs.map((r) => r.version)).toEqual([2, 1]); // neueste zuerst
      expect(revs[1]?.markdown).toBe("eins"); // alte Revision = unveränderter Snapshot
      expect(revs[0]?.editorActorId).toBe("sb.a"); // Autor aus der Session
    } finally {
      await app.close();
    }
  });
});
