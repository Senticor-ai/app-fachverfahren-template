# Mitwirken

## Frontend aus dem Template-Checkout starten

Dieser Abschnitt richtet sich an Beitragende am Template selbst. Konsumenten
starten stattdessen ihr gescaffoldetes Repository (siehe README, „Lokal
starten") oder erkunden die Bausteine login-frei mit `pnpm run storybook`.

```bash
mise install
pnpm install
pnpm run dev
```

`pnpm run dev` allein zeigt nur die Landing mit „Server nicht erreichbar":
die Landing (`/`) ist die einzige Route ohne Anmeldung, alle Persona- und
Workspace-Sichten liegen hinter dem Session-Gate. Für die angemeldeten
Sichten zusätzlich die App-Runtime starten — Voraussetzung ist ein
erreichbares Postgres (Manifest: `dev/postgres.yaml`, übersteuerbar via
`APP_PG_URL`):

```bash
pnpm run dev:api
```

Beim ersten Start den Administrationszugang auf der Landing (`/`) mit dem
Bootstrap-Token `dev-setup` einrichten (Default nur für lokale Entwicklung).

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
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:storybook
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

## Troubleshooting

Wenn `pnpm run dev` wegen eines fehlenden Binaries wie `vite` abbricht, fehlen
die lokalen Workspace-Abhängigkeiten. In diesem Fall im Repository-Root erneut
installieren:

```bash
pnpm install
pnpm run dev
```

Das passiert auch, wenn zuvor production-only installiert wurde.

Der Vite-Dev-Server bindet lokal standardmäßig an `127.0.0.1:5173`. Für
Container- oder LAN-Zugriff kann der Host explizit geöffnet werden:

```bash
VITE_DEV_HOST=0.0.0.0 pnpm run dev
```
