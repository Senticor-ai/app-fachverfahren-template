> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST
> Quellen: `packages/app-store-contracts`, `packages/fachverfahren-domain`, `packages/app-store-postgres`
> Pflicht-Lektüre vorher: `AGENTS.md`, dieses Dokument, `docs/adr/0001-provider-neutral-store-contracts.md`

# Persistence adapters

## Layers

| Boundary                     | Contracts                                                          | Implementations                                                    |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Browser / application UI     | `VorgangPort`, `BoardPort`, `AttachmentPort`, `RegisterLookupPort` | HTTP clients; in-memory Storybook/test adapters                    |
| Server application layer     | `CaseService`, `AttachmentService`                                 | Domain orchestration, authz, config resolution, history authorship |
| Persistence / provider layer | `CaseStore`, `KanbanStore`, `AttachmentStore`, `AppStore`          | Postgres, InMemory, Unavailable; later CHOS                        |

**Provider seam = server stores only.** A future `provider-chos` implements store interfaces from `@senticor/app-store-contracts`. Browser ports and Fastify routes stay provider-independent.

## IST matrix

| Concern               | Port (browser)                 | Service           | Store             | Package                          |
| --------------------- | ------------------------------ | ----------------- | ----------------- | -------------------------------- |
| Cases / Vorgänge      | `VorgangPort` (HTTP client)    | `CaseService`     | `CaseStore`       | contracts + `app-store-postgres` |
| Kanban boards         | `BoardPort`                    | thin routes       | `KanbanStore`     | contracts + `app-store-postgres` |
| Attachments           | `AttachmentPort` (HTTP client) | attachment routes | `AttachmentStore` | contracts + `app-store-postgres` |
| Preferences / mailbox | BFF client                     | BFF routes        | `AppStore`        | contracts + `app-store-postgres` |
| Register lookup       | `RegisterLookupPort`           | local Naht mock   | —                 | not part of case seam            |

The production app (`apps/fachverfahren/src/store.ts`) uses `createVorgangClient()` —
not `createFachverfahrenStore`. Storybook/tests keep the in-memory kit store.

Boards are **independent collaboration objects**, not projections of case status. No dual-write CaseStore ↔ KanbanStore.

## Env / failure

- Missing `APP_PG_*` → deliberate `Unavailable*Store` → data routes return 503; readiness reflects it.
- Empty `APP_PG_*` → startup/configuration error (fail fast).
- Runtime DB outage → `StoreUnavailableError` / 503.
- After HTTP cutover the **running app requires Postgres** for cases (and already for boards/auth). Storybook/tests stay in-memory.
- `APP_ATTACHMENT_STORE=memory|local-fs` for DEV; LocalFs is single-node only.

## CHOS today vs PLAN

- **IST:** CHOS is generator/preview/governance ([`chos-code-integration.md`](chos-code-integration.md)), not persistence.
- **PLAN:** `provider-chos` implements `CaseStore` / `KanbanStore` / `AttachmentStore` behind the same contracts. No scaffold `PERSISTENCE_MODE` in this slice.

## Attachment lifecycle

Unbound upload token → bind atomically on `einreichen` → orphan TTL purge for unbound drafts. Bytes never in case JSON, API JSON (except binary download), logs, or Zustand.
