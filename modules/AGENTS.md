# Module Instructions

Diese Regeln gelten zusätzlich zu `../AGENTS.md`.

- Jedes konkrete Fachverfahren braucht `module.contract.yaml`.
- Domain-Code darf Plattformfähigkeiten nur über deklarierte Capabilities
  nutzen.
- Modulinterne Regeln dürfen die Root-Policy nur verschärfen.
- Gemeinsame Logik wandert nicht aus Bequemlichkeit aus dem Modul in
  Plattformpakete.
- **Modul-Server ist FRAMEWORK-AGNOSTISCH.** `modules/<domain>/server/` exportiert einen
  deklarativen Routen-Descriptor (`describe<Domain>Routes`) + REINE Handler-Funktionen
  `(input, ports) => result` über die deklarierten Ports. Das Modul importiert **niemals** ein
  HTTP-/Server-Framework (kein `fastify`/`express`/`http`), nutzt **kein** `declare module` und
  startet **keinen** Server. Das HTTP-/BFF-Framework ist Sache der App-Factory (`apps/<app>/server/`,
  Anleitung `.agents/skills/backend-fastify`), die den Descriptor + die Handler mountet. Vorlage:
  `modules/_template/server/routes.template.ts` bzw. `modules/neutral-example/server/routes.ts`.
- **Oberflächen nach ZONE/Persona getrennt.** Bürger-, Sachbearbeiter- und Aufsichts-Oberflächen laufen in
  GETRENNTEN Sicherheitszonen (BSI Netzsegmentierung: Bürger=Internet/DMZ, Sachbearbeitung=Verwaltungsnetz,
  Aufsicht=separat/pseudonymisiert). Darum werden die persona-getaggten Screen-Contracts
  (`persona: citizen|caseworker|auditor`) in SEPARATE, je Zone deploybare Bundles/Entry-Points gebaut
  (z. B. `ui/citizen.screens.tsx`, `ui/caseworker.screens.tsx`, `ui/auditor.screens.tsx`) — **nicht** alles in
  eine gemeinsame Datei/Bundle. Keine zonenübergreifenden Importe; Kopplung NUR über die governte Modul-API.
  UI **nur** aus dem Design-System komponieren (Tokens/Komponenten, BITV-AA) — keine rohen Styles/Hex/px.
