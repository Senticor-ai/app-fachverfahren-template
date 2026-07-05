---
name: deutschland-plattform-anforderungen
description: |
  Use this skill when updating, reviewing, exporting, or validating the German
  Deutschlandplattform/SaaS/Grundschutz requirements package: Deutschlandplattform-
  Anforderungen, SaaS readiness, Grundschutz-Kontext, requirements JSON/XLSX/
  Markdown regeneration, blocker matrix, cost/benefit ratings, platform delegation,
  CHOS-BMS Sicherheitskonzept or BSI IT-Grundschutz context. Triggers include
  "Deutschlandplattform-Anforderungen", "Grundschutz-Kontext", "requirements
  register", "xlsx export", "platform delegation", "KMS blocker",
  "platform inference blocker", "Anbieter/Gemeinsam", and "ENTFALLEN".
---

# Deutschland-Plattform-Anforderungen

Diese Skill ist das Runbook fuer das deutsche Anforderungenpaket rund um Deutschlandplattform, SaaS-Readiness, CHOS-BMS-Sicherheitskonzept und BSI-IT-Grundschutz-Kontext. Das Ziel ist ein reproduzierbares deutsches Paket mit klarer Provenienz, sauberer Plattformdelegation und lokal downloadbaren Exporten.

## Quellen und Artefakte

Kanonische Quelle ist `docs/platform-requirements/requirements.json` (Manifest) plus die Anforderungs-Shards unter `docs/platform-requirements/requirements/`. Das Manifest fuehrt alle Abschnitte ausser der Anforderungsliste; an deren Stelle steht `requirement_shards`, ein geordneter Index der Shard-Dateien. Die Anforderungen sind je Quelle geshardet, Grundschutz zusaetzlich je Baustein — so reisst keine Einzeldatei das 1-MiB-Repo-Hygiene-Limit (`scripts/pr-hygiene-check.sh`). Der Renderer ist `scripts/render-platform-requirements.py`, bleibt stdlib-only, setzt die Shards beim Lesen wieder in Listenreihenfolge zusammen und schreibt sie auf `--refresh-json` neu. Eine Anforderung manuell aendern heisst: ihren Shard unter `requirements/` editieren (nicht das Manifest) und danach exportieren.

Quellen beim Refresh:

```bash
docs/deutschlandplattform-anforderungen.md
operators/SAAS_READINESS.md
/home/coder/Cognitive-Hive-OS/docs/compliance/bsi-sicherheitskonzept.de.md
/home/coder/Cognitive-Hive-OS/docs/compliance/it-grundschutz-mapping.de.md
/home/coder/Cognitive-Hive-OS/docs/delivery/IT-Sicherheitskonzept-BMS/sicherheitskonzept-langfassung.de.md
/home/coder/Cognitive-Hive-OS/docs/delivery/IT-Sicherheitskonzept-BMS/IT-Sicherheitskonzept-BMS__grundschutz-checklisten-audit.json
```

Gerenderte Repo-Artefakte:

```bash
docs/platform-requirements/grundschutz-context.md
docs/operations-docs/src/cognitive-hive-os/grundschutz-context.md
```

Lokale Download-Artefakte liegen unter `tmp/docs-operations-exports/` plus `tmp/platform-requirements-grundschutz-YYYY-MM-DD.zip`. Diese Dateien sind gitignored und werden nicht committed.

## Standardablauf

Bei geaenderten Quelldokumenten oder Audit-Artefakten:

```bash
npm run deutschland-plattform-anforderungen:refresh
```

Bei manuellen Aenderungen an einem Shard unter `docs/platform-requirements/requirements/` (oder am Manifest):

```bash
npm run deutschland-plattform-anforderungen:export
```

Wenn npm nicht passend ist, direkt ausfuehren:

```bash
python3 scripts/render-platform-requirements.py --refresh-json
python3 scripts/render-platform-requirements.py
```

## Fachliche Regeln

