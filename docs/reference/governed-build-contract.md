# Governed-Build-Vertrag

Dieses Template ist so gebaut, dass ein **externer, governter Build-Agent** ein
Fachverfahren aus ihm generieren und deterministisch abnehmen kann — ohne den
Kit-Code zu ändern. Der Vertrag ist vendor-neutral: er beschreibt _Nahtstelle,
Emit/Check, Gates und Pflicht-Artefakte_, nicht ein konkretes Produkt.

## 1. Die Austausch-Nähte — eine je Verfahrenstyp

Ein Verfahren wird ausschließlich über **eine** Datei instanziiert — welche,
entscheidet der Verfahrenstyp (Details:
[`../agents/fachverfahren-typen.md`](../agents/fachverfahren-typen.md)):

```
apps/fachverfahren/src/leistung.config.ts     →  export const leistungConfig: LeistungConfig
                                                 (Antrag/Vorgang — der Bürger-Antragspfad)
apps/fachverfahren/server/procedure.config.ts →  die Dossier-Naht (Fall/Akte — Fall/Dossier-Pfad)
```

In einer **erzeugten** App heißt der Antragspfad `apps/<domain>/src/leistung.config.ts`;
der Scaffold benennt das App-Verzeichnis um, nicht die Naht.

Alles andere (Kit-Komponenten, Server, Gates) bleibt generisch. Der Generator
schreibt **nur** diese Config; er erfindet keine Kit-Dateien.

**Build-Scratch nie unter `modules/`.** `check:domain-contracts` prüft jedes
Verzeichnis ohne `_`-Präfix dort als _vollständiges_ Modul
(`scripts/check-domain-contracts.mjs:68-73`), und `check:module-contracts`
verlangt in **jedem** Verzeichnis eine `module.contract.yaml`
(`tooling/template/lib/agent-platform.ts:436-439`). Es gibt unter `modules/`
keinen CI-sicheren Ablageort. Erdung, Korpus-Bindung und Phasen-Artefakte
gehören nach `.chos/` oder `docs/domain/`. Ein wirklich gemeintes Modul wird
generiert (`pnpm run app:new -- --spec <app.spec.yaml>`), nie von Hand
geschrieben.

## 1a. Die Naht als Werkzeug

Die Form der Naht kommt zum Agenten, statt dass der Agent sie sich aus dem
Typgraphen liest. Quelle jeder Regel ist
`packages/fachverfahren-kit/src/leistung-contract-form.ts` — dieselbe, die
`check:leistung-contract` ausführt:

```bash
pnpm seam:shape
pnpm seam:check --from <datei|->
pnpm seam:set --from <datei|-> --part <teil>
```

`seam:check` ist eine echte **Teilmenge** von `check:leistung-contract`: es prüft
weder die Frische des Snapshots noch `verifyDatenanbindung`. Das Gate bleibt die
Wahrheit; das Werkzeug ist die früheste Warnung.

## 2. Emit → committeter Vertrags-Snapshot

Nach jeder Config-Änderung wird der JSON-Vertrag neu erzeugt und
**mitcommittet** — je Naht einer:

```bash
pnpm --filter @senticor/fachverfahren emit:contract
pnpm --filter @senticor/fachverfahren emit:procedure-contract
```

Der erste schreibt `apps/fachverfahren/leistung.contract.json`, der zweite
`apps/fachverfahren/procedure.contract.json`.

`leistung.contract.json` serialisiert die Business-Logik als DATEN (Tarif-Staffeln,
Codelisten mit Provenienz, Feldregeln, Register-/FIM-Referenzen, Fristen-Typen,
StatusMachine, `antrag.konditionierendesFeld`) — nicht als `[function]`-Marker. So
kann ein Gate den Vertrag prüfen, ohne die `.ts`-Config zu importieren.

## 3. Pflicht-Gates (deterministisch, lokal + CI)

