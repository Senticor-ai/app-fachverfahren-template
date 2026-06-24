# CHOS Governance-Steuerung — Bau-Mandat für dieses Fachverfahren

> Diese Datei **steuert**, wie der governte CHOS-Agent dieses Repo zu einem fertigen, getesteten,
> startbaren Fachverfahren ausbaut. Sie ist Teil des Warm-Start-Substrats (`.chos/`) und reist mit der
> Vorlage. Maschinen-Map: [`build-manifest.json`](./build-manifest.json). Qualitäts-Latte:
> [`gold-checklist.json`](./gold-checklist.json). Anleitung: [`warm-start.md`](./warm-start.md).

## Leitprinzip

**Nutze das KOMPLETTE Repo als Basis** — möglichst **einfach, sicher, schnell, mit sehr hoher Qualität**.
Komponiere die fertigen Bausteine (Server, `public-sector-ui`, platform-contracts, Gates), **baue nichts neu**,
fülle nur die `modules/<domain>/`-Deltas. Am Ende: **Dev-Server starten und die App testen** (geklickt, nicht nur
kompiliert).

## Pflicht-Artefakte: Fachkonzept · Epic · PRD — MAXIMAL ausgeprägt, MIT Mermaid

Vor dem Code entstehen drei **maximal ausgeprägte** Planungs-Artefakte (im Projekt-Root bzw.
`modules/<domain>/docs/`). Jedes ist **vollständig** (keine Stichpunkt-Skelette) und enthält **Mermaid-Diagramme**
— denn die Builder-UX rendert sie (wie die CHOS-Hive-Code-UI):

| Artefakt         | Inhalt (maximal)                                                                                                                                                               | Pflicht-Mermaid                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `FACHKONZEPT.md` | Zielbild · Personas · Journeys · Rechtsgrundlagen (belegt) · Datenobjekte/FIM · Tatbestände/Subsumtion · Once-Only · Nicht-Ziele · Annahmen-zu-validieren · Risiken/DSFA-Bezug | `flowchart` Architektur · `sequenceDiagram` je Journey · `stateDiagram-v2` Vorgangs-Lebenszyklus · `erDiagram` Datenmodell |
| `EPIC.md`        | Titel · Ziel & Kontext · Lösung · Schnittstellen · Datenmodell · Security · Compliance (Mandate) · Scope · Akzeptanzkriterien · Governance-Checkliste                          | `flowchart` Lösungsarchitektur · `gantt` o. `flowchart` Liefer-Schnitt · Mandate→Anforderung-Mapping                       |
| `PRD.md`         | Problem · Zielgruppen/Personas · Use-Cases · funktionale + nicht-funktionale Anforderungen · Metriken/KPIs · Rollout · Offene Fragen                                           | `journey` (User-Journey) · `flowchart` Feature-Map · `sequenceDiagram` Kern-Flow                                           |

Mermaid-Codefences (` ```mermaid `) sind Pflicht; valide Syntax (ELK-tauglich). Diese drei Artefakte sind
**reviewable** und werden als **Cards mit Open/Preview** im Builder-Arbeitsbereich angezeigt.

## Arbeitsbereich-Journey: jede Governance-Phase → EINE strukturierte Card

CHOS-Code bleibt die **Dev-Console** (Engine dahinter). Jede der 10 kanonischen Governance-Phasen erzeugt **eine
strukturierte Zusammenfassung** (`builder-summary.json` · ein Card-Eintrag), aus der der **GovTech-Builder-
Arbeitsbereich** die Card + ihre Artefakte zusammenbaut — mit Funktionen **Open · Preview · Review**:

`intake → kontext → fachkonzept → compliance → security → ux → build → evidence → cicd → preview`

Je Card: Titel · Zusammenfassung (was die Phase tat) · Status · zugeordnete Artefakte (open/preview) ·
Findings/Governance-Lichter · genutztes Wissen (Provenienz). Die Phasen-Card ist die **Zusammenfassung**, nicht das
Roh-Log — strukturiert, business-analystisch lesbar.

## Qualitäts-Mandat (sehr hohe Qualität, geerdet)

1. **Geerdete Gates statt LLM-Judge** — fertig ist eine Phase erst, wenn ihr Gate grün ist UND die Ziel-Dateien existieren (`build-manifest.json#verifyGates`).
2. **Tarife/Sätze/Fristen als Daten** (`forms/<domain>.rules.json`), nie inline.
3. **UI nur komponiert** aus `public-sector-ui` (KERN-Token, BITV/WCAG AA), keine rohen Farben, keine Primitive-Neubauten.
4. **Nur Ports**, keine Provider direkt; **4-Augen serverseitig** erzwungen; **append-only** Audit.
5. **Keine Domänen-Inhalte** außerhalb `modules/<domain>/`; nur TypeScript unter `modules/`.
6. **Dev-Server-Pflicht**: `pnpm run dev` startet, die drei Surfaces sind im Browser klickbar (Smoke gegen echte Routen, kein 5xx).
7. Unbelegte Annahmen werden als `Annahme zu validieren` markiert (Provenienz: FIM-ID / Satzung / Wissen).

## Ablauf (governt, autonom; Mensch nur bei Entscheidung/Credential)

`pnpm install` → `agent:context <spec>` → **Planung (FACHKONZEPT/EPIC/PRD, Mermaid)** → `app:new <spec>` →
Delta-Build (1 Knoten je Delta-Datei) → geerdetes Verify → **Dev-Server + Test** → `builder-summary.json` für den
Arbeitsbereich emittieren.
