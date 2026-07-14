# UX/UI-Konformität des Templates

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST mit ausdrücklich markierten RC-Gaps.
> Quellen: `docs/ux-ui/fachverfahren-ux-contract.md`,
> `.agents/skills/ux-ui/references/fachverfahren-design-manual.md`,
> `.agents/skills/ux-ui/references/public-sector-ux-methodik.md`,
> `.agents/skills/ux-ui/references/coding-agent-ui-und-designsystem.md`,
> `packages/fachverfahren-kit/src/stories/`,
> `packages/public-sector-ui/src/`, `scripts/check-storybook-coverage.mjs`.
> Pflicht-Lektüre vorher: `AGENTS.md`, `.agents/skills/ux-ui/SKILL.md`,
> `docs/ux-ui/fachverfahren-ux-contract.md`.

Dieses Dokument ist der aktuelle Abgleich des generischen Templates mit Design
Manual, Public-Sector-UX-Methodik und dem repo-lokalen UI-Source-Set. Es ersetzt
keine fachliche oder manuelle Barrierefreiheitsfreigabe eines konkreten
Fachverfahrens.

## Verbindlicher Nachweis

- `Design Manual/Fachverfahren` zeigt Persona-Dichte, Shell,
  Master-Detail-Arbeit und `Loading, Empty, Error, Success`.
- `UX-Methodik/Public Sector` zeigt Time to Clarity, Bürger:innen- und
  Sachbearbeitungsflüsse, HCAI sowie sichtbare RC-Gaps.
- `UX-Methodik/Source Set` hält die Abgrenzung zwischen generischen Regeln,
  Build Console und ausgeschlossenen Fachbeispielen sichtbar.
- `Public Sector UI/Components` dokumentiert exportierte UI-Komponenten.
- `pnpm run check:storybook` prüft die Existenz dieser Abnahmeflächen und die
  Story-Abdeckung der öffentlichen Komponenten.

## Konformitätsmatrix

| Bereich                        | Status                        | Nachweis oder Grenze                                                                                                                                                                          |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bürger:innen-UX                | IST                           | Geführte, mobile-first Strecken; einfache Sprache, Once-Only, Review und Bestätigung sind Vertrag und Storybook-Pflicht.                                                                      |
| Sachbearbeitung                | IST                           | Rollenbezogene Shell, Breadcrumbs, Master-Detail, Tastaturzeilen, Filter, gespeicherte Ansichten, Pagination und Bulk-Auswahl sind in App oder Stories sichtbar.                              |
| Aufsicht/Management            | IST als generische Oberfläche | Überblick, Drilldown und Audit-Muster sind vorhanden; konkrete Fachkennzahlen bleiben Konfigurationsdaten.                                                                                    |
| Zustände und Recovery          | IST                           | Loading, Empty, Error und Success werden durch Screen Contract, Stories und Coverage-Gate verlangt.                                                                                           |
| Design-System                  | IST                           | `packages/public-sector-ui` ist die Fassade; shadcn-Primitives bleiben Implementierungsdetail. Komponenten nutzen `--color-*`-Aliasse, semantische Statusdarstellung und reduzierte Bewegung. |
| HCAI                           | IST als Vertrag               | KI bleibt assistiv; Kennzeichnung, Quelle, Konfidenz, Begründung, Accept/Reject/Override und Audit sind Pflicht, sobald KI eingesetzt wird.                                                   |
| Fachliche Forschung            | pro Fachverfahren offen       | Jobs to be Done, Touchpoints, Service Blueprint, Quellen und Annahmen können vom fachneutralen Template nicht vorweggenommen werden.                                                          |
| Serverseitige Autorisierung    | IST für vorhandene BFF-Routen | UI-Gating ist nur Darstellung; Fastify-Policy-Checks bleiben maßgeblich. Fachliche Domain-Routen bleiben PLAN.                                                                                |
| Manuelle Accessibility-Abnahme | RC-Gap                        | Screenreader, vollständige Tastaturstrecken und 400-Prozent-Zoom müssen je Release zusätzlich manuell belegt werden.                                                                          |
| Zentrale Info-/Hilfe-Seite     | bewusste Produktentscheidung  | Meta-Inhalte bleiben in Docs und Storybook, solange sie keine konkrete Nutzeraufgabe erfüllen.                                                                                                |

## Pflege bei Änderungen

- Screen Contract und passende Story werden vor der UI-Implementierung
  aktualisiert.
- Abweichungen werden als `RC-Gap` in Story und dieser Matrix benannt.
- Token-, `public-sector-ui`- und Build-Console-Änderungen aktualisieren
  `UX-Methodik/Source Set`.
- Änderungen an Bürger:innen-, Sachbearbeitungs-, Aufsichts- oder
  Managementflächen aktualisieren die passende Design-Manual-Story.
- Fachwerte und fachliche Beispieltexte bleiben unter
  `docs/examples/<domain>/` oder in der Austausch-Naht eines konkreten Builds.
