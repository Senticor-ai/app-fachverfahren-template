# Module Instructions

Diese Regeln gelten zusätzlich zu `../AGENTS.md` — für Module, die über den
Generator-Pfad (`app:new`) unter `modules/<domain>/` entstehen. Derzeit
existiert hier keine Instanz; die App-Einbindung von Modulen ist (PLAN),
siehe `README.md` in diesem Verzeichnis.

- Jedes konkrete Fachverfahren-Modul braucht `module.contract.yaml`
  (Schema: `schemas/module-contract.schema.json`).
- Domain-Code darf Plattformfähigkeiten nur über deklarierte Capabilities
  nutzen (`platform/capabilities.json`).
- Modulinterne Regeln dürfen die Root-Policy nur verschärfen.
- Gemeinsame Logik wandert nicht aus Bequemlichkeit aus dem Modul in
  Plattformpakete.
- Nur TypeScript unter `modules/` (`.ts`/`.tsx`, kein `.js/.jsx/.cjs/.mjs`).
- **Modul-Server ist FRAMEWORK-AGNOSTISCH (PLAN).** `modules/<domain>/server/`
  exportiert deklarative Routen-Descriptoren und REINE Handler-Funktionen
  `(input, ports) => result` über die deklarierten Ports. Das Modul importiert
  niemals ein HTTP-/Server-Framework und startet keinen Server. Das Mounten
  übernimmt die (PLAN-)App-Factory, siehe `docs/reference/backend-fastify.md`.
- **Oberflächen nach Zone/Persona getrennt (PLAN für Bundles).** Bürger-,
  Sachbearbeitungs- und Aufsichts-Oberflächen laufen in getrennten
  Sicherheitszonen; persona-getaggte Screen Contracts
  (`persona: citizen|caseworker|auditor`) werden in separate Entry-Points
  gebaut. Keine zonenübergreifenden Imports; Kopplung nur über die Modul-API.
- UI nur aus dem Design-System komponieren (Tokens/Komponenten, BITV AA) —
  keine rohen Styles/Hex/px. Komponenten-Katalog:
  `docs/reference/fachverfahren-kit-components.md`.
