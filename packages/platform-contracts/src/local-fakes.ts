import {
  capabilityOk,
  defaultSemantics,
  type CapabilityDescriptor,
} from "./capabilities.js";
import type {
  AuditPort,
  AuthorityDirectoryPort,
  DataExchangePort,
  EvidenceRetrievalPort,
  IdentityAndTrustPort,
  MailboxPort,
  PaymentPort,
  PlatformPorts,
  RecordsManagementPort,
  SignatureSealPort,
  WorkflowPort,
} from "./ports.js";

function descriptor(
  id: CapabilityDescriptor["id"],
  name: string,
  dataClassification: CapabilityDescriptor["dataClassification"] = "internal",
): CapabilityDescriptor {
  return {
    id,
    name,
    version: "0.1.0-local",
    provider: "local-fake",
    dataClassification,
    schemas: [],
    semantics: defaultSemantics,
  };
}

function id(prefix: string) {
  return `${prefix}.${crypto.randomUUID()}`;
}

export function createLocalPlatformPorts(): PlatformPorts {
  const payments = new Map<
    string,
    { amountMinor: number; reference: string }
  >();
  const deliveries = new Map<string, "queued" | "delivered" | "failed">();

  const identityAndTrust: IdentityAndTrustPort = {
    descriptor: descriptor(
      "identity-and-trust",
      "Local Identity and Trust",
      "confidential",
    ),
    async getCurrentIdentity(context) {
      return capabilityOk({
        subjectId: context.actor?.actorId ?? "local.employee",
        displayName: context.actor?.displayName ?? "Lokale Demo",
        assuranceLevel: context.actor?.assuranceLevel ?? "local-low",
        identityProvider: "local",
        identifiers: {},
      });
    },
    async requireAssurance(_context, _minimumAssuranceLevel) {
      return capabilityOk({ accepted: true });
    },
  };

  const dataExchange: DataExchangePort = {
    descriptor: descriptor(
      "data-exchange",
      "Local Data Exchange",
      "restricted",
    ),
    async submitEnvelope(_context, _envelope) {
      return capabilityOk({ submissionId: id("submission") });
    },
    async getSubmissionStatus(_context, _submissionId) {
      return capabilityOk({ status: "sent" });
    },
  };

  const evidenceRetrieval: EvidenceRetrievalPort = {
    descriptor: descriptor(
      "evidence-retrieval",
      "Local Evidence Retrieval",
      "restricted",
    ),
    async requestEvidence(_context, request) {
      return capabilityOk({
        evidenceId: id("evidence"),
        evidenceType: request.evidenceType,
        schemaVersion: request.acceptedSchemaVersions[0] ?? "local.v1",
        issuedAt: new Date().toISOString(),
        issuerAuthorityId: "authority.local",
        attributes: { localFake: true },
      });
    },
  };

  const payment: PaymentPort = {
    descriptor: descriptor("payment", "Local Payment", "confidential"),
    async createPayment(_context, request) {
      const paymentId = id("payment");
      payments.set(paymentId, {
        amountMinor: request.amountMinor,
        reference: request.reference,
      });
      return capabilityOk({
        paymentId,
        status: "completed",
        amountMinor: request.amountMinor,
        currency: request.currency,
        providerReference: request.reference,
      });
    },
    async getPaymentStatus(_context, paymentId) {
      const stored = payments.get(paymentId);
      return capabilityOk({
        paymentId,
        status: stored ? "completed" : "failed",
        amountMinor: stored?.amountMinor ?? 0,
        currency: "EUR",
        ...(stored ? { providerReference: stored.reference } : {}),
      });
    },
  };

  const mailbox: MailboxPort = {
    descriptor: descriptor("mailbox", "Local Mailbox", "confidential"),
    async sendMessage(_context, _message) {
      const deliveryId = id("delivery");
      deliveries.set(deliveryId, "delivered");
      return capabilityOk({ deliveryId });
    },
    async getDeliveryStatus(_context, deliveryId) {
      return capabilityOk({ status: deliveries.get(deliveryId) ?? "failed" });
    },
  };

  const signatureSeal: SignatureSealPort = {
    descriptor: descriptor("signature-seal", "Local Signature and Seal"),
    async validateSignature() {
      return capabilityOk({ valid: true, signer: "local-signer" });
    },
    async createSeal(_context, document) {
      return capabilityOk({ sealedDocument: document });
    },
  };

  const authorityDirectory: AuthorityDirectoryPort = {
    descriptor: descriptor("authority-directory", "Local Authority Directory"),
    async findAuthority(context, query) {
      return capabilityOk([
        {
          authorityId: query.authorityId ?? context.authorityId,
          displayName: "Lokale Behörde",
          authorityType: "municipality",
          jurisdictionIds: [query.jurisdictionId ?? context.jurisdictionId],
          serviceEndpointIds: [],
        },
      ]);
    },
  };

  const recordsManagement: RecordsManagementPort = {
    descriptor: descriptor(
      "records-management",
      "Local Records Management",
      "restricted",
    ),
    async fileRecord() {
      return capabilityOk({ archiveRecordId: id("archive") });
    },
  };

  const notification: PlatformPorts["notification"] = {
    descriptor: descriptor("notification", "Local Notification"),
    async notify() {
      return capabilityOk({ notificationId: id("notification") });
    },
  };

  const workflow: WorkflowPort = {
    descriptor: descriptor("workflow", "Local Workflow"),
    async startWorkflow() {
      return capabilityOk({ workflowInstanceId: id("workflow") });
    },
    async signalWorkflow() {
      return capabilityOk({ accepted: true });
    },
  };

  const audit: AuditPort = {
    descriptor: descriptor("audit", "Local Audit", "restricted"),
    async appendEvent() {
      return capabilityOk({ auditEventId: id("audit") });
    },
  };

  return {
    identityAndTrust,
    dataExchange,
    evidenceRetrieval,
    payment,
    mailbox,
    signatureSeal,
    authorityDirectory,
    recordsManagement,
    notification,
    workflow,
    audit,
  };
}
