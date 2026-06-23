# Mitwirken

## Entwicklungsregeln

- Wiederverwendbare Logik gehört in `packages/*`.
- Fachlogik gehört in `modules/<domain>/`.
- Providerdetails gehören in `packages/provider-*`.
- Rechtsraumlogik gehört in `jurisdictions/*`.
- UI-Verträge gehören in `packages/public-sector-ui`; ShadCN bleibt
  Implementierungsdetail.
- App-, Package-, Jurisdiction- und Domain-Modul-Code ist TypeScript-only.
  Verwende `.ts` oder `.tsx`; keine `.js`, `.jsx`, `.cjs` oder `.mjs` in
  `apps/`, `packages/`, `jurisdictions/` oder `modules/`. Generierte Assets wie
  der MSW Worker sind die einzige Ausnahme.

## Lokale Prüfung

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

Mockdaten für Plattformfunktionen laufen über MSW. Neue fachliche Mockdaten
gehören in Domain-Module; Details stehen in `docs/reference/mock-data-msw.md`.

Wenn eine Änderung ein neues Domain-Modul einführt, muss sie das Manifest,
Rechte, Events, Datenkategorien, Retention und Compliance-Profil mitliefern.
