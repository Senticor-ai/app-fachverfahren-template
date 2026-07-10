// public-sector-sdk/case-service — die SERVER-AUTORITATIVE Entscheidung über einen Fall-Statuswechsel.
//
// Bündelt RBAC (PolicyEngine) + Vier-Augen + Optimistic-Locking + append-only Audit zu EINER geprüften Operation.
// Der Vorbereiter einer kritischen Entscheidung (`previousApproverActorId`) ist der Akteur des LETZTEN fachlichen
// Übergangs dieses Falls — die Vier-Augen-Regel der `DefaultDenyPolicyEngine` verlangt dann einen ANDEREN Menschen.
// Die Persistenz ist ein struktureller PORT (der `CaseStore` aus @senticor/app-store-postgres erfüllt ihn), sodass
// die Domain an der ABSTRAKTION hängt, nicht an Postgres. Kein HTTP hier — der Fastify-Handler ist dünner Adapter.
import { type PolicyEngine } from "./authorization.js";
import type { Clock, IdGenerator } from "./clock.js";

/** Der maschinelle Dienst-Akteur der Automations-Engine — EINE Wahrheit (auch die Engine importiert diesen Wert).
 *  Ein Service-Akteur ist NIE ein „Auge" einer Vier-Augen-Entscheidung. */
export const AUTOMATION_SERVICE_ACTOR = "automation.service";

/** Ist der Akteur ein maschineller Dienst (kein Mensch)? Dann zählt er nicht als Vorbereiter/Freigeber. */
export function isServiceActor(actorId: string): boolean {
  return actorId === AUTOMATION_SERVICE_ACTOR;
}

/** Ein Fall, reduziert auf die für die Entscheidung nötigen Felder (der `CaseStore` liefert mehr — strukturell ok). */
export interface CaseRecord {
  caseId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string;
  procedureVersion: string;
  state: string;
  version: number;
}

/** Ein Audit-Eintrag, reduziert auf das für die Vorbereiter-Bestimmung Nötige. */
export interface AuditRecord {
  actorId: string;
  eventType: string;
  occurredAt: string;
}

