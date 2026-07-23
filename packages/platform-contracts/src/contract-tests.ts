import type {
  AiAssistPort,
  BlobStoragePort,
  PlatformPorts,
  PaymentPort,
} from "./ports.js";
import type { PortCallContext } from "./capabilities.js";

export interface ContractScenario {
  name: string;
  run: () => Promise<void>;
}

export function sampleContext(
  overrides: Partial<PortCallContext> = {},
): PortCallContext {
  return {
    requestId: "req.contract-test",
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    actor: {
      actorId: "employee.local",
      actorType: "employee",
      displayName: "Contract Test",
    },
    purpose: "contract-test",
    legalBasisId: "legal.local",
    idempotencyKey: "idem.contract-test",
    ...overrides,
  };
}

export function paymentContractScenarios(
  payment: PaymentPort,
): ContractScenario[] {
  return [
    {
      name: "payment create/get roundtrip",
      async run() {
        const created = await payment.createPayment(sampleContext(), {
          amountMinor: 4200,
          currency: "EUR",
          purpose: "contract test",
          reference: "CONTRACT-TEST",
        });
        if (!created.ok) {
          throw new Error(created.error.message);
        }
        const status = await payment.getPaymentStatus(
          sampleContext(),
          created.value.paymentId,
        );
        if (!status.ok || status.value.status !== "completed") {
          throw new Error("payment status did not complete");
        }
      },
    },
  ];
}

/**
 * Conformance-Szenarien für JEDE beliebige `AiAssistPort`-Impl (local-fake ODER echter Adapter, z.B.
 * Ollama). Der Kern der Austauschbarkeit: eine Impl ist genau dann substituierbar, wenn sie DIESE
 * Szenarien besteht. Sie prüfen die HCAI-/EU-AI-Act-Invarianten, die ein Adapter WAHREN muss, egal was
 * das Modell liefert: transparente Kennzeichnung + `reviewRequired`, `limited-risk`, und die Ablehnung
 * high-risk-autonomer Entscheidungen (VOR jedem Modellaufruf).
 */
export function aiAssistContractScenarios(
  aiAssist: AiAssistPort,
): ContractScenario[] {
  return [
    {
      name: "ai-assist suggests transparently and never decides",
      async run() {
        const suggestion = await aiAssist.suggest(sampleContext(), {
          task: "adresse-vorschlag",
          input: { plz: "00000" },
        });
        if (!suggestion.ok) {
          throw new Error("ai-assist suggest failed");
        }
        const s = suggestion.value;
        if (s.marking !== "ki-vorschlag" || s.reviewRequired !== true) {
          throw new Error(
            "ai-assist suggestion missing transparency/human-review markers",
          );
        }
        if (s.euAiActClass !== "limited-risk") {
          throw new Error("ai-assist must be limited-risk (assistive only)");
        }
      },
    },
    {
      name: "ai-assist refuses high-risk autonomous decisions",
      async run() {
        const refused = await aiAssist.suggest(sampleContext(), {
          task: "binding-legal-decision",
          input: {},
          maxClass: "high-risk",
        });
        if (refused.ok) {
          throw new Error(
            "ai-assist must refuse high-risk autonomous decisions",
          );
        }
      },
    },
  ];
}

/**
 * Conformance-Szenarien für JEDE `BlobStoragePort`-Impl (In-Memory-Fake / Dateisystem / Objekt-Store): der
 * Byte-Roundtrip muss die Bytes EXAKT erhalten, die server-berechnete SHA-256 muss über die gelieferten
 * Bytes stimmen (Integritäts-Token), und ein `get` auf eine unbekannte Kennung scheitert sauber (kein leerer
 * Erfolg). Wer das besteht, ist substituierbar.
 */
export function blobStorageContractScenarios(
  blob: BlobStoragePort,
): ContractScenario[] {
  return [
    {
      name: "blob put/get roundtrip preserves bytes and checksum",
      async run() {
        const inhalt = "Nachweis-Inhalt (synthetisch)";
        const bytes = new TextEncoder().encode(inhalt);
        const put = await blob.put(sampleContext(), {
          fileName: "nachweis.txt",
          mimeType: "text/plain",
          bytes,
        });
        if (!put.ok) throw new Error("blob put failed");
        if (put.value.sizeBytes !== bytes.byteLength) {
          throw new Error("blob size not computed from bytes");
        }
        const got = await blob.get(sampleContext(), put.value.attachmentId);
        if (!got.ok) throw new Error("blob get failed");
        if (new TextDecoder().decode(got.value.bytes) !== inhalt) {
          throw new Error("blob bytes not preserved across roundtrip");
        }
        if (got.value.ref.checksumSha256 !== put.value.checksumSha256) {
          throw new Error("blob checksum inconsistent across roundtrip");
        }
      },
    },
    {
      name: "blob get of unknown id fails cleanly (no empty success)",
      async run() {
        const got = await blob.get(sampleContext(), "att.does-not-exist");
        if (got.ok) throw new Error("blob get of unknown id must fail");
      },
    },
  ];
}

export function platformContractScenarios(
  ports: PlatformPorts,
): ContractScenario[] {
  return [
    ...paymentContractScenarios(ports.payment),
    {
      name: "identity fake returns actor context",
      async run() {
        const identity =
          await ports.identityAndTrust.getCurrentIdentity(sampleContext());
        if (!identity.ok || identity.value.subjectId !== "employee.local") {
          throw new Error("identity port did not preserve actor context");
        }
      },
    },
    ...aiAssistContractScenarios(ports.aiAssist),
    ...blobStorageContractScenarios(ports.blobStorage),
  ];
}
