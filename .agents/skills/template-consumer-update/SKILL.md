---
name: template-consumer-update
description: Update generated Fachverfahren apps from the lifecycle template. Use in consumer repositories with .template metadata before manually copying template files.
---

# Template Consumer Update

Never manually copy files from the template before trying the updater.

## Workflow

1. Inspect state:

```bash
pnpm run template:status -- --json
pnpm run template:doctor
```

2. Preview:

```bash
pnpm run template:diff -- --to <version>
```

3. Update from a clean worktree:

```bash
pnpm run template:update -- --to <version>
```

4. Resolve reported conflicts according to `.template/ownership.yaml`.
5. Run generated-app checks:

```bash
pnpm run check:template-invariants
pnpm run check:scaffold
pnpm run precommit:check
```

## MR Summary

Include old and new template versions, update mode, migrations applied,
managed files changed, consumer modifications preserved, conflicts, and checks.
