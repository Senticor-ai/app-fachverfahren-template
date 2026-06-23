# Public Sector UX Methodik Checklist

Use this as the compact checklist for
`/Users/wolfgang/Downloads/mdfilesuxuiskill/01_ux-methodik-public-sector-generisch.md`.

## Method Before UI

- Start with problem, role and measurable success. Do not start from tooling.
- Document Jobs to be Done, touchpoints, journey/service blueprint, open
  questions and assumptions before implementing a domain UI.
- Treat research gaps as `Annahme zu validieren`; never invent legal rules.
- Human review is required before a generated Fachverfahren is treated as
  accepted.

## HCAI And AI

- Public-sector default is assistive or proposing AI, not autonomous decisions.
- If AI appears, show source, confidence, why-details, accept/reject/override and
  audit.
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
- The source method prefers a collapsible sidebar, mobile right drawer and no
  desktop topbar. If the template uses another shell, document the deviation as
  an RC-Gap in `docs/ux-ui/ux-methodik-public-sector-audit.md` and Storybook.

## Tables And Forms

- Tables need enough synthetic rows to validate scrolling, sorting, filtering
  and keyboard activation.
- Desktop caseworker tables target sticky headers, two frozen lead columns,
  sort/filter affordances and multi-select quick filters with counts.
- Mobile tables scroll horizontally and do not freeze columns.
- Multi-step forms ask path-deciding questions first, then details.
- Once-only prefilled values are marked as übernommen and remain editable.
- Use real `form` elements, autocomplete tokens and semantic validation with
  `err`, `warn` and `ok`; only `err` blocks submission.

## Accessibility And Tokens

- Target WCAG 2.2 AA / BITV 2.0.
- Visible labels, full keyboard path, visible focus, 400 percent zoom and clear
  recovery paths are mandatory.
- Status never relies on color alone; use icon or text with the color state.
- Accessibility options are user-controlled: contrast, larger text, density and
  reduced motion.
- Use semantic tokens, radius `0.5rem`, tabular numbers and dark mode. Avoid
  raw component colors.

## Storybook Contract

- Add or update Storybook before treating UI as done.
- Keep `UX-Methodik/Public Sector` aligned with the app and docs.
- If a rule is not met yet, say so as `RC-Gap`; do not hide it behind a polished
  mock.
- Keep method explanations out of the live app unless they support a concrete
  user task.
