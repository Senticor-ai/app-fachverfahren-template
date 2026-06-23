---
name: template-fleet
description: Manage many Fachverfahren template consumers. Use when inspecting consumer versions, planning fleet updates, creating draft update MRs, retrying failures, or classifying conflicts.
---

# Template Fleet

Use central fleet commands; do not push directly to default branches.

## Workflow

1. Inspect configured consumers:

```bash
pnpm run template:consumers:status -- --json
```

2. Prepare updates locally:

```bash
pnpm run template:consumers:update -- --to <version>
```

3. Create draft MRs only when credentials and remotes are configured:

```bash
pnpm run template:consumers:mr -- --to <version>
```

4. Publish a report:

```bash
pnpm run template:consumers:report -- --json
```

## Safety

- Use least-privilege GitLab tokens.
- Open draft MRs; never push template changes directly to default branches.
- Classify conflicts as managed-file drift, consumer-owned change, migration
  precondition failure, or environment failure.
- Include generated-app checks in every MR summary.
