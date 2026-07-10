// server/domain-api — die fachliche Domain-API (Fastify), server-autoritativ.
//
// Dünner HTTP-Adapter über der geprüften Domain-Logik: `authPlugin` (Session → 401), `policy.decide`-Gate (in
// `executeCaseTransition`, 403), Optimistic-Locking (409), append-only Audit. Der Mandanten-Scope kommt
// AUSSCHLIESSLICH aus der Server-Session, NIE aus Query/Body. Der CaseStore ist austauschbar (In-Memory/Postgres);
// dieselbe Route läuft im Test (inject) und in PROD (echte DB).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  ActorRoleStore,
  AppAutomationRule,
  AppCase,
  AppTask,
  AutomationStore,
  CaseStore,
  TaskStore,
} from "@senticor/app-store-postgres";
import {
  bedingungUnterstuetzt,
  evalBedingungNodeSafe,
} from "./automation-eval.js";
import type { KiAssistPort } from "./ai-assist.js";
import {
  DefaultDenyPolicyEngine,
  executeCaseTransition,
  headerSessionResolver,
  type CaseworkerSession,
  type Clock,
  type IdGenerator,
  type PolicyEngine,
  type ProcedureCatalog,
} from "@senticor/public-sector-sdk";

// EINE Wahrheit der Session-Auflösung: der framework-neutrale SDK-Resolver (DEV: x-*-Header; PROD: OIDC-Seam).
const sdkHeaderResolver = headerSessionResolver();

const NO_STORE = "no-store";

export interface DomainApiDeps {
  caseStore: CaseStore;
  catalog: ProcedureCatalog;
  policy?: PolicyEngine;
  /** Löst die authentifizierte Sitzung aus dem Request auf (Session-Cookie/OIDC in PROD; Header im DEV). */
  resolveSession: (request: FastifyRequest) => CaseworkerSession | undefined;
  /** OPTIONAL — die Management-Datenschicht (Aufgaben/Board/Inbox). Fehlt sie, gibt es keine /api/tasks|/api/inbox-Routen. */
  taskStore?: TaskStore;
  /** OPTIONAL — die Automations-Datenschicht (Regeln/Outbox/Läufe). Fehlt sie, gibt es keine /api/automations-Routen. */
  automationStore?: AutomationStore;
  /** OPTIONAL — die KI-Assistenz-Naht. Fehlt sie, gibt es keine /api/tasks/:id/ai-Routen. */
  aiAssist?: KiAssistPort;
  /** OPTIONAL — der Zuständigkeits-Lesepfad (app_actor_roles). Für die KI-Zuweisungsprüfung. */
  actorRoleStore?: ActorRoleStore;
  /** Initialzustand eines Verfahrens (aus der StatusMachine) — für `acceptIntake`. */
  procedureInitialState?: (
    procedureId: string,
    procedureVersion: string,
  ) => string | undefined;
  /** Verfahrensversion für neu erzeugte Fälle (Default "1"). */
  procedureVersion?: string;
  /** Injizierbar für deterministische Tests. */
  now?: Clock;
  newAuditId?: IdGenerator;
  newId?: IdGenerator;
}

interface TransitionBody {
  action: string;
  expectedVersion: number;
  detail?: string;
}

/** DEV/Test-Session aus Headern — in PROD durch eine echte Session-/OIDC-Auflösung ersetzt. Fehlt der Akteur oder
 *  der Mandant, gibt es keine Sitzung (→ 401). Rechte kommen als kommagetrennte `x-permissions`. */
export function headerSession(
  request: FastifyRequest,
): CaseworkerSession | undefined {
  // Delegiert an den framework-neutralen SDK-Resolver — EINE Wahrheit, testbar ohne Fastify.
  return sdkHeaderResolver({ headers: request.headers });
}

/** Baut einen `ProcedureCatalog` aus den StatusMachine-Übergängen mehrerer Verfahren (data-driven, kein Literal).
 *  `action` = Ziel-Status (from + action ist eindeutig); Vier-Augen/Detail/Endzustand werden übernommen. */
export function catalogFromStatusMachines(
  eintraege: {
    procedureId: string;
    procedureVersion: string;
    statusMachine: {
      states: { key: string; terminal?: boolean }[];
      transitions: {
        from: string;
        to: string;
        rollen: string[];
        vierAugen?: boolean;
        detailPflicht?: boolean;
      }[];
    };
  }[],
): ProcedureCatalog {
  const byKey = new Map<
    string,
    ReturnType<ProcedureCatalog["transitionsFor"]>
  >();
  for (const e of eintraege) {
    const terminal = new Set(
      e.statusMachine.states.filter((s) => s.terminal).map((s) => s.key),
    );
    byKey.set(
      `${e.procedureId}@${e.procedureVersion}`,
      e.statusMachine.transitions.map((t) => ({
        from: t.from,
        to: t.to,
        action: t.to,
        requiredPermission: t.vierAugen ? "case.decide" : "case.transition",
        ...(t.vierAugen ? { requiresFourEyes: true } : {}),
        ...(t.detailPflicht ? { requiresDetail: true } : {}),
        ...(terminal.has(t.to) ? { terminal: true } : {}),
      })),
    );
  }
  return {
    transitionsFor: (procedureId, procedureVersion) =>
      byKey.get(`${procedureId}@${procedureVersion}`) ?? [],
  };
}

