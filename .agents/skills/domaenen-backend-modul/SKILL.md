---
name: domaenen-backend-modul
description: Erzeuge ein eigenes Domänen-Backend als framework-agnostischen ModuleServer, deklariere seinen Governance-Vertrag über app:new und mounte es via ModuleHost (APP_MODULES) auf den Public-Server — mehrere Fachverfahren-Backends aus EINEM Image.
---

# Domänen-Backend-Modul (ModuleServer)

Der Weg, ein eigenständiges Domänen-Backend NEBEN dem Monolithen zu betreiben:
mehrere Fachverfahren (jeweils eigene Routen, Rechte, Events, Tabellen) laufen
als getrennte, framework-agnostische Modul-Server aus EINEM gebauten Image.
Root-Policy und Pfad-Karte: `AGENTS.md`. Abgrenzung zur EINEN Austausch-Naht
(`leistung.config.ts`) siehe `.agents/skills/fachverfahren-app/SKILL.md` — dort
lebt EIN Verfahren als reine Config, hier lebt ein Verfahren als eigenes,
mountbares Backend.

## Kernprinzip

Ein Domänen-Backend ist ein `ModuleServer` (`@senticor/public-sector-sdk`,
`packages/public-sector-sdk/src/module-server.ts`): REINE Descriptoren plus
Handler `(ctx) => ModuleResult` — mehr nicht. Das Modul importiert NIE ein
HTTP-Framework, kein `pg`, keinen Store, keinen Provider. Die eine Naht ist der
Export:

```text
modules/_backends/<id>/server/index.ts   →   export const server: ModuleServer
```

Das Mounten, die Session-/RBAC-Durchsetzung und die VOR-GESCOPTE Port-Injektion
übernimmt ausschließlich der Host (`apps/fachverfahren/server/module-host.ts`).
So bleibt die Modul-Fläche framework- und infrastruktur-agnostisch, und der
Host reproduziert für JEDES Modul EXAKT dasselbe server-autoritative Enforcement
wie der Monolith. Mehrere Verfahren = mehrere Einträge in der `APP_MODULES`-
Allowlist; alle werden in denselben Public-Fastify gemountet und in dasselbe
Image gebaut. Leer/unset ⇒ `[]` ⇒ Monolith unverändert (additive Naht).

Der `_backends/`-Ort ist bewusst: der `_`-Präfix lässt `check:domain-contracts`
(das 9-Verzeichnis-Regime für Fach-Domänen unter `modules/<domain>/`) diesen
Ordner ÜBERSPRINGEN, während `check:module-boundaries` weiter greift. Der
Governance-/Artefakt-Vertrag (Contract, Rechte, Events, Migrationen,
Screen-Contracts) wird davon getrennt über `app:new` aus einer `app.spec.yaml`
abgeleitet (siehe nächster Abschnitt).

## Wie ein Build-Agent (chos-code/gtc-builder) es nutzt

1. **Vendor-neutraler Einstieg** (Task, Write-Boundaries, relevante Checks):

   ```bash
   pnpm run agent:bootstrap -- --json
   pnpm run agent:discover -- --json
   pnpm run agent:context -- --task <app.spec.yaml> --paths modules/_backends/<id>
   ```

2. **Spec schreiben.** Eine `app.spec.yaml` (Format-Referenz:
   `docs/examples/*/app.spec.yaml`, Schema `schemas/app-spec.schema.json`) trägt
   die maschinenlesbare Absicht: `id`/`displayName`, `module.{id,destination,
owner,lifecycle,riskClass}` (`destination` MUSS unter `modules/` liegen),
   `roles`, `routes[].{path,surface}`, `requiredCapabilities`, `workflows`,
   `dataClassifications`, `humanApproval`, `acceptanceCriteria[].tests`,
   `permittedExternalSources`, `domainVocabulary`. Diese Datei ist der INPUT —
   nie einen Beispiel-Slug hart übernehmen.

