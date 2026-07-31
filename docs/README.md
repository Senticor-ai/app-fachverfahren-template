# Dokumentation — app-fachverfahren-template

> **Status:** Doku-Index · Baum geordnet und gegen das Repository verifiziert am **2026-07-31**.
> **Lizenz:** EUPL-1.2 · © Senticor GmbH. Dieses Repository ist Senticors urheberrechtliche
> Open-Source-Arbeit — es trägt **kein** proprietäres Substrat (kein Wissen, keine Governance, kein
> `cognitive-hive.*`). Governance und Wissen kommen zur Bauzeit als Overlay von außen.

Dieses Repository ist der **versionierte Plattform-Unterbau** für Fachverfahren der öffentlichen Hand:
App-Shell, Fastify-Server, Fähigkeits-/Port-Verträge, Provider-Adapter, der `fachverfahren-kit` und die
Template-Lifecycle-CLI. Ein governter Build klont es live von `main` und füllt genau **eine Naht** —
`apps/fachverfahren/src/leistung.config.ts`. Der vendor-neutrale Vertrag dafür steht in
[`reference/governed-build-contract.md`](reference/governed-build-contract.md), ohne Namen der
erzeugenden Fabrik.

## Der Baum

| Ordner                           | Rolle             | Inhalt                                                                                                                        |
| -------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`reference/`](reference/)       | **Eigenvertrag**  | Die verbindlichen Verträge des Repos: Build-Vertrag, Backend, Storybook, RBAC, Lifecycle, k8s-Delivery, TDD, ESM, Migrationen |
| [`architecture/`](architecture/) | As-built          | Systemüberblick, Domänen-Module, Deutschland-Stack, Fall-/Dossier-Workflow                                                    |
| [`adr/`](adr/)                   | Entscheidung      | Architecture Decision Records (7 + Vorlage) — Kontext → Entscheidung → Konsequenz                                             |
| [`capabilities/`](capabilities/) | Vertrag           | Die 13 Fähigkeits-/Port-Verträge (identity, payment, mailbox, audit, workflow, records, data-exchange …)                      |
| [`ux-ui/`](ux-ui/)               | Vertrag + Audit   | UX-Vertrag, Design-Manual-Audit, Screen-Contract-Vorlage und -Beispiele                                                       |
| [`compliance/`](compliance/)     | Nachweis          | Evidence-Vertrag und Beispiel-Compliance-Profil                                                                               |
| [`operations/`](operations/)     | Runbook           | Laufzeit-Konfiguration                                                                                                        |
| [`migration/`](migration/)       | Runbook           | Migrationspfade (Babelfish)                                                                                                   |
| [`validation/`](validation/)     | Baseline          | Template-Evaluation                                                                                                           |
| [`agents/`](agents/)             | Referenz          | Agenten-Anbindung (Bootstrap, Codex, Gemini, opencode) + Fachverfahren-Typen                                                  |
| [`contributing/`](contributing/) | Anleitung         | Agenten-Konfiguration für Beitragende                                                                                         |
| [`examples/`](examples/)         | Beispiel          | Durchgespielte Verfahren: Hundesteuer, Hunderegister, Beschaffung, HR-Einstellung, Integrationsberatung                       |
| [`planning/`](planning/)         | **offene Arbeit** | Pläne, die **nicht** As-built sind — vor Nutzung gegen den Code prüfen                                                        |
| [`assets/`](assets/)             | Medien            | Screenshots                                                                                                                   |

## Einstieg nach Rolle

| Ich bin …                             | Ich lese zuerst                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Konsument** (adoptiere die Vorlage) | [Repository-README](../README.md) → [`reference/template-lifecycle.md`](reference/template-lifecycle.md) → [`reference/governed-build-contract.md`](reference/governed-build-contract.md)                                  |
| **Generierende Fabrik / Agent**       | [`reference/governed-build-contract.md`](reference/governed-build-contract.md) → [`../AGENTS.md`](../AGENTS.md) → [`agents/`](agents/)                                                                                     |
| **Frontend/UX**                       | [`ux-ui/fachverfahren-ux-contract.md`](ux-ui/fachverfahren-ux-contract.md) → [`reference/storybook.md`](reference/storybook.md) → [`reference/fachverfahren-kit-components.md`](reference/fachverfahren-kit-components.md) |
| **Backend/Plattform**                 | [`reference/backend-fastify.md`](reference/backend-fastify.md) → [`capabilities/`](capabilities/) → [`reference/kubernetes-delivery.md`](reference/kubernetes-delivery.md)                                                 |
| **Architekt**                         | [`architecture/overview.md`](architecture/overview.md) → [`adr/`](adr/) → [`architecture/deutschland-stack.md`](architecture/deutschland-stack.md)                                                                         |
| **Auditor / Datenschutz**             | [`compliance/evidence.md`](compliance/evidence.md) → [`capabilities/audit.md`](capabilities/audit.md) → [`adr/0005-dsgvo-loeschkonzept-krypto-shredding.md`](adr/0005-dsgvo-loeschkonzept-krypto-shredding.md)             |

