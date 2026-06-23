export interface FachlicheAuditEvent {
  auditEventId: string;
  eventType: string;
  actorId: string;
  actingAuthorityId: string;
  representationId?: string;
  purpose: string;
  legalBasisId: string;
  caseId?: string;
  requestId: string;
  previousState?: string;
  newState?: string;
  summary: string;
  occurredAt: string;
}

export interface SecurityEvent {
  securityEventId: string;
  eventType: string;
  actorId?: string;
  requestId: string;
  severity: "info" | "warning" | "critical";
  occurredAt: string;
}

export interface TechnicalLogEvent {
  requestId: string;
  message: string;
  level: "debug" | "info" | "warn" | "error";
  occurredAt: string;
}

export function createFachlicheAuditEvent(
  input: Omit<FachlicheAuditEvent, "auditEventId" | "occurredAt">,
): FachlicheAuditEvent {
  return {
    ...input,
    auditEventId: `audit.${crypto.randomUUID()}`,
    occurredAt: new Date().toISOString(),
  };
}