3. **Governance-Vertrag ableiten:**

   ```bash
   pnpm run app:new -- --spec <app.spec.yaml>
   ```

   `app:new` (`tooling/template/lib/agent-platform.ts`, `deriveModuleContract`)
   erzeugt/aktualisiert unter `module.destination` deterministisch:
   `module.contract.yaml` (die maschinenlesbare Grenze — `permittedDependencies`,
   `consumedCapabilities`/`platformPorts`, `routes`, `permissions`
   `<id>.<role>`, `events.produces`, `storage.ownsTables`/`migrations`,
   `retention`, `humanApproval`, `audit.appendOnlyEvents`), dazu
   `domain.module.yaml`, `permissions/`, `events/`, `migrations/database/`
   (Tabelle mit `tenant_id`/`authority_id`), Screen-Contracts je Persona,
   `forms/`, `i18n/`, `tests/`, `compliance/profile.example.json`. Bestehende
   Fachdateien werden bewahrt (`writeIfMissing`), der Contract wird neu
   abgeleitet.

4. **Den ModuleServer schreiben.** Unter `modules/_backends/<id>/server/index.ts`
   den `ModuleServer` als reine Descriptoren + Handler ausformulieren (Routen mit
   `surface`, `operationId`, `requiredPermissions`; Fachdaten aus `ctx.body`, nie
   Scope aus Query/Body; Datenzugriff nur über `ctx.ports`). `moduleId` MUSS dem
   späteren `APP_MODULES`-Eintrag entsprechen.

5. **Mounten.** Die Runtime discovert per Env und mountet nach der Domain-API:

   ```bash
   APP_MODULES=<id>,<id2> pnpm run dev:api
   ```

   `discoverModules(env)` lädt GENAU die gelisteten Module (dynamischer `import`
   des gebauten `dist-domain-servers/<id>/server/index.js`; der Loader ist für
   Tests injizierbar), `mountModules` registriert ihre Public-Routen. Der Cutover
   (`stripModuleOwnedStores`) entfernt vom Modul übernommene Monolith-Routen →
   genau EIN Routen-Eigentümer.

