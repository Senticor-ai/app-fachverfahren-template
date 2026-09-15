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
die Landing (`/`) und das Doku-Wiki (`/hilfe`) sind die einzigen Routen ohne
Anmeldung, alle Persona- und Workspace-Sichten liegen hinter dem Session-Gate. Für die angemeldeten
Sichten zusätzlich die App-Runtime starten — Voraussetzung ist ein
erreichbares Postgres — leichter Weg `docker compose up -d` (die
`docker-compose.yml` im Wurzelverzeichnis), Cluster-naher Weg das Manifest
`dev/postgres.yaml`; beide übersteuerbar via `APP_PG_URL`:

```bash
pnpm run dev:api
```

Beim ersten Start den Administrationszugang auf der Landing (`/`) mit dem
Bootstrap-Token `dev-setup` einrichten. Das Token ist **an genau diesen
Startweg gebunden**: `scripts/dev-api.mjs:31` setzt es, und nur wenn
`BOOTSTRAP_TOKEN` undefiniert ist UND kein `AUTH_BOOTSTRAP_ADMIN_EMAIL`
gesetzt ist. Bei jedem anderen Startweg ist Bootstrap ungesetzt = **aus**
(`.env.example:49`) — dort `BOOTSTRAP_TOKEN` bzw. `AUTH_BOOTSTRAP_ADMIN_*`
selbst setzen. Ausführlich im `README.md`, Abschnitt „Lokal starten".

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

Husky richtet beim Installieren einen Pre-Commit-Hook ein. Der Hook prüft
zuerst, ob `apps/fachverfahren/leistung.contract.json` zum **gestagten** Stand
passt — er zieht die Emit-Closure per `git show :<pfad>` aus dem INDEX in ein
Temp-Verzeichnis und emittiert dort, ohne Worktree oder Index anzufassen. Danach
ruft er `pnpm run check:precommit` auf (= `check:git-hygiene` + `check:fast`, der
nebenläufige Runner über die `precommit:check`-Kette). Details und Bypass-Regeln
stehen in `docs/reference/precommit-hooks.md`.

Demo- und Registerdaten leben deterministisch in der `LeistungConfig`-Naht.
MSW ist Test-Schicht (`pnpm run test:browser`); eine fachliche Mock-Schicht ist
nicht Teil der App (`docs/reference/mock-data-msw.md`).

Wenn eine Änderung ein neues Domain-Modul einführt (Generator-Pfad, PLAN),
muss sie das Manifest, Rechte, Events, Datenkategorien, Retention und
Compliance-Profil mitliefern.

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
