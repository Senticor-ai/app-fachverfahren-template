# Public Sector UX Methodik Checklist

Use this as the compact operational checklist for generated public-sector
Fachverfahren. Domain examples should reference this guidance instead of
copying it.

## Method Before UI

- Start with problem, role and measurable success. Do not start from tooling.
- Document Jobs to be Done, touchpoints, journey/service blueprint, open
  questions and assumptions before implementing a domain UI.
- Capture the Fachkonzept as artifacts: scope, roles, journey, KI strategy,
  data/rule model, sources, non-goals, assumptions and measurable success.
- Treat research gaps as `Annahme zu validieren`; never invent legal rules.
- Human review is required before a generated Fachverfahren is treated as
  accepted.
- Do not let an agent approve itself. Creation, review, release and deployment
  are separate steps.

## HCAI And AI

- Public-sector default is assistive or proposing AI, not autonomous decisions.
- If AI appears, show source, confidence, why-details, accept/reject/override and
  audit.
- Choose AI autonomy from risk, reversibility, maturity, explainability,
  compliance and long-term maintainability, not from technical ambition.
- If outputs feed later AI steps, keep the chain short and show when upstream
  changes affect downstream suggestions.
- Design failure and uncertainty states. Unsure output must lead to review, not
  silent automation.
- Keep legal or irreversible actions behind human confirmation.

## App Shell And IA

- No global marketing or intro page in generated apps. Send users to the
  relevant protected work area.
- Navigation is role-filtered and permission-aware. UI roles are not
  authorization.
- Citizen experiences are guided, mobile-first and focused on one next action.
- Caseworker experiences are dense, keyboard-efficient, list-detail first and
  support filters, deadlines, decisions and search.
- Settings and accessibility controls are global and persist per user.
- Role/profile switches must re-scope visible navigation and actions
  immediately. UI role checks are presentation only; authorization remains
  server-side.
- Keep method, demo and architecture explanations out of primary navigation.
  Surface them in docs, Storybook, settings or diagnostics only when they serve a
  user task.
- The source method prefers a collapsible sidebar, mobile right drawer and no
  desktop topbar. If the template uses another shell, document the deviation as
  an RC-Gap in `docs/ux-ui/ux-methodik-public-sector-audit.md` and Storybook.

## Tables And Forms

- Tables need enough synthetic rows to validate scrolling, sorting, filtering
  and keyboard activation.
- Synthetic rows must be deterministic. Do not render `Date.now()`,
  `crypto.randomUUID()` or relative times where hydration or snapshots can
  drift.
- Desktop caseworker tables target sticky headers, two frozen lead columns,
  sort/filter affordances and multi-select quick filters with counts.
- Multi-select quick filters are chips, not tabs. They show counts, default to
  all active and do not allow the last active chip to be cleared.
- Mobile tables scroll horizontally and do not freeze columns.
- Multi-step forms ask path-deciding questions first, then details.
- Once-only prefilled values are marked as übernommen and remain editable.
- Use real `form` elements, autocomplete tokens and semantic validation with
  `err`, `warn` and `ok`; only `err` blocks submission.
- Derive supported client-side constraints from the module form schema and show
  inline recovery before submit; server-side schemas stay authoritative.
- Keep form helper components at module scope. Local render helpers are plain
  functions called as `{renderStep()}`, not nested React component definitions.
- Step navigation may stay free, but submit stays gated until all blocking
  validation is resolved. The final review names the first incomplete step and
  offers a jump back.

## Accessibility And Tokens

- Target WCAG 2.2 AA / BITV 2.0.
- Visible labels, full keyboard path, visible focus, 400 percent zoom and clear
  recovery paths are mandatory.
- Status never relies on color alone; use icon or text with the color state.
- Accessibility options are user-controlled: contrast, larger text, density and
  reduced motion.
- Use semantic tokens, radius `0.5rem`, tabular numbers and dark mode. Avoid
  raw component colors.
- Generated UI uses direct `--color-*` aliases. Raw HSL component tokens such as
  `--foreground` stay internal to the token source.
- Do not turn every accessibility option on by default. Users choose their
  contrast, density, motion and font-size preferences.

## Storybook Contract

- Add or update Storybook before treating UI as done.
- Keep `UX-Methodik/Public Sector` aligned with the app and docs.
- Keep domain examples concise. Generic rules belong in docs, this skill,
  Storybook contracts or app guardrails.
- If a rule is not met yet, say so as `RC-Gap`; do not hide it behind a polished
  mock.
- Keep method explanations out of the live app unless they support a concrete
  user task.
