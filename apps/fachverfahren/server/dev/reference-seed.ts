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
  AppStore,
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
import { hashPassword } from "@senticor/provider-local-auth";
import { dossierDemo, dossierProcedure } from "../procedure.config.js";
import {
  seedPasswort,
  testzugangAnlageErlaubt,
  TESTKONTEN,
  TESTKONTO_ADMIN,
  type TestkontoDeklaration,
} from "./testzugang.js";

// DIE KONTEN SELBST STEHEN NICHT HIER: sie sind in testzugang.ts deklariert — DIESELBE Wahrheit, die
// der Ausweis auf /hilfe anzeigt. Anlage und Anzeige können damit nicht auseinanderlaufen.
// Die Sperre (kein Produktivbetrieb · nur ephemerer Store · Passwort nur aus der Umgebung) liegt
// ebenfalls dort — ein committetes Login-Secret wäre eine öffentlich bekannte Zugangsdaten-Naht.
const DEV_CITIZEN = TESTKONTEN.find((k) => k.kind === "citizen");

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
  /** Optional: die App-Daten-Schicht (Postfach) — gesetzt seedet ein Demo eine Postfach-Nachricht. */
  appStore?: AppStore;
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
  // Die weiteren Testkonten AUS DER DEKLARATION (testzugang.ts): Bürger:in für den Antrag-Flow
  // (die Sachbearbeitung hat bewusst kein case.own.submit) und eine zweite Sachbearbeitung für
  // das Vier-Augen-Prinzip. Kein Konto-Literal mehr hier.
  for (const konto of TESTKONTEN) await seedZusatzKonto(deps, log, konto);
  // Das Demo-Dossier ist unabhängig vom Login und wird IMMER einem festen synthetischen Eröffnungs-Akteur
  // zugeschrieben (≠ Login-Konto) — so bleibt der Vier-Augen-Abschluss vom Demo-Login ausübbar.
  await seedDemoDossier(deps, SEED_AUDIT_ACTOR, log);
  // Eine synthetische Postfach-Nachricht für die Demo-Bürger:in — damit die gemountete Postfach-Seite
  // im Preview Inhalt zeigt (statt nur des Leerzustands). Nur, wenn appStore verdrahtet ist.
  if (deps.appStore && DEV_CITIZEN)
    await seedDemoPostfach(deps.appStore, DEV_CITIZEN.actorId, log);
}

/** Idempotent: legt der Demo-Bürger:in eine synthetische Willkommens-Nachricht ins Postfach (nur wenn leer). */
async function seedDemoPostfach(
  appStore: AppStore,
  buergerActorId: string,
  log: SeedLog,
): Promise<void> {
  try {
    const vorhanden = await appStore.listMailboxMessages({
      box: "inbox",
      audience: "citizen",
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      actorId: buergerActorId,
      scope: "owner",
    });
    if (vorhanden.length > 0) return;
    await appStore.saveMailboxMessage({
      messageId: "msg.dev-willkommen",
      box: "inbox",
      audience: "citizen",
      tenantId: DEFAULT_TENANT_ID,
      authorityId: DEFAULT_AUTHORITY_ID,
      jurisdictionId: DEFAULT_JURISDICTION_ID,
      ownerActorId: buergerActorId,
      caseId: null,
      subject: "Willkommen in Ihrem Postfach",
      bodyPreview:
        "Hier erhalten Sie Bescheide und Nachrichten der Behörde. Diese Demo-Nachricht ist synthetisch.",
      status: "unread",
      createdAt: new Date().toISOString(),
    });
    log("info", "dev.seed.postfach", { ownerActorId: buergerActorId });
  } catch (error) {
    log("error", "dev.seed.postfach.failed", { error: String(error) });
  }
}

/** Legt — nur mit APP_DEV_SEED_PASSWORD und nur wenn noch nicht vorhanden — ein anmeldbares Zusatz-Konto
 *  an (Bürger bzw. zweiter Caseworker). Idempotent (getUserByEmail); wirft NIE. Nutzt
 *  createLocalUserWithCredential direkt (nicht bootstrapWorkspace — das ist dem ersten Konto vorbehalten). */
async function seedZusatzKonto(
  deps: ReferenceSeedDeps,
  log: SeedLog,
  konto: TestkontoDeklaration,
): Promise<void> {
  const env = deps.env ?? {};
  // FAIL-CLOSED an EINER Stelle: kein Produktivbetrieb, nur ephemerer Store, Passwort nur aus der
  // Umgebung. Fehlt eine Bedingung, entsteht kein Konto — und /hilfe weist auch keins aus.
  if (!testzugangAnlageErlaubt(env)) return;
  const password = seedPasswort(env);
  if (password === undefined) return;
  try {
    const vorhanden = await deps.authStore.getUserByEmail({
      tenantId: DEFAULT_TENANT_ID,
      email: konto.email,
    });
    if (vorhanden) {
      log("info", `runtime.dev-seed.${konto.kind}.skipped`, {
        reason: "exists",
      });
      return;
    }
    const nowIso = "2026-01-01T00:00:00.000Z";
    const passwordHash = await hashPassword(password);
    await deps.authStore.createLocalUserWithCredential({
      user: {
        actorId: konto.actorId,
        tenantId: DEFAULT_TENANT_ID,
        authorityId: DEFAULT_AUTHORITY_ID,
        jurisdictionId: DEFAULT_JURISDICTION_ID,
        email: konto.email,
        displayName: konto.name,
        status: "active",
        role: konto.rolle,
        localPersonas: [...konto.personas],
        oidcPersonas: [],
        personaManagementMode: "local",
        principalVersion: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      credential: {
        actorId: konto.actorId,
        passwordHash,
        hashAlgo: "argon2id",
        passwordChangedAt: nowIso,
        failedAttempts: 0,
        lockedUntil: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    });
    log("info", `runtime.dev-seed.${konto.kind}.created`, {
      actorId: konto.actorId,
      email: konto.email,
    });
  } catch (error) {
    log("error", `runtime.dev-seed.${konto.kind}.failed`, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function seedDevCaseworker(
  deps: ReferenceSeedDeps,
  log: SeedLog,
): Promise<void> {
  const env = deps.env ?? {};
  const password = seedPasswort(env);
  if (!testzugangAnlageErlaubt(env) || password === undefined) {
    // Kein committetes Login-Secret und kein Testkonto ausserhalb des Entwicklungsstands: ohne
    // erfüllte Sperre (testzugang.ts) wird KEIN anmeldbares Konto angelegt.
    log("info", "runtime.dev-seed.user.skipped", {
      reason:
        "Testzugang gesperrt (Produktivbetrieb, kein ephemerer Store oder kein APP_DEV_SEED_PASSWORD) — kein Testkonto angelegt",
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
        {
          email: TESTKONTO_ADMIN.email,
          password,
          displayName: TESTKONTO_ADMIN.name,
        },
      );
      log("info", "runtime.dev-seed.user.created", {
        actorId: result.user.actorId,
        email: TESTKONTO_ADMIN.email,
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
      scope: "authority",
      authorityId: DEFAULT_AUTHORITY_ID,
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
      // Behörden-initiiertes Dossier — kein Bürger-Eigentümer.
      ownerActorId: null,
      // Ein DOSSIER-Fall trägt seine Fachlichkeit in Aufgaben/Zielen (app_tasks), nicht in der
      // Fall-Nutzlast — `data` bleibt leer. Gefüllt wird sie von der ANTRAGS-Art (Antragsdaten +
      // Berechnung), die den Fall als Akte nutzt.
      data: {},
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
