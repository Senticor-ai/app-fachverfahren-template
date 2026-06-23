# Audit: UX-Methodik Public Sector

Quelle: `/Users/wolfgang/Downloads/mdfilesuxuiskill/01_ux-methodik-public-sector-generisch.md`

Status: RC1-Template, fachneutral. Dieses Dokument bewertet, was im Template
bereits durch App, Storybook, Skill, Tests oder Dokumentation abgesichert ist.
Es ersetzt keine fachliche Freigabe für ein konkretes Fachverfahren.

## Ergebnis

Die Methode ist jetzt repo-lokal codifiziert:

- `docs/ux-ui/fachverfahren-ux-contract.md` übersetzt die Methodik in den
  verbindlichen UI-Vertrag.
- `apps/fachverfahren-template/src/stories/UxMethodikPublicSector.stories.tsx`
  zeigt Methodik-Audit, Sachbearbeitungstabelle und Bürgerin-Formularvertrag.
- `scripts/check-storybook-coverage.mjs` erzwingt die Storybook-Abdeckung für
  `UX-Methodik`, `Time to Clarity`, `HCAI`, `Bürgerin`, `Sachbearbeitung` und
  dokumentierte `RC-Gap`-Einträge.
- `.claude/skills/ux-ui/` hält die Regeln für Coding Agents bereit.

## Teil 1: Methodik

| Callout                                         |                  Status | Nachweis                                                                                                                                        |
| ----------------------------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Problem, Rolle und Erfolg vor Lösung klären     |               Teilweise | Domain-Module, Screen Contracts und TDD-Dokumentation erzwingen Vorarbeit. Konkrete Research-Ergebnisse bleiben pro Fachverfahren zu liefern.   |
| HCAI als Entscheidungslinse                     |               Teilweise | Screen Contract und Skill verlangen KI-Kennzeichnung, Quelle, Konfidenz, Override und Audit. Die Template-App selbst enthält keine KI-Funktion. |
| Personas und Touchpoints                        |    Erfüllt für Template | Login trennt Bürgerin und Sachbearbeitung. Management/Audit ist noch kein primärer App-Strang.                                                  |
| Voice of Customer, Benchmarking, Double Diamond | Offen pro Fachverfahren | Muss im Domain-Modul oder Fachkonzept dokumentiert werden; das Template kann diese Recherche nicht vorwegnehmen.                                |
| Service Blueprint, User Flow, JTBD              |               Teilweise | `docs/ux-ui/screen-contract.template.yaml` und Domain-Modul-Manifest bieten die Struktur. Befüllung ist Fachverfahrensarbeit.                   |
| KI-Strategie, EU-AI-Act-Designsicht             |               Teilweise | Als Pflichtfelder in Guidance und Screen Contract vorhanden; konkrete Risikoklasse und Schwellen bleiben fachlich zu bewerten.                  |
| Offene Fragen und Human Review                  |               Teilweise | Der Prozess ist dokumentiert. Ein hartes CI-Gate gegen unbefüllte offene Fragen existiert noch nicht.                                           |
| Anti-Patterns                                   |               Teilweise | Keine Hundesteuer- oder Demo-Fachlogik in der Runtime, keine Basisdienste als prominente Navigation, keine unnötigen Disclaimer in der App.     |

## Teil 2: Umsetzungsspezifikation A-J

| Abschnitt                            |                 Status | Aktueller Stand                                                                                                                                                                                                                     |
| ------------------------------------ | ---------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Stack, Daten, Stabilität           |                Erfüllt | Node 24, strict ESM, React, Tailwind, shadcn-Primitives, MSW, deterministische Mockdaten, Postgres-Pfade für Präferenzen und Posteingang/Ausgang.                                                                                   |
| B App-Shell und IA                   |                Erfüllt | Geschützte Shell, rollenbezogene Navigation, Nutzer-Menü, Breadcrumbs und einklappbare Sachbearbeitungs-Sidebar mit Auto-/Statikmodus sind vorhanden.                                                                               |
| C Mobile                             |                Erfüllt | Layouts reflowen, Tabellen scrollen horizontal und mobile Navigation läuft über einen rechtsseitigen Drawer.                                                                                                                        |
| D Seiten-Konsistenz                  |                Erfüllt | Arbeitsbereiche haben konsistente Header; primäre Fachnavigation bleibt rollenbezogen und basisdienstfrei.                                                                                                                          |
| E Tabellen                           |                Erfüllt | Sachbearbeitung hat List-Detail, Sticky Table Head, zwei eingefrorene Leitspalten, Sortier-/Filter-Affordances, Tastaturzeilen und Filteransichten.                                                                                 |
| F Mehrschritt-Formulare              |    Erfüllt als Vertrag | Bürgerin-Erlebnis ist geführt; der generische Formular-Assistent mit err/warn/ok, Once-Only-Prefill und freier Step-Navigation ist in Storybook und Screen Contract codifiziert.                                                    |
| G Einstellungen und Barrierefreiheit |                Erfüllt | Hell/Dunkel/System, Kontrast, größere Schrift, reduzierte Bewegung, Dichte und Sidebar-Autoausklappen werden persistiert.                                                                                                           |
| H Info-/Hilfe-Seite                  | Offen/konfliktbehaftet | Die Methode fordert eine zentrale Info-Seite. Die aktuelle Template-Richtung vermeidet unnütze Meta-Texte in der App; Info-Inhalte bleiben daher in Docs/Storybook, bis eine Produktentscheidung getroffen ist.                     |
| I Keine Demo-/Meta-Möblierung        |                Erfüllt | Sichtbare App-Copy ist fachneutral und nutzt keine Hundesteuer-, Sprint- oder Architekturbegriffe in primärer Navigation.                                                                                                           |
| J Tokens und Accessibility           |                Erfüllt | Semantische Tokens, Dark Mode, Fokus, Status mit Text/Icon, reduzierte Bewegung, Print-Regeln und Doc-3-Motion-Utilities sind vorhanden. Manuelle Screenreader-, 400-Prozent-Zoom- und PDF/UA-Prüfungen bleiben ergänzende Abnahme. |

## Konflikte

Ein Punkt bleibt eine Produktentscheidung:

1. Die Methodik fordert eine Info-/Hilfe-Seite mit Meta- und Disclaimer-Inhalt.
   Die App soll zugleich keinen unnötigen Fluff zeigen. Bis zur Entscheidung
   bleiben Meta-Inhalte in Storybook und Dokumentation; in der App selbst nur,
   wenn sie einer konkreten Nutzeraufgabe dienen.

## Storybook-Abnahme

Neue UI-Arbeit muss eine passende Story ergänzen oder aktualisieren:

- Bürgerin: geführter Flow, Formularzustände, einfache Sprache, mobile Reflow.
- Sachbearbeitung: List-Detail, Tastaturpfad, Tabellenfilter, Fristen,
  Entscheidungsvorlagen.
- Accessibility: Tastatur, Fokus, Status mit Text/Icon, Hochkontrast, größere
  Schrift, reduzierte Bewegung und Dichte.
- HCAI: Quelle, Konfidenz, Warum-Details, Bestätigen, Ablehnen, Überschreiben
  und Audit, sobald KI im Fachverfahren vorkommt.

`pnpm run check:storybook` darf nicht bestehen, wenn die Methodik-Story entfernt
oder die zentralen Callouts nicht mehr sichtbar sind.
