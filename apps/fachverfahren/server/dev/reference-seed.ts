// reference-seed — das Referenz-Verfahren (Integrationsmanagement) + ein DEV-Demo-Seed.
//
// NUR vom Runtime-Entrypoint (startRuntime) und NUR im ephemeren In-Memory-Modus benutzt — der
// generische Template-Default (buildPublicServer ohne Args) bleibt fail-closed (leere
// ProcedureRegistry), sodass Unit-Tests unberührt bleiben. In PROD (Postgres) läuft dieser Seed NIE;
// dort kommen Konten und Fälle ausschließlich aus echten Quellen.
//
// Das Verfahren steht als CODE-LITERAL (nicht via bpmnToProcedureVersion aus der .bpmn geparst), weil
// docs/examples/.../integrationsmanagement.bpmn NICHT nach dist-server ausgeliefert wird — ein fs-Read
// zur Laufzeit wäre cwd-/Packaging-fragil. Die Werte spiegeln die stateMachine des Beispiel-Verfahrens.
// Alle Demo-Daten sind SYNTHETISCH (keine echten Personen/PII).
import { builtInPermissions } from "@senticor/public-sector-sdk";
import type { ProcedureVersion } from "@senticor/public-sector-sdk";
import type {
  AppAuditEvent,
  AppCase,
  AppTask,
  AuthStore,
  CaseStore,
  KanbanStore,
  TaskStore,
} from "@senticor/app-store-postgres";
import {
  bootstrapWorkspace,
  DEFAULT_AUTHORITY_ID,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_TENANT_ID,
} from "../auth/bootstrap.js";

/** Feinere RBAC lebt in der Governance-/BFF-Schicht; die Transitionen tragen die Schreib-Permission
 *  case.decision.prepare (wie die aus BPMN abgeleiteten Übergänge). */
const PREPARE = builtInPermissions.casePrepareDecision.permission;

/** Das Referenz-Verfahren, das die ProcedureRegistry-Naht (createInMemoryProcedureRegistry) im
 *  Runtime-Entrypoint füttert. Wiederaufnehmbarer Lebenszyklus mit Vier-Augen-Abschluss. */
export const REFERENCE_PROCEDURE: ProcedureVersion = {
  procedureId: "integrationsmanagement",
  version: "2026.1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: [
    "de-aufenthg-43",
    "de-aufenthg-44",
    "de-aufenthg-44a",
    "de-aufenthg-45a",
    "de-vwv-integrationsmanagement-2023",
    "de-flueag-17",
    "de-flueag-18",
  ],
  allowedStates: ["aufgenommen", "aktiv", "pausiert", "abgeschlossen"],
  allowedTransitions: [
    {
      from: "aufgenommen",
      to: "aktiv",
      action: "aktivieren",
      requiredPermission: PREPARE,
    },
    {
      from: "aktiv",
      to: "pausiert",
      action: "pausieren",
      requiredPermission: PREPARE,
    },
    {
      from: "pausiert",
      to: "aktiv",
      action: "fortsetzen",
      requiredPermission: PREPARE,
    },
    {
      from: "aktiv",
      to: "abgeschlossen",
      action: "abschließen",
      requiredPermission: PREPARE,
      requiresFourEyes: true,
    },
    {
      from: "abgeschlossen",
      to: "aktiv",
      action: "wiederaufnehmen",
      requiredPermission: PREPARE,
    },
  ],
};

// DEV-Login (nur In-Memory): das Passwort erfüllt die Mindestlänge von bootstrapWorkspace und erscheint
// bewusst in KEINEM Logfeld. Nur ephemer/DEV — niemals in einer erreichbaren Umgebung memory-Modus fahren.
const DEV_EMAIL = "sachbearbeitung@example.org";
const DEV_PASSWORD = "dev-demo-passwort";
const DEV_NAME = "Demo-Sachbearbeitung";

const DEMO_CASE_ID = "case.demo-igm-0001";

type SeedLog = (
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>,
) => void;

export interface ReferenceSeedDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  caseStore: CaseStore;
  taskStore: TaskStore;
  log?: SeedLog;
}

/** Idempotenter DEV-Seed: legt (falls noch KEIN Konto existiert) einen anmeldbaren Sachbearbeitungs-
 *  Account an und seedet ein synthetisches Demo-Dossier (Fall + Ziele/Schritte/Termine + Eröffnungs-
 *  Audit). Wirft NIE — Fehler landen im Log, der Server startet trotzdem (analog autoBootstrapAdminFromEnv). */
export async function seedReferenceDemo(
  deps: ReferenceSeedDeps,
): Promise<void> {
  const log: SeedLog = deps.log ?? (() => undefined);
  const actorId = await seedDevCaseworker(deps, log);
  await seedDemoDossier(deps, actorId ?? "actor.dev-seed", log);
}

