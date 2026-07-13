---
bump: minor
updateMode: auto
migration: none
---

Lokaler Dev-Workflow für den Team-Workspace: Der Vite-Dev-Server proxied
`/auth` + `/api` + `/runtime-config.json` an die lokale Fastify-Runtime
(`apps/*/dev-proxy.ts`, Ziel via `VITE_DEV_API_PROXY_TARGET`) — vorher
beantwortete der SPA-Fallback API-Pfade mit `index.html` und `/boards` brach
mit einer JSON-SyntaxError. `pnpm dev:api` (`scripts/dev-api.mjs`) startet die
Runtime reproduzierbar (Store bauen → Migrationen → Server bauen → Start).
Beide Dateien sind bewusst Konsumenten-Hoheit (Ownership-Opt-out, wie
`apps/*/vite.config.ts` und `dev/**`).

Workspace-UX im Kit (template-verwaltet, additiv): `FachverfahrenShell` kann
zusätzliche Sidebar-Sektionen (`extraNavSections`, z.B. role-gated
„Verwaltung"), einen Konto-Bereich im Header (`accountSlot`) und das
Abschalten des Demo-Badges (`showDemoBadge=false` für echte Arbeitsdaten).
Die Referenz-App nutzt das: Boards/Verwaltung/Konto rendern in der
Persona-Sidebar (Screen-Contract boards-list, „persistent shell"), ein
First-Run-Gate führt vor dem ersten Setup JEDEN Pfad zum Einmal-Setup, und
die Login-Formulare tragen Passwort-Manager-Attribute (`autocomplete`/`name`).
