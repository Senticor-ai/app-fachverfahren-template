# Dokumentation — app-fachverfahren-template

> **Status:** Doku-Index · Baum geordnet und gegen das Repository verifiziert am **2026-09-11**.
> **Lizenz:** EUPL-1.2 · © Senticor GmbH. Dieses Repository ist Senticors urheberrechtliche
> Open-Source-Arbeit — es trägt **kein** proprietäres Substrat (kein Wissen, keine Governance, kein
> `cognitive-hive.*`). Governance und Wissen kommen zur Bauzeit als Overlay von außen.

Dieses Repository ist der **versionierte Plattform-Unterbau** für Fachverfahren der öffentlichen Hand:
App-Shell, Fastify-Server, Fähigkeits-/Port-Verträge, Provider-Adapter, der `fachverfahren-kit` und die
Template-Lifecycle-CLI. Ein governter Build klont es live von `main` und füllt genau **eine Naht** —
**je Verfahrenstyp eine**: `apps/fachverfahren/src/leistung.config.ts` (Antrag/Vorgang) oder
`apps/fachverfahren/server/procedure.config.ts` (Fall/Dossier). Welcher Typ wann gilt, steht in
[`agents/fachverfahren-typen.md`](agents/fachverfahren-typen.md); der vendor-neutrale Vertrag dafür in
[`reference/governed-build-contract.md`](reference/governed-build-contract.md), ohne Namen der
erzeugenden Fabrik.

## Der Baum

| Ordner                           | Rolle             | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`reference/`](reference/)       | **Eigenvertrag**  | Die 16 verbindlichen Verträge des Repos, nach Gruppen: **Build** (governed-build-contract, template-lifecycle, precommit-hooks, esm-strict) · **Backend** (backend-fastify, rbac, db-migrations, web-delivery, kubernetes-delivery, ci-image-builds) · **UI** (fachverfahren-kit-components, storybook, mock-data-msw) · **Qualität/KI/Agenten** (test-driven-development, ai-assist-integration, opencode-agent-readiness) |
| [`architecture/`](architecture/) | As-built          | Systemüberblick, Deutschland-Stack, Fall-/Dossier-Workflow — plus zwei Dokumente mit `Status: PLAN` im Kopfblock (`domain-modules`, `repeating-group-fields`)                                                                                                                                                                                                                                                               |
| [`adr/`](adr/)                   | Entscheidung      | Architecture Decision Records (7 + Vorlage) — Kontext → Entscheidung → Konsequenz                                                                                                                                                                                                                                                                                                                                           |
| [`capabilities/`](capabilities/) | Vertrag           | Die 13 Fähigkeits-/Port-Verträge (identity, payment, mailbox, audit, workflow, records, data-exchange, ai-assist, blob-storage …)                                                                                                                                                                                                                                                                                           |
| [`ux-ui/`](ux-ui/)               | Vertrag + Audit   | UX-Vertrag, `DESIGN-UPGRADE-SPEC.md`, drei Audits (Design-Manual, Source-Set, UX-Methodik), Screen-Contract-Vorlage und `screen-contracts/`                                                                                                                                                                                                                                                                                 |
| [`compliance/`](compliance/)     | Nachweis          | Evidence-Vertrag und Beispiel-Compliance-Profil                                                                                                                                                                                                                                                                                                                                                                             |
| [`operations/`](operations/)     | Runbook           | Laufzeit-Konfiguration                                                                                                                                                                                                                                                                                                                                                                                                      |
| [`migration/`](migration/)       | Runbook           | Migrationspfade (Babelfish)                                                                                                                                                                                                                                                                                                                                                                                                 |
| [`validation/`](validation/)     | Baseline          | Template-Evaluation                                                                                                                                                                                                                                                                                                                                                                                                         |
| [`agents/`](agents/)             | Referenz          | Agenten-Anbindung (Bootstrap, Codex, Gemini, opencode) + Fachverfahren-Typen                                                                                                                                                                                                                                                                                                                                                |
| [`examples/`](examples/)         | Beispiel          | Durchgespielte Verfahren: Hundesteuer, Hunderegister, Beschaffung, HR-Einstellung, Integrationsberatung                                                                                                                                                                                                                                                                                                                     |
| [`planning/`](planning/)         | **offene Arbeit** | Pläne, die **nicht** As-built sind — vor Nutzung gegen den Code prüfen                                                                                                                                                                                                                                                                                                                                                      |
| [`archive/`](archive/)           | **ungültig**      | Verschobene, nicht mehr geltende Dokumente. Jede Zeile in [`archive/README.md`](archive/README.md) nennt Grund und Nachfolger                                                                                                                                                                                                                                                                                               |
| [`assets/`](assets/)             | Medien            | Screenshots                                                                                                                                                                                                                                                                                                                                                                                                                 |

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

Ein governter Build füllt **genau eine Datei** mit Fachinhalt und lässt die App-Shell unberührt.
Welche, entscheidet der Verfahrenstyp:

```
apps/fachverfahren/src/leistung.config.ts        ← die Antrags-Naht (Daten)
  └─ pnpm --filter @senticor/fachverfahren emit:contract
       └─ apps/fachverfahren/leistung.contract.json    ← der Snapshot, den externe Tore prüfen

apps/fachverfahren/server/procedure.config.ts    ← die Dossier-Naht (Fall/Akte)
  └─ pnpm --filter @senticor/fachverfahren emit:procedure-contract
       └─ apps/fachverfahren/procedure.contract.json   ← der zweite Snapshot
```

