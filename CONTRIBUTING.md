# Mitwirken

## Entwicklungsregeln

- Wiederverwendbare Logik gehoert in `packages/*`.
- Fachlogik gehoert in `modules/<domain>/`.
- Providerdetails gehoeren in `packages/provider-*`.
- Rechtsraumlogik gehoert in `jurisdictions/*`.
- UI-Vertraege gehoeren in `packages/public-sector-ui`; ShadCN bleibt
  Implementierungsdetail.
- App-, Package-, Jurisdiction- und Domain-Modul-Code ist TypeScript-only.
  Verwende `.ts` oder `.tsx`; keine `.js`, `.jsx`, `.cjs` oder `.mjs` in
  `apps/`, `packages/`, `jurisdictions/` oder `modules/`. Generierte Assets wie
  der MSW Worker sind die einzige Ausnahme.

## Lokale Pruefung

```bash
pnpm install
pnpm run precommit:check
pnpm run format:check
pnpm run check:typescript-policy
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:k8s:render
pnpm run evidence:build
```

Husky richtet beim Installieren einen Pre-Commit-Hook ein. Der Hook ruft
`pnpm run precommit:check` auf. Details und Bypass-Regeln stehen in
`docs/reference/precommit-hooks.md`.

Mockdaten fuer Plattformfunktionen laufen ueber MSW. Neue fachliche Mockdaten
gehoeren in Domain-Module; Details stehen in `docs/reference/mock-data-msw.md`.

Wenn eine Aenderung ein neues Domain-Modul einfuehrt, muss sie das Manifest,
Rechte, Events, Datenkategorien, Retention und Compliance-Profil mitliefern.
