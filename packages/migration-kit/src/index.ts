export interface MigrationProfile {
  profileId: string;
  displayName: string;
  source: string;
  target: string;
  requiredArtifacts: string[];
  exitCriteria: string[];
}

export const migrationProfiles: MigrationProfile[] = [
  {
    profileId: "sql-server-babelfish",
    displayName: "SQL Server nach Babelfish",
    source: "SQL Server / T-SQL",
    target: "Babelfish migration bridge",
    requiredArtifacts: [
      "T-SQL compatibility analysis",
      "stored procedure and job inventory",
      "portability score",
      "native PostgreSQL target architecture",
      "sunset date",
      "dual-run reconciliation queries",
    ],
    exitCriteria: [
      "legacy application can run during transition",
      "data can be exported and operated as native PostgreSQL",
    ],
  },
  {
    profileId: "sql-server-postgresql",
    displayName: "SQL Server nach PostgreSQL",
    source: "SQL Server",
    target: "native PostgreSQL",
    requiredArtifacts: [
      "schema mapping",
      "data classification",
      "snapshot and delta migration plan",
      "rollback procedure",
    ],
    exitCriteria: ["reconciliation queries pass", "legacy system read-only"],
  },
  {
    profileId: "soap-xml-to-api",
    displayName: "SOAP/XML nach API",
    source: "SOAP/XML",
    target: "OpenAPI and event contracts",
    requiredArtifacts: [
      "interface inventory",
      "anti-corruption mapping",
      "contract-test suite",
    ],
    exitCriteria: ["contract tests pass", "cutover checklist signed"],
  },
  {
    profileId: "fileshare-to-object-storage",
    displayName: "Fileshare nach Object Storage",
    source: "file share",
    target: "object storage plus records-management metadata",
    requiredArtifacts: [
      "checksum manifest",
      "malware scan evidence",
      "retention mapping",
    ],
    exitCriteria: ["sample restore passes", "metadata reconciliation passes"],
  },
  {
    profileId: "cron-to-worker",
    displayName: "Cron nach Worker/Scheduler",
    source: "cron or batch jobs",
    target: "scheduler plus worker roles",
    requiredArtifacts: ["job inventory", "retry policy", "idempotency report"],
    exitCriteria: ["replay test passes", "failure recovery documented"],
  },
  {
    profileId: "ad-ldap-to-oidc",
    displayName: "AD/LDAP nach OIDC",
    source: "AD/LDAP",
    target: "OIDC identity and trust port",
    requiredArtifacts: [
      "role mapping",
      "assurance-level mapping",
      "logout/session behavior",
    ],
    exitCriteria: ["authorization tests pass", "key rotation test passes"],
  },
  {
    profileId: "legacy-dms",
    displayName: "Legacy DMS/eAkte",
    source: "legacy DMS",
    target: "records-management port",
    requiredArtifacts: [
      "record type mapping",
      "retention and legal hold mapping",
      "archive handover test",
    ],
    exitCriteria: ["records lookup passes", "archive export verified"],
  },
];