function requireSession(
  deps: DomainApiDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): CaseworkerSession | undefined {
  const session = deps.resolveSession(request);
  if (!session) {
    reply
      .code(401)
      .header("Cache-Control", NO_STORE)
      .send({ error: "unauthorized" });
    return undefined;
  }
  return session;
}

/** Einheitliche 403-Antwort (fehlendes Recht) — eine Wahrheit für den RBAC-Deny. */
function forbidden(reply: FastifyReply, reason?: string): FastifyReply {
  return reply
    .code(403)
    .header("Cache-Control", NO_STORE)
    .send({ error: "forbidden", ...(reason ? { reason } : {}) });
}

const MUTIERENDE_ARTEN: ReadonlySet<string> = new Set([
  "setze-feld",
  "setze-prioritaet",
  "zuweisen",
  "label-hinzufuegen",
  "status-uebergang",
  "aufgabe-erstellen",
]);

/** Konfigurationsprobleme einer Regel (für `simulate`): mutierend OHNE Bedingung (fail-closed) bzw. nicht
 *  unterstützte Bedingungsform — beides führt dazu, dass die Engine die Regel NICHT ausführt. */
function regelProbleme(rule: AppAutomationRule): string[] {
  const mutierend = rule.actions.some(
    (a) =>
      typeof a === "object" &&
      a !== null &&
      MUTIERENDE_ARTEN.has(String((a as { art?: unknown }).art)),
  );
  const probleme: string[] = [];
  if (mutierend && rule.condition === null)
    probleme.push("mutierend-ohne-wenn");
  if (mutierend && !bedingungUnterstuetzt(rule.condition))
    probleme.push("unsupported-condition");
  return probleme;
}

/** Registriert die /api/automations-Routen (rechte-gated). `simulate` ist STRIKT nicht-mutierend. */
function registerAutomationRoutes(
  app: FastifyInstance,
  deps: DomainApiDeps,
  automationStore: AutomationStore,
  now: Clock,
  newId: IdGenerator,
): void {
  // Regeln im Scope lesen — `automation.read`.
  app.get<{
    Querystring: {
      procedureId?: string;
      triggerEvent?: string;
      activeOnly?: string;
    };
  }>("/api/automations", async (request, reply) => {
    const session = requireSession(deps, request, reply);
    if (!session) return reply;
    if (!session.permissions.includes("automation.read"))
      return forbidden(reply);
    const rules = await automationStore.listRules({
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      ...(request.query.procedureId
        ? { procedureId: request.query.procedureId }
        : {}),
      ...(request.query.triggerEvent
        ? { triggerEvent: request.query.triggerEvent }
        : {}),
      ...(request.query.activeOnly === "true" ? { activeOnly: true } : {}),
    });
    return reply.header("Cache-Control", NO_STORE).send({ rules });
  });

  // Regel anlegen — `automation.write`. Der Scope (Mandant/Behörde) kommt aus der Session.
  app.post<{
    Body: {
      procedureId: string;
      triggerEvent: string;
      condition?: Record<string, unknown> | null;
      actions: Record<string, unknown>[];
      requiresFourEyes?: boolean;
      active?: boolean;
    };
  }>(
    "/api/automations",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["procedureId", "triggerEvent", "actions"],
          properties: {
            procedureId: { type: "string", minLength: 1 },
            triggerEvent: { type: "string", minLength: 1 },
            condition: { type: ["object", "null"] },
            actions: { type: "array", items: { type: "object" } },
            requiresFourEyes: { type: "boolean" },
            active: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("automation.write"))
        return forbidden(reply);
      const rule = await automationStore.insertRule({
        ruleId: `rule.${newId()}`,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        procedureId: request.body.procedureId,
        triggerEvent: request.body.triggerEvent,
        condition: request.body.condition ?? null,
        actions: request.body.actions,
        requiresFourEyes: request.body.requiresFourEyes ?? false,
        active: request.body.active ?? true,
        createdAt: now(),
      });
      // Simulate-Hinweis mitgeben: welche Konfigurationsprobleme die Aktivierung entwerten würden.
      return reply
        .code(201)
        .header("Cache-Control", NO_STORE)
        .send({ rule, probleme: regelProbleme(rule) });
    },
  );

  // Regel aktiv/inaktiv schalten — `automation.write` (Regel-INHALT bleibt unveränderlicher Vertrag).
  app.patch<{ Params: { id: string }; Body: { active: boolean } }>(
    "/api/automations/:id",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["active"],
          properties: { active: { type: "boolean" } },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("automation.write"))
        return forbidden(reply);
      reply.header("Cache-Control", NO_STORE);
      // Behörden-Scope: setRuleActive filtert nur nach tenant_id — erst die Eigentümerschaft in der Behörde der
      // Session prüfen (Fremd-Behörde = 404), sonst schaltet A eine Regel der Behörde B aktiv/inaktiv.
      const vorhandeneRegel = await automationStore.getRule({
        tenantId: session.tenantId,
        ruleId: request.params.id,
      });
      if (
        !vorhandeneRegel ||
        vorhandeneRegel.authorityId !== session.authorityId
      )
        return reply.code(404).send({ error: "not-found" });
      try {
        const rule = await automationStore.setRuleActive({
          tenantId: session.tenantId,
          ruleId: request.params.id,
          active: request.body.active,
        });
        return reply.code(200).send({ rule });
      } catch (error) {
        if (errorName(error) === "AutomationRuleNotFoundError")
          return reply.code(404).send({ error: "not-found" });
        throw error;
      }
    },
  );

  // REIN simulieren (Trockenlauf) — `automation.read`. KEINE Mutation, kein Lauf: nur „würde feuern?" + Effektliste.
  app.post<{
    Params: { id: string };
    Body: { daten?: Record<string, unknown> };
  }>(
    "/api/automations/:id/simulate",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: { daten: { type: "object" } },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("automation.read"))
        return forbidden(reply);
      const rule = await automationStore.getRule({
        tenantId: session.tenantId,
        ruleId: request.params.id,
      });
      // Behörden-Scope: getRule filtert nur nach tenant_id — die Regel MUSS zusätzlich zur Behörde der Session
      // gehören, sonst leakt eine fremde ruleId aus der URL fremde Regeln/Läufe (Fremd-Behörde = 404, nicht 403).
      if (!rule || rule.authorityId !== session.authorityId)
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const daten = request.body.daten ?? {};
      const probleme = regelProbleme(rule);
      // Würde feuern, wenn keine Konfig-Probleme UND die Bedingung über den gelieferten Daten erfüllt ist.
      const wuerdefeuern =
        probleme.length === 0 && evalBedingungNodeSafe(rule.condition, daten);
      return reply.header("Cache-Control", NO_STORE).send({
        ruleId: rule.ruleId,
        wuerdefeuern,
        probleme,
        // Die ABSICHTEN (kein Effekt) — genau die Aktionen, die die Engine ausführen würde.
        effekte: wuerdefeuern ? rule.actions : [],
      });
    },
  );

  // Läufe einer Regel einsehen — `automation.read`. WICHTIG: erst die Regel-Eigentümerschaft im Session-Mandanten
  // prüfen (getRule filtert WHERE tenant_id = $1), sonst würde eine fremde ruleId aus der URL fremde Läufe leaken
  // (die runs-Tabelle trägt keine tenant_id — der Scope MUSS aus der Session kommen, nicht aus dem Pfad).
  app.get<{ Params: { id: string } }>(
    "/api/automations/:id/runs",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("automation.read"))
        return forbidden(reply);
      const rule = await automationStore.getRule({
        tenantId: session.tenantId,
        ruleId: request.params.id,
      });
      // Behörden-Scope: getRule filtert nur nach tenant_id — die Regel MUSS zusätzlich zur Behörde der Session
      // gehören, sonst leakt eine fremde ruleId aus der URL fremde Regeln/Läufe (Fremd-Behörde = 404, nicht 403).
      if (!rule || rule.authorityId !== session.authorityId)
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const runs = await automationStore.listRuns({
        ruleId: request.params.id,
      });
      return reply.header("Cache-Control", NO_STORE).send({ runs });
    },
  );
}

