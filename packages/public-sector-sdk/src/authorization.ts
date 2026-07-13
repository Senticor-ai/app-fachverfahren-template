import type { ActorRef } from "@senticor/platform-contracts";

export interface AuthorizationSubject {
  actor: ActorRef;
  permissions: string[];
  attributes: Record<string, string | boolean | number | undefined>;
}

export interface AuthorizationResource {
  resourceType: "case" | "task" | "document" | "payment" | "admin";
  resourceId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  ownerActorId?: string;
  assignedActorId?: string;
}

export interface AuthorizationRequest {
  subject: AuthorizationSubject;
  action: string;
  resource: AuthorizationResource;
  purpose?: string;
  legalBasisId?: string;
  requiresFourEyes?: boolean;
  previousApproverActorId?: string;
}

export interface AuthorizationDecision {
  effect: "allow" | "deny";
  reason: string;
  obligations: string[];
}

export interface PolicyEngine {
  decide(request: AuthorizationRequest): AuthorizationDecision;
}

export class DefaultDenyPolicyEngine implements PolicyEngine {
  decide(request: AuthorizationRequest): AuthorizationDecision {
    if (!request.subject.permissions.includes(request.action)) {
      return {
        effect: "deny",
        reason: "missing permission",
        obligations: [],
      };
    }
    if (request.requiresFourEyes) {
      // ZWEI-PERSONEN-INTEGRITÄT: eine Vier-Augen-Entscheidung verlangt einen (menschlichen) VORBEREITER, der ein
      // ANDERER ist als der Ausführende. FEHLT der Vorbereiter (`undefined`) — kein menschlicher Übergang hat den Fall
      // in seinen aktuellen Zustand gebracht — ist die Zwei-Personen-Regel NICHT erfüllbar → DENY. (Bisher wurde ohne
      // Vorbereiter fälschlich ERLAUBT: EIN Mensch konnte eine Vier-Augen-Entscheidung allein abschließen — der Bypass.)
      if (
        request.previousApproverActorId === undefined ||
        request.previousApproverActorId === request.subject.actor.actorId
      ) {
        return {
          effect: "deny",
          reason: "four-eyes separation failed",
          obligations: [],
        };
      }
    }
    return {
      effect: "allow",
      reason: "permission matched",
      obligations: ["append-fachliche-audit-event"],
    };
  }
}
