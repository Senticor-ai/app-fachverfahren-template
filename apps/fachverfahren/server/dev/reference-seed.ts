// reference-seed — der generische DEV-Demo-Seed-MOTOR. Verfahrens-NEUTRAL: der Inhalt (Verfahren + Demo-Dossier)
// kommt AUSSCHLIESSLICH aus der Naht ../procedure.config.js (dossierProcedure/dossierDemo); dieser Motor mappt
// ihn nur auf die Stores. So seedet eine GENERIERTE App automatisch ein Preview-Demo IHRES Verfahrens — es ist
// kein Beispiel hier eingebrannt.
//
// NUR vom Runtime-Entrypoint (startRuntime) und NUR im ephemeren In-Memory-Modus benutzt — der generische
// Template-Default (buildPublicServer ohne Args) bleibt fail-closed (leere ProcedureRegistry), sodass Unit-Tests
// unberührt bleiben. In PROD (Postgres) läuft dieser Seed NIE; dort kommen Konten und Fälle aus echten Quellen.
// Alle Demo-Daten sind SYNTHETISCH (keine echten Personen/PII).
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
import { dossierDemo, dossierProcedure } from "../procedure.config.js";

// DEV-Login (nur In-Memory): der Account wird NUR angelegt, wenn ein Passwort über die Umgebung
// (APP_DEV_SEED_PASSWORD) bereitgestellt wird — es gibt bewusst KEIN im Quelltext festgeschriebenes Passwort
// (der memory-Modus wird auch für erreichbare Previews genutzt; ein committetes Login-Secret wäre eine
// öffentlich bekannte Zugangsdaten-Naht). Ohne die Variable existiert kein Demo-Login.
const DEV_PASSWORD_ENV = "APP_DEV_SEED_PASSWORD";
const DEV_EMAIL = "sachbearbeitung@example.org";
const DEV_NAME = "Demo-Sachbearbeitung";

// Eröffnungs-Akteur des Demo-Falls: ein FESTER synthetischer Akteur, bewusst VERSCHIEDEN vom Login-Konto,
// damit der Vier-Augen-Abschluss (jüngster-Audit-Akteur ≠ auslösender Akteur) vom Demo-Login ausübbar ist.
const SEED_AUDIT_ACTOR = "actor.dev-seed-opener";

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
  env?: NodeJS.ProcessEnv;
  log?: SeedLog;
}

/** Idempotenter DEV-Seed: legt — NUR wenn APP_DEV_SEED_PASSWORD gesetzt ist und noch kein Konto existiert —
 *  einen anmeldbaren Sachbearbeitungs-Account an und seedet das Demo-Dossier AUS der procedure.config-Naht
 *  (Fall + Ziele/Schritte/Termine + Eröffnungs-Audit, Urheber ein FESTER synthetischer Akteur ≠ Login). Wirft
 *  NIE — Fehler landen im Log, der Server startet trotzdem (analog autoBootstrapAdminFromEnv). */
export async function seedReferenceDemo(
  deps: ReferenceSeedDeps,
): Promise<void> {
  const log: SeedLog = deps.log ?? (() => undefined);
  await seedDevCaseworker(deps, log);
  // Das Demo-Dossier ist unabhängig vom Login und wird IMMER einem festen synthetischen Eröffnungs-Akteur
  // zugeschrieben (≠ Login-Konto) — so bleibt der Vier-Augen-Abschluss vom Demo-Login ausübbar.
  await seedDemoDossier(deps, SEED_AUDIT_ACTOR, log);
}

