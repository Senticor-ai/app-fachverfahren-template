---
name: domaenen-backend-modul
description: Baue ein eigenes Domänen-Backend (server-autoritative Fachlogik mit eigenen Tabellen, Routen, Rechten) auf dem AKZEPTIERTEN Weg — Store-Trias in @senticor/app-store-postgres + BFF-Routen in @senticor/app-bff-fastify hinter bffRouteAuth + ggf. Capability-Port in platform-contracts + die leistung.config-Naht für die UI. Nutze dieses Skill für "neues Backend für ein Fachverfahren", "server-seitige Fallverwaltung", "eigene API-Routen + eigene Postgres-Tabelle", "Capability-Naht statt app-lokalem Domain-Server". Der modules/<domain>-Runtime-Mount / ModuleHost ist NICHT dieser Weg (verworfen, PR #37; nur PLAN).
---

# Domänen-Backend als Capability + Store + BFF-Naht (AKZEPTIERT)

Der Weg, ein eigenes Domänen-Backend zu bauen — server-autoritative Fachlogik
mit eigenen Tabellen, Routen, Rechten und append-only Audit — auf den
package/runtime-Nähten, die der Maintainer **akzeptiert** hat (ADR-0001):

```text
docs/adr/0001-server-seitige-fallverwaltung-ueber-sdk-domain-kernel.md
```

Root-Policy und Pfad-Karte: `AGENTS.md`.

> **Wichtig — was NICHT dieser Weg ist.** Ein app-lokaler Domain-Server
> (`apps/fachverfahren/server/domain-api.ts`), der `ModuleHost`-Runtime-Mount
> per `APP_MODULES`, eine Multi-Verfahren-Registry und „dual-mode auf EINER
> `LeistungConfig`" wurden **verworfen** (ADR-0001, „Ausdrücklich NICHT";
> PR #37 geschlossen). Ein `modules/<domain>/`-Runtime-Mount (Alternative C)
> ist ausdrücklich **PLAN/nicht gemountet** (`docs/architecture/domain-modules.md`,
> `modules/README.md`) und bräuchte ein eigenes ADR. Baue NICHT dorthin.
> Eine frühere Version dieses Skills beschrieb genau diese verworfene
> Architektur — sie gilt nicht mehr.

## Kernprinzip: vier Bausteine

Ein neues Domänen-Backend entsteht aus GENAU diesen additiven Nähten. Der
gebaute Fall-/Dossier-Kern (ADR-0001) ist die lebende Blaupause — lies ihn.

1. **Store-Trias** in `@senticor/app-store-postgres` — die server-autoritative
   Datenschicht. Ein `interface XStore` plus die etablierte Impl-Trias
   **Postgres / InMemory / Unavailable** + `createXStoreFromEnv(env)`.
   Blaupause: `packages/app-store-postgres/src/case-store.ts`
   (`CaseStore`, `PostgresCaseStore`/`InMemoryCaseStore`/`UnavailableCaseStore`,
   `createCaseStoreFromEnv`) und `.../task-store.ts`. Jede Tabelle trägt
   `tenant_id`/`authority_id`/`jurisdiction_id`; Mutationen laufen mit
   Optimistic-Locking (`expectedVersion` → `XVersionConflictError`); fachliche
   Zustandswechsel schreiben ein append-only Audit-Ereignis in DERSELBEN
   Transaktion (`patchCaseState`). Migration additiv + checksum-gelockt
   (Beispiel `migrations/.../app_tasks`).

2. **BFF-Routen** in `@senticor/app-bff-fastify` — die Exposition. Neue
   `routes/<domain>.ts` nach dem Muster `routes/cases.ts` + `routes/tasks.ts`:
   - Auth ausschließlich über `bffRouteAuth({ kind: "rbac", permission })`
     (`src/route-auth.ts`).
   - Mandant/Behörde/Jurisdiktion/Akteur kommen NUR aus `sessionOf(request)`
     — nie aus Query/Body/Header. Fremd-Behörde im selben Mandanten → 404
     (keine Existenz-Leaks).
   - Store-Ausfall → `storeUnavailable(request, reply)` (503); Konflikt → 409.
   - TypeBox-Request/Response-Schemas (aus `@senticor/app-bff-contracts`),
     `requestIdOf(request)` in jeder Fehler-Antwort.
   - Der Store hängt als Port an `BffDeps` (`src/deps.ts`) und wird in
     `src/plugin.ts` via `registerXRoutes(app, deps)` registriert.

3. **Capability-Port (optional)** in `@senticor/platform-contracts`
   (`src/ports.ts`, `src/capabilities.ts`) — nur wenn die Fähigkeit eine
   austauschbare, provider-hinter-Naht ist (Stub im Template, in PROD z. B.
   chos als Provider). Fall/Dossier nutzt die BESTEHENDEN Ports
   `records-management`/`workflow`/`audit` WIEDER; eine eigenständige
   `case-management`-Capability ist **zurückgestellt** (ADR-0001 Alt. E →
   ADR-0004) und steht NICHT im Katalog (`platform/capabilities.json`). Lege
   einen neuen Capability-Eintrag nur mit ADR an — nicht spekulativ.

4. **`leistung.config`-Naht** für die UI
   (`apps/fachverfahren/src/leistung.config.ts`). Der Server ist autoritativ;
   die App bleibt dünn und steuert die Sicht über die eine Config-Naht. Für
   die 360°-Fallakte gibt es die generische Kit-Komponente `DossierAkte360`
   (`packages/fachverfahren-kit/src/components/DossierAkte360.tsx`) — aktuell
   Komponente + Story, noch KEINE App-Route (`/amt/akte/:id` ist **offen/geplant**).

## Wie ein Build-Agent (chos-code/gtc-builder) es nutzt

1. **Vendor-neutraler Einstieg** (Task, Write-Boundaries, relevante Checks):

   ```bash
   pnpm run agent:bootstrap -- --json
   pnpm run agent:discover -- --json
   pnpm run agent:context -- --task <app.spec.yaml>
   ```

2. **Verfahren als DATEN modellieren.** Zustandsmaschine + Rechtsgrundlagen
   leben in einer `ProcedureVersion` (`allowedStates`, `allowedTransitions` mit
   `requiredPermission`/`requiresFourEyes`, `legalBasisIds`) und werden über
   die `ProcedureRegistry` aufgelöst
   (`packages/public-sector-sdk/src/domain-kernel.ts`,
   `createInMemoryProcedureRegistry`). So werden `allowedStates` und eine
   Rechtsgrundlage NIE erfunden — der reine Reducer `transitionCase(...)`
   erzwingt Versions-Konflikt + Übergangs-Guards. Gespeist aus der
   `leistung.config`/BPMN-Ableitung (ADR-0002).

3. **Store schreiben** (Baustein 1) — `interface` + Postgres/InMemory/Unavailable
   - `createXStoreFromEnv`, additive Migration, InMemory==Postgres-Parität.

4. **BFF-Routen schreiben** (Baustein 2) — Port an `BffDeps`, in `plugin.ts`
   registrieren, `bffRouteAuth` + `sessionOf` + `storeUnavailable`.

5. **UI über die `leistung.config`-Naht** anbinden (Baustein 4); nur bei
   echter Provider-Austauschbarkeit einen Capability-Port (Baustein 3) mit ADR.

6. **Verifizieren** (siehe „Gates") und im LOOP korrigieren, bis grün;
   Abschluss `pnpm run agent:verify -- --task <app.spec.yaml>`.

## Konkretes Beispiel: Fall/Dossier

Das erste reale Backend auf diesem Weg ist die server-autoritative
Fallverwaltung (ADR-0001):
`case-store.ts`/`task-store.ts` (Store), `routes/cases.ts`/`routes/tasks.ts`
(BFF: `GET/POST /api/cases`, `GET /api/cases/:id`,
`POST /api/cases/:id/transitions`, `GET/POST /api/cases/:id/tasks`,
`PATCH /api/tasks/:id`, `GET /api/cases/:id/progress`). Für ein LANGLEBIGES,
akkumulierendes Dossier (Ziele/Checklisten/Notizen/Termine an EINER Akte, die
Sub-Sammlungen auf `app_cases`/`app_tasks` modelliert) ist [[dossier-fallmanagement]]
der handlungsleitende Einstieg — dieses Skill hier ist die allgemeinere
Backend-Naht dahinter.

## Vertrag & Leitplanken

- **Server-autoritativ, Session-Scope.** Mandant/Behörde/Jurisdiktion/Akteur
  IMMER aus `sessionOf(request)`, nie vom Client. Fremd-Behörde → 404.
- **Optimistic-Locking + append-only Audit.** Jede fachliche Mutation prüft
  `expectedVersion` und schreibt das Audit-Ereignis ATOMAR (eine Transaktion,
  `patchCaseState`). Audit ist append-only (`REVOKE UPDATE/DELETE` + Trigger
  auf `app_audit_events`) — eine Rechtsgrundlage (`legalBasisId`) wird NIE
  erfunden, sondern aus der `ProcedureVersion` gezogen.
- **Impl-Trias-Parität.** InMemory und Postgres verhalten sich identisch
  (Contract-Tests + `e2e:postgres`); `Unavailable` fällt fail-closed
  (Store-Ausfall → 503 via `storeUnavailable`), nie fail-open.
- **Vier-Augen server-erzwungen.** `requiresFourEyes`-Übergänge verlangen
  zwei VERSCHIEDENE Akteure (Prüfung gegen den jüngsten Audit-Eintrag,
  `routes/cases.ts`). Die KI ist strukturell nie eines der zwei Augen.
- **Dünne App.** Fachlogik liegt in versionierten Packages
  (`@senticor/app-store-postgres`, `@senticor/app-bff-fastify`,
  `@senticor/public-sector-sdk`), nicht in `apps/`. Fachwerte (Tarife, Fristen,
  Schwellen) sind DATEN, nie Inline-Konstanten (Annahme-DATEN-Konvention,
  `AGENTS.md`).

## Gates & Verifikation

Lokal vorwegnehmen, bis grün:

- `pnpm run typecheck` — strict/NodeNext über Store + BFF + SDK-Konsum.
- `pnpm run test` — u. a. die Store-Contract-Tests (InMemory + Postgres via
  `skipIf` `APP_PG_URL`) und die BFF-Routen-Tests (Auth-Kette, Behörden-Scope,
  Optimistic-Locking, Vier-Augen, `storeUnavailable`).
- `pnpm run test:migration` — Store-Parität + additive, checksum-gelockte
  Migration (InMemory vs. Postgres).
- `packages/app-store-postgres/src/audit-append-only.test.ts` — der
  Append-only-Riegel der Audit-Tabelle (läuft in `pnpm run test:pg`).
- `pnpm run check:docs-language` — diese SKILL.md ist Deutsch mit echten
  Umlauten (ä/ö/ü/ß, nicht als ASCII-Ersatz in Prosa; die Frontmatter-
  `description` ist die Discovery-Auswahl).
- `pnpm run precommit:check` bzw. `ci-validate.sh` bündeln die Gates;
  Abschluss `pnpm run agent:verify -- --task <spec>`.

## Minimalbeispiel

Generischer Baustein 1 + 2 für ein beliebiges Verfahren `<domain>` —
Store-Interface (Trias-Auszug) + eine BFF-Route hinter `bffRouteAuth`,
Scope nur aus der Session.

```ts
// packages/app-store-postgres/src/<domain>-store.ts — die Datenschicht (Trias-Kopf).
export interface DomainStore {
  insert(input: AppEntity): Promise<AppEntity>;
  get(input: { tenantId: string; id: string }): Promise<AppEntity | undefined>;
  // ATOMAR: Mutation (Optimistic-Locking) + append-only Audit in EINER Transaktion.
  patch(input: PatchEntityInput): Promise<AppEntity>;
  ping?(): Promise<void>;
}
// Impls: PostgresDomainStore / InMemoryDomainStore / UnavailableDomainStore
//        + createXStoreFromEnv(env) — exakt wie case-store.ts.
```

```ts
// packages/app-bff-fastify/src/routes/<domain>.ts — die Exposition.
import { builtInPermissions } from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js"; // Port dort ergaenzen, in plugin.ts registrieren.
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

export function registerDomainRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseRead.permission },
    deps,
  );
  app.get(
    "/api/<domain>/:id",
    { config: readAuth.config, preHandler: readAuth.preHandler /* , schema */ },
    async (request, reply) => {
      const session = sessionOf(request); // Scope NUR aus der Session — nie aus Query/Body.
      let found;
      try {
        found = await deps.domainStore.get({
          tenantId: session.tenantId,
          id: request.params.id,
        });
      } catch {
        return storeUnavailable(request, reply); // Store-Ausfall → 503, fail-closed.
      }
      // Fremd-Behoerde im selben Mandanten → 404 (keine Existenz-Leaks).
      if (!found || found.authorityId !== session.authorityId)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      return reply.send(found /* → DTO ohne Server-Topologie */);
    },
  );
}
```
