# Storybook für Designer und Entwickler

Storybook ist die gemeinsame Arbeitsfläche für Designer, Fachseite,
Accessibility-Review und Coding Agents. Es dokumentiert den UI-Vertrag, nicht
nur einzelne Komponenten.

## Start

```bash
pnpm install
pnpm run storybook
```

Build für Review oder CI:

```bash
pnpm run build:storybook
pnpm run check:storybook
```

## Struktur

- `.storybook/` enthält die zentrale Konfiguration.
- `packages/fachverfahren-kit/src/stories/` enthält die App-, Pattern- und
  Methodik-Stories; die Bausteine und shadcn/Radix/Tailwind-Primitive liegen
  daneben unter `src/components/` und `src/ui/`.
- `packages/public-sector-ui/src/` enthält wiederverwendbare Komponenten mit
  ihren Stories; neue Exports müssen durch Stories abgedeckt sein.
- `modules/<domain>/ui/` wird als Story-Quelle mitgeladen (PLAN — derzeit
  existiert keine Modul-Instanz, siehe `modules/README.md`).

## Story-Kategorien

- `Public Sector UI`: wiederverwendbare Verwaltungs-Komponenten.
- `Design System`: Tokens, Dichte, Tabellen, Status und Accessibility-Regeln.
- `Design Manual`: Dok.-2-Abnahme für Sachbearbeiter:in-Fachanwendung,
  Bürger:in-Patterns und gestaltete Zustände.
- `UX-Methodik/Source Set`: Abnahme gegen das gesamte
  repo-lokale UX/UI-Source-Set, inklusive Doc 3, Build Console und
  Abgrenzung fachlicher Beispiele.
- `Delivery`: Screen Contracts, Fehlerzustände und TDD-Akzeptanz.
- `UX-Methodik`: Abnahme der generischen Public-Sector-Methodik mit
  Time-to-Clarity, HCAI, Bürgerin-Flows, Sachbearbeitung und dokumentierten
  RC-Gaps.

## Regeln für Designer

- Designs nutzen dieselben semantischen Tokens wie der Code.
- Token-Stories zeigen die direkt nutzbaren `--color-*`-Aliasse. Rohe
  HSL-Komponententokens wie `--foreground` sind nur Token-Quelle und werden
  nicht direkt in Komponenten verwendet.
- Deutsche Copy nutzt echte Umlaute, zum Beispiel `Bürgerin`, `Vorgänge` und
  `Behörde`.
- Inaktive Platzhalter wie `Gebärdensprache` und `Leichte Sprache` werden nicht
  in der Live-App gerendert. `LanguageAccessLinks` gibt ohne echte Ziele `null`
  zurück.
- Status wird mit Text/Icon plus Farbe entworfen.
- Jeder Screen zeigt Default, Empty, Error und Loading.
- Jeder abschließbare Screen zeigt Success/Confirmation mit Vorgangs- oder
  Referenznummer.
- Mobile und Desktop werden explizit betrachtet.
- Bürgerstrecken sind geführt; Sachbearbeitung ist dichter und
  tastatureffizient.
- Methodik-Stories zeigen explizit, ob ein Callout umgesetzt, teilweise
  umgesetzt oder noch ein RC-Gap ist. Gaps nicht durch dekorative UI kaschieren.

## Regeln für Agents

- Bei neuer UI zuerst Screen Contract und Story anlegen.
- Stories folgen der Persona-Dichte aus
  `docs/ux-ui/fachverfahren-ux-contract.md`.
- Bei UI- oder Screen-Contract-Änderungen den Audit aus
  `docs/ux-ui/ux-methodik-public-sector-audit.md` prüfen und die Story
  `UX-Methodik/Public Sector` aktualisieren.
- Bei Sachbearbeitung, Bürgerportal, Zuständen oder App-Shell zusätzlich
  `docs/ux-ui/fachverfahren-design-manual-audit.md` prüfen und
  `Design Manual/Fachverfahren` aktualisieren.
- Bei Token-, `public-sector-ui`- oder Build-Console-Änderungen zusätzlich
  `docs/ux-ui/source-set-template-audit.md` prüfen und
  `UX-Methodik/Source Set` aktualisieren.
- Keine Rohfarben oder Einmal-Komponenten.
- Keine direkte Nutzung von HSL-Komponententokens wie `var(--foreground)`;
  `pnpm run check:css-tokens` muss bestehen.
- Neue `public-sector-ui` Exports müssen in Storybook erscheinen.
- Accessibility-Parameter in Storybook nicht als Ersatz für manuelle
  Tastatur-/Screenreader-Prüfung behandeln.

## Coverage Gate

`pnpm run check:storybook` prüft ohne Storybook-Build:

- zentrale Storybook-Konfiguration vorhanden.
- TDD- und UX-Dokumentation vorhanden.
- public-sector-ui Exports sind in Stories referenziert.
- mindestens eine Story enthält einen Screen Contract.
- die generische UX-Methodik bleibt in Storybook sichtbar, einschließlich
  `Time to Clarity`, `HCAI`, `Bürgerin`, `Sachbearbeitung` und `RC-Gap`.
- das Fachverfahren Design Manual bleibt sichtbar, einschließlich
  `Sachbearbeiter:in`, `Bürger:in`, `Master-Detail` und
  `Loading, Empty, Error, Success`.
- das UX/UI-Source-Set bleibt sichtbar, einschließlich `Doc 3`,
  `Build Console`, `ContextRail`, `GovernanceBar`, `Run Cards`,
  `Working Context` und `Fachbeispiele ausgeschlossen`.

Der echte Storybook-Build bleibt zusätzlich erforderlich, sobald
Abhängigkeiten installiert sind.