async function seedDevCaseworker(
  deps: ReferenceSeedDeps,
  log: SeedLog,
): Promise<void> {
  const password = deps.env?.[DEV_PASSWORD_ENV];
  if (password === undefined || password === "") {
    // Kein committetes Login-Secret: ohne bereitgestelltes Passwort wird KEIN anmeldbares Konto angelegt.
    log("info", "runtime.dev-seed.user.skipped", {
      reason: `${DEV_PASSWORD_ENV} not set — kein Demo-Login angelegt`,
    });
    return;
  }
  try {
    await deps.authStore.withBootstrapLock(DEFAULT_TENANT_ID, async () => {
      const existing = await deps.authStore.countUsers({
        tenantId: DEFAULT_TENANT_ID,
      });
      if (existing > 0) {
        // Ein Konto existiert bereits (z. B. via AUTH_BOOTSTRAP_ADMIN_*): der explizite Env-Bootstrap gewinnt.
        log("info", "runtime.dev-seed.user.skipped", {
          reason: "already-bootstrapped",
        });
        return;
      }
      const result = await bootstrapWorkspace(
        { authStore: deps.authStore, kanbanStore: deps.kanbanStore },
        { email: DEV_EMAIL, password, displayName: DEV_NAME },
      );
      log("info", "runtime.dev-seed.user.created", {
        actorId: result.user.actorId,
        email: DEV_EMAIL,
      });
    });
  } catch (error) {
    log("error", "runtime.dev-seed.user.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
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
      caseId: dossierDemo.caseId,
    });
    if (already) {
      log("info", "runtime.dev-seed.case.skipped", { reason: "exists" });
      return;
    }

    const demoCase: AppCase = {
      caseId: dossierDemo.caseId,
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      jurisdictionId: DEFAULT_JURISDICTION_ID,
      procedureId: dossierProcedure.procedureId,
      procedureVersion: dossierProcedure.version,
      state: dossierDemo.initialState,
      version: 1,
      subjectIds: [dossierDemo.subjectId],
      openedAt: dossierDemo.openedAt,
      closedAt: null,
    };
    await deps.caseStore.insertCase(demoCase);

    // Eröffnungs-Audit — die Akte-Ansicht (toVerlauf) liest payload.summary als Titel; die Rechtsgrundlage
    // kommt aus dem Verfahren (nie erfunden).
    const audit: AppAuditEvent = {
      auditEventId: "audit.demo-0001",
      caseId: dossierDemo.caseId,
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      jurisdictionId: DEFAULT_JURISDICTION_ID,
      actorId,
      eventType: "case.opened",
      purpose: "case-management",
      legalBasisId: dossierProcedure.legalBasisIds[0] ?? "muster-satzung-1",
      requestId: "seed",
      payload: { summary: dossierDemo.openedSummary },
      occurredAt: dossierDemo.openedAt,
    };
    await deps.caseStore.appendAuditEvent(audit);

    for (const task of buildDemoTasks()) {
      await deps.taskStore.insertTask(task);
    }
    log("info", "runtime.dev-seed.case.created", {
      caseId: dossierDemo.caseId,
    });
  } catch (error) {
    log("error", "runtime.dev-seed.case.failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Bildet `dossierDemo` (Ziele+Schritte+Termine) auf die Task-Zeilen ab: Ziele (taskKind "ziel"), Schritte
 *  (taskKind "checkliste-item", data.erledigt für aggregateChildFlag), Termine (taskKind "termin"). */
function buildDemoTasks(): AppTask[] {
  const base = (
    o: Partial<AppTask> & Pick<AppTask, "taskId" | "title" | "taskKind">,
  ): AppTask => ({
    caseId: dossierDemo.caseId,
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
    createdAt: dossierDemo.openedAt,
    updatedAt: dossierDemo.openedAt,
    ...o,
  });

  const tasks: AppTask[] = [];
  dossierDemo.ziele.forEach((ziel, zi) => {
    tasks.push(
      base({
        taskId: ziel.id,
        title: ziel.titel,
        taskKind: "ziel",
        sortRank: String.fromCharCode(97 + zi),
        ...(ziel.faelligAm !== undefined ? { dueAt: ziel.faelligAm } : {}),
        data: {
          ...(ziel.kategorie !== undefined
            ? { handlungsfeld: ziel.kategorie }
            : {}),
          ...(ziel.status !== undefined ? { status: ziel.status } : {}),
        },
      }),
    );
    ziel.schritte.forEach((schritt, si) => {
      tasks.push(
        base({
          taskId: schritt.id,
          title: schritt.titel,
          taskKind: "checkliste-item",
          parentTaskId: ziel.id,
          sortRank: String.fromCharCode(97 + si),
          data: { erledigt: schritt.erledigt },
        }),
      );
    });
  });
  dossierDemo.termine.forEach((termin, ti) => {
    tasks.push(
      base({
        taskId: termin.id,
        title: termin.titel,
        taskKind: "termin",
        sortRank: String.fromCharCode(97 + ti),
        dueAt: termin.faelligAm,
      }),
    );
  });
  return tasks;
}
