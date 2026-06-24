# Compliance & Evidence Skill

Anleitung, wie ein governtes Fachverfahren seine Pflichten NACHWEIST. GENERISCH (jede Leistung).
`governance.yaml` verlangt das Evidence-Bundle (`conformance-kit`) + die öffentlichen Pflichten;
dieser Skill sagt, WIE man die Mandate auf Evidenz mappt und das Bundle füllt — er erfindet keine
Pflicht und keinen Beleg.

## Mandate-Mapping (jede Pflicht hat einen Beleg)

Fülle in `modules/<domain>/domain.module.yaml` das `mandateMapping` + die Pflichtfelder:

- `fimReferences` — FIM-/OZG-Leistungs-/Prozess-IDs (Leistung existiert, nicht erfunden).
- `legalBases` — §/Satzung je fachlicher Aussage (Rechtsgrundlage-Mandat).
- `mandateMapping` — je `PUBLIC_SECTOR_MANDATE_ID` (aus `packages/conformance-kit`) → das
  belegende Artefakt (Datei/Test/Konzept). Leere Mappings sind ein Gate-Fehler.

## Compliance-Profil

Lege `modules/<domain>/compliance/compliance-profile.yaml` an (Form aus `packages/conformance-kit`):
`euAiActClass`, `fimSource`, `dataClassifications`, `retention`, die referenzierten Mandate +
HITL-Rollen. Tighten-only gegenüber `governance.yaml` (nie lockern).

## Evidence-Bundle bauen + prüfen

- `pnpm run evidence:build` erzeugt das Bundle (conformance-kit:14-items + AI-Evaluation, falls
  ein KI-Feature vorliegt).
- Jedes Item zeigt auf einen REALEN Beleg: Threat-Model/DSFA (Skill `security-dsfa`),
  A11y-Report (Skill `accessibility-bitv`), Tests, SBOM/SCA, Architektur-/Betriebsnachweis.
- Export: OSCAL-Bundle + OZG-Evidence-Pack (`governance.yaml` evidence.export).

## Anti-Overclaim

Behaupte nichts als „erfüllt", was nicht durch ein Bundle-Item belegt ist. Geplantes als
„geplant" kennzeichnen — der `compliance`-Gate (forbidden-block) + das Stop-Gate prüfen es.