/** Registriert die Domain-API-Routen unter /api/* auf dem gegebenen Fastify-Server. */
export function registerDomainApi(
  app: FastifyInstance,
  deps: DomainApiDeps,
): void {
  const policy = deps.policy ?? new DefaultDenyPolicyEngine();

  // Alle Fälle im Session-Scope (Mandant/Behörde) — erfordert `case.read`.
  app.get("/api/cases", async (request, reply) => {
    const session = requireSession(deps, request, reply);
    if (!session) return reply;
    if (!session.permissions.includes("case.read")) {
      return reply
        .code(403)
        .header("Cache-Control", NO_STORE)
        .send({ error: "forbidden", reason: "missing permission case.read" });
    }
    const cases = await deps.caseStore.listCases({
      tenantId: session.tenantId,
      authorityId: session.authorityId,
    });
    return reply.header("Cache-Control", NO_STORE).send({ cases });
  });

  // Ein einzelner Fall (mandanten-scoped).
  app.get<{ Params: { id: string } }>(
    "/api/cases/:id",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("case.read")) {
        return reply.code(403).header("Cache-Control", NO_STORE).send({
          error: "forbidden",
        });
      }
      const found = await deps.caseStore.getCase({
        tenantId: session.tenantId,
        caseId: request.params.id,
      });
      // Behörden-Scope: getCase ist nur mandanten-scoped — eine Fremd-Behörde im selben Mandanten wird als 404
      // behandelt (Existenz einer fremden Akte darf nicht durchsickern), konsistent zu executeCaseTransition.
      if (!found || found.authorityId !== session.authorityId)
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      return reply.header("Cache-Control", NO_STORE).send({ case: found });
    },
  );

  // Append-only Audit eines Falls — erfordert `audit.read`.
  app.get<{ Params: { id: string } }>(
    "/api/cases/:id/audit",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("audit.read")) {
        return reply.code(403).header("Cache-Control", NO_STORE).send({
          error: "forbidden",
        });
      }
      // Behörden-Scope: listAuditEvents ist nur mandanten-scoped — erst die Zugehörigkeit der Akte zur Behörde der
      // Session prüfen (Fremd-Behörde = 404), sonst leakt die vollständige revisionssichere Audit-Historie
      // (Akteure, Zwecke, Begründungen) einer fremden Behörde im selben Mandanten.
      const fall = await deps.caseStore.getCase({
        tenantId: session.tenantId,
        caseId: request.params.id,
      });
      if (!fall || fall.authorityId !== session.authorityId)
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const events = await deps.caseStore.listAuditEvents({
        tenantId: session.tenantId,
        caseId: request.params.id,
      });
      return reply.header("Cache-Control", NO_STORE).send({ events });
    },
  );

  // Der server-autoritative Statuswechsel: RBAC + Vier-Augen + Locking + atomar mit Audit.
  app.post<{ Params: { id: string }; Body: TransitionBody }>(
    "/api/cases/:id/transitions",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["action", "expectedVersion"],
          properties: {
            action: { type: "string" },
            expectedVersion: { type: "integer" },
            detail: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;

      const result = await executeCaseTransition(
        {
          persistence: deps.caseStore,
          policy,
          catalog: deps.catalog,
          ...(deps.now ? { now: deps.now } : {}),
          ...(deps.newAuditId ? { newAuditId: deps.newAuditId } : {}),
          ...(deps.newId ? { newOutboxId: deps.newId } : {}),
        },
        {
          session,
          caseId: request.params.id,
          action: request.body.action,
          expectedVersion: request.body.expectedVersion,
          ...(request.body.detail ? { detail: request.body.detail } : {}),
          requestId: reply.request.id ?? "req",
          // Nur emittieren, wenn eine Automations-Datenschicht konfiguriert ist (sonst sammeln sich unbearbeitete
          // Events). Der SDK-Guard unterdrückt zusätzlich jeden maschinellen Akteur (Rekursions-Sperre).
          ...(deps.automationStore ? { outboxTrigger: "beim-uebergang" } : {}),
        },
      );

      reply.header("Cache-Control", NO_STORE);
      if (result.ok) return reply.code(200).send({ case: result.case });
      return reply.code(result.status).send({ error: result.reason });
    },
  );

  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => globalThis.crypto.randomUUID());

  // ── Automations-Regeln: lesen/anlegen/aktiv-schalten, REIN simulieren, Läufe einsehen ──
  const automationStore = deps.automationStore;
  if (automationStore) {
    registerAutomationRoutes(app, deps, automationStore, now, newId);
  }

  // ── Management-Ebene: Aufgaben/Board + Triage-Inbox (nur wenn ein taskStore konfiguriert ist) ──
  const taskStore = deps.taskStore;
  if (!taskStore) return;

  // Aufgaben über alle Verfahren im Session-Scope, gefiltert.
  app.get<{
    Querystring: { procedureId?: string; assignee?: string; priority?: string };
  }>("/api/tasks", async (request, reply) => {
    const session = requireSession(deps, request, reply);
    if (!session) return reply;
    if (!session.permissions.includes("task.read"))
      return reply
        .code(403)
        .header("Cache-Control", NO_STORE)
        .send({ error: "forbidden" });
    const q = request.query;
    const tasks = await taskStore.listTasks({
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      ...(q.procedureId ? { procedureId: q.procedureId } : {}),
      ...(q.assignee ? { assigneeActorId: q.assignee } : {}),
      ...(q.priority ? { priorityKey: q.priority } : {}),
    });
    return reply.header("Cache-Control", NO_STORE).send({ tasks });
  });

  // Metadaten einer Aufgabe ändern (Zuweisung/Priorität/Label/Board-Rang). KEIN Vier-Augen-Gate; Board-Move via
  // `expectedVersion` optimistic-locked (409). Erfordert `task.write`.
  app.patch<{
    Params: { id: string };
    Body: {
      priorityKey?: string | null;
      assigneeActorId?: string | null;
      labels?: string[];
      sortRank?: string;
      boardColumn?: string | null;
      dueAt?: string | null;
      expectedVersion?: number;
    };
  }>(
    "/api/tasks/:id",
    {
      schema: {
        // additionalProperties:false gegen Overposting — der Handler spreizt `...request.body` in patchTask.
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            priorityKey: { type: ["string", "null"] },
            assigneeActorId: { type: ["string", "null"] },
            labels: { type: "array", items: { type: "string" } },
            sortRank: { type: "string" },
            boardColumn: { type: ["string", "null"] },
            // Fälligkeit/Frist (ISO) oder null — speist den `frist-erreicht`-Trigger.
            dueAt: { type: ["string", "null"] },
            expectedVersion: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("task.write"))
        return reply
          .code(403)
          .header("Cache-Control", NO_STORE)
          .send({ error: "forbidden" });
      reply.header("Cache-Control", NO_STORE);
      // Behörden-Scope: patchTask kann nur nach tenant_id+task_id filtern — erst die Zugehörigkeit der Aufgabe zur
      // Behörde der Session prüfen (Fremd-Behörde = 404), sonst mutiert A eine Aufgabe der Behörde B (Zuweisung/
      // Board/Priorität; `dueAt: null` würde sogar deren Fristautomation stilllegen). Wie die relations/ai-Routen.
      const vorhandeneAufgabe = await taskStore.getTask({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      if (
        !vorhandeneAufgabe ||
        vorhandeneAufgabe.authorityId !== session.authorityId
      )
        return reply.code(404).send({ error: "not-found" });
      try {
        const task = await taskStore.patchTask({
          tenantId: session.tenantId,
          taskId: request.params.id,
          ...request.body,
        });
        return reply.code(200).send({ task });
      } catch (error) {
        const name = errorName(error);
        if (name === "TaskNotFoundError")
          return reply.code(404).send({ error: "not-found" });
        if (name === "CaseVersionConflictError")
          return reply.code(409).send({ error: "conflict" });
        throw error;
      }
    },
  );

  // Triage-Inbox: verfahrensübergreifender Eingang. Erfordert `inbox.read`.
  app.get<{ Querystring: { status?: string } }>(
    "/api/inbox",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("inbox.read"))
        return reply
          .code(403)
          .header("Cache-Control", NO_STORE)
          .send({ error: "forbidden" });
      const items = await taskStore.listIntake({
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        ...(request.query.status
          ? { triageStatus: request.query.status as "pending" }
          : {}),
      });
      return reply.header("Cache-Control", NO_STORE).send({ items });
    },
  );

  // Einen Eingang ANNEHMEN → atomar Vorgang + Aufgabe erzeugen. Erfordert `inbox.triage`.
  app.post<{ Params: { id: string } }>(
    "/api/inbox/:id/accept",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("inbox.triage"))
        return reply
          .code(403)
          .header("Cache-Control", NO_STORE)
          .send({ error: "forbidden" });
      reply.header("Cache-Control", NO_STORE);
      const items = await taskStore.listIntake({
        tenantId: session.tenantId,
        authorityId: session.authorityId,
      });
      const intake = items.find((i) => i.intakeId === request.params.id);
      if (!intake) return reply.code(404).send({ error: "not-found" });
      // Doppel-Annahme verhindern: ein bereits angenommener Eingang würde sonst einen DUPLIKAT-Vorgang erzeugen und
      // den ersten verwaisen. Idempotenz-Grenze = der Triage-Status (accepted ist terminal).
      if (intake.triageStatus === "accepted")
        return reply.code(409).send({ error: "already-accepted" });

      const procedureVersion = deps.procedureVersion ?? "1";
      // Initialzustand kommt AUSSCHLIESSLICH aus der StatusMachine/dem Katalog — KEIN Literal-Fallback (sonst
      // entstünde ein Fall in einem Zustand, den das Verfahren gar nicht kennt). Fehlt er ⇒ 422.
      const initialState = deps.procedureInitialState?.(
        intake.procedureId,
        procedureVersion,
      );
      if (!initialState)
        return reply.code(422).send({
          error: "no-initial-state",
          reason: `kein Initialzustand für Verfahren „${intake.procedureId}"`,
        });
      const ts = now();
      const caseId = `case.${newId()}`;
      const newCase: AppCase = {
        caseId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        procedureId: intake.procedureId,
        procedureVersion,
        state: initialState,
        version: 1,
        subjectIds: [],
        openedAt: ts,
        closedAt: null,
      };
      const newTask: AppTask = {
        taskId: `task.${newId()}`,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        procedureId: intake.procedureId,
        caseId,
        title: intake.subject ?? `Vorgang ${intake.procedureId}`,
        priorityKey: null,
        assigneeActorId: null,
        labels: [],
        dueAt: null,
        sortRank: "V",
        parentTaskId: null,
        boardColumn: null,
        version: 1,
        createdAt: ts,
        updatedAt: ts,
      };
      // WURZEL-Audit-Event: der Fall entsteht revisionssicher MIT seinem ersten Audit-Eintrag (kein Fall ohne Audit).
      const rootAudit = {
        auditEventId: `audit.${newId()}`,
        caseId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actorId: session.actorId,
        eventType: "case.eingegangen",
        purpose: "intake-accepted",
        legalBasisId: "inbox.triage",
        requestId: reply.request.id ?? "req",
        payload: {
          intakeId: intake.intakeId,
          source: intake.source,
          initialState,
          // Die Eingangs-/Antragsdaten revisionssicher am Fall verankern — sonst gingen sie bei der Annahme verloren
          // (der AppCase trägt keine Antragsdaten). So hat der PROD-Fall dieselben Nutzdaten wie der DEV-Vorgang.
          rohdaten: intake.rawData,
        },
        occurredAt: ts,
      };
      const created = await taskStore.acceptIntake({
        tenantId: session.tenantId,
        intakeId: intake.intakeId,
        case: newCase,
        task: newTask,
        rootAudit,
        // Automations-Outbox: „beim-eingang"-Event ATOMAR in DERSELBEN Transaktion wie acceptIntake — kein Fall ohne
        // sein Event (und umgekehrt). Nur wenn eine Automations-Datenschicht konfiguriert ist.
        ...(deps.automationStore
          ? {
              outboxEvent: {
                eventId: `evt.${newId()}`,
                tenantId: session.tenantId,
                authorityId: session.authorityId,
                procedureId: intake.procedureId,
                caseId: newCase.caseId,
                taskId: newTask.taskId,
                triggerEvent: "beim-eingang",
                payload: { actor: session.actorId, source: intake.source },
                createdAt: now(),
                processedAt: null,
              },
            }
          : {}),
      });
      return reply.code(201).send(created);
    },
  );

  // Einen Eingang TRIAGIEREN OHNE Annahme (zurückstellen/ablehnen/Dublette/wieder offen). „accepted" ist NICHT hier
  // erlaubt — das ist die atomare accept-Route (erzeugt Vorgang + Aufgabe). Erfordert `inbox.triage`.
  app.post<{
    Params: { id: string };
    Body: { status: "declined" | "duplicate" | "snoozed" | "pending" };
  }>(
    "/api/inbox/:id/triage",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["declined", "duplicate", "snoozed", "pending"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("inbox.triage"))
        return reply
          .code(403)
          .header("Cache-Control", NO_STORE)
          .send({ error: "forbidden" });
      reply.header("Cache-Control", NO_STORE);
      try {
        const item = await taskStore.setTriageStatus({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          intakeId: request.params.id,
          triageStatus: request.body.status,
        });
        return reply.code(200).send({ item });
      } catch (error) {
        if (errorName(error) === "IntakeNotFoundError")
          return reply.code(404).send({ error: "not-found" });
        throw error;
      }
    },
  );

  // Runtime-INGEST: einen neuen Eingang einreihen (Antrag/E-Mail/Formular/Register). Der Mandanten-/Behörden-Scope
  // kommt AUSSCHLIESSLICH aus der Session (nie aus dem Body). Erfordert `inbox.triage`.
  app.post<{
    Body: {
      procedureId: string;
      source: "antrag" | "email" | "formular" | "register";
      subject?: string;
      rohdaten?: Record<string, unknown>;
    };
  }>(
    "/api/inbox",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["procedureId", "source"],
          properties: {
            procedureId: { type: "string", minLength: 1 },
            source: {
              type: "string",
              enum: ["antrag", "email", "formular", "register"],
            },
            subject: { type: "string" },
            rohdaten: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("inbox.triage"))
        return reply
          .code(403)
          .header("Cache-Control", NO_STORE)
          .send({ error: "forbidden" });
      reply.header("Cache-Control", NO_STORE);
      const item = await taskStore.insertIntake({
        intakeId: `intake.${newId()}`,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        procedureId: request.body.procedureId,
        source: request.body.source,
        triageStatus: "pending",
        subject: request.body.subject ?? null,
        rawData: request.body.rohdaten ?? {},
        taskId: null,
        caseId: null,
        receivedAt: now(),
      });
      return reply.code(201).send({ item });
    },
  );

  // ── Vermerke (intern, nur Sachbearbeitung), Aktivitäts-Feed, gespeicherte Ansichten ──

  // Interne Vermerke einer Aufgabe lesen — erfordert `task.read` UND `comment.read` (Bürger bekommt letzteres nie).
  app.get<{ Params: { id: string } }>(
    "/api/tasks/:id/comments",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (
        !session.permissions.includes("task.read") ||
        !session.permissions.includes("comment.read")
      )
        return forbidden(reply);
      // Behörden-Scope: listTaskComments ist nur mandanten-scoped — interne Vermerke sind vertraulich; eine
      // Fremd-Behörde im selben Mandanten darf sie nicht lesen (404), wie die relations/ai-Routen.
      const kommentarAufgabe = await taskStore.getTask({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      if (
        !kommentarAufgabe ||
        kommentarAufgabe.authorityId !== session.authorityId
      )
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const comments = await taskStore.listTaskComments({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      return reply.header("Cache-Control", NO_STORE).send({ comments });
    },
  );

  // Internen Vermerk anlegen (append-only) — erfordert `comment.write`. Schreibt zusätzlich einen Aktivitäts-Eintrag.
  app.post<{ Params: { id: string }; Body: { body: string } }>(
    "/api/tasks/:id/comments",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["body"],
          properties: { body: { type: "string", minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("comment.write"))
        return forbidden(reply);
      // Behörden-Scope: kein Vermerk/keine Aktivität an einer Aufgabe einer FREMDEN Behörde (404), wie GET.
      const zielAufgabe = await taskStore.getTask({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      if (!zielAufgabe || zielAufgabe.authorityId !== session.authorityId)
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const ts = now();
      const comment = await taskStore.insertTaskComment({
        commentId: `comment.${newId()}`,
        taskId: request.params.id,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        authorActorId: session.actorId,
        body: request.body.body,
        createdAt: ts,
      });
      await taskStore.insertTaskActivity({
        activityId: `activity.${newId()}`,
        taskId: request.params.id,
        tenantId: session.tenantId,
        actorId: session.actorId,
        activityType: "task.commented",
        payload: { commentId: comment.commentId },
        occurredAt: ts,
      });
      return reply
        .code(201)
        .header("Cache-Control", NO_STORE)
        .send({ comment });
    },
  );

  // Aktivitäts-Feed einer Aufgabe — erfordert `task.read`.
  app.get<{ Params: { id: string } }>(
    "/api/tasks/:id/activity",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("task.read")) return forbidden(reply);
      // Behörden-Scope: der Aktivitäts-Feed einer Aufgabe einer FREMDEN Behörde ist nicht lesbar (404), wie die
      // relations/comments/ai-Routen.
      const aktivitaetAufgabe = await taskStore.getTask({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      if (
        !aktivitaetAufgabe ||
        aktivitaetAufgabe.authorityId !== session.authorityId
      )
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const activity = await taskStore.listTaskActivity({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      return reply.header("Cache-Control", NO_STORE).send({ activity });
    },
  );

  // Gespeicherte Ansichten (persönliche + geteilte im Scope) — erfordert `view.read`.
  app.get("/api/views", async (request, reply) => {
    const session = requireSession(deps, request, reply);
    if (!session) return reply;
    if (!session.permissions.includes("view.read")) return forbidden(reply);
    const views = await taskStore.listSavedViews({
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      ownerActorId: session.actorId,
    });
    return reply.header("Cache-Control", NO_STORE).send({ views });
  });

  // Ansicht speichern — `view.write`. Eine GETEILTE Ansicht erfordert zusätzlich `view.share`.
  app.post<{
    Body: {
      label: string;
      layout: string;
      scope?: "personal" | "geteilt";
      definition?: Record<string, unknown>;
    };
  }>(
    "/api/views",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["label", "layout"],
          properties: {
            label: { type: "string", minLength: 1 },
            layout: { type: "string", minLength: 1 },
            scope: { type: "string", enum: ["personal", "geteilt"] },
            definition: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("view.write")) return forbidden(reply);
      const scope = request.body.scope ?? "personal";
      if (scope === "geteilt" && !session.permissions.includes("view.share"))
        return forbidden(reply, "geteilte Ansicht erfordert view.share");
      const view = await taskStore.insertSavedView({
        viewId: `view.${newId()}`,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        ownerActorId: scope === "personal" ? session.actorId : null,
        scope,
        label: request.body.label,
        layout: request.body.layout,
        definition: request.body.definition ?? {},
        createdAt: now(),
      });
      return reply.code(201).header("Cache-Control", NO_STORE).send({ view });
    },
  );

  // Ansicht löschen — `view.write`, mandanten-scoped.
  app.delete<{ Params: { id: string } }>(
    "/api/views/:id",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("view.write")) return forbidden(reply);
      await taskStore.deleteSavedView({
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        actorId: session.actorId,
        viewId: request.params.id,
      });
      return reply.code(204).header("Cache-Control", NO_STORE).send();
    },
  );

  // ── Aufgaben-Beziehungen (blocks / blocked-by / duplicate / relates / widerspruch-zu) ──
  // Beziehungen einer Aufgabe lesen — `task.read`, behörden-scoped.
  app.get<{ Params: { id: string } }>(
    "/api/tasks/:id/relations",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("task.read")) return forbidden(reply);
      const task = await taskStore.getTask({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      if (!task || task.authorityId !== session.authorityId)
        return reply
          .code(404)
          .header("Cache-Control", NO_STORE)
          .send({ error: "not-found" });
      const relations = await taskStore.listTaskRelations({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      return reply.header("Cache-Control", NO_STORE).send({ relations });
    },
  );

  // Beziehung anlegen — `task.write`. Beide Aufgaben müssen in der eigenen Behörde liegen; Selbstreferenz/Duplikat → 409.
  app.post<{
    Params: { id: string };
    Body: { relatedTaskId: string; relationType: string };
  }>(
    "/api/tasks/:id/relations",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["relatedTaskId", "relationType"],
          properties: {
            relatedTaskId: { type: "string", minLength: 1 },
            relationType: {
              type: "string",
              enum: [
                "blocks",
                "blocked-by",
                "duplicate",
                "relates",
                "widerspruch-zu",
              ],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("task.write")) return forbidden(reply);
      reply.header("Cache-Control", NO_STORE);
      const [task, related] = await Promise.all([
        taskStore.getTask({
          tenantId: session.tenantId,
          taskId: request.params.id,
        }),
        taskStore.getTask({
          tenantId: session.tenantId,
          taskId: request.body.relatedTaskId,
        }),
      ]);
      // Beide Aufgaben müssen existieren UND zur eigenen Behörde gehören (kein Verlinken fremder Aufgaben).
      if (
        !task ||
        task.authorityId !== session.authorityId ||
        !related ||
        related.authorityId !== session.authorityId
      )
        return reply.code(404).send({ error: "not-found" });
      try {
        const relation = await taskStore.insertTaskRelation({
          relationId: `relation.${newId()}`,
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          taskId: request.params.id,
          relatedTaskId: request.body.relatedTaskId,
          relationType: request.body
            .relationType as import("@senticor/app-store-postgres").TaskRelationType,
          createdAt: now(),
        });
        return reply.code(201).send({ relation });
      } catch (error) {
        if (errorName(error) === "TaskRelationError")
          return reply.code(409).send({ error: "invalid-relation" });
        throw error;
      }
    },
  );

  // Beziehung löschen — `task.write`, behörden-scoped (wie GET/POST): die Aufgabe muss der eigenen Behörde gehören,
  // und die Beziehung wird nur gelöscht, wenn sie zu GENAU dieser Aufgabe + Behörde gehört (kein Fremd-Löschen).
  app.delete<{ Params: { id: string; relationId: string } }>(
    "/api/tasks/:id/relations/:relationId",
    async (request, reply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply;
      if (!session.permissions.includes("task.write")) return forbidden(reply);
      reply.header("Cache-Control", NO_STORE);
      const task = await taskStore.getTask({
        tenantId: session.tenantId,
        taskId: request.params.id,
      });
      if (!task || task.authorityId !== session.authorityId)
        return reply.code(404).send({ error: "not-found" });
      await taskStore.deleteTaskRelation({
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        taskId: request.params.id,
        relationId: request.params.relationId,
      });
      return reply.code(204).send();
    },
  );

  // ── KI-Assistenz (assistiv, Mensch entscheidet) — nur wenn ein aiAssist-Port konfiguriert ist ──
  const aiAssist = deps.aiAssist;
  if (aiAssist) {
    // Vorschlag holen — `task.read` + `ai.assist`. REIN: keine Mutation, keine Persistenz. Der Client zeigt den
    // Vorschlag mit `marking:"ki-vorschlag"`/`reviewRequired:true`; ein Mensch übernimmt (oder verwirft) ihn.
    app.post<{
      Params: { id: string };
      Body: { daten?: Record<string, unknown> };
    }>(
      "/api/tasks/:id/ai/assist",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            properties: { daten: { type: "object" } },
          },
        },
      },
      async (request, reply) => {
        const session = requireSession(deps, request, reply);
        if (!session) return reply;
        if (
          !session.permissions.includes("task.read") ||
          !session.permissions.includes("ai.assist")
        )
          return forbidden(reply);
        const task = await taskStore.getTask({
          tenantId: session.tenantId,
          taskId: request.params.id,
        });
        // Behörden-Scope: nur Aufgaben der eigenen Behörde (getTask ist nur mandanten-scoped).
        if (!task || task.authorityId !== session.authorityId)
          return reply
            .code(404)
            .header("Cache-Control", NO_STORE)
            .send({ error: "not-found" });
        // PII-armer Kontext: nur Metadaten, kein Freitext/Name.
        const vorschlag = await aiAssist.suggest(
          {
            tenantId: session.tenantId,
            authorityId: session.authorityId,
            procedureId: task.procedureId,
            taskId: task.taskId,
            ...(task.caseId ? { caseId: task.caseId } : {}),
            prioritaet: task.priorityKey,
            faelligIso: task.dueAt,
            labels: task.labels,
          },
          { ...(request.body.daten ? { daten: request.body.daten } : {}) },
        );
        return reply.header("Cache-Control", NO_STORE).send({ vorschlag });
      },
    );

    // Vorschlag ÜBERNEHMEN — `task.write` + `ai.assist`. Erlaubt AUSSCHLIESSLICH nicht-autoritative Metadaten
    // (Priorität/Zuweisung/Label); ruft NIE executeCaseTransition, schreibt NIE ein case.*-Audit. So ist die KI
    // strukturell nie eines der zwei Augen. Eine Zuweisung wird server-seitig gegen die Zuständigkeit geprüft.
    app.post<{
      Params: { id: string };
      Body: { prioritaet?: string; zuweisenAn?: string; labels?: string[] };
    }>(
      "/api/tasks/:id/ai/apply",
      {
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              prioritaet: { type: "string" },
              zuweisenAn: { type: "string" },
              labels: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      async (request, reply) => {
        const session = requireSession(deps, request, reply);
        if (!session) return reply;
        if (
          !session.permissions.includes("task.write") ||
          !session.permissions.includes("ai.assist")
        )
          return forbidden(reply);
        reply.header("Cache-Control", NO_STORE);
        const task = await taskStore.getTask({
          tenantId: session.tenantId,
          taskId: request.params.id,
        });
        if (!task) return reply.code(404).send({ error: "not-found" });
        // Behörden-Scope: die Aufgabe muss zur Behörde der Session gehören (getTask ist nur mandanten-scoped).
        if (task.authorityId !== session.authorityId)
          return reply.code(404).send({ error: "not-found" });

        // Zuweisung nur an einen ZUSTÄNDIGEN, aktiven Akteur in der Behörde DER AUFGABE (kein Self-Assign an Beliebige).
        if (request.body.zuweisenAn !== undefined) {
          const rollen = deps.actorRoleStore
            ? await deps.actorRoleStore.listActiveRolesForActor({
                tenantId: session.tenantId,
                actorId: request.body.zuweisenAn,
                nowIso: now(),
              })
            : [];
          const zustaendig = rollen.some(
            (r) => r.authorityId === task.authorityId,
          );
          if (!zustaendig)
            return reply.code(422).send({
              error: "not-competent",
              reason: `„${request.body.zuweisenAn}" hat keine aktive Zuständigkeit in dieser Behörde`,
            });
        }

        const patch: {
          tenantId: string;
          taskId: string;
          priorityKey?: string;
          assigneeActorId?: string;
          labels?: string[];
        } = { tenantId: session.tenantId, taskId: request.params.id };
        if (request.body.prioritaet !== undefined)
          patch.priorityKey = request.body.prioritaet;
        if (request.body.zuweisenAn !== undefined)
          patch.assigneeActorId = request.body.zuweisenAn;
        if (request.body.labels !== undefined)
          // Additiv, aber DEDUPLIZIERT (keine akkumulierten Duplikate wie beim rohen Concat).
          patch.labels = [...new Set([...task.labels, ...request.body.labels])];

        const updated = await taskStore.patchTask(patch);
        // Herkunft protokollieren (nicht nur UI-Badge): jede KI-beeinflusste Änderung ist auditierbar.
        await taskStore.insertTaskActivity({
          activityId: `activity.${newId()}`,
          taskId: request.params.id,
          tenantId: session.tenantId,
          actorId: session.actorId,
          activityType: "task.ki-uebernommen",
          payload: {
            marking: "ki-vorschlag",
            ...(request.body.prioritaet !== undefined
              ? { prioritaet: request.body.prioritaet }
              : {}),
            ...(request.body.zuweisenAn !== undefined
              ? { zuweisenAn: request.body.zuweisenAn }
              : {}),
          },
          occurredAt: now(),
        });
        return reply.code(200).send({ task: updated });
      },
    );
  }
}

function errorName(error: unknown): string | undefined {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name)
    : undefined;
}
