---
name: shared-vs-scaffolded
description: Decide where reusable Fachverfahren platform behavior belongs. Use before adding copied template files, shared packages, GitLab components, pnpm config, migrations, or consumer-owned code.
---

# Shared Vs Scaffolded

Choose the lowest-copy mechanism that preserves updateability.

| Concern                             | Preferred Placement            |
| ----------------------------------- | ------------------------------ |
| Shared runtime behavior             | workspace or published package |
| GitLab jobs and Kaniko setup        | pinned GitLab CI/CD component  |
| ESLint, TypeScript, Vitest defaults | shared config package          |
| Dependency alignment in one repo    | pnpm catalog                   |
| Cross-repo pnpm config              | pnpm config dependency         |
| Dockerfile and bootstrap files      | template-managed file          |
| One-time structural rewrite         | template migration             |
| Domain logic and domain docs        | consumer-owned paths           |

If the answer is template-managed, update ownership rules, scaffold checks, and
release fragments in the same change.
