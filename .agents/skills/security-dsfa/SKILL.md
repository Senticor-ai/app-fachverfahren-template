# Security & DSFA Skill

Anleitung für Datenschutz- und Sicherheitsnachweise eines governten Fachverfahrens.
GENERISCH (jede Leistung) — keine fachspezifischen Inhalte hier. `governance.yaml` führt
`dsfa` als HITL-/blocking-Regel (Rolle Datenschutz, locked) und die Security-Vorgaben; dieser
Skill sagt, WIE die Nachweise strukturiert werden, damit der DSFA-/Security-Gate grün wird.

## Wann

- Sobald ein Modul personenbezogene Daten verarbeitet (fast jedes Fachverfahren).
- Vor `prod-deploy` (HITL) — der Nachweis muss vorliegen, nicht nur geplant sein.

## DSFA (Datenschutz-Folgenabschätzung, DSGVO Art. 35)

Lege `modules/<domain>/compliance/dsfa.md` an mit:

- **Verarbeitungszweck + Rechtsgrundlage** — referenziere die `legalBases`/`fimReferences`
  aus `domain.module.yaml` (jede Aussage belegt, kein erfundener Zweck).
- **Datenkategorien + Betroffene** — aus `dataCategories`/`retentionPolicies` des Moduls.
- **Notwendigkeit & Verhältnismäßigkeit** — Datenminimierung, Once-Only statt Doppel-Erhebung.
- **Risiken + TOM** — technische/organisatorische Maßnahmen, gemappt auf die `governance.yaml`
  Security-Regeln (authzServerSide, fourEyesServer, auditAppendOnly, secrets server-only,
  tlsMin 1.3, PII server-side/redact). Jede Maßnahme verweist auf den umsetzenden Code/Port.
- **Löschkonzept** — DIN 66398, Fristen aus `retentionPolicies`, Umsetzung im Code (nicht nur Doku).
- **Rest-Risiko + Abzeichnung** — Rolle Datenschutz (HITL).

## Threat-Model (knapp, generisch)

- STRIDE je Vertrauensgrenze (Bürger ↔ BFF ↔ Port ↔ Provider). Keine Bring-your-own-Krypto/Auth.
- Untrusted-Input überall validieren (server-autoritativ), Untrusted-Output sanitisieren.
- Secrets nur server-seitig (Vault/Env), nie im Client/Repo; `secretScan` (gitleaks) muss grün sein.

## Belege (kein Overclaim)

Behaupte in DSFA/Security-Konzept **nur, was im Code belegbar ist**. Geplantes klar als
„geplant/Betriebskonzept" kennzeichnen. Die Nachweise fließen in das Evidence-Bundle
(siehe Skill `compliance-evidence`); SCA/SBOM/SLSA-Belege gehören dazu, wenn `governance.yaml`
sie verlangt.
