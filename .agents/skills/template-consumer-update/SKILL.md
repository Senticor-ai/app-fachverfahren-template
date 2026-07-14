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

Bootstrap for consumers scaffolded before the ownership-default merge
existed (symptom: false conflicts for files the new template manages,
e.g. `ci.yml`): the merge logic lives in the CLI you invoke, and
`pnpm run template:update` runs the consumer's already-copied — older —
CLI. Run the FIRST update with the source template's CLI instead (from
the consumer root; requires a template checkout with installed
dependencies):

```bash
node --experimental-strip-types <template-checkout>/tooling/template/cli.ts -- \
  update --to <version> --template-source-dir <template-checkout>
```

Subsequent updates can use `pnpm run template:update` again — the update
replaces `tooling/template/**` with the current CLI.

4. Resolve reported conflicts according to `.template/ownership.yaml`. The
   update merges new template defaults into that file automatically (listed
   under "Ownership Updates"; existing consumer entries always win). To opt a
   path out permanently, set its strategy to `consumer` — do not delete the
   line, deleted entries are re-added on the next update.
5. Run generated-app checks:

```bash
pnpm run check:template-invariants
pnpm run check:scaffold
pnpm run precommit:check
```

## MR Summary

Include old and new template versions, update mode, migrations applied,
managed files changed, consumer modifications preserved, conflicts, and checks.