In einer erzeugten App heißt der Antragspfad `apps/<domain>/src/leistung.config.ts` — der Scaffold
benennt das App-Verzeichnis um, nicht die Naht.

Die **Form** der Antrags-Naht kommt zum Agenten, statt dass er sie sich aus dem Typgraphen liest:
`pnpm seam:shape` druckt sie, `pnpm seam:check --from <datei|-> [--part <teil>]` prüft VOR dem
Schreiben, `pnpm seam:set --from … --part <teil>` schreibt einen Teil. `seam:check` ist eine echte
Teilmenge von `check:leistung-contract` (keine Snapshot-Frische, kein `verifyDatenanbindung`) — das
Gate bleibt die Wahrheit.

## Eigene Tore — die Vorlage prüft sich selbst

| Lauf                       | Umfang                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run check:precommit` | `check:git-hygiene` + `check:fast` — der Runner `tooling/check/run-checks.mjs` fährt die 23 Einträge der `precommit:check`-Kette NEBENLÄUFIG; `tooling/check/lanes.json` hält `typecheck` vor `test` seriell, der Report landet in `reports/checks.json`. Die Liste: [`reference/precommit-hooks.md`](reference/precommit-hooks.md) |
| `pnpm run check:ci`        | = `check:push` (`scripts/ci-validate.sh`): `build:packages`, `check:precommit`, `check:dockerfile-paths`, `build:app`, `build:server`, `check:web-delivery`, `check:openapi`, `smoke:runtime`, `test:e2e`. Mit `CI_PROFILE=full` zusätzlich K8s-Render, `check:k8s-delivery`, Supply-Chain und Evidence                             |
| in **keinem** Tor          | nur manuell: `check:docs-manifest`, `check:runbook-commands`, `check:docs-language`                                                                                                                                                                                                                                                 |

Ein Push landet nur grün. Die vollständige Script-Liste steht in [`../package.json`](../package.json) —
sie ist die Ground Truth, diese Tabelle ist die Übersicht.

## Pflegevertrag

- Jedes Dokument hat genau **eine** Rolle und liegt im Ordner dieser Rolle. Verträge nach `reference/`
  bzw. `capabilities/`, As-built nach `architecture/`, Entscheidungen nach `adr/`, offene Arbeit nach
  `planning/`.
- **Geplantes nie als As-built schreiben.** Ein Entwurf einer ZIELARCHITEKTUR darf in `architecture/`
  liegen, wenn sein Kopfblock `Status: PLAN` trägt (Konvention `AGENTS.md`, „Kopfblock-Standard") —
  heute `domain-modules.md` und `repeating-group-fields.md`. Arbeitspläne dieses Repos gehen dagegen
  nach `planning/`. Ohne diese Markierung ist ein Plan in `architecture/` ein Versprechen, das wie ein
  Nachweis aussieht.
- **Archivieren statt löschen.** Ein ungültig gewordenes Dokument zieht nach
  `docs/archive/<datum>/<ursprünglicher Pfad>`, bekommt in Zeile 1 eine Archiv-Plakette und in
  [`archive/README.md`](archive/README.md) eine Zeile mit Grund und Nachfolger. Eingehende Links werden
  im selben Zug gezogen oder entfernt.
- `docs/ux-ui/` ist **vertraglich erforderlich** (`completeness.requiredDirs` der Vorlagen-Deklaration
  auf Fabrik-Seite) — nicht umbenennen, nicht leeren.
- Wer ein Dokument verschiebt, zieht mit: eingehende Links, die Ownership-Muster in
  `tooling/template/lib/ownership-parity.test.ts` **und** das generierte Manifest
  (`pnpm run check:docs-manifest`, Erzeuger `apps/fachverfahren/scripts/emit-docs-manifest.mts`).
  Das Manifest ist generiert — nie von Hand ändern.
- Keine Secrets, keine PII, keine Domänen-Literale im Kit. Das Repo ist öffentlich.

## Stand 2026-09-11

Der Baum wurde gegen den Code nachgezogen. Drei Dokumente sind nach
[`archive/`](archive/) gezogen — der fertige Composable-Plan aus `planning/`, der an EINE benannte
Fabrik adressierte Vorfallbericht aus `reference/` und die doppelte Agenten-Konfiguration aus
`contributing/`; der Ordner `contributing/` ist damit leer und entfallen. Grund und Nachfolger stehen
je Zeile in [`archive/README.md`](archive/README.md).

Zwei Dinge gehören danach in den Code-Zug, nicht in diesen Index:

- Die Ownership-Muster in `tooling/template/lib/ownership-parity.test.ts` — der Commit, der die
  Archiv-Verschiebungen STAGED, nimmt `docs/archive/**` in `updateUnmanagedPaths` auf und entfernt
  `docs/contributing/**`, sonst wird der Dead-Entry-Test rot.
- Das generierte Doku-Manifest — nach dieser Runde
  `pnpm --filter @senticor/fachverfahren emit:docs` laufen lassen, sonst zeigt das Doku-Wiki
  (`/hilfe`) den alten Stand.
