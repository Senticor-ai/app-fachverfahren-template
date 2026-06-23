---
name: ux-ui
description: Apply the Fachverfahren design manual when changing citizen, caseworker, management, Storybook, screen-contract, accessibility, or public-sector UI code in this template.
---

# UX/UI Skill

Use this before implementing UI. The source manuals are distilled in
`references/fachverfahren-design-manual.md` and
`references/public-sector-ux-methodik.md`; read both when adding or changing
screen contracts, Storybook states, form flows, app shell, AI assistance, or
public UI components. Also read
`references/coding-agent-ui-und-designsystem.md` when changing design tokens,
Storybook contracts, `packages/public-sector-ui`, Build Console components or
agent-facing UI.

## Workflow

1. Identify the persona: citizen, caseworker, management/audit, or mixed.
2. Write or update the screen contract before implementation.
3. Add the failing test or Storybook state first.
4. Implement with `packages/public-sector-ui` and shadcn primitives underneath.
5. Verify states, accessibility path, role gating, and German microcopy.

## Non-Negotiables

- Keep template/runtime domain-neutral. No Hundesteuer content outside
  validation briefs or domain modules.
- UI text and docs are German; code, identifiers, env vars and package names are
  English.
- German copy uses proper umlauts, for example `Bürgerin`, `Vorgänge`,
  `Behörde`, `Prüfung`, and `Übersicht`.
- Citizen UI is guided, mobile-first and focused on one next action.
- Caseworker UI is dense, keyboard-efficient, role-gated and list-detail first.
- Doc 3 is the authoritative shared design-system source for tokens,
  typography, motion, Build Console vocabulary and Storybook coverage.
- Do not expose architecture terms such as Basisdienste, ports or adapters in
  primary user navigation. Surface them only in diagnostics/settings when useful.
- Status uses semantic tokens plus text/icon. Never communicate state by color
  alone and never add ad-hoc component colors.
- Loading, empty, error, success and relevant accessibility states must exist in
  the screen contract and Storybook.
- If AI assistance is present, show AI marking, source, confidence, why-details,
  accept/reject/override controls and auditability.
- Keep the UX method visible in Storybook. If a method rule is intentionally not
  implemented yet, mark it as an explicit RC-Gap in the audit/story instead of
  hiding the deviation.
- Do not add product explanations, disclaimers, demo labels or architecture
  terms to the live app unless they directly serve a user task. Put method and
  review material in docs or Storybook.

## Checks

Run the relevant subset, then the full gate before handoff when feasible:

```bash
pnpm run check:domain-contracts
pnpm run check:storybook
pnpm run typecheck:storybook
pnpm run test
pnpm run precommit:check
```