6. **Verifizieren** (siehe „Gates & Verifikation") und im LOOP korrigieren, bis
   grün. Für offizielle Fachquellen ggf. `pnpm run source:fetch -- --source <id>`;
   Abschluss über `pnpm run agent:verify -- --task <app.spec.yaml>` (Report unter
   `.agent/runs/<run-id>/report.json`).

## Vertrag & Leitplanken

Was der Host für JEDES Modul ERZWINGT (`module-host.ts`) — ein Modul kann diese
Garantien nicht umgehen, deshalb muss der Modul-Code sich nicht darum kümmern:

- **Guard-Kette je Route, fail-closed und in dieser Reihenfolge:** Session
  (401) → Tenant-Pinning (403) → `requiredPermissions` als RBAC-UND (ALLE Rechte
  nötig; Prüfung via `!== undefined`, damit ein Leerstring-Recht nicht
  fail-OPEN durchfällt) → VOR-GESCOPTE Ports → `handle` → `ModuleResult`→HTTP
  (immer `Cache-Control: no-store`).
- **VOR-GESCOPTE Ports (Fix-First #1).** Der Host baut GENAU die in
  `requiredPorts` genannten Ports und bindet den Mandanten EINMAL im Closure
  (`scope.tenantId`); die Port-Methoden nehmen `tenantId` gar nicht an. `ctx.scope`
  ist `readonly` und wird eingefroren — ein Handler kann PHYSISCH keinen fremden
  Mandanten adressieren. Ein verlangter, nicht verfügbarer/unbekannter Port
  WIRFT beim Bauen (kein stiller `undefined`-Port). Braucht ein Backend einen
  neuen Port, wird dieser HOST-seitig in `buildModulePorts` (unter `apps/`, mit
  session-gebundenem Mandanten) verdrahtet — nie im Modul.
- **Framework-/Infrastruktur-agnostisch.** Ein Modul importiert nie Fastify,
  `pg`, `@senticor/app-store-postgres`, `@senticor/provider-*` und
  reimplementiert keine Plattformfähigkeit (Auth/Session). `check:module-boundaries`
  erzwingt das; Plattformcode (`apps`/`packages`) darf umgekehrt nicht aus
  `modules/` importieren.
- **Zonen-Trennung.** `PUBLIC_SURFACES = ["citizen","caseworker","audit"]`;
  Routen der Zone `internal` werden auf dem Public-Server NICHT gemountet.
- **Discovery fail-closed.** Ein in `APP_MODULES` gelistetes, nicht
  ladbares/ungültiges Modul WIRFT (ein „Backend" darf nicht lautlos
  verschwinden); `moduleId` muss dem Listen-Eintrag entsprechen; doppelte
  `method+path` über Module WIRFT (`assertModuleRoutesUnique`). Sind Module
  gesetzt, aber fehlt die Datenschicht (`moduleHostDeps`), bootet die Runtime
  nicht; die Header-Auth-Sperre feuert auch, wenn NUR Module mounten (Fix-First
  #2).
- **HITL & append-only.** `humanApproval` der Spec landet im Contract und in
  `compliance/profile.example.json`; kritische Schreib-Routen tragen
  `RouteDescriptor.fourEyes`; Audit-Events sind append-only (`audit.appendOnlyEvents`).
  Fachwerte (Tarife, Fristen, Schwellen) sind DATEN im Modul, nie Inline-Konstanten
  in Plattformcode; Unbelegtes folgt der Annahme-DATEN-Konvention aus `AGENTS.md`.

## Gates & Verifikation

Diese Läufe sichern die Naht ab — lokal vorwegnehmen, bis grün:

- `pnpm run typecheck` — schließt `typecheck:domain-servers` ein
  (`tsconfig.domain-servers.json`, deckt `modules/_backends/**` strikt ab).
- `pnpm run check:module-boundaries` — kein Framework-/Infra-/Provider-Import,
  keine reimplementierte Plattformfähigkeit; keine `modules/`-Importe aus
  `apps`/`packages`.
- `pnpm run check:module-contracts` — `module.contract.yaml` vorhanden und
  konsistent (`schemaVersion`, `moduleId` == `domain.module.yaml`-`id`,
  `consumedCapabilities`).
- `pnpm run check:domain-contracts` — Fach-Domänen-Regime (überspringt
  `_`-präfigierte Backend-Ordner).
- `pnpm run test` — u. a. `apps/fachverfahren/server/module-host.test.ts`:
  Guard-Kette, Mandanten-Pinning, fail-closed Discovery und ein e2e-Lauf über
  `discoverModules` + `mountModule` gegen ein echtes Backend.
- Gebündelt: `pnpm run check:agent-domain` (Contracts + Boundaries + Capability-
  /Source-Katalog + `test`) und Abschluss `pnpm run agent:verify -- --task <spec>`.

## Minimalbeispiel

Generischer `ModuleServer` für ein beliebiges Verfahren `<domain>` — reine
Descriptoren + Handler, Datenzugriff nur über den vor-gescopten Port, Scope nur
aus `ctx.scope`:

```ts
// modules/_backends/<domain>/server/index.ts
import type {
  ModuleServer,
  ModuleResult,
  RouteDescriptor,
} from "@senticor/public-sector-sdk";

// Nur der (vom Host gebaute, mandanten-gebundene) Port — kein Store-Typ, kein pg.
interface VorgangPort {
  list(input: { offen?: boolean }): Promise<readonly unknown[]>;
}
interface DomainPorts {
  vorgang: VorgangPort;
}

const routes: readonly RouteDescriptor<DomainPorts>[] = [
  {
    method: "GET",
    path: "/api/<domain>/vorgaenge",
    surface: "caseworker",
    operationId: "<domain>.vorgang.list",
    requiredPermissions: ["<domain>.caseworker"],
    handle: async (ctx): Promise<ModuleResult> => ({
      ok: true,
      body: {
        // Mandant steckt im Closure des Ports (ctx.scope.tenantId) — nicht als Argument.
        vorgaenge: await ctx.ports.vorgang.list({
          offen: ctx.query["offen"] === "true",
        }),
      },
    }),
  },
];

export const server: ModuleServer<DomainPorts> = {
  moduleId: "<domain>", // == APP_MODULES-Eintrag
  // Host baut GENAU diese, vor-gescopt. Jeder Name MUSS zuvor host-seitig in `buildModulePorts`
  // verdrahtet sein (heute existiert nur "notification"); ein unbekannter/nicht verfügbarer Port WIRFT beim Boot.
  requiredPorts: ["vorgang"],
  routes,
};
export default server;
```

Ein reines event-first Backend deklariert statt `routes` nur `consumers`
(`ConsumerDescriptor`, `eventTypes`) und verarbeitet Domänen-Events aus der
Outbox — dieselbe Scope-/Port-Disziplin gilt.
