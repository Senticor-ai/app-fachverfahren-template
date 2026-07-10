---
bump: patch
updateMode: review
migration: none
---

# Public Sector UI Styles

- ergänzt eine tokenisierte `ps-*`-Komponentenschicht im zentralen Kit-Stylesheet
- macht Public-Sector-UI- und Storybook-Flächen ohne zusätzliche Consumer-CSS nutzbar
- ergänzt dezente Surface-Animationen, Hover-Tiefe und Touch-/Safe-Area-Regeln für PWA- und iPhone-Nutzung
- ergänzt `ResponsiveWorkspaceShell`, `SavedViewsToolbar` und `StickyActionBar` für produktive Sachbearbeitungs-Arbeitsflächen
- ergänzt `EvidenceReviewGrid` für akzeptieren, ablehnen und nachfordern von Nachweisen im Sachbearbeitungs-Workflow
- ergänzt `DecisionComposer` für Entscheidungsvorbereitung, Begründung, Auflagen, Vier-Augen-Hinweise und auditierbare Aktionen
- ergänzt `CalculationTrace` für prüfbare Berechnungsherleitungen mit Eingabewerten, Rechenschritten, Annahmen und Quellen
- ergänzt `CommunicationThread` für fachneutrale Vorgangskommunikation, Nachforderungen, Fristen, Anhänge und Entwürfe
- ergänzt `ReadinessGatePanel` als Prüfstand für Entscheidungsreife, blockierende Gates, Zuständigkeiten und nächste Aktionen
- ergänzt `CaseContextPanel` als kompakten Aktenkopf für Vorgangs-ID, Status, Phase, Zuständigkeit, Fristen, Signale und Aktionen
- ergänzt `ProcessTimeline` für erledigte, aktuelle, ausstehende und blockierte Verfahrensschritte mit nächster Aktion
- ergänzt `TaskQueuePanel` für konkrete Arbeitsaufgaben mit Priorität, Frist, Zuständigkeit, Auswahl, Blockaden und nächsten Aktionen
- ergänzt `HandoffPanel` für Übergaben, Freigaben, Rückgaben und blockierte Übergabewege mit Audit-Hinweis
- ergänzt `DeadlinePanel` für Fristensteuerung mit Überfälligkeit, Restzeit, Zuständigkeit, Eskalationspfad und Aktionen
- ergänzt `QuickFilterChips` und `BulkActionBar` für mehrfach aktive Arbeitslistenfilter, Auswahlstatus und Mehrfachaktionen
- ergänzt `DocumentChecklistPanel` für Pflicht- und optionale Unterlagen mit Vollständigkeit, Quelle, Eingang, Gültigkeit und Nachforderung
- ergänzt `AssumptionRegisterPanel` für offene Fachannahmen, Quellenvalidierung, Zuständigkeit, Fristen und blockierende Freigabefragen
- ergänzt `SourceCoveragePanel` für belegte, offene, veraltete und widersprüchliche Quellenanforderungen in agentisch erzeugten Fachverfahren
- ergänzt mobile Arbeitsvorrat-/Inbox-Karten mit Sortierkontrolle als touchfähigen Reflow der Desktop-Tabelle
- modernisiert `BarrierefreiheitsPanel` mit Statuszusammenfassung, Reset-Aktion, größeren Touch-Zielen und `ps-*`-Tokenstil
- hebt Muted-, Sidebar-, Status- und Dark-Mode-Texttokens auf WCAG-AA-Kontrastniveau
- hält die Änderung migrationsfrei, weil bestehende Konsumenten nur das aktualisierte Stylesheet erhalten
