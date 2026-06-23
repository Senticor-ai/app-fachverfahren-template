# mdfilesuxuiskill Template Audit

Diese Abnahme gilt für die Quellen unter
`/Users/wolfgang/Downloads/mdfilesuxuiskill` und für die generische
Fachverfahren-Vorlage. Hundesteuer-spezifische Inhalte bleiben aus der Runtime
ausgeschlossen.

## Quelle Und Entscheidung

| Quelle                                      | Generisch angewendet                                                                                                   | Ausgeschlossen                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `00_README-uebersicht.md`                   | Trennung zwischen generischen Regeln, Storybook-Vertrag und Fachbeispielen. Doc 3 ist Design-System-Quelle.            | Keine Verfahrenswerte in der Template-UI.                                    |
| `01_ux-methodik-public-sector-generisch.md` | Methodik, HCAI, Shell/IA, Tabellen-, Formular-, A11y- und Token-Regeln.                                                | Kein Domain-Fachkonzept ohne konkreten Auftrag.                              |
| `01_ux-methodik-hundesteuer-demo.md`        | Generische Regeln für Shell, Tabellen, Stepper, Settings, Status und Hydration.                                        | Hundedaten, Satzungswerte, Gebühren, Rassen, Fristen und Rechtsverweise.     |
| `02_fachverfahren-design-manual.md`         | Bürgerin-, Sachbearbeitung- und Management-Muster, Master-Detail, Zustände, Screen Contracts.                          | Hundesteuer-Illustration aus §13.                                            |
| `03_coding-agent-ui-und-designsystem.md`    | Tokens, Typografie, Motion, Build-Console-Komponenten, GovernanceBar, ContextRail, Run Cards, Findings und GateStatus. | Rohes Agentenlog oder anbieterinterne Runtime-Begriffe in Nutzeroberflächen. |

## Storybook Als Erster Vertrag

- `UX-Methodik/Source Set` enthält die vollständige Quellen-Abnahme.
- `UX-Methodik/Public Sector` zeigt Bürgerin-, Sachbearbeitung-, Tabellen-,
  Formular-, Settings- und Accessibility-Kontrakte.
- `Design Manual/Fachverfahren` zeigt die Fachanwendung für Sachbearbeiter:in,
  Zustände und Screen Contracts.
- `Public Sector UI/Components` zeigt die fachneutralen UI-Komponenten inklusive
  Doc-3-Build-Console-Komponenten.

## Runtime-Anwendung

- Login ist Pflicht; die Mock-Nutzer trennen Bürgerin und Sachbearbeitung.
- Bürgerin-Erfahrung nutzt generische Vorgänge, Posteingang und Ausgang.
- Sachbearbeitung nutzt Eingang, Zugewiesen, Fristen, Entscheidungen und Suche
  mit denselben fachneutralen Vorgängen.
- Darstellung, Barrierefreiheit und Navigation sind persistierte
  Benutzereinstellungen.
- Die Sachbearbeitungs-Navigation ist einklappbar, unterstützt Auto-Ausklappen
  und statischen Modus mit Chevron.
- Basisdienste, Logs und Evidence erscheinen nicht in der Hauptnavigation,
  sondern nur im Benutzermenü oder in Prüf-/Storybook-Kontexten.

## Skill-Regel

Die Skill-Dateien unter `.claude/skills/ux-ui` sind die kurze Arbeitsanweisung
für spätere Erweiterungen. Jede UI-Erweiterung muss zuerst Storybook oder einen
Screen Contract aktualisieren und dann die App ändern.
