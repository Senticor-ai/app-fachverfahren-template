import type { ServiceBinding } from "@senticor/public-sector-sdk";

export interface ManagedServiceProfile {
  service: ServiceBinding["service"];
  profile: string;
  authoritativeUse: string;
  guardrails: string[];
  portabilityEvidence: string[];
}

export const codesphereServiceProfiles: ManagedServiceProfile[] = [
  {
    service: "postgresql",
    profile: "transactional-system-of-record",
    authoritativeUse: "default transactional case and application data store",
    guardrails: [
      "schema migrations run via migrator job",
      "backup and point-in-time recovery must be tested",
      "transactional outbox is required for emitted domain events",
      "tenant isolation mode must be declared before production",
    ],
    portabilityEvidence: [
      "standard PostgreSQL dump/restore",
      "migration rollback record",
      "restore test result",
    ],
  },
  {
    service: "babelfish",
    profile: "sql-server-migration-bridge",
    authoritativeUse: "temporary compatibility bridge for legacy T-SQL systems",
    guardrails: [
      "not a greenfield default",
      "requires T-SQL compatibility report",
      "requires native PostgreSQL target architecture",
      "requires sunset date",
    ],
    portabilityEvidence: [
      "compatibility score",
      "native PostgreSQL export proof",
      "dual-run reconciliation report",
    ],
  },
  {
    service: "object-storage",
    profile: "document-bytes-and-large-artifacts",
    authoritativeUse: "document bytes, large artifacts, quarantine objects",
    guardrails: [
      "metadata and access policy remain in PostgreSQL",
      "checksum and immutable document IDs required",
      "malware quarantine workflow required",
      "handover to records-management port required for eAkte/archive",
    ],
    portabilityEvidence: [
      "checksum manifest",
      "object listing export",
      "retention class mapping",
    ],
  },
  {
    service: "valkey",
    profile: "ephemeral-cache-and-idempotency",
    authoritativeUse: "cache, rate limits, short sessions, idempotency records",
    guardrails: [
      "never authoritative case database",
      "all values must have expiry or declared lifecycle",
    ],
    portabilityEvidence: ["cache flush procedure", "idempotency replay test"],
  },
  {
    service: "rabbitmq",
    profile: "async-application-processing",
    authoritativeUse: "work queues and schema-versioned domain events",
    guardrails: [
      "transactional outbox/inbox required",
      "idempotent consumers required",
      "dead-letter and replay policy required",
      "correlation and causation IDs required",
    ],
    portabilityEvidence: [
      "AsyncAPI catalogue",
      "poison-message test",
      "lost-ack reconciliation test",
    ],
  },
  {
    service: "opensearch",
    profile: "rebuildable-read-model",
    authoritativeUse: "authorization-aware business search read models",
    guardrails: [
      "never authoritative case record",
      "PII field allowlist required",
      "index version and reindex strategy required",
      "deletion propagation test required",
    ],
    portabilityEvidence: [
      "index mapping export",
      "reindex runbook",
      "stale-index failure test",
    ],
  },
];

export function codesphereBindings(): ServiceBinding[] {
  return codesphereServiceProfiles.map((profile) => ({
    bindingId: `codesphere.${profile.service}`,
    service: profile.service,
    provider: "codesphere",
    classification:
      profile.service === "rabbitmq" || profile.service === "opensearch"
        ? "internal"
        : "confidential",
    secretRef: `codesphere-${profile.service}`,
    endpointRef: `codesphere-${profile.service}`,
    profile: profile.profile,
  }));
}
