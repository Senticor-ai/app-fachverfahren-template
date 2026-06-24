# CHOS Warm-Start — dieses Repo ist die FERTIGE Startbasis

> **Kernregel: KOMPONIEREN + DELTAS FÜLLEN, NICHT NEU BAUEN.**
> Dieses Template ist ein vollständiges, kompilierendes Monorepo. Server, UX-Bibliothek,
> Plattform-Verträge und alle Qualitäts-Gates sind bereits da. Ein neues Fachverfahren
> entsteht, indem du **ausschließlich die wenigen Delta-Dateien unter `modules/<domain>/`**
> mit Domänen-WERTEN füllst — geklont aus `modules/_template/`, geformt wie
> `modules/neutral-example/`.

Wenn du (Mensch oder Agent) hier startest, baue **nichts** von Grund auf nach, was schon
existiert. Der häufigste und teuerste Fehler ist, einen eigenen `server/`, ein eigenes
`web/index.html` oder eine eigene Komponenten-Bibliothek zu erzeugen. Das ist alles vorhanden.

## Was bereits FERTIG ist (NICHT neu bauen)

| Baustein                                                    | Ort                                        | Du nutzt es durch                                             |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Fastify-Server (App-Factory, OpenAPI, AJV, Session, Health) | `apps/fachverfahren-template/server/`      | Modul-Routen einhängen (`modules/<domain>/server/routes.ts`)  |
| UX-Komponenten (BITV, shadcn/Tailwind+KERN, Storybook)      | `packages/public-sector-ui/`               | **importieren** (`@senticor/public-sector-ui`), nie nachbauen |
| Plattform-Ports (Identity/Payment/Mailbox/Audit/Workflow/…) | `packages/platform-contracts/`             | Ports aufrufen, nie Provider direkt                           |
| Domain-Kernel/Authz/Audit/Manifest                          | `packages/public-sector-sdk/`              | `@senticor/public-sector-sdk`                                 |
| App-Shell + Surfaces + MSW-Mocks + i18n                     | `apps/fachverfahren-template/src/`         | Modul-Screens werden hier sichtbar                            |
| Qualitäts-Gates (geerdet, kein LLM-Judge)                   | `scripts/check-*.mjs`, `tooling/template/` | `pnpm run agent:verify` & `check:*`                           |
| **Gefüllte Referenz** (kompiliert!)                         | `modules/neutral-example/`                 | Form kopieren, Werte ersetzen                                 |
| **Leeres Delta-Skelett**                                    | `modules/_template/`                       | nach `modules/<domain>/` klonen                               |

## Der einzige Weg (5 Schritte)

```bash
pnpm install --frozen-lockfile
pnpm run agent:context -- docs/examples/<instanz>/app.spec.yaml   # Pflicht-Lesedateien
pnpm run app:new      -- docs/examples/<instanz>/app.spec.yaml   # erzeugt modules/<domain>/
#  → jetzt die Delta-Dateien aus .chos/build-manifest.json mit WERTEN füllen
pnpm run agent:verify && pnpm run check:domain-contracts && pnpm run typecheck && pnpm run test
pnpm run dev   # Surfaces im Browser klickbar (127.0.0.1:5173)
```

## Die Delta-Dateien (das ist ALLES, was du generierst)

Vollständige, maschinenlesbare Liste mit Vertrag, Kompositions-Komponenten, Quelle und Gate
je Datei: **[`.chos/build-manifest.json`](./build-manifest.json)**.

Kurzfassung pro `modules/<domain>/`:

- `domain.module.yaml` — Routen/Capabilities/Rechte/Events/Retention/FIM-Referenzen
- `contracts/citizen-intake.screen.yaml` · `caseworker-workspace.screen.yaml` · (`audit-review.screen.yaml`)
- `forms/intake.form.schema.json` + `forms/<domain>.rules.json` (**Tarife/Fristen als DATEN**)
- `server/routes.ts` (Ports!) + `server/berechnung.ts` (reine, **vollständige** Funktion)
- `ui/<Domain>.stories.tsx` (komponiert public-sector-ui)
- `permissions/permissions.yaml` · `events/events.yaml` · `i18n/de.json`
- `migrations/database/<ts>_<domain>.sql` · `compliance/profile.example.json` · `tests/<domain>.test.ts`

## Harte Regeln (sonst Gate-Fail)

1. **Keine Domänen-Inhalte außerhalb `modules/<domain>/`** (Plattformcode bleibt neutral).
2. **Tarife/Sätze/Fristen/Schwellen sind DATEN** (`forms/<domain>.rules.json`), nie inline im Code.
3. **UI nur durch Komposition** aus `@senticor/public-sector-ui` — ShadCN bleibt Implementierungsdetail, rohe Farben verboten (KERN-Token).
4. **Nur Ports**, keine Provider direkt. **4-Augen serverseitig** erzwungen.
5. **Nur TypeScript** unter `modules/` (kein `.js/.jsx/.cjs/.mjs`).
6. **Screen-Contract zuerst**, dann Screen. Pflicht-States Default/Loading/Empty/Error/Success.
7. Fertig ist ein Delta erst, wenn **die Ziel-Datei existiert UND ihr Gate grün ist** — Text ohne Datei zählt nicht.

Domänen-/Rechtsannahmen, die nicht aus einer belegten Quelle (FIM-ID, Satzung) stammen,
werden als `Annahme zu validieren` markiert.
