---
bump: minor
updateMode: review
migration: none
---

Führt AGENTIC COMPOSABLES ein (Senticor/CHOS Blueprint v5.0) — die vertikalen,
verantworteten, austauschbaren Fähigkeitseinheiten mit einem SPINE-AGENT
(Rückgrat), der von einfacher Assistenz bis zu komplexer
Prüfung/Subsumtion/Review/Strukturierung eskaliert. Domänen-spezifisch deklariert;
ein extern gebautes Composable erbt das gesamte Governance-Gerüst.

**Metamodell (public-sector-sdk/composable.ts):** der Contract Envelope
(`AgenticComposable`) bindet das `DomainModuleManifest` (deterministische Naht) +
Outcome/Ownership/Spine/Assurance/Evals. CAL-0..4 (Assurance) und AAL-0..5
(Autonomy) sind erstklassige Typen. Zwei harte Grenzen (`assertSpineAgent`):
global ≤ AAL-3; bei rechtsnaher Aufgabe ≤ AAL-2 „Advise" — die KI berät,
entscheidet/handelt nie (HCAI, Vier-Augen, `reviewRequired=true`).
`certificationReadiness` nennt konkret fehlende Ebenen (§19/§28).

**Deklaration (apps/fachverfahren/server/composables.config.ts, KONSUMENTEN-Hoheit
wie procedure.config):** das neutrale Musterverfahren als fahrbares Composable mit
vollem Spine-Eskalationspfad.

**Drei gleichwertige Schnittstellen (Blueprint §9):**
- Human/Deterministisch (REST): `GET /api/composables` (Discovery),
  `GET /api/composables/:id` (Detail + Zertifizierungsreife).
- Agentic/Runtime: `POST /api/composables/:id/spine/:aufgabe` — führt eine
  Spine-Aufgabe über den `AiAssistPort` aus (AAL-2, `reviewRequired`); die Aufgabe
  muss am Spine deklariert sein (kein Erfinden von Fähigkeiten).
- CLI: `mesh composable list|show|spine` — was der Agent kann, geht auch
  deterministisch per CLI.

**Governance:** `check:composables` (in `check:agent-domain` + `precommit:check`)
validiert jede Deklaration (wohlgeformt + enabled ⇒ zertifiziert-vollständig +
eindeutig). Spine-Handlungen sind auditpflichtig (`spine.suggestion.created`).

Offen (bewusst): das vollständige Evidence-Ledger mit Hash-Kette (Blueprint §15.3)
und der Composition-Graph/Lockfile eines Productive Slice (§12) — Folge-Stufen.