/** Der append-only Audit-Eintrag, den `transitionCase` ATOMAR mit dem Statuswechsel schreibt. */
export interface CaseAuditEvent {
  auditEventId: string;
  caseId: string | null;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  actorId: string;
  eventType: string;
  purpose: string;
  legalBasisId: string;
  requestId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/** Ein Automations-Outbox-Event, das ATOMAR mit dem Statuswechsel geschrieben wird (feldgleich zu
 *  `AppAutomationEvent` in app-store-postgres — rein STRUKTURELL, kein Import, damit das SDK node-frei/lean bleibt). */
export interface TransitionOutboxEvent {
  eventId: string;
  tenantId: string;
  authorityId: string;
  procedureId: string;
  caseId: string | null;
  taskId: string | null;
  triggerEvent: string;
  payload: Record<string, unknown>;
  createdAt: string;
  processedAt: string | null;
}

/** Persistenz-PORT — strukturell erfüllt vom `CaseStore` (app-store-postgres). Nur die drei nötigen Methoden. */
export interface CasePersistence {
  getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<CaseRecord | undefined>;
  listAuditEvents(query: {
    tenantId: string;
    caseId: string;
  }): Promise<AuditRecord[]>;
  transitionCase(input: {
    tenantId: string;
    caseId: string;
    expectedVersion: number;
    toState: string;
    closedAt?: string | null;
    auditEvent: CaseAuditEvent;
    /** OPTIONAL — wird ATOMAR in DERSELBEN Transaktion wie der Statuswechsel geschrieben („keine Mutation ohne Event"). */
    outboxEvent?: TransitionOutboxEvent;
  }): Promise<CaseRecord>;
}

/** Eine erlaubte Transition mit ihren Autorisierungs-Anforderungen (aus dem Verfahrens-Katalog). */
export interface CatalogTransition {
  from: string;
  to: string;
  action: string;
  requiredPermission: string;
  requiresFourEyes?: boolean;
  /** Begründungspflicht (z. B. bei Ablehnung) — der Handler MUSS ein `detail` liefern, sonst 400. */
  requiresDetail?: boolean;
  /** Endzustand — setzt `closedAt`. */
  terminal?: boolean;
}

/** Der PROZESS-KATALOG: welche Übergänge ein Verfahren (in einer Version) erlaubt. */
export interface ProcedureCatalog {
  transitionsFor(
    procedureId: string,
    procedureVersion: string,
  ): CatalogTransition[];
}

/** Die authentifizierte Sachbearbeiter-Sitzung — Scope + Rechte kommen aus der SERVER-Session, nie aus dem Client. */
export interface CaseworkerSession {
  actorId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  permissions: string[];
}

export type CaseTransitionResult =
  | { ok: true; case: CaseRecord }
  | { ok: false; status: 400 | 403 | 404 | 409; reason: string };

export interface ExecuteCaseTransitionDeps {
  persistence: CasePersistence;
  policy: PolicyEngine;
  catalog: ProcedureCatalog;
  /** Injizierbar für deterministische Tests. */
  now?: Clock;
  newAuditId?: IdGenerator;
  /** Id-Generator für das (optionale) Outbox-Event. */
  newOutboxId?: IdGenerator;
}

export interface ExecuteCaseTransitionInput {
  session: CaseworkerSession;
  caseId: string;
  action: string;
  expectedVersion: number;
  detail?: string;
  requestId: string;
  /** Ist gesetzt, wird ATOMAR ein Outbox-Event dieses Triggers (z. B. "beim-uebergang") mitgeschrieben — ABER NIE für
   *  einen maschinellen Dienst-Akteur (Rekursions-Sperre). Fehlt der Trigger, entsteht kein Event. */
  outboxTrigger?: string;
}

/**
 * Führt einen Fall-Statuswechsel SERVER-AUTORITATIV aus: prüft Existenz (404), Gültigkeit der Transition (400),
 * Begründungspflicht (400), RBAC + Vier-Augen (403), Optimistic Locking (409) — und schreibt erst dann atomar
 * Statuswechsel + Audit. Gibt ein typisiertes Ergebnis zurück (der HTTP-Adapter mappt `status` 1:1 auf den Code).
 */
export async function executeCaseTransition(
  deps: ExecuteCaseTransitionDeps,
  input: ExecuteCaseTransitionInput,
): Promise<CaseTransitionResult> {
  const { session } = input;
  const now = deps.now ?? (() => new Date().toISOString());
  const newAuditId =
    deps.newAuditId ?? (() => `audit.${globalThis.crypto.randomUUID()}`);

  const current = await deps.persistence.getCase({
    tenantId: session.tenantId,
    caseId: input.caseId,
  });
  if (!current) return { ok: false, status: 404, reason: "case not found" };
  // BEHÖRDEN-SCOPE (wie `listCases` beim Lesen): ein Fall einer ANDEREN Behörde desselben Mandanten ist für diese
  // Session nicht existent — 404 (nicht 403), damit die Existenz fremder Fälle nicht durchsickert. Ohne diese Sperre
  // könnte ein Bearbeiter einen Fremd-Behörden-Fall wechseln und dabei Audit + Outbox-Event unter der FREMDEN Behörde
  // schreiben (und deren Automationen auslösen).
  if (current.authorityId !== session.authorityId)
    return { ok: false, status: 404, reason: "case not found" };

  const transition = deps.catalog
    .transitionsFor(current.procedureId, current.procedureVersion)
    .find((t) => t.from === current.state && t.action === input.action);
  if (!transition)
    return {
      ok: false,
      status: 400,
      reason: `invalid transition ${current.state}/${input.action}`,
    };

  if (transition.requiresDetail && !input.detail?.trim())
    return {
      ok: false,
      status: 400,
      reason: "detail required for this action",
    };

  // Vorbereiter = Akteur des LETZTEN fachlichen Übergangs (event_type "case.*") — ABER nur MENSCHLICHE Akteure zählen.
  // Ein maschineller Dienst-Übergang (Automation) darf die Vier-Augen-Prüfung NICHT verfälschen: Sonst würde die
  // Automation als „Vorbereiter" gezählt, der eigentliche menschliche Vorbereiter verdrängt, und EIN Mensch könnte
  // eine Vier-Augen-Entscheidung allein abschließen (Automation legt vor → derselbe Mensch entscheidet → fälschlich
  // erlaubt). Deshalb: Service-Akteure aus der Vorbereiter-Bestimmung ausschließen.
  const audit = await deps.persistence.listAuditEvents({
    tenantId: session.tenantId,
    caseId: input.caseId,
  });
  const previousApproverActorId = [...audit]
    .reverse()
    .find(
      (e) => e.eventType.startsWith("case.") && !isServiceActor(e.actorId),
    )?.actorId;

  const decision = deps.policy.decide({
    subject: {
      actor: {
        actorId: session.actorId,
        actorType: "employee",
        displayName: session.actorId,
      },
      permissions: session.permissions,
      attributes: {},
    },
    action: transition.requiredPermission,
    resource: {
      resourceType: "case",
      resourceId: current.caseId,
      tenantId: current.tenantId,
      authorityId: current.authorityId,
      jurisdictionId: current.jurisdictionId,
    },
    ...(transition.requiresFourEyes ? { requiresFourEyes: true } : {}),
    ...(previousApproverActorId ? { previousApproverActorId } : {}),
  });
  if (decision.effect === "deny")
    return { ok: false, status: 403, reason: decision.reason };

  // Optimistic Locking VOR dem Schreiben (der Store prüft zusätzlich atomar unter FOR UPDATE).
  if (current.version !== input.expectedVersion)
    return { ok: false, status: 409, reason: "case version conflict" };

  const auditEvent: CaseAuditEvent = {
    auditEventId: newAuditId(),
    caseId: current.caseId,
    tenantId: current.tenantId,
    authorityId: current.authorityId,
    jurisdictionId: current.jurisdictionId,
    actorId: session.actorId,
    eventType: `case.${input.action}`,
    purpose: "case-transition",
    legalBasisId: transition.requiredPermission,
    requestId: input.requestId,
    payload: {
      fromState: current.state,
      toState: transition.to,
      ...(input.detail ? { detail: input.detail } : {}),
    },
    occurredAt: now(),
  };

  // Die EINZIGE Rekursions-Sperre: ein Outbox-Event entsteht NUR, wenn ein Trigger gewünscht ist UND der Akteur KEIN
  // maschineller Dienst ist. So kann ein automationsgetriebener Übergang nie ein weiteres Event erzeugen (kein Sturm).
  const newOutboxId =
    deps.newOutboxId ?? (() => `evt.${globalThis.crypto.randomUUID()}`);
  const outboxEvent: TransitionOutboxEvent | undefined =
    input.outboxTrigger && !isServiceActor(session.actorId)
      ? {
          eventId: newOutboxId(),
          tenantId: current.tenantId,
          authorityId: current.authorityId,
          procedureId: current.procedureId,
          caseId: current.caseId,
          taskId: null,
          triggerEvent: input.outboxTrigger,
          payload: {
            actor: session.actorId,
            fromState: current.state,
            toState: transition.to,
            action: input.action,
          },
          createdAt: now(),
          processedAt: null,
        }
      : undefined;

  try {
    const updated = await deps.persistence.transitionCase({
      tenantId: session.tenantId,
      caseId: input.caseId,
      expectedVersion: input.expectedVersion,
      toState: transition.to,
      closedAt: transition.terminal ? now() : null,
      auditEvent,
      ...(outboxEvent ? { outboxEvent } : {}),
    });
    return { ok: true, case: updated };
  } catch (error) {
    // Ein Nebenläufigkeits-Konflikt aus dem Store (z. B. CaseVersionConflictError) → 409, strukturell erkannt
    // (ohne Kopplung an die Postgres-Fehlerklasse).
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "CaseVersionConflictError"
    ) {
      return { ok: false, status: 409, reason: "case version conflict" };
    }
    throw error;
  }
}
