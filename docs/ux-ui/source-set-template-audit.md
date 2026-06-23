# UX/UI Source Set Template Audit

Diese Abnahme gilt für das repo-lokale UX/UI-Source-Set und für die generische
Fachverfahren-Vorlage. Fachspezifische Beispielinhalte bleiben aus der Runtime
ausgeschlossen.

## Quelle Und Entscheidung

| Quelle                            | Generisch angewendet                                                                                                   | Ausgeschlossen                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Source-Set-Überblick              | Trennung zwischen generischen Regeln, Storybook-Vertrag und Fachbeispielen. Doc 3 ist Design-System-Quelle.            | Keine Verfahrenswerte in der Template-UI.                                     |
| Public-Sector-UX-Methodik         | Methodik, HCAI, Shell/IA, Tabellen-, Formular-, A11y- und Token-Regeln.                                                | Kein Domain-Fachkonzept ohne konkreten Auftrag.                               |
| Fachliches Beispiel               | Nur der konkrete Auftrag, Fachannahmen, synthetische Werte, Akzeptanz und offene Fragen.                               | Wiederholung generischer Shell-, Tabellen-, Formular-, A11y- und Tokenregeln. |
| Fachverfahren Design Manual       | Bürgerin-, Sachbearbeitung- und Management-Muster, Master-Detail, Zustände, Screen Contracts.                          | Domain-spezifische Illustrationen im Template-Runtime-Code.                   |
| Coding-Agent UI und Design-System | Tokens, Typografie, Motion, Build-Console-Komponenten, GovernanceBar, ContextRail, Run Cards, Findings und GateStatus. | Rohes Agentenlog oder anbieterinterne Runtime-Begriffe in Nutzeroberflächen.  |

## Storybook Als Erster Vertrag

- `UX-Methodik/Source Set` enthält die repo-lokale Quellen-Abnahme.
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

Die Skill-Dateien unter `.agents/skills/ux-ui` sind die kurze Arbeitsanweisung
für spätere Erweiterungen. Jede UI-Erweiterung muss zuerst Storybook oder einen
Screen Contract aktualisieren und dann die App ändern.
