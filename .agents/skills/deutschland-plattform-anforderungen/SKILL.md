---
name: deutschland-plattform-anforderungen
description: |
  INTERNAL maintainer skill (NOT shipped to consumers, NOT in agent.discovery.json).
  Runbook for the maintainer's German Deutschlandplattform/SaaS/Grundschutz
  requirements register, which is maintained in a SEPARATE maintainer repository —
  its source artifacts do not live in this template. Kept here for the maintainer's
  reference only. Triggers: "Deutschlandplattform-Anforderungen", "Grundschutz-Kontext",
  "requirements register", "xlsx export", "platform delegation".
metadata:
  author: maintainer-internal
  internal: true
---

# Deutschland-Plattform-Anforderungen (INTERNAL)

> INTERNAL maintainer skill. The requirements register it governs is maintained in a
> SEPARATE maintainer repository; the source artifacts referenced below do NOT exist in
> this template and this skill is NOT delivered to scaffolded consumer apps.

Diese Skill ist das Runbook für das deutsche Anforderungenpaket rund um Deutschlandplattform, SaaS-Readiness, internes IT-Sicherheitskonzept und BSI-IT-Grundschutz-Kontext. Das Ziel ist ein reproduzierbares deutsches Paket mit klarer Provenienz, sauberer Plattformdelegation und lokal downloadbaren Exporten.

## Quellen und Artefakte

Kanonische Quelle ist `docs/platform-requirements/requirements.json` (Manifest) plus die Anforderungs-Shards unter `docs/platform-requirements/requirements/`. Das Manifest führt alle Abschnitte ausser der Anforderungsliste; an deren Stelle steht `requirement_shards`, ein geordneter Index der Shard-Dateien. Die Anforderungen sind je Quelle geshardet, Grundschutz zusätzlich je Baustein — so reisst keine Einzeldatei das 1-MiB-Repo-Hygiene-Limit (`scripts/pr-hygiene-check.sh`). Der Renderer ist `scripts/render-platform-requirements.py`, bleibt stdlib-only, setzt die Shards beim Lesen wieder in Listenreihenfolge zusammen und schreibt sie auf `--refresh-json` neu. Eine Anforderung manuell ändern heisst: ihren Shard unter `requirements/` editieren (nicht das Manifest) und danach exportieren.

Quellen beim Refresh (liegen im SEPARATEN Maintainer-Repository, NICHT in diesem Template — die konkreten
absoluten Pfade sind contributor-lokal und hier bewusst nicht eingetragen):

```text
<maintainer-repo>/docs/deutschlandplattform-anforderungen.md
<maintainer-repo>/operators/SAAS_READINESS.md
<maintainer-repo>/docs/compliance/*.de.md            # BSI-Sicherheitskonzept, IT-Grundschutz-Mapping
<maintainer-repo>/docs/delivery/<sicherheitskonzept>/ # Langfassung + Grundschutz-Checklisten-Audit
```

Gerenderte Repo-Artefakte:

```bash
docs/platform-requirements/grundschutz-context.md
<maintainer-repo>/docs/.../grundschutz-context.md
```

Lokale Download-Artefakte liegen unter `tmp/docs-operations-exports/` plus `tmp/platform-requirements-grundschutz-YYYY-MM-DD.zip`. Diese Dateien sind gitignored und werden nicht committed.

## Standardablauf

Bei geänderten Quelldokumenten oder Audit-Artefakten:

```bash
npm run deutschland-plattform-anforderungen:refresh
```

Bei manuellen Änderungen an einem Shard unter `docs/platform-requirements/requirements/` (oder am Manifest):

```bash
npm run deutschland-plattform-anforderungen:export
```

Wenn npm nicht passend ist, direkt ausführen:

```bash
python3 scripts/render-platform-requirements.py --refresh-json
python3 scripts/render-platform-requirements.py
```

## Fachliche Regeln

- Gemeinsame Pakettexte auf Deutsch halten; Fachabkürzungen wie KMS, SBOM, WAF, OCI sind ok, wenn sie als Standardsignale dienen.
- Provenienz pro Anforderung erhalten: Quelle, Referenz, Importmethode, Pfad und Evidence-Refs dürfen nicht verloren gehen.
- Harte Blocker nur für souveränes KMS/Schlüsselmanagement, plattformbereitgestellte Inferenz und echte IT-Grundschutz-Audit-`blockingFindings` setzen.
- IT-Grundschutz-Audit mit aktuell 19 Bausteinen, 396 Anforderungen und 0 Blocking Findings als Kontextquelle behandeln, nicht als pauschalen Blocker.
- `ENTFALLEN`-Zeilen müssen `Geltung = Entfallen`, `Zustaendigkeit = Entfaellt`, Aufwand/Nutzen `Entfaellt` sowie leere Plattformleistung und leere Abmilderung haben.
- Plattformdelegation nicht zu grob setzen: Plattform baut Registry, Inventar, Runtime, Evidence, Admission, Deployment- oder Change-Schnittstellen; der Anbieter meldet ein, liefert Nachweise oder implementiert appseitige Pflichten.
- `Anbieter` nur verwenden, wenn die Verantwortung wirklich anbieter-geführt bleibt. Bei KI-Inventar, Modellnachweisen, SBOM, Signing, Scanning, Deployment, Change und Auditfeeds ist meist `Gemeinsam` richtig.
- BSI IT-Grundschutz / BSI-Standard 200-2 ist der primäre Rahmen. Grundschutz++/OSCAL nur als zukunftskompatible Evidence-Automation behandeln.

## Erwartete Zählwerte

Nach einem vollständigen Refresh müssen diese Werte stabil sein, solange die Quellen nicht bewusst geändert wurden:

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
AI-05: Gemeinsam, KI-Systeminventar durch Plattform, der Anbieter meldet ein.
SUP-05: Gemeinsam, Deployment-/Admission-/Change-Nachweisstrom.
GS-CON-8-A8: Gemeinsam, sicherer Entwicklungslebenszyklus und Lieferkette.
GS-CON-8-A21: Anbieter, anbieter-geführte Bedrohungsmodellierung.
GS-APP-3-1-A24: Entfaellt, keine Plattformleistung, keine Abmilderung.
```

## Validierung

Immer ausführen, bevor ein PR erstellt oder aktualisiert wird:

```bash
npm run deutschland-plattform-anforderungen:refresh
npm run deutschland-plattform-anforderungen:export
# (Skill-Struktur validieren — der Validator liegt im Maintainer-Toolchain-Setup, nicht in diesem Template.)
```

MkDocs strikt bauen. Falls die temporäre venv fehlt, einmalig neu anlegen:

```bash
python3 -m venv /tmp/docs-operations-mkdocs-venv
/tmp/docs-operations-mkdocs-venv/bin/pip install -r docs/operations-docs/requirements.txt
/tmp/docs-operations-mkdocs-venv/bin/python -m mkdocs build --strict -f docs/operations-docs/mkdocs.yml
```

XLSX-Struktur prüfen, wenn am Renderer oder den Spalten gearbeitet wurde. Erwartete Sheets:

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
- PR als Draft öffnen, sofern der Nutzer nicht ausdrücklich ready-for-review verlangt.
- PR-Beschreibung kurz halten: was geändert wurde, warum, Exportbefehle, Validierungsergebnisse.
