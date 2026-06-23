# Agent Bootstrap

Dieser Bootstrap ist die vendor-neutrale Startanweisung für Coding Agents.
`AGENTS.md` bleibt die Root-Policy. `.agents/skills` enthält die kanonischen
Workflow-Skills; tool-spezifische Verzeichnisse sind nur Kompatibilität.

## Start

- Nutze Package-Script `agent:discover`, um Workflows, Skills, Schemas und
  Checks zu finden.
- Nutze Package-Script `agent:context` mit einer App-Spezifikation, bevor du
  Dateien änderst.
- Nutze Package-Script `app:new`, wenn aus einer App-Spezifikation ein
  Domain-Modul entstehen soll.
- Nutze Package-Script `agent:verify`, um die Evidenz zu einer Agentenänderung
  zu erzeugen.

## Regeln

- Lies die von `agent:context` ausgewählten Dateien in der angegebenen
  Aufgabenbreite.
- Schreibe Fachlogik nur in den vom Modulvertrag erlaubten Pfaden.
- Verwende Plattformfähigkeiten aus `platform/capabilities.json`; baue
  Authentifizierung, Audit, Benachrichtigung, Zahlung oder Workflow nicht im
  Modul neu.
- Nutze `source:fetch` für gouvernierte Webquellen statt beliebiger
  Netzwerkzugriffe.
- Melde Abweichungen und offene Validierungsfragen im Agentenbericht, nicht als
  versteckte Annahmen im Code.

## Checks

Verwende die im Discovery-Manifest referenzierten Package-Scripts. Die
Command-Strings werden aus `package.json` aufgelöst.
