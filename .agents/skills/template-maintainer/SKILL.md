---
name: template-maintainer
description: Maintain the Fachverfahren template lifecycle. Use when changing generic template files, scaffold output, CI/Docker/dev tooling, template release fragments, ownership rules, migrations, or generated-app update behavior.
---

# Template Maintainer

Use this before changing generic template behavior.

## Decision Path

1. Decide placement with `shared-vs-scaffolded`.
2. If the change affects generated repositories, update the template CLI,
   scaffold checks, docs, and skills in the same change.
3. If existing consumers need a transformation, add a migration with
   `template:migration:new -- --id <id>`.
4. Add a `.template-changes/*.md` fragment with `bump`, `updateMode`, and
   `migration`.
5. Run:

```bash
pnpm run test:template
pnpm run check:template-invariants
pnpm run check:scaffold
pnpm run check:scaffold-reproducible
```

## Rules

- Implement template lifecycle code in TypeScript under `tooling/template/`.
- Put command behavior behind `pnpm run template -- <command>`.
- Keep machine output available through `--json`; do not make agents parse
  colored text.
- Keep generated provenance deterministic: no timestamps and no local paths in
  `.template/answers.json` or `.template/lock.json`.
- Do not copy domain examples into template runtime code.
- Do not change consumer-owned paths unless an explicit migration reports a
  review-mode or manual-mode change.