| Gate                                   | Prüft                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run check:leistung-contract`     | Snapshot frisch **und** Pflichtform (die 8 Pflichten `id`, `label`, `kommune`, `rechtsgrundlagen`, `antrag.steps`, `statusMachine.states`, `detailSektionen`, `register.suchfelder`) **und** die Antrags-/Zustandsmaschinen-Invarianten (`leistung-contract-form.ts:227`, `:425` — u. a. `konditionierendesFeld` in `steps[0]`) **und** `verifyDatenanbindung`. |
| `pnpm run check:procedure-contract`    | Dossier-Naht + `procedure.contract.json` (Frische + generische Wohlgeformtheit).                                                                                                                                                                                                                                                                                |
| `pnpm run check:antrag-procedure`      | Antrags- und Dossier-Naht widersprechen einander nicht.                                                                                                                                                                                                                                                                                                         |
| `pnpm run check:composables`           | Agentic-Composable-Manifeste.                                                                                                                                                                                                                                                                                                                                   |
| `pnpm run check:bpmn-example`          | Das mitgelieferte BPMN-Beispiel bleibt gültig.                                                                                                                                                                                                                                                                                                                  |
| `pnpm run check:esm`                   | Strikte ESM-/`.js`-Endungs-Politik.                                                                                                                                                                                                                                                                                                                             |
| `pnpm run check:typescript-policy`     | TypeScript-Quellpolitik.                                                                                                                                                                                                                                                                                                                                        |
| `pnpm run check:domain-contracts`      | Domänen-/Modul-Verträge.                                                                                                                                                                                                                                                                                                                                        |
| `pnpm run check:css-tokens`            | Nur Token-Aliase, kein rohes `var(--…)`.                                                                                                                                                                                                                                                                                                                        |
| `pnpm run check:motion`                | Dezente Motion (kein `animate-bounce`, keine literalen Dauer-Klassen über Baseline).                                                                                                                                                                                                                                                                            |
| `pnpm run check:storybook`             | Storybook-/UX-Abdeckung.                                                                                                                                                                                                                                                                                                                                        |
| `pnpm run typecheck` · `pnpm run test` | Typen + Unit-Tests.                                                                                                                                                                                                                                                                                                                                             |
| `pnpm run test:e2e`                    | Reales Bundle wird auf allen Persona-Routen ausgeliefert (`app.inject()`, kein Browser).                                                                                                                                                                                                                                                                        |
| `pnpm run test:k8s:render`             | K8s-Render-Delivery.                                                                                                                                                                                                                                                                                                                                            |

Der Sammel-Lauf `pnpm run check:precommit` bündelt die schnellen Gates;
`pnpm run check:agent-release` fügt Build + Delivery-Checks hinzu.

## 4. Persona-Routen (Web-Delivery)

Der Fastify-Server (`apps/fachverfahren/server/`) liefert das SPA auf allen
client-seitigen Routen aus — `/` (Landing/Anmeldung) und `/hilfe` (Doku-Wiki)
ohne Anmeldung, dazu `/buerger`, `/amt`, `/aufsicht` — plus Health
(`/livez`/`/readyz`/`/startupz`). Siehe die Skill
[`backend-fastify`](../../.agents/skills/backend-fastify/SKILL.md).

## 5. Pflicht-Artefakte

- `apps/fachverfahren/src/leistung.config.ts` (Naht) + `apps/fachverfahren/leistung.contract.json` (Snapshot).
- `docs/ux-ui/` (UX-Vertrag, Design-Manual-Audit) — von der Storybook-Abdeckung erwartet.
- `agent.discovery.json` (Skills/Checks/Commands) + `.agents/skills/*` (komponierte Skills).

## 6. Governance-Overlay (Hinweis)

Ein governter Build kann eine **Verfassungs-/Governance-Datei** und weitere
Substrat-Artefakte **zur Laufzeit** über dem Projekt einblenden (Overlay,
nicht kopiert). Das Template selbst ist **vendor-neutral** und trägt kein
solches Substrat — es erfüllt nur diesen Vertrag. Der Overlay-Mechanismus ist
Sache des Build-Systems, nicht dieses Repos.
