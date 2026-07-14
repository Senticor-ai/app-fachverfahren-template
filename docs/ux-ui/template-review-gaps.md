# Offene UX/UI-Review-Gaps des Templates

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST-Lückenregister — kein Konformitäts- oder Compliance-Nachweis.
> Quellen: `docs/ux-ui/fachverfahren-ux-contract.md`,
> `.agents/skills/ux-ui/references/fachverfahren-design-manual.md`,
> `.agents/skills/ux-ui/references/public-sector-ux-methodik.md`,
> `.agents/skills/ux-ui/references/coding-agent-ui-und-designsystem.md`,
> `packages/fachverfahren-kit/src/stories/`,
> `packages/public-sector-ui/src/`, `scripts/check-storybook-coverage.mjs`.
> Pflicht-Lektüre vorher: `AGENTS.md`, `.agents/skills/ux-ui/SKILL.md`,
> `docs/ux-ui/fachverfahren-ux-contract.md`.

Dieses Dokument bündelt offene Review-Punkte des generischen Templates. Es
ersetzt weder die fachliche Freigabe noch eine manuelle
Barrierefreiheitsprüfung eines konkreten Fachverfahrens.

## Review-Flächen

- `Design Manual/Fachverfahren` zeigt Persona-Dichte, Shell,
  Master-Detail-Arbeit und `Loading, Empty, Error, Success`.
- `UX-Methodik/Public Sector` zeigt Time to Clarity sowie Bürger:innen- und
  Sachbearbeitungsflüsse.
- `UX-Methodik/Source Set` hält die Abgrenzung zwischen generischen Regeln,
  Build Console und ausgeschlossenen Fachbeispielen sichtbar.
- `Public Sector UI/Components` dokumentiert exportierte UI-Komponenten.
- `pnpm run check:storybook` prüft die Existenz dieser Review-Flächen und die
  Story-Abdeckung der öffentlichen Komponenten.

## Offene Nachweise und Entscheidungen

| Bereich                         | Offener Nachweis oder Entscheidung                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Manuelle Accessibility-Abnahme  | Screenreader, vollständige Tastaturstrecken und 400-Prozent-Zoom müssen je Release zusätzlich manuell belegt werden.           |
| Fachliche Nutzer:innenforschung | Jobs to be Done, Touchpoints, Service Blueprint, Quellen und Annahmen müssen je Fachverfahren erhoben und dokumentiert werden. |
| Fachliche Domain-Routen         | Serverseitige Autorisierung ist für vorhandene BFF-Routen umgesetzt; fachliche Domain-Routen bleiben PLAN.                     |
| Zentrale Info-/Hilfe-Seite      | Meta-Inhalte bleiben in Docs und Storybook, solange keine konkrete Nutzeraufgabe eine eigene Oberfläche begründet.             |

## Pflege bei Änderungen

- Screen Contract und passende Story werden vor der UI-Implementierung
  aktualisiert.
- Abweichungen werden als `RC-Gap` in Story und diesem Register benannt.
- Token-, `public-sector-ui`- und Build-Console-Änderungen aktualisieren
  `UX-Methodik/Source Set`.
- Änderungen an Bürger:innen-, Sachbearbeitungs-, Aufsichts- oder
  Managementflächen aktualisieren die passende Design-Manual-Story.
- Fachwerte und fachliche Beispieltexte bleiben unter
  `docs/examples/<domain>/` oder in der Austausch-Naht eines konkreten Builds.
