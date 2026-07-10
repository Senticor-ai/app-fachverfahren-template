// tests/simulation — beweist, dass die Architektur GENERISCH und VOLLSTÄNDIG hält, indem sie 4 maximal diverse
// Verfahren-Archetypen durch den GESAMTEN Stack treibt: reiner Interpreter → verfahrensübergreifender Workspace +
// Automationen → StatusMachine-Invarianten → server-autoritativer Backend-Pfad (accept → transition → Audit),
// parametrisiert gegen das IN-MEMORY-Paar UND (wenn konfiguriert) echtes Postgres. Der In-Memory-Lauf ist NICHT
// optional — nur er deckt ein „Split-Brain" auf (accept schreibt einen Fall, den transition lesen muss).
import { describe, it, expect, beforeAll } from "vitest";
import {
  createWorkspaceStore,
  effektiveBerechnung,
  effektiveNachweise,
  validiereStatusMachine,
  boardSpalten,
} from "@senticor/fachverfahren-kit";
import {
  DefaultDenyPolicyEngine,
  executeCaseTransition,
  type CasePersistence,
  type ProcedureCatalog,
} from "@senticor/public-sector-sdk";
import {
  InMemoryCaseStore,
  InMemoryTaskStore,
  PostgresCaseStore,
  PostgresTaskStore,
  type AppCase,
  type AppAuditEvent,
  type AppTask,
  type CaseStore,
  type TaskStore,
} from "@senticor/app-store-postgres";
import { catalogFromStatusMachines } from "../../apps/fachverfahren/server/domain-api.js";
import {
  ARCHETYPEN,
  archetypWorkspace,
  archetypGebuehr,
} from "./archetypes.js";

const uid = () => globalThis.crypto.randomUUID();
const NOW = () => "2026-06-10T00:00:00.000Z";

// ── Stage 1 — reiner Interpreter (Determinismus, Berechnung, Nachweise) ───────────────────────────
describe("Simulation Stage 1 — reiner Interpreter je Archetyp", () => {
  for (const arch of ARCHETYPEN) {
    it(`[${arch.id}] Berechnung + Nachweise sind deterministisch`, () => {
      const config = arch.config();
      const seed = config.seed!({ vorgangsnummer: () => "FV-SIM-0001" })[0]!;
      const b1 = effektiveBerechnung(config, seed.antragsdaten);
      const b2 = effektiveBerechnung(config, seed.antragsdaten);
      expect(b1).toEqual(b2); // rein/deterministisch
      if (arch.erwarteterBetrag !== undefined)
        expect(b1?.betrag).toBe(arch.erwarteterBetrag);
      // Nachweise sind ableitbar (Codelisten belege oder nachweise-Hatch) — kein Crash.
      expect(Array.isArray(effektiveNachweise(config, seed.antragsdaten))).toBe(
        true,
      );
    });
  }
});

// ── Stage 2 — StatusMachine-Vollständigkeit (Invariante) ──────────────────────────────────────────
describe("Simulation Stage 2 — StatusMachine-Vollständigkeit je Archetyp", () => {
  for (const arch of ARCHETYPEN) {
    it(`[${arch.id}] StatusMachine ist strukturell wohlgeformt`, () => {
      expect(validiereStatusMachine(arch.config().statusMachine)).toEqual([]);
    });
  }
});

// ── Stage 3 — verfahrensübergreifender Workspace + Automation ─────────────────────────────────────
describe("Simulation Stage 3 — Workspace-Aggregation + Automationen", () => {
  it("aggregiert alle 4 Verfahren kollisionsfrei in EINER Liste", () => {
    const store = createWorkspaceStore(archetypWorkspace(), { now: NOW });
    const tasks = store.listTasks();
    expect(tasks).toHaveLength(4);
    // Global eindeutige Aufgaben-Ids (verfahren::vorgang), 4 verschiedene Verfahren.
    expect(new Set(tasks.map((t) => t.id)).size).toBe(4);
    expect(new Set(tasks.map((t) => t.procedureId))).toEqual(
      new Set(["gebuehr", "erlaubnis", "anzeige", "leistung"]),
    );
  });

  it("das Board leitet Spalten aus der StatusMachine des primären Verfahrens ab", () => {
    const store = createWorkspaceStore(archetypWorkspace(), { now: NOW });
    const spalten = boardSpalten(store.configFor("gebuehr")!);
    expect(spalten.map((s) => s.key)).toEqual([
      "eingegangen",
      "pruefung",
      "festgesetzt",
      "abgelehnt",
    ]);
  });

  it("beim-eingang-Automation feuert bei Antragseingang (Codelisten-Ableitung → Priorität + Label)", () => {
    const store = createWorkspaceStore(
      {
        ...archetypWorkspace(),
        verfahren: [{ procedureId: "gebuehr", config: archetypGebuehr() }],
      },
      { now: NOW },
    );
    // Kategorie "b" leitet sonderklasse=true ab → Automation setzt Priorität hoch + Label.
    const v = store.portFor("gebuehr")!.einreichen({ kategorie: "b" });
    const t = store.getTask(v.id)!;
    expect(t.prioritaet).toBe("hoch");
    expect(t.labels).toContain("sonder");
  });
});

