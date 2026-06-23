---
name: template-migration-author
description: Author Fachverfahren template migrations. Use when a template release must transform existing generated apps, package scripts, imports, CI files, Dockerfiles, or metadata.
---

# Template Migration Author

Use `pnpm run template:migration:new -- --id <id>` to start.

## Migration Contract

- Write migrations in TypeScript as `tooling/template/migrations/<id>/up.ts`.
- Keep migrations idempotent, deterministic, and safe in dry-run mode.
- Define preconditions and postconditions in `migration.json`.
- Use structured JSON/YAML edits where possible; avoid broad regex rewrites.
- Use exact replacements only when the expected old form must occur once.
- Report every operation through `context.report(...)`.
- Record the migration in `.template/lock.json` only after success.

## Tests

Every migration needs `migration.test.ts` covering:

- metadata shape and update mode
- idempotency
- dry-run behavior
- preservation of unrelated content
- failure behavior for missing or ambiguous preconditions

Run:

```bash
pnpm run test:template
pnpm run check:migration-coverage
```
