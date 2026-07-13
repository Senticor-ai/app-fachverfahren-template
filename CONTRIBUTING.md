# Mitwirken

## Entwicklungsregeln

- Wiederverwendbare Logik gehört in `packages/*`.
- Fachlogik gehört in die Austausch-Naht
  `apps/fachverfahren/src/leistung.config.ts` (siehe `AGENTS.md`); der
  Modul-Pfad `modules/<domain>/` ist der Generator-Weg (PLAN, siehe
  `modules/README.md`).
- Providerdetails gehören in `packages/provider-*`.
- Rechtsraumlogik gehört in `jurisdictions/*`.
- UI-Verträge gehören in `packages/public-sector-ui`; ShadCN bleibt
  Implementierungsdetail.
- App-, Package-, Jurisdiction- und Domain-Modul-Code ist TypeScript-only.
  Verwende `.ts` oder `.tsx`; keine `.js`, `.jsx`, `.cjs` oder `.mjs` in
  `apps/`, `packages/`, `jurisdictions/` oder `modules/`. Ausnahmen sind nur
  die in `scripts/check-esm-policy.mjs` allowgelisteten Interop-Assets.

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
`pnpm run check:precommit` auf (führt `check:git-hygiene` und `precommit:check`
aus). Details und Bypass-Regeln stehen in `docs/reference/precommit-hooks.md`.

Demo- und Registerdaten leben deterministisch in der `LeistungConfig`-Naht;
eine MSW-Mock-Schicht ist (PLAN) in `docs/reference/mock-data-msw.md`
beschrieben.

Wenn eine Änderung ein neues Domain-Modul einführt (Generator-Pfad, PLAN),
muss sie das Manifest, Rechte, Events, Datenkategorien, Retention und
Compliance-Profil mitliefern.

## Pull Requests, Commits und Lizenz

- **Branch/PR:** Zweig von `main`, PR gegen die kanonische Quelle
  `github.com/Senticor-ai/app-fachverfahren-template`. `check:precommit` muss
  grün sein, bevor ein PR review-fähig ist.
- **Commit-Konvention:** Conventional Commits, z. B.
  `feat(modules): …`, `fix(security): …`, `chore(oss): …`, `docs(...): …`.
- **Inbound-Lizenz:** Beiträge werden unter der **EUPL-1.2** eingebracht
  (inbound = outbound); mit dem Öffnen eines PRs bestätigst du, dass du deinen
  Beitrag unter dieser Lizenz beisteuern darfst.
- **Verhalten & Sicherheit:** Es gilt der [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md);
  Sicherheitslücken NICHT als öffentliches Issue, sondern nach
  [`SECURITY.md`](SECURITY.md) melden.
