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

// ── AiAssistPort — KI nur ASSISTIV/vorschlagend, transparent, EU-AI-Act limited-risk. ─────────────────
// Eine rechtsnahe Entscheidung trifft die KI NIE (sie bleibt menschlich, 4-Augen, serverseitig); jeder
// Vorschlag trägt das Pflicht-Transparenzmuster (Kennzeichnung/Quelle/Konfidenz/Warum/Override) und
// reviewRequired=true. OSS-first: das Modell kommt aus dem Provider (z.B. lokales Ollama), nie als Inline-Key.
export type AiAssistClass = "minimal" | "limited-risk" | "high-risk";

export interface AiSuggestRequest {
  /** Was assistiert werden soll, z.B. "adresse-vorschlag", "vollstaendigkeits-hinweis". */
  task: string;
  /** Strukturierter, PII-armer Kontext (synthetisch im Demo-Betrieb). */
  input: Record<string, unknown>;
  /** Höchste akzeptierte Klasse — high-risk wird abgelehnt (kein autonomes rechtsnahes Entscheiden). */
  maxClass?: AiAssistClass;
}

export interface AiSuggestion {
  /** Der Vorschlagswert — NIE eine Entscheidung. Der Aufrufer castet `value` fachlich. */
  value: unknown;
  /** 0..1 Konfidenz. */
  confidence: number;
  /** Welches Modell den Vorschlag erzeugt hat (OSS-first, z.B. "ollama:qwen3"). */
  modelId: string;
  /** Warum — für die Progressive-Disclosure-„Warum"-Affordance. */
  rationale: string;
  /** Quellen/Provenienz (z.B. Once-Only-Register, Wissensknoten). */
  sources: string[];
  /** Pflicht-Transparenzkennung (HCAI). */
  marking: "ki-vorschlag";
  /** EU-AI-Act-Einordnung — Assistenz ist limited-risk. */
  euAiActClass: AiAssistClass;
  /** IMMER true: die rechtsnahe Entscheidung bleibt menschlich (serverseitig erzwungen, 4-Augen). */
  reviewRequired: true;
}

export interface AiAssistPort {
  descriptor: CapabilityDescriptor;
  suggest(
    context: PortCallContext,
    request: AiSuggestRequest,
  ): Promise<CapabilityResponse<AiSuggestion>>;
}

// ── BlobStoragePort — der fehlende BYTE-Transfer (Nachweis-/Dokument-Upload). ──────────────────────────
// Die anderen Ports tragen nur `AttachmentRef` (eine Referenz: id/name/mime/size/checksum) — den echten
// Inhalt bewegt NIEMAND. Dieser Port schliesst die Luecke: `put` nimmt Bytes und gibt die Referenz
// (server-berechnete Groesse + SHA-256 ueber die Bytes = Integritaets-Token) zurueck; `get` liefert Bytes
// + Referenz zurueck. Austauschbar (In-Memory-Fake / Dateisystem / Objekt-Store) hinter EINEM Vertrag.
export interface BlobPutInput {
  fileName: string;
  mimeType: string;
  /** Der Roh-Inhalt. Uint8Array ist browser- UND node-neutral (kein Buffer im SDK). */
  bytes: Uint8Array;
}

export interface BlobObject {
  ref: AttachmentRef;
  bytes: Uint8Array;
}

export interface BlobStoragePort {
  descriptor: CapabilityDescriptor;
  put(
    context: PortCallContext,
    input: BlobPutInput,
  ): Promise<CapabilityResponse<AttachmentRef>>;
  get(
    context: PortCallContext,
    attachmentId: string,
  ): Promise<CapabilityResponse<BlobObject>>;
}

export interface PlatformPorts {
  identityAndTrust: IdentityAndTrustPort;
  aiAssist: AiAssistPort;
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
  blobStorage: BlobStoragePort;
}