// ── Stage 4 — server-autoritativer Backend-Pfad (IN-MEMORY + Postgres) ────────────────────────────
const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];

function macheStores(kind: "memory" | "postgres"): {
  caseStore: CaseStore;
  taskStore: TaskStore;
} {
  if (kind === "postgres") {
    return {
      caseStore: new PostgresCaseStore(pgUrl!),
      taskStore: new PostgresTaskStore(pgUrl!),
    };
  }
  const caseStore = new InMemoryCaseStore();
  return { caseStore, taskStore: new InMemoryTaskStore({ caseStore }) };
}

function sitzung(actorId: string, perms: string[]) {
  return {
    actorId,
    tenantId: "sim-tenant",
    authorityId: "sim-authority",
    jurisdictionId: "de",
    permissions: perms,
  };
}

/** Legt (wie die reale Domain-API) einen Fall + Aufgabe + Wurzel-Audit über `acceptIntake` an. */
async function annehmen(
  stores: { caseStore: CaseStore; taskStore: TaskStore },
  procedureId: string,
  initialState: string,
): Promise<string> {
  const intakeId = `intake-${uid()}`;
  await stores.taskStore.insertIntake({
    intakeId,
    tenantId: "sim-tenant",
    authorityId: "sim-authority",
    jurisdictionId: "de",
    procedureId,
    source: "antrag",
    triageStatus: "pending",
    subject: `Sim ${procedureId}`,
    rawData: {},
    taskId: null,
    caseId: null,
    receivedAt: NOW(),
  });
  const caseId = `case-${uid()}`;
  const newCase: AppCase = {
    caseId,
    tenantId: "sim-tenant",
    authorityId: "sim-authority",
    jurisdictionId: "de",
    procedureId,
    procedureVersion: "1",
    state: initialState,
    version: 1,
    subjectIds: [],
    openedAt: NOW(),
    closedAt: null,
  };
  const newTask: AppTask = {
    taskId: `task-${uid()}`,
    tenantId: "sim-tenant",
    authorityId: "sim-authority",
    jurisdictionId: "de",
    procedureId,
    caseId,
    title: `Sim ${procedureId}`,
    priorityKey: null,
    assigneeActorId: null,
    labels: [],
    dueAt: null,
    sortRank: "V",
    parentTaskId: null,
    boardColumn: null,
    version: 1,
    createdAt: NOW(),
    updatedAt: NOW(),
  };
  const rootAudit: AppAuditEvent = {
    auditEventId: `audit-${uid()}`,
    caseId,
    tenantId: "sim-tenant",
    authorityId: "sim-authority",
    jurisdictionId: "de",
    actorId: "sb.a",
    eventType: "case.eingegangen",
    purpose: "intake-accepted",
    legalBasisId: "inbox.triage",
    requestId: `req-${uid()}`,
    payload: { initialState },
    occurredAt: NOW(),
  };
  await stores.taskStore.acceptIntake({
    tenantId: "sim-tenant",
    intakeId,
    case: newCase,
    task: newTask,
    rootAudit,
  });
  return caseId;
}

const ALLE_RECHTE = [
  "case.read",
  "case.transition",
  "case.decide",
  "audit.read",
];

