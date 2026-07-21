import {
  capabilityFailure,
  capabilityOk,
  defaultSemantics,
  type CapabilityDescriptor,
} from "./capabilities.js";
import type {
  AiAssistPort,
  AiSuggestion,
  AttachmentRef,
  AuditPort,
  AuthorityDirectoryPort,
  BlobObject,
  BlobStoragePort,
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

/** SHA-256 (Hex) über die Bytes — browser- UND node-neutral via WebCrypto (kein node:crypto im SDK).
 *  Die ArrayBuffer-gestützte Kopie stellt einen gültigen `BufferSource` sicher (TS-6 schließt
 *  SharedArrayBuffer-gestützte Views aus). */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * In-Memory-BlobStoragePort als eigenständige Fabrik (wie createLocalAiAssistPort): hält die Bytes in einer
 * Map, berechnet Größe + SHA-256 server-seitig (das Integritäts-Token, nicht vom Client geliefert). Ein
 * echter Adapter (Dateisystem/Objekt-Store) implementiert denselben Vertrag und besteht dieselbe Conformance.
 */
export function createLocalBlobStoragePort(): BlobStoragePort {
  const blobs = new Map<string, BlobObject>();
  return {
    descriptor: descriptor("blob-storage", "Local Blob Storage", "confidential"),
    async put(_context, input) {
      const attachmentId = id("att");
      const ref: AttachmentRef = {
        attachmentId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        // Größe + Prüfsumme kommen vom SERVER über die Bytes — nie vom Client behauptet.
        sizeBytes: input.bytes.byteLength,
        checksumSha256: await sha256Hex(input.bytes),
      };
      blobs.set(attachmentId, { ref, bytes: input.bytes });
      return capabilityOk(ref);
    },
    async get(_context, attachmentId) {
      const found = blobs.get(attachmentId);
      if (!found)
        return capabilityFailure(
          "blob-storage/not-found",
          `unbekannte Anlage ${attachmentId}`,
          { classification: "confidential" },
        );
      return capabilityOk(found);
    },
  };
}

/**
 * Der lokale AI-Assist-Fake als EIGENSTÄNDIGE Fabrik (nicht nur als Feld im 12-Port-Bündel), damit die
 * Port-Registry ihn im „local"-Modus direkt nutzen kann, OHNE elf ungenutzte Ports zu konstruieren.
 * OSS-first: das Modell setzt der Provider/die Runtime (lokales Ollama als Default), KEIN Inline-Key.
 * Wahrt die HCAI-Invarianten (Kennzeichnung, `reviewRequired`, `limited-risk`, high-risk-Ablehnung).
 */
export function createLocalAiAssistPort(
  options: { aiAssistModel?: string } = {},
): AiAssistPort {
  return {
    descriptor: descriptor(
      "ai-assist",
      "Local AI Assist (OSS-first)",
      "confidential",
    ),
    async suggest(_context, request) {
      // OSS-first: Modell vom Provider/Runtime gesetzt (lokales Ollama als Default), KEIN Inline-Key.
      const modelId = options.aiAssistModel ?? "ollama:qwen3";
      // KI assistiert nie rechtsnah autonom: high-risk-Aufgaben werden abgelehnt.
      if (request.maxClass === "high-risk") {
        return capabilityFailure(
          "ai-assist/high-risk-refused",
          "KI darf rechtsnahe Entscheidungen nicht autonom treffen (assistiv/limited-risk).",
          { retryable: false, classification: "confidential" },
        );
      }
      const suggestion: AiSuggestion = {
        value: request.input,
        confidence: 0.5,
        modelId,
        rationale: `Lokaler OSS-Vorschlag (${modelId}) für Aufgabe '${request.task}' — synthetisch, menschlich zu prüfen.`,
        sources: ["local-fake"],
        marking: "ki-vorschlag",
        euAiActClass: "limited-risk",
        reviewRequired: true,
      };
      return capabilityOk(suggestion);
    },
  };
}

/**
 * Der lokale PaymentPort als EIGENSTÄNDIGE Fabrik (wie createLocalAiAssistPort), damit die Port-Registry
 * ihn im „local"-Modus direkt nutzen kann. Hält die Zahlungen in einer eigenen Map; jede createPayment
 * fingiert einen sofort abgeschlossenen Roundtrip (deterministisch, ohne Netz/ePayBL). Für den Durchstich.
 */
export function createLocalPaymentPort(): PaymentPort {
  const payments = new Map<string, { amountMinor: number; reference: string }>();
  return {
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
}

/**
 * Der lokale IdentityAndTrustPort als EIGENSTÄNDIGE Fabrik (wie createLocalAiAssistPort). Zustandslos: liest die
 * Identität aus dem Aufruf-Kontext (der Aufrufer/BFF setzt actor aus der Sitzung); die Assurance wird lokal
 * akzeptiert. Deterministisch, ohne BundID/eID-Server. Für den Durchstich (später echter DeutschlandID-Adapter).
 */
export function createLocalIdentityAndTrustPort(): IdentityAndTrustPort {
  return {
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
}

export function createLocalPlatformPorts(
  options: { aiAssistModel?: string } = {},
): PlatformPorts {
  const deliveries = new Map<string, "queued" | "delivered" | "failed">();

  // EINE Wahrheit: dieselbe Identitäts-Impl wie die eigenständige Fabrik.
  const identityAndTrust: IdentityAndTrustPort =
    createLocalIdentityAndTrustPort();

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

  // EINE Wahrheit: dieselbe Zahlungs-Impl wie die eigenständige Fabrik (kein zweiter Roundtrip-Klon).
  const payment: PaymentPort = createLocalPaymentPort();

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

  const aiAssist = createLocalAiAssistPort(options);
  const blobStorage = createLocalBlobStoragePort();

  return {
    identityAndTrust,
    aiAssist,
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
    blobStorage,
  };
}
