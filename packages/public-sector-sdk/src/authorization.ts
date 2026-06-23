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
    if (
      request.requiresFourEyes &&
      request.previousApproverActorId === request.subject.actor.actorId
    ) {
      return {
        effect: "deny",
        reason: "four-eyes separation failed",
        obligations: [],
      };
    }
    return {
      effect: "allow",
      reason: "permission matched",
      obligations: ["append-fachliche-audit-event"],
    };
  }
}
