---
name: fachverfahren-app
description: Build or extend Fachverfahren and Bürgerportal apps from this template. Use when scaffolding a domain module, adding screen contracts, UI, tests, Storybook stories, permissions, events, migrations, compliance evidence, or exporting a standalone app from the workspace template.
---

# Fachverfahren App

Use this workflow for complete vertical slices. Keep platform code
domain-neutral; put Fachlogik under `modules/<domain>/`.

## Decision Path

1. For a new Fachverfahren, start from `modules/_template/`.
2. For an example or validation scenario, use `modules/neutral-example/` as the
   shape reference.
3. For a full generated repository, run
   `pnpm run scaffold:domain-app -- --domain <domain> --target <target-dir>`.
4. For an app-only export, run `pnpm run scaffold:standalone -- <target-dir>`.
5. For any UI change, create or update a screen contract before implementing the
   screen.
6. For UI, Storybook, app-shell, form or screen-contract work, read
   `.agents/skills/ux-ui/SKILL.md` before coding.

## Source Lookup

- Web search is allowed for official domain sources when building or validating
  a domain module.
- For German public-sector services, agents may search `https://fimportal.de`
  and use FIM Leistung IDs, names and hierarchy as source references.
- Treat FIM as a structural source, not as the complete legal basis. Concrete
  statutes, fees, deadlines and local rules still need the responsible
  jurisdiction's source or the status `Annahme zu validieren`.
- Record source URLs and retrieved IDs in the domain manifest, screen contract,
  compliance profile or test evidence where they affect behavior.

## Domain Module Workflow

Create or update:

- `domain.module.yaml`
- `contracts/*.screen.yaml`
- `ui/*.stories.tsx`
- `permissions/*.yaml`
- `events/*.yaml`
- `migrations/`
- `tests/`
- `compliance/`

Then run:

```bash
pnpm run check:domain-contracts
pnpm run check:typescript-policy
pnpm run check:storybook
pnpm run typecheck:storybook
pnpm run test
```

## App Workflow

- Use `@senticor/platform-contracts` ports for basis services.
- Use `@senticor/public-sector-sdk` for manifests, authorization, audit and
  domain-kernel primitives.
- Use `@senticor/public-sector-ui` for UI contracts; ShadCN stays an
  implementation detail.
- Write implementation code in TypeScript only. Domain modules use `.ts` and
  `.tsx`; do not add `.js`, `.jsx`, `.cjs` or `.mjs` under `modules/`.
- Use MSW mock handlers for early UI, integration and E2E states.
- Do not add domain-example details to platform runtime code.
- Keep citizen UI guided and caseworker UI dense/list-detail. Do not expose
  Basisdienste, ports or adapters in primary user navigation.
- Screen contracts must include persona, IA, content, HCAI, loading, empty,
  error, ready, success and accessibility acceptance criteria.
- For CI or container work on GitLab/opencode.de, use Kaniko, not
  Docker-in-Docker. The runners are unprivileged Kubernetes pods without a
  Docker socket.
- For workspace package builds, keep pnpm filters before `run`, for example
  `pnpm --filter "./packages/**" run --if-present build`.
- Build workspace packages before app and server outputs:
  `pnpm run build:packages`, then `pnpm run build:app`, then
  `pnpm run build:server`.

## Standalone Export Workflow

Run:

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

The exporter copies `apps/fachverfahren-template`, resolves `catalog:` specs
from `pnpm-workspace.yaml`, resolves `workspace:*` specs to local package
versions, and writes `standalone-export-report.json`.

Use this for SDK-style consumers after the internal packages are published or
otherwise available at the resolved versions.

## Full-Repo Template Workflow

Use the full-repo scaffold for opencode.de-ready apps:

```bash
pnpm run scaffold:domain-app -- --domain antragsservice --display-name Antragsservice --target /tmp/app-antragsservice
```

Generated repositories carry `.template/` provenance and the TypeScript
template CLI. Do not manually copy files from this template into a generated
repository before trying:

```bash
pnpm run template:status
pnpm run template:diff -- --to <version>
pnpm run template:update -- --to <version>
```