async function seedDevCaseworker(
  deps: ReferenceSeedDeps,
  log: SeedLog,
): Promise<string | undefined> {
  try {
    return await deps.authStore.withBootstrapLock(
      DEFAULT_TENANT_ID,
      async () => {
        const existing = await deps.authStore.countUsers({
          tenantId: DEFAULT_TENANT_ID,
        });
        if (existing > 0) {
          // Ein Konto existiert bereits (z. B. via AUTH_BOOTSTRAP_ADMIN_*): der explizite Env-Bootstrap
          // gewinnt; wir übernehmen den ersten Actor als Audit-Urheber des Demo-Falls.
          log("info", "runtime.dev-seed.user.skipped", {
            reason: "already-bootstrapped",
          });
          const users = await deps.authStore.listUsers({
            tenantId: DEFAULT_TENANT_ID,
          });
          return users[0]?.actorId;
        }
        const result = await bootstrapWorkspace(
          { authStore: deps.authStore, kanbanStore: deps.kanbanStore },
          { email: DEV_EMAIL, password: DEV_PASSWORD, displayName: DEV_NAME },
        );
        log("info", "runtime.dev-seed.user.created", {
          actorId: result.user.actorId,
          email: DEV_EMAIL,
        });
        return result.user.actorId;
      },
    );
  } catch (error) {
    log("error", "runtime.dev-seed.user.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function seedDemoDossier(
  deps: ReferenceSeedDeps,
  actorId: string,
  log: SeedLog,
): Promise<void> {
  try {
    const already = await deps.caseStore.getCase({
      tenantId: DEFAULT_TENANT_ID,
      caseId: DEMO_CASE_ID,
    });
    if (already) {
      log("info", "runtime.dev-seed.case.skipped", { reason: "exists" });
      return;
    }

    const openedAt = "2026-06-01T08:00:00.000Z";
    const demoCase: AppCase = {
      caseId: DEMO_CASE_ID,
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      jurisdictionId: DEFAULT_JURISDICTION_ID,
      procedureId: REFERENCE_PROCEDURE.procedureId,
      procedureVersion: REFERENCE_PROCEDURE.version,
      // Zustand "aktiv" (nicht abgeschlossen), damit ein:e Prüfer:in die Übergänge — inkl. des Vier-
      // Augen-Abschlusses — an der laufenden Akte ausprobieren kann.
      state: "aktiv",
      version: 1,
      subjectIds: ["subject.1"],
      openedAt,
      closedAt: null,
    };
    await deps.caseStore.insertCase(demoCase);

    // Eröffnungs-Audit — die Akte-Ansicht (toVerlauf) liest payload.summary als Titel.
    const audit: AppAuditEvent = {
      auditEventId: "audit.demo-igm-0001",
      caseId: DEMO_CASE_ID,
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      jurisdictionId: DEFAULT_JURISDICTION_ID,
      actorId,
      eventType: "case.opened",
      purpose: "case-management",
      legalBasisId:
        REFERENCE_PROCEDURE.legalBasisIds[0] ??
        "de-vwv-integrationsmanagement-2023",
      requestId: "seed",
      payload: {
        summary: "Fall FALL-2026-0001 eröffnet (integrationsmanagement)",
      },
      occurredAt: openedAt,
    };
    await deps.caseStore.appendAuditEvent(audit);

    for (const task of buildDemoTasks()) {
      await deps.taskStore.insertTask(task);
    }
    log("info", "runtime.dev-seed.case.created", { caseId: DEMO_CASE_ID });
  } catch (error) {
    log("error", "runtime.dev-seed.case.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Ziele (taskKind "ziel") + Schritte (taskKind "checkliste-item", data.erledigt für aggregateChildFlag)
 *  + Termine (taskKind "termin"). Synthetische Integrationsberatungs-Handlungsfelder. */
function buildDemoTasks(): AppTask[] {
  const base = (
    o: Partial<AppTask> & Pick<AppTask, "taskId" | "title" | "taskKind">,
  ): AppTask => ({
    caseId: DEMO_CASE_ID,
    tenantId: DEFAULT_TENANT_ID,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    state: "open",
    assignedTo: null,
    dueAt: null,
    parentTaskId: null,
    data: {},
    sortRank: "",
    version: 1,
    createdAt: "2026-06-01T08:00:00.000Z",
    updatedAt: "2026-06-01T08:00:00.000Z",
    ...o,
  });
  return [
    base({
      taskId: "ziel.1",
      title: "Sprachkurs B1 abschließen",
      taskKind: "ziel",
      sortRank: "a",
      dueAt: "2026-09-30T00:00:00.000Z",
      data: { handlungsfeld: "sprache", status: "laufend" },
    }),
    base({
      taskId: "s.1",
      title: "Kurs anmelden",
      taskKind: "checkliste-item",
      parentTaskId: "ziel.1",
      sortRank: "a",
      data: { erledigt: true },
    }),
    base({
      taskId: "s.2",
      title: "Modul 1 besuchen",
      taskKind: "checkliste-item",
      parentTaskId: "ziel.1",
      sortRank: "b",
      data: { erledigt: true },
    }),
    base({
      taskId: "s.3",
      title: "Modul 2 besuchen",
      taskKind: "checkliste-item",
      parentTaskId: "ziel.1",
      sortRank: "c",
      data: { erledigt: false },
    }),
    base({
      taskId: "s.4",
      title: "Prüfung ablegen",
      taskKind: "checkliste-item",
      parentTaskId: "ziel.1",
      sortRank: "d",
      data: { erledigt: false },
    }),
    base({
      taskId: "ziel.2",
      title: "Ausbildungsplatz finden",
      taskKind: "ziel",
      sortRank: "b",
      data: { handlungsfeld: "arbeit", status: "neu" },
    }),
    base({
      taskId: "s.5",
      title: "Bewerbungsunterlagen erstellen",
      taskKind: "checkliste-item",
      parentTaskId: "ziel.2",
      sortRank: "a",
      data: { erledigt: false },
    }),
    base({
      taskId: "t.1",
      title: "Beratungsgespräch",
      taskKind: "termin",
      sortRank: "a",
      dueAt: "2026-07-20T10:00:00.000Z",
    }),
    base({
      taskId: "t.2",
      title: "Nachweis Sprachkurs",
      taskKind: "termin",
      sortRank: "b",
      dueAt: "2026-07-05T00:00:00.000Z",
    }),
  ];
}
