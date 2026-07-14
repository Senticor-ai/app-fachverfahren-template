# BSI IT-Grundschutz — Baustein-Mapping (Fachverfahren-Template)

Version: 1.0.0 · Stand: 2026-07-14

Dieses Dokument ordnet relevante BSI-IT-Grundschutz-Bausteine konkreten Kontrollen im
Template zu — mit **Code-/Config-Beleg** und **ehrlichem Status**. Es ist ein
**Template-Profil**: ein generiertes Fachverfahren erbt die als _erfüllt_ markierten
Kontrollen; die _offenen_/_teilweisen_ Punkte sind vor einem Produktivbetrieb zu schließen
(kein Compliance-Versprechen). Das Gate `scripts/check-bsi-grundschutz.mjs` prüft, dass jeder
zitierte Beleg-Pfad im Repository existiert (kein Overclaiming).

Status-Werte: `erfüllt` · `teilweise` · `offen`.

## Bausteine

| Baustein          | Anforderung (verkürzt)                                                      | Status    | Beleg                                                                                                                                                                                   | Lücke / Nächster Schritt                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORP.4             | Identitäts- und Berechtigungsmanagement (RBAC, Least Privilege, Vier-Augen) | teilweise | `packages/public-sector-sdk/src/authorization.ts` · `packages/public-sector-sdk/src/case-service.ts`                                                                                    | Keine produktive Authentifizierung (nur Header-Test-Modus). Offen: OIDC/JWKS-Verifier + Assurance-Gate (Welle 1/2 Auth).                                                  |
| ORP.4.A           | Vier-Augen-Prinzip server-autoritativ, bypass-gehärtet                      | erfüllt   | `packages/public-sector-sdk/src/case-service.ts` · `packages/fachverfahren-kit/src/store.ts`                                                                                            | Gegen `previousApproverActorId` erzwungen; Service-Actor kann nie freigeben.                                                                                              |
| ORP.4.B           | Rollen-Rechte default-deny                                                  | erfüllt   | `packages/public-sector-sdk/src/authorization.ts`                                                                                                                                       | `DefaultDenyPolicyEngine` verweigert ohne explizite Permission.                                                                                                           |
| APP.3.1           | Sichere Webanwendung: Security-Header, Rate-Limit, Origin-Kontrolle         | erfüllt   | `apps/fachverfahren/server/index.ts` · `apps/fachverfahren/server/http-guards.ts`                                                                                                       | CSP/HSTS/nosniff/Referrer-/Permissions-Policy, Host-Allowlist→421, Rate-Limit, Request-ID-Korrelation.                                                                    |
| APP.3.1.A         | Service-Actor-Impersonation strukturell gesperrt                            | erfüllt   | `apps/fachverfahren/server/http-guards.ts` · `packages/public-sector-sdk/src/case-service.ts`                                                                                           | reservierte Service-Actor-IDs werden an der HTTP-Grenze mit 403 abgewiesen.                                                                                               |
| CON.3             | Revisionssichere, unveränderbare Protokollierung (Audit)                    | erfüllt   | `packages/app-store-postgres/migrations/20260709120100_audit_append_only/migration.sql` · `packages/app-store-postgres/migrations/20260712100100_task_collab_append_only/migration.sql` | Append-only DB-erzwungen (REVOKE UPDATE/DELETE/TRUNCATE + BEFORE-Trigger); statisch gegated via `scripts/check-schema-invariants.mjs`.                                    |
| SYS.1.6 / APP.4.3 | Mandantentrennung (Multi-Tenancy)                                           | teilweise | `scripts/check-schema-invariants.mjs` · `packages/fachverfahren-kit/src/store.ts`                                                                                                       | tenant_id NOT NULL + applikatives Query-Scoping + Schema-Invarianten-Gate. Offen: DB-seitige Row-Level-Security (Welle 1 RLS).                                            |
| CON.2             | Datenschutz: Datenklassifikation & Aufbewahrung (DSGVO)                     | teilweise | `packages/public-sector-sdk/src/module-manifest.ts`                                                                                                                                     | `dataCategories`/`retentionPolicies` als geprüfte Deklaration beim Start. Offen: DSGVO Art. 17 Löschung (PII aus dem immutablen Audit; Crypto-Shredding — Welle 1 DSGVO). |
| CON.8             | Software-Entwicklung: reproduzierbare, geprüfte Lieferung                   | teilweise | `scripts/ci-validate.sh` · `scripts/check-package-licenses.mjs`                                                                                                                         | Gates + SBOM/Evidence-Build. Offen: Vuln-Scan/SAST/Secret-Scanning (osv/semgrep/gitleaks — Welle 3 CI).                                                                   |
| CON.1             | Kryptokonzept (Transport-/Ruhe-Verschlüsselung)                             | offen     | —                                                                                                                                                                                       | Keine erzwungene TLS-Verifikation zur DB (sslmode=verify-full), keine at-rest-Verschlüsselung der PII. Vor Produktivbetrieb schließen (Welle 4).                          |
| OPS.1.1.5 / DER.1 | Protokollierung & Detektion (zentral, manipulationssicher)                  | offen     | —                                                                                                                                                                                       | Security-/Technik-Logs nur ephemeres stdout; kein zentrales/manipulationssicheres Logging, keine Korrelation zu SIEM (Welle 3 Betrieb).                                   |
| CON.3.A           | Datensicherung / Backup & Restore (PITR, RPO/RTO)                           | offen     | —                                                                                                                                                                                       | Keine Backup-/DR-Automation für Verwaltungsdaten. Vor Produktivbetrieb schließen (Welle 3/4 Betrieb).                                                                     |

## Cutover-Hinweise (Ehrlichkeit)

- **Nicht-shredbarer Bestand**: Bereits im Klartext-Audit liegende PII (vor Einführung der
  Split-/Vault-Naht) ist strukturell nicht selektiv löschbar; für die DSGVO-Löschbarkeit gilt
  ein Cutover ab Aktivierung von `splitPersonalData` + `PersonalDataVault`.
- **Test- vs. Produktiv-Auth**: Der Header-Session-Modus ist ausschließlich ein Test-Modus und
  MUSS in Produktion durch den OIDC-Verifier ersetzt sein (fail-closed Bootstrap-Sperre in
  `production` ist vorhanden).

Dieses Profil wird bei jeder sicherheitsrelevanten Änderung fortgeschrieben; das Gate hält die
Belege ehrlich (jeder zitierte Pfad muss existieren).
