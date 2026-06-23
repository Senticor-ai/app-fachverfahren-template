import type {
  ActorRef,
  CapabilityDescriptor,
  CapabilityResponse,
  PortCallContext,
} from "./capabilities.js";

export interface IdentityProfile {
  subjectId: string;
  displayName: string;
  assuranceLevel: string;
  identityProvider: string;
  identifiers: Record<string, string>;
  representedOrganizationId?: string;
}

export interface IdentityAndTrustPort {
  descriptor: CapabilityDescriptor;
  getCurrentIdentity(
    context: PortCallContext,
  ): Promise<CapabilityResponse<IdentityProfile>>;
  requireAssurance(
    context: PortCallContext,
    minimumAssuranceLevel: string,
  ): Promise<CapabilityResponse<{ accepted: boolean; stepUpUrl?: string }>>;
}

export interface DataEnvelope {
  envelopeId: string;
  schema: string;
  schemaVersion: string;
  payloadRef: string;
  attachments: AttachmentRef[];
  destinationId: string;
}

export interface AttachmentRef {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface DataExchangePort {
  descriptor: CapabilityDescriptor;
  submitEnvelope(
    context: PortCallContext,
    envelope: DataEnvelope,
  ): Promise<CapabilityResponse<{ submissionId: string }>>;
  getSubmissionStatus(
    context: PortCallContext,
    submissionId: string,
  ): Promise<CapabilityResponse<{ status: "queued" | "sent" | "failed" }>>;
}

export interface EvidenceRequest {
  evidenceType: string;
  subjectId: string;
  purpose: string;
  consentRef?: string;
  acceptedSchemaVersions: string[];
}

export interface EvidenceRecord {
  evidenceId: string;
  evidenceType: string;
  schemaVersion: string;
  issuedAt: string;
  issuerAuthorityId: string;
  documentRef?: AttachmentRef;
  attributes?: Record<string, unknown>;
}

export interface EvidenceRetrievalPort {
  descriptor: CapabilityDescriptor;
  requestEvidence(
    context: PortCallContext,
    request: EvidenceRequest,
  ): Promise<CapabilityResponse<EvidenceRecord>>;
}

export interface PaymentRequest {
  amountMinor: number;
  currency: "EUR";
  purpose: string;
  debtor?: ActorRef;
  returnUrl?: string;
  reference: string;
}

export interface PaymentStatus {
  paymentId: string;
  status: "created" | "pending" | "completed" | "failed" | "refunded";
  amountMinor: number;
  currency: "EUR";
  providerReference?: string;
}

export interface PaymentPort {
  descriptor: CapabilityDescriptor;
  createPayment(
    context: PortCallContext,
    request: PaymentRequest,
  ): Promise<CapabilityResponse<PaymentStatus>>;
  getPaymentStatus(
    context: PortCallContext,
    paymentId: string,
  ): Promise<CapabilityResponse<PaymentStatus>>;
}

export interface MailboxMessage {
  messageId: string;
  recipientId: string;
  subject: string;
  bodyText: string;
  attachments: AttachmentRef[];
}

export interface MailboxPort {
  descriptor: CapabilityDescriptor;
  sendMessage(
    context: PortCallContext,
    message: MailboxMessage,
  ): Promise<CapabilityResponse<{ deliveryId: string }>>;
  getDeliveryStatus(
    context: PortCallContext,
    deliveryId: string,
  ): Promise<CapabilityResponse<{ status: "queued" | "delivered" | "failed" }>>;
}

export interface SignatureSealPort {
  descriptor: CapabilityDescriptor;
  validateSignature(
    context: PortCallContext,
    document: AttachmentRef,
  ): Promise<CapabilityResponse<{ valid: boolean; signer?: string }>>;
  createSeal(
    context: PortCallContext,
    document: AttachmentRef,
  ): Promise<CapabilityResponse<{ sealedDocument: AttachmentRef }>>;
}

export interface AuthorityDirectoryEntry {
  authorityId: string;
  displayName: string;
  authorityType: string;
  jurisdictionIds: string[];
  serviceEndpointIds: string[];
}

export interface AuthorityDirectoryPort {
  descriptor: CapabilityDescriptor;
  findAuthority(
    context: PortCallContext,
    query: {
      authorityId?: string;
      serviceKey?: string;
      jurisdictionId?: string;
    },
  ): Promise<CapabilityResponse<AuthorityDirectoryEntry[]>>;
}

export interface RecordDocument {
  recordId: string;
  title: string;
  document: AttachmentRef;
  retentionPolicyId: string;
  legalHold: boolean;
}

export interface RecordsManagementPort {
  descriptor: CapabilityDescriptor;
  fileRecord(
    context: PortCallContext,
    record: RecordDocument,
  ): Promise<CapabilityResponse<{ archiveRecordId: string }>>;
}

export interface NotificationPort {
  descriptor: CapabilityDescriptor;
  notify(
    context: PortCallContext,
    notification: { recipientId: string; channel: string; templateId: string },
  ): Promise<CapabilityResponse<{ notificationId: string }>>;
}

export interface WorkflowPort {
  descriptor: CapabilityDescriptor;
  startWorkflow(
    context: PortCallContext,
    workflow: { workflowKey: string; businessKey: string; input: unknown },
  ): Promise<CapabilityResponse<{ workflowInstanceId: string }>>;
  signalWorkflow(
    context: PortCallContext,
    signal: {
      workflowInstanceId: string;
      signalName: string;
      payload?: unknown;
    },
  ): Promise<CapabilityResponse<{ accepted: boolean }>>;
}

export interface AuditPort {
  descriptor: CapabilityDescriptor;
  appendEvent(
    context: PortCallContext,
    event: {
      eventType: string;
      caseId?: string;
      legalBasisId?: string;
      previousState?: string;
      newState?: string;
      summary: string;
    },
  ): Promise<CapabilityResponse<{ auditEventId: string }>>;
}

export interface PlatformPorts {
  identityAndTrust: IdentityAndTrustPort;
  dataExchange: DataExchangePort;
  evidenceRetrieval: EvidenceRetrievalPort;
  payment: PaymentPort;
  mailbox: MailboxPort;
  signatureSeal: SignatureSealPort;
  authorityDirectory: AuthorityDirectoryPort;
  recordsManagement: RecordsManagementPort;
  notification: NotificationPort;
  workflow: WorkflowPort;
  audit: AuditPort;
}
