export type CapabilityId =
  | "identity-and-trust"
  | "data-exchange"
  | "evidence-retrieval"
  | "payment"
  | "mailbox"
  | "signature-seal"
  | "authority-directory"
  | "records-management"
  | "notification"
  | "workflow"
  | "audit"
  | "ai-assist";

export type DataClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "special-category";

export type IdempotencyRequirement = "not-supported" | "optional" | "required";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  retryableStatusCodes: number[];
}

export interface PortSemantics {
  timeoutMs: number;
  retry: RetryPolicy;
  idempotency: IdempotencyRequirement;
}

export interface SchemaVersionRef {
  name: string;
  version: string;
  url?: string;
}

export interface CapabilityDescriptor {
  id: CapabilityId;
  name: string;
  version: string;
  provider: string;
  dataClassification: DataClassification;
  schemas: SchemaVersionRef[];
  semantics: PortSemantics;
}

export interface ActorRef {
  actorId: string;
  actorType: "citizen" | "employee" | "service" | "organization";
  displayName?: string;
  assuranceLevel?: string;
}

export interface PortCallContext {
  requestId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  actor?: ActorRef;
  purpose?: string;
  legalBasisId?: string;
  idempotencyKey?: string;
  deadline?: Date;
}

export interface CapabilityResult<T> {
  ok: true;
  value: T;
  providerRequestId?: string;
}

export interface CapabilityFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    classification: DataClassification;
    providerRequestId?: string;
  };
}

export type CapabilityResponse<T> = CapabilityResult<T> | CapabilityFailure;

export function capabilityOk<T>(
  value: T,
  providerRequestId?: string,
): CapabilityResult<T> {
  return {
    ok: true,
    value,
    ...(providerRequestId ? { providerRequestId } : {}),
  };
}

export function capabilityFailure(
  code: string,
  message: string,
  options: {
    retryable?: boolean;
    classification?: DataClassification;
    providerRequestId?: string;
  } = {},
): CapabilityFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable: options.retryable ?? false,
      classification: options.classification ?? "internal",
      ...(options.providerRequestId
        ? { providerRequestId: options.providerRequestId }
        : {}),
    },
  };
}

export const defaultSemantics: PortSemantics = {
  timeoutMs: 10_000,
  retry: {
    maxAttempts: 2,
    backoffMs: 250,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },
  idempotency: "required",
};
