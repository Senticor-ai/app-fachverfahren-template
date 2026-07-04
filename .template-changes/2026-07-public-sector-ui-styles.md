bump: patch
updateMode: review
migration: none

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
- hält die Änderung migrationsfrei, weil bestehende Konsumenten nur das aktualisierte Stylesheet erhalten
