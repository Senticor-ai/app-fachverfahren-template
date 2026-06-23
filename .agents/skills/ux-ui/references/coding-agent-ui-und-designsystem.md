# Coding-Agent UI Und Design-System Checklist

Use this as the compact checklist for the shared design-system and agent-facing
Build Console vocabulary.

## Design-System Source Of Truth

- Doc 3 Teil B is authoritative for shared tokens, typography, motion,
  component rules and accessibility.
- Use React, Vite, Tailwind v4, shadcn-style primitives, Inter, Lucide and
  semantic HSL tokens.
- Treat raw HSL component tokens as source values only. Components, stories and
  generated code use direct `--color-*` aliases such as `--color-text`,
  `--color-sidebar` and `--color-status-warn`.
- Never write `color: var(--foreground)` or Tailwind classes like
  `text-[var(--foreground)]`; use the matching color alias or a deliberate
  token-source wrapper `hsl(var(--foreground))`.
- Keep `packages/public-sector-ui` as the template's reusable public contract;
  shadcn primitives remain implementation details.
- Use one font family throughout. Numbers and dates use `tabular-nums`, not a
  mono font.
- Radius stays `0.5rem`. Status colors always use semantic status tokens plus
  text or icon.
- Respect `prefers-reduced-motion`; print rules hide shell chrome with
  `.no-print`.
- The design-system source of truth is generic. Domain examples may define data
  and rules, but not new token semantics or one-off component colors.

## Build Console Vocabulary

- The Build Console is a calm management UI, not a raw agent log.
- Layout grammar: `ContextRail` on the left, `WorkspacePanel` on the right and
  `GovernanceBar` at the top.
- The composer remains in the Working Context; the left rail is orientation and
  control, not chat.
- Agent progress appears as readable Run Cards with status, agent, inputs,
  summary and relevant detail.
- Only active, blocked or decision-relevant cards should be expanded by default.
- Findings must show finding ID, source/platform rule, affected artifact or
  agent, correction, owner and gate impact.
- Gate status covers accessibility, SBOM, SCA, secrets, AI eval, tests and
  evidence.
- Inbox, Compare and Story/Replays are management surfaces for decisions,
  differences and reproducibility, not places to expose raw runtime internals.
- No agent approves itself. Creating, checking, approving and deploying remain
  separate steps.

## Storybook Contract

- Add Storybook coverage before app/runtime changes.
- Keep `UX-Methodik/Source Set` aligned whenever this source set changes.
- Keep Build Console components documented through `Public Sector UI/Components`
  and `UX-Methodik/Source Set`.
- Do not surface agent-runtime internals, provider terms or raw token streams in
  citizen or Sachbearbeitung primary UI.
- Gate and story text should use repo-relative references, never paths from a
  local downloads folder.