for (const kind of ["memory", "postgres"] as const) {
  describe.skipIf(kind === "postgres" && !pgUrl)(
    `Simulation Stage 4 — Backend accept→transition→Audit (${kind})`,
    () => {
      let deps: {
        persistence: CasePersistence;
        policy: DefaultDenyPolicyEngine;
        catalog: ProcedureCatalog;
      };
      let stores: { caseStore: CaseStore; taskStore: TaskStore };

      beforeAll(() => {
        stores = macheStores(kind);
        deps = {
          persistence: stores.caseStore,
          policy: new DefaultDenyPolicyEngine(),
          // EIN Katalog über ALLE Archetypen (dieselbe Ableitung wie die reale Domain-API).
          catalog: catalogFromStatusMachines(
            ARCHETYPEN.map((a) => ({
              procedureId: a.id,
              procedureVersion: "1",
              statusMachine: a.config().statusMachine,
            })),
          ),
        };
      });

      it("[gebuehr] Split-Brain-Regression: accept → transition findet den Fall (nicht 404)", async () => {
        const caseId = await annehmen(stores, "gebuehr", "eingegangen");
        const res = await executeCaseTransition(
          { ...deps, now: NOW, newAuditId: uid },
          {
            session: sitzung("sb.a", ALLE_RECHTE),
            caseId,
            action: "pruefung",
            expectedVersion: 1,
            requestId: uid(),
          },
        );
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.case.state).toBe("pruefung");
        // Audit-Kette lückenlos ab der Wurzel.
        const audit = await stores.caseStore.listAuditEvents({
          tenantId: "sim-tenant",
          caseId,
        });
        expect(audit.map((e) => e.eventType)).toEqual([
          "case.eingegangen",
          "case.pruefung",
        ]);
      });

      it("[erlaubnis] Vier-Augen: Vorbereiter darf nicht selbst erteilen; ein anderer schon", async () => {
        const caseId = await annehmen(stores, "erlaubnis", "eingegangen");
        const d = { ...deps, now: NOW, newAuditId: uid };
        // sb.a legt vor
        await executeCaseTransition(d, {
          session: sitzung("sb.a", ALLE_RECHTE),
          caseId,
          action: "vorgelegt",
          expectedVersion: 1,
          requestId: uid(),
        });
        // sb.a versucht zu erteilen (vierAugen) → 403
        const selbst = await executeCaseTransition(d, {
          session: sitzung("sb.a", ALLE_RECHTE),
          caseId,
          action: "erteilt",
          expectedVersion: 2,
          requestId: uid(),
        });
        expect(selbst.ok).toBe(false);
        if (!selbst.ok) expect(selbst.status).toBe(403);
        // sb.b (andere Person) → 200
        const andere = await executeCaseTransition(d, {
          session: sitzung("sb.b", ALLE_RECHTE),
          caseId,
          action: "erteilt",
          expectedVersion: 2,
          requestId: uid(),
        });
        expect(andere.ok).toBe(true);
        if (andere.ok) expect(andere.case.state).toBe("erteilt");
      });

      it("[erlaubnis] Begründungspflicht: versagen ohne detail → 400", async () => {
        const caseId = await annehmen(stores, "erlaubnis", "eingegangen");
        const d = { ...deps, now: NOW, newAuditId: uid };
        await executeCaseTransition(d, {
          session: sitzung("sb.a", ALLE_RECHTE),
          caseId,
          action: "vorgelegt",
          expectedVersion: 1,
          requestId: uid(),
        });
        const res = await executeCaseTransition(d, {
          session: sitzung("sb.b", ALLE_RECHTE),
          caseId,
          action: "versagt",
          expectedVersion: 2,
          requestId: uid(),
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.status).toBe(400);
      });

      it("[anzeige] 2-State-Verfahren läuft zum Endzustand", async () => {
        const caseId = await annehmen(stores, "anzeige", "eingegangen");
        const res = await executeCaseTransition(
          { ...deps, now: NOW, newAuditId: uid },
          {
            session: sitzung("sb.a", ALLE_RECHTE),
            caseId,
            action: "bestaetigt",
            expectedVersion: 1,
            requestId: uid(),
          },
        );
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.case.state).toBe("bestaetigt");
      });

      it("[leistung] verzweigte Entscheidung + Optimistic-Locking (veraltete Version → 409)", async () => {
        const caseId = await annehmen(stores, "leistung", "eingegangen");
        const d = { ...deps, now: NOW, newAuditId: uid };
        await executeCaseTransition(d, {
          session: sitzung("sb.a", ALLE_RECHTE),
          caseId,
          action: "geprueft",
          expectedVersion: 1,
          requestId: uid(),
        });
        // veraltete Version → 409
        const konflikt = await executeCaseTransition(d, {
          session: sitzung("sb.a", ALLE_RECHTE),
          caseId,
          action: "bewilligt",
          expectedVersion: 1,
          requestId: uid(),
        });
        expect(konflikt.ok).toBe(false);
        if (!konflikt.ok) expect(konflikt.status).toBe(409);
        // korrekte Version → 200
        const ok = await executeCaseTransition(d, {
          session: sitzung("sb.a", ALLE_RECHTE),
          caseId,
          action: "bewilligt",
          expectedVersion: 2,
          requestId: uid(),
        });
        expect(ok.ok).toBe(true);
      });

      it("RBAC: fehlende Berechtigung → 403", async () => {
        const caseId = await annehmen(stores, "gebuehr", "eingegangen");
        const res = await executeCaseTransition(
          { ...deps, now: NOW, newAuditId: uid },
          {
            session: sitzung("sb.a", ["case.read"]),
            caseId,
            action: "pruefung",
            expectedVersion: 1,
            requestId: uid(),
          },
        );
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.status).toBe(403);
      });
    },
  );
}
