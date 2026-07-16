export interface Actor {
  actorId: string;
  actorType: "citizen" | "employee" | "service" | "organization";
  displayName: string;
}

export interface Subject {
  subjectId: string;
  subjectType: "person" | "organization" | "property" | "object";
  displayName?: string;
}

export interface Representation {
  representationId: string;
  actorId: string;
  subjectId: string;
  validFrom: string;
  validTo?: string;
  evidenceId?: string;
}

export interface Mandate {
  mandateId: string;
  representationId: string;
  scope: string[];
  legalBasisId: string;
}

export interface Procedure {
  procedureId: string;
  displayName: string;
  currentVersion: string;
}

export interface ProcedureVersion {
  procedureId: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legalBasisIds: string[];
  allowedStates: string[];
  allowedTransitions: CaseTransition[];
}

export interface Application {
  applicationId: string;
  procedureId: string;
  procedureVersion: string;
  subjectIds: string[];
  submittedAt?: string;
}

export interface Case {
  caseId: string;
  procedureId: string;
  procedureVersion: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  state: string;
  version: number;
  subjectIds: string[];
  openedAt: string;
  closedAt?: string;
}

export interface CaseTransition {
  from: string;
  to: string;
  action: string;
  requiredPermission: string;
  requiresFourEyes?: boolean;
  /** Schließt dieser Übergang den Fall? Dann wird `closedAt` gestempelt. Data-driven statt eines hart
   *  kodierten Zielzustand-Namens — jedes Verfahren benennt seinen Endzustand selbst (z. B. „abgeschlossen"). */
  closesCase?: boolean;
}

export interface Task {
  taskId: string;
  caseId: string;
  title: string;
  state: "open" | "claimed" | "completed" | "cancelled";
  assignedTo?: string;
  dueAt?: string;
}

export interface Deadline {
  deadlineId: string;
  caseId: string;
  kind: string;
  dueAt: string;
  calendarId: string;
}

export interface Evidence {
  evidenceId: string;
  caseId: string;
  evidenceType: string;
  provenance: {
    source: string;
    retrievedAt: string;
    consentRef?: string;
  };
}

export interface Decision {
  decisionId: string;
  caseId: string;
  decisionType: string;
  decidedAt: string;
  decidedBy: string;
  legalBasisIds: string[];
}

export interface Document {
  documentId: string;
  caseId: string;
  version: number;
  title: string;
  mimeType: string;
  checksumSha256: string;
  retentionPolicyId: string;
}

export interface Communication {
  communicationId: string;
  caseId: string;
  channel: "mailbox" | "email" | "letter" | "in-person";
  direction: "inbound" | "outbound";
  sentAt?: string;
  receivedAt?: string;
}

export interface Payment {
  paymentId: string;
  caseId: string;
  amountMinor: number;
  currency: "EUR";
  status: "created" | "pending" | "completed" | "failed" | "refunded";
}

export interface RetentionRule {
  retentionPolicyId: string;
  displayName: string;
  retentionPeriod: string;
  disposalAction: "review" | "delete" | "archive";
}

export interface LegalBasisReference {
  legalBasisId: string;
  title: string;
  uri?: string;
  validFrom: string;
  validTo?: string;
}

export function transitionCase(
  currentCase: Case,
  procedureVersion: ProcedureVersion,
  action: string,
  expectedVersion: number,
): Case {
  if (currentCase.version !== expectedVersion) {
    throw new Error("case version conflict");
  }
  if (currentCase.procedureVersion !== procedureVersion.version) {
    throw new Error("procedure version mismatch");
  }
  const transition = procedureVersion.allowedTransitions.find(
    (candidate) =>
      candidate.from === currentCase.state && candidate.action === action,
  );
  if (!transition) {
    throw new Error(`invalid case transition: ${currentCase.state}/${action}`);
  }
  const next: Case = {
    ...currentCase,
    state: transition.to,
    version: currentCase.version + 1,
  };
  if (transition.closesCase === true) {
    next.closedAt = new Date().toISOString();
  } else {
    // Nicht-schließender Übergang (z. B. Wiederaufnahme aus dem Endzustand) entfernt eine ggf. gesetzte
    // Schließzeit wieder — ein wiederaufgenommener Fall ist nicht mehr „geschlossen am".
    delete next.closedAt;
  }
  return next;
}

/** Nachschlage-Naht über die VerfahrensVersionen (die Prozess-/Zustandsmaschine + Rechtsgrundlagen als DATEN). Der
 *  Server (BFF) löst zu einer Akte ihre `ProcedureVersion` auf, um `allowedStates`/`allowedTransitions` und
 *  `legalBasisIds` NICHT zu erfinden — eine Rechtsgrundlage wird nie gefaked. Gefüttert aus der `leistung.config`/
 *  BPMN-Ableitung (ADR-0002); in Produktion kann chos die Registry hinter derselben Naht liefern. */
export interface ProcedureRegistry {
  get(procedureId: string, version: string): ProcedureVersion | undefined;
  /** Alle registrierten Verfahren-Versionen (z. B. damit ein Anlege-Formular sie zur Wahl anbietet). */
  list(): ProcedureVersion[];
}

/** Baut eine In-Memory-`ProcedureRegistry` aus einer Liste von VerfahrensVersionen (Template-Stub/Standalone). */
export function createInMemoryProcedureRegistry(
  versions: readonly ProcedureVersion[],
): ProcedureRegistry {
  const byKey = new Map(
    versions.map((version) => [
      `${version.procedureId}:${version.version}`,
      version,
    ]),
  );
  return {
    get: (procedureId, version) => byKey.get(`${procedureId}:${version}`),
    list: () => [...byKey.values()],
  };
}