## Die Naht — was ein Build hier anfasst

Ein governter Build füllt **genau eine Datei** mit Fachinhalt und lässt die App-Shell unberührt:

```
apps/fachverfahren/src/leistung.config.ts     ← die kanonische Naht (Daten)
  └─ pnpm --filter @senticor/fachverfahren emit:contract
       └─ apps/fachverfahren/leistung.contract.json   ← der Snapshot, den externe Tore prüfen
```

Optional komponiert ein Build zusätzlich `modules/<domain>/ui/screens.tsx` (ModuleHost-Vertrag). Der
ModuleHost ist eine **Kompositionsschicht**, kein zweiter Pfad — die Naht bleibt so oder so
`leistung.config.ts`. Welche Naht gilt, deklariert die Fabrik data-driven; das erzeugte Projekt trägt
das Subset als `.chos/template-meta.json` (gitignored).

## Eigene Tore — die Vorlage prüft sich selbst

| Lauf                       | Umfang                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run check:precommit` | schnelle Tore: `check:esm`, `check:typescript-policy`, `check:domain-contracts`, `check:leistung-contract`, `check:storybook`, `check:css-tokens`, `check:motion`, `check:docs-manifest` + Tests, Format, Lint, Typecheck |
| `pnpm run ci-validate`     | zusätzlich: Builds (packages/app/server), `test:e2e` (Persona-Routen gegen reales Bundle), K8s-Render, Supply-Chain, Evidence                                                                                             |

Ein Push landet nur grün. Die vollständige Script-Liste steht in [`../package.json`](../package.json) —
sie ist die Ground Truth, diese Tabelle ist die Übersicht.

## Pflegevertrag

- Jedes Dokument hat genau **eine** Rolle und liegt im Ordner dieser Rolle. Verträge nach `reference/`
  bzw. `capabilities/`, As-built nach `architecture/`, Entscheidungen nach `adr/`, offene Arbeit nach
  `planning/`.
- **Geplantes nie als As-built schreiben.** Ein Plan in `architecture/` ist ein Versprechen, das wie ein
  Nachweis aussieht.
- `docs/ux-ui/` ist **vertraglich erforderlich** (`completeness.requiredDirs` der Vorlagen-Deklaration
  auf Fabrik-Seite) — nicht umbenennen, nicht leeren.
- Wer ein Dokument verschiebt, zieht mit: eingehende Links, die Ownership-Muster in
  `tooling/template/lib/ownership-parity.test.ts` **und** das generierte Manifest
  (`pnpm run check:docs-manifest`, Erzeuger `apps/fachverfahren/scripts/emit-docs-manifest.mts`).
  Das Manifest ist generiert — nie von Hand ändern.
- Keine Secrets, keine PII, keine Domänen-Literale im Kit. Das Repo ist öffentlich.

## Umbau-Nachweis 2026-07-31

Der Baum war bereits nach Rollen geordnet; lose lagen nur zwei Arbeitspläne im Wurzelverzeichnis
(`UX-UPGRADE-PLAN.md`, `PLAN-COMPOSABLE-FAEHIGKEITEN-KIT.md`) — Planung, die neben Verträgen stand.
Beide sind nach [`planning/`](planning/) gezogen. Mitgezogen wurden:

- die Ownership-Muster in `tooling/template/lib/ownership-parity.test.ts` — zwei Einzel-/Namensmuster
  (`docs/UX-UPGRADE-PLAN.md` + `docs/PLAN-*.md`) wurden zu **einem** Ordner-Muster `docs/planning/**`;
  der Dead-Entry-Test hält es weiter ehrlich. **Lauf: 4/4 grün.**
- das generierte Doku-Manifest (`pnpm --filter @senticor/fachverfahren emit:docs` → 90 Dokumente).

Zusätzlich neu: **dieser Index** — das Verzeichnis hatte keinen.
