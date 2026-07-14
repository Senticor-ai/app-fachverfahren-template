# Agent Bootstrap

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST — vendor-neutraler Einstieg in die vorhandenen Agenten-Workflows.
> Quellen: `AGENTS.md`, `agent.discovery.json`, `package.json`,
> `tooling/template/lib/agent-platform.ts`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

Dieser Bootstrap ist die vendor-neutrale Startanweisung für Coding Agents.
`AGENTS.md` bleibt die Root-Policy. `.agents/skills` enthält die kanonischen
Workflow-Skills; tool-spezifische Verzeichnisse sind nur Kompatibilität.

## Start

- Nutze Package-Script `agent:bootstrap`, um Node, pnpm, Lockfile,
  Abhängigkeiten, Git-Quelle und Agent-Verträge als JSON zu prüfen.
- Nutze Package-Script `agent:discover`, um Workflows, Skills, Schemas und
  Checks zu finden.
- Nutze Package-Script `agent:context` mit einer App-Spezifikation, bevor du
  Dateien änderst.
- Folge `agent:context.nextCommands` in der angegebenen Reihenfolge, sofern der
  Nutzer keinen engeren Scope vorgibt.
- Nutze Package-Script `app:new` nur für den Generator-Pfad eines
  Domain-Modul-Gerüsts. Die laufende App bindet dieses Gerüst noch nicht ein;
  der produktive Fachverfahren-Build läuft über die Austausch-Naht aus
  `AGENTS.md`.
- Nutze Package-Script `agent:verify`, um die Evidenz zu einer Agentenänderung
  zu prüfen. Ohne `--report` entsteht ein Report-Entwurf mit `plannedCommands`;
  der Abschlussbericht muss echte `commandsExecuted` enthalten.

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
- Übergib `--allow-dirty` beim Full-Repo-Scaffold nur, wenn ein Mensch die
  nicht saubere Template-Quelle ausdrücklich akzeptiert hat.
- Nutze `--allow-existing-empty` statt `--force`, wenn das Zielverzeichnis
  bereits existiert, aber leer ist.

## Checks

Verwende die im Discovery-Manifest referenzierten Package-Scripts. Die
Command-Strings werden aus `package.json` aufgelöst.

- `check:agent-smoke` für schnelle Agent-/Scaffold-Verträge.
- `check:agent-domain` für Domain-, Modul-, Quellen- und Capability-Verträge.
- `check:agent-ui` für Screen Contracts, Storybook und UI-Typen.
- `check:agent-release` für release-nahe Validierung.

## Scaffold und Export

Vollständige Konsumenten entstehen ausschließlich über:

```bash
pnpm run scaffold:domain-app -- --domain <domain> --display-name <name> --target <ziel> --allow-existing-empty
```

Ein App-only-Export entsteht mit:

```bash
pnpm run scaffold:standalone -- <ziel>
```

Lifecycle und Ownership beschreibt
`docs/reference/template-lifecycle.md`. Delivery- und CI-Regeln stehen in
`docs/reference/ci-image-builds.md`.