- Gemeinsame Pakettexte auf Deutsch halten; Fachabkuerzungen wie KMS, SBOM, WAF, OCI sind ok, wenn sie als Standardsignale dienen.
- Provenienz pro Anforderung erhalten: Quelle, Referenz, Importmethode, Pfad und Evidence-Refs duerfen nicht verloren gehen.
- Harte Blocker nur fuer souveraenes KMS/Schluesselmanagement, plattformbereitgestellte Inferenz und echte CHOS-BMS-Audit-`blockingFindings` setzen.
- CHOS-BMS-Audit mit aktuell 19 Bausteinen, 396 Anforderungen und 0 Blocking Findings als Kontextquelle behandeln, nicht als pauschalen Blocker.
- `ENTFALLEN`-Zeilen muessen `Geltung = Entfallen`, `Zustaendigkeit = Entfaellt`, Aufwand/Nutzen `Entfaellt` sowie leere Plattformleistung und leere Abmilderung haben.
- Plattformdelegation nicht zu grob setzen: Plattform baut Registry, Inventar, Runtime, Evidence, Admission, Deployment- oder Change-Schnittstellen; Senticor meldet ein, liefert Nachweise oder implementiert appseitige Pflichten.
- `Anbieter` nur verwenden, wenn die Verantwortung wirklich Senticor-gefuehrt bleibt. Bei KI-Inventar, Modellnachweisen, SBOM, Signing, Scanning, Deployment, Change und Auditfeeds ist meist `Gemeinsam` richtig.
- BSI IT-Grundschutz / BSI-Standard 200-2 ist der primaere Rahmen. Grundschutz++/OSCAL nur als zukunftskompatible Evidence-Automation behandeln.

## Erwartete Zaehlwerte

Nach einem vollstaendigen Refresh muessen diese Werte stabil sein, solange die Quellen nicht bewusst geaendert wurden:

```text
requirements_total: 477
deutschlandplattform: 65
saas: 15
inferred: 1
grundschutz_bausteine: 19
grundschutz_requirements: 396
grundschutz_blocking_findings: 0
```

Pflicht-Spotchecks:

```text
AI-05: Gemeinsam, KI-Systeminventar durch Plattform, Senticor meldet ein.
SUP-05: Gemeinsam, Deployment-/Admission-/Change-Nachweisstrom.
GS-CON-8-A8: Gemeinsam, sicherer Entwicklungslebenszyklus und Lieferkette.
GS-CON-8-A21: Anbieter, Senticor-gefuehrte Bedrohungsmodellierung.
GS-APP-3-1-A24: Entfaellt, keine Plattformleistung, keine Abmilderung.
```

## Validierung

Immer ausfuehren, bevor ein PR erstellt oder aktualisiert wird:

```bash
npm run deutschland-plattform-anforderungen:refresh
npm run deutschland-plattform-anforderungen:export
python3 /home/coder/.codex/skills/.system/skill-creator/scripts/quick_validate.py .claude/skills/deutschland-plattform-anforderungen
```

MkDocs strikt bauen. Falls die temporaere venv fehlt, einmalig neu anlegen:

```bash
python3 -m venv /tmp/docs-operations-mkdocs-venv
/tmp/docs-operations-mkdocs-venv/bin/pip install -r docs/operations-docs/requirements.txt
/tmp/docs-operations-mkdocs-venv/bin/python -m mkdocs build --strict -f docs/operations-docs/mkdocs.yml
```

XLSX-Struktur pruefen, wenn am Renderer oder den Spalten gearbeitet wurde. Erwartete Sheets:

```text
Anforderungen
Grundschutz-Kontext
Plattformdelegation
Blocker
Auditbefunde
Zusammenfassung
```

## PR-Checkliste

- Nur intendierte Dateien stagen: Renderer, `docs/platform-requirements/`, Docs-Wrapper/Nav, Skill, `CLAUDE.md`, `package.json`.
- Keine `tmp/`-Downloads und kein `docs/operations-docs/site/` committen.
- PR als Draft oeffnen, sofern der Nutzer nicht ausdruecklich ready-for-review verlangt.
- PR-Beschreibung kurz halten: was geaendert wurde, warum, Exportbefehle, Validierungsergebnisse.
