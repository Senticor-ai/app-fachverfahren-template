import type { PlatformPorts, PaymentPort } from "./ports.js";
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
    {
      name: "ai-assist suggests transparently and never decides",
      async run() {
        const suggestion = await ports.aiAssist.suggest(sampleContext(), {
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
        const refused = await ports.aiAssist.suggest(sampleContext(), {
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
