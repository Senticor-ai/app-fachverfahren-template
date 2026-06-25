# Fachverfahren Design Manual Checklist

Use this as the compact checklist for generated Fachverfahren apps,
Bürgerportale and Storybook review surfaces.

## Design Principles

- Progressive disclosure: ask path-deciding questions first and reveal details
  only when needed.
- Simple language for citizens; precise but concise language for employees.
- Use proper German umlauts in copy. Do not replace umlauts with `ae`, `oe` or
  `ue` fallback spellings in visible UI text.
- Data minimization and once-only: do not ask again for known data; mark
  prefilled values as taken over and editable.
- Persona density: citizen calm and guided, caseworker dense and efficient,
  management/audit overview and drilldown.
- Accessibility is architectural: labels, keyboard, focus, contrast, reflow and
  reduced motion from the first story.
- Failure states are designed: loading, empty, error, recovery, success.
- Orientation comes before input: users must always understand where they are,
  what is missing and what happens next.

## Shell And Navigation

- Use a persistent shell around routes. Navigation/profile/settings do not
  rebuild between screens.
- Navigation is role/permission gated. UI roles are not authorization.
- Profile and settings are reachable from the shell. Accessibility settings are
  user-controlled, not forced globally.
- Citizen navigation is minimal and task-oriented.
- Caseworker navigation supports inbox, assigned cases, reviews, deadlines,
  search and detail work.
- Detail/workspace screens need breadcrumbs and independent scroll containers.
- The shell must not rebuild or flicker on route changes. Shell chrome stays
  stable while the active workspace changes.
- Collapsible sidebars need a static mode and a delayed hover mode. If hover
  expansion exists, pointer/focus timers must avoid open/close flicker and
  respect reduced motion.
- Mobile navigation uses an off-canvas drawer/sheet and closes on route change.
- For Sachbearbeiter:in workspaces, keep the Design Manual story
  `Design Manual/Fachverfahren` aligned with the app shell, navigation,
  breadcrumbs and master-detail behavior.

## Design System

- `packages/public-sector-ui` is the public template contract.
- shadcn/ui, Tailwind v4, Inter and Lucide are implementation primitives.
- KERN-like public-sector patterns may inform UX, but shadcn primitives stay
  underneath the template UI contract.
- Use semantic HSL tokens: background, foreground, surface, border, ring,
  status-ok, status-warn, status-block, status-info, status-muted and soft
  variants.
- Use direct `--color-*` aliases in component code; raw HSL component tokens are
  only the token source.
- Use `tabular-nums` for numbers and dates. Do not use mono font for tabular
  data.
- Keep radius at `0.5rem`; avoid decorative spacing or one-off components.
- Respect `prefers-reduced-motion`.
- Keep a single font family. Use `tabular-nums` for numbers and dates instead
  of mono text.

## Forms

- Start with path-deciding questions.
- Use progressive disclosure for dependent fields.
- Provide inline validation in plain language; say what to correct and how.
- Derive supported client-side constraints from
  `modules/<domain>/forms/*.form.schema.json` and keep server-side schemas
  authoritative.
- Mark required fields clearly.
- Provide review before submit and confirmation with case/reference number.
- Persist drafts and support recovery.
- Use real browser form semantics, labels, autocomplete tokens and
  programmatically linked errors.
- Keep React helper components at module scope. Use local render helpers as
  `{renderStep()}`, not as nested JSX component types.

## Lists And Tables

- Caseworker lists use master-detail by default.
- Provide sorting/filtering, sticky headers, keyboard row activation and
  pagination for large result sets.
- Use status badges with semantic text/icon.
- Bulk review is expected where many similar decisions exist.
- If pagination or bulk review is not implemented yet, keep it visible as an
  RC-Gap in `docs/ux-ui/fachverfahren-design-manual-audit.md`.
- Rows that navigate must be whole-row keyboard targets with Enter/Space support
  and clear `aria-label`s.

## AI/HCAI

- AI suggestions are assistance only unless a concrete domain explicitly allows
  more.
- Mark AI output clearly and provide source, confidence and a "why" disclosure.
- Provide accept, reject and manual override controls.
- Keep draft state before legally relevant decisions.
- Audit overrides and show uncertainty honestly.
- AI assistance needs a designed escalation path for missing source, low
  confidence or disputed suggestions.

## Accessibility

- Target BITV 2.0 / WCAG 2.2 AA.
- Visible labels, full keyboard path and visible focus are mandatory.
- 400 percent zoom must reflow without function loss.
- Status must not rely on color alone.
- Error messages need recovery paths and programmatic field association.
- High contrast, larger text, reduced density and reduced motion are
  persistable settings.
- Loading, Empty, Error and Success states must be represented in Storybook for
  each new user-facing workflow.
- Inactive placeholders such as language or accessibility modes are not rendered
  in the live app unless they have real destinations or functionality.

## Template Resolution Notes

- The source manual says "no KERN UI" and promotes shadcn directly. This
  template keeps `public-sector-ui` as the public contract and shadcn as an
  implementation detail so generated Fachverfahren can be upgraded centrally.
- If a future decision makes shadcn the public contract, update AGENTS.md,
  this skill, the UI package boundary and Storybook rules together.
