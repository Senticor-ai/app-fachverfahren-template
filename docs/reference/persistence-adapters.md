> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST
> Quellen: `packages/app-store-contracts`, `packages/fachverfahren-domain`, `packages/app-store-postgres`
> Pflicht-Lektüre vorher: `AGENTS.md`, dieses Dokument, `docs/adr/0001-provider-neutral-store-contracts.md`, `docs/adr/0004-kanban-as-action-thing-view.md`

# Persistence adapters

## Layers

| Boundary                     | Contracts                                                                                           | Implementations                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Browser / application UI     | `VorgangPort`, `BoardPort`, `AttachmentPort`, `RegisterLookupPort`                                  | HTTP clients; in-memory Storybook/test adapters |
| Server application layer     | `CaseService`, attachment routes, (PLAN) Action/Thing services                                      | Domain orchestration, authz, projection         |
| Persistence / provider layer | `CaseStore`, `ThingStore`, `ActionStore`, `KanbanStore` (view cache), `AttachmentStore`, `AppStore` | Postgres / InMemory / Unavailable; later CHOS   |

**Provider seam = server stores only.** A future `provider-chos` implements store interfaces from `@senticor/app-store-contracts`. Browser ports stay provider-independent.

## Domain model (Kanban)

```text
ThingStore  (CreativeWork, Person, Organization, Event, Product, MediaObject, …)
    ^
    | object
ActionStore (ApproveAction, ReadAction, CommunicateAction, ReviewAction, …)
    ^
    | projectActionsToBoardView
BoardPort / KanbanStore  (VIEW / optional materialised cache)
```

Cards represent **Actions on Things**, not free-floating tasks. Prefer
`sourceKey = action:<actionId>` and references `Action` + `Thing`.

## IST matrix

| Concern               | Port (browser)                 | Service / view                    | Store                       | Package                          |
| --------------------- | ------------------------------ | --------------------------------- | --------------------------- | -------------------------------- |
| Cases / Vorgänge      | `VorgangPort` (HTTP client)    | `CaseService`                     | `CaseStore`                 | contracts + `app-store-postgres` |
| Things / Actions      | (PLAN BoardPort from Actions)  | `projectActionsToBoardView`       | `ThingStore`, `ActionStore` | domain + contracts + InMemory    |
| Kanban boards         | `BoardPort`                    | materialised cache of Action view | `KanbanStore`               | contracts + `app-store-postgres` |
| Attachments           | `AttachmentPort` (HTTP client) | attachment routes                 | `AttachmentStore`           | contracts + `app-store-postgres` |
| Preferences / mailbox | BFF client                     | BFF routes                        | `AppStore`                  | contracts + `app-store-postgres` |
| Register lookup       | `RegisterLookupPort`           | local Naht mock                   | —                           | not part of case seam            |

The production app (`apps/fachverfahren/src/store.ts`) uses `createVorgangClient()` —
not `createFachverfahrenStore`. Storybook/tests keep the in-memory kit store.

## Env / failure

- Missing `APP_PG_*` → deliberate `Unavailable*Store` → data routes return 503; readiness reflects it.
- Empty `APP_PG_*` → startup/configuration error (fail fast).
- Runtime DB outage → `StoreUnavailableError` / 503.
- Local DEV: `APP_CASE_STORE=memory`, `APP_THING_STORE=memory`, `APP_ACTION_STORE=memory`, `APP_ATTACHMENT_STORE=memory`.
- `LocalFs` attachments are single-node DEV only.

## CHOS today vs PLAN

- **IST:** CHOS is generator/preview/governance ([`chos-code-integration.md`](chos-code-integration.md)), not persistence.
- **PLAN:** `provider-chos` implements `CaseStore`, `ThingStore`, `ActionStore`, `AttachmentStore`. Kanban may be served as Action projection without a separate board SoR. No scaffold `PERSISTENCE_MODE` in this slice.

## Attachment lifecycle

Unbound upload token → bind atomically on `einreichen` → orphan TTL purge for unbound drafts. Bytes never in case JSON, API JSON (except binary download), logs, or Zustand. Media Things (`ImageObject`, `AudioObject`, `VideoObject`) may reference the same attachment ids.
