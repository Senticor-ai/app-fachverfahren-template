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

/** Leichtgewichtiges Audit-Ereignis für App-Daten-Schreibzugriffe (Preferences,
 *  Mailbox): bewusst OHNE legalBasisId/purpose — eine Rechtsgrundlage wird nie
 *  gefaked. Fachliche Ereignisse mit Rechtsgrundlage nutzen FachlicheAuditEvent;
 *  der Workspace-AuditStore in @senticor/app-store-postgres (Admin-/Login-Ereignisse,
 *  eigener Katalog) ist ein DRITTES, davon unabhängiges Konzept. */
export interface AppDataAuditEvent {
  auditEventId: string;
  eventType: string;
  actorId: string;
  tenantId: string;
  requestId: string;
  summary: string;
  resource?: { type: string; id: string };
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

export function createAppDataAuditEvent(
  input: Omit<AppDataAuditEvent, "auditEventId" | "occurredAt">,
): AppDataAuditEvent {
  return {
    ...input,
    auditEventId: `audit.${crypto.randomUUID()}`,
    occurredAt: new Date().toISOString(),
  };
}

export function createSecurityEvent(
  input: Omit<SecurityEvent, "securityEventId" | "occurredAt">,
): SecurityEvent {
  return {
    ...input,
    securityEventId: `security.${crypto.randomUUID()}`,
    occurredAt: new Date().toISOString(),
  };
}
