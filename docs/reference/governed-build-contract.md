# Governed-Build-Vertrag

Dieses Template ist so gebaut, dass ein **externer, governter Build-Agent** ein
Fachverfahren aus ihm generieren und deterministisch abnehmen kann — ohne den
Kit-Code zu ändern. Der Vertrag ist vendor-neutral: er beschreibt _Nahtstelle,
Emit/Check, Gates und Pflicht-Artefakte_, nicht ein konkretes Produkt.

## 1. Die EINE Austausch-Naht

Ein Verfahren wird ausschließlich über **eine** Datei instanziiert:

```
apps/fachverfahren/src/leistung.config.ts   →  export const leistungConfig: LeistungConfig
```

Alles andere (Kit-Komponenten, Server, Gates) bleibt generisch. Der Generator
schreibt **nur** diese Config; er erfindet keine Kit-Dateien.

## 2. Emit → committeter Vertrags-Snapshot

Nach jeder Config-Änderung wird der JSON-Vertrag neu erzeugt und **mitcommittet**:

```bash
pnpm --filter @senticor/fachverfahren emit:contract   # → apps/fachverfahren/leistung.contract.json
```

`leistung.contract.json` serialisiert die Business-Logik als DATEN (Tarif-Staffeln,
Codelisten mit Provenienz, Feldregeln, Register-/FIM-Referenzen, Fristen-Typen,
StatusMachine) — nicht als `[function]`-Marker. So kann ein Gate den Vertrag prüfen,
ohne die `.ts`-Config zu importieren.

## 3. Pflicht-Gates (deterministisch, lokal + CI)

| Gate | Prüft |
|------|-------|
| `pnpm run check:leistung-contract` | Snapshot frisch **und** generisch wohlgeformt (id/label, ≥1 Schritt, widerspruchsfreie StatusMachine, Detail-Sektionen, Register-Suchfelder, ≥1 Rechtsgrundlage). |
| `pnpm run check:esm` | Strikte ESM-/`.js`-Endungs-Politik. |
| `pnpm run check:typescript-policy` | TypeScript-Quellpolitik. |
| `pnpm run check:domain-contracts` | Domänen-/Modul-Verträge. |
| `pnpm run check:css-tokens` | Nur Token-Aliase, kein rohes `var(--…)`. |
| `pnpm run check:motion` | Dezente Motion (kein `animate-bounce`, keine literalen Dauer-Klassen über Baseline). |
| `pnpm run check:storybook` | Storybook-/UX-Abdeckung. |
| `pnpm run typecheck` · `pnpm run test` | Typen + Unit-Tests. |
| `pnpm run test:e2e` | Reales Bundle wird auf allen Persona-Routen ausgeliefert (`app.inject()`, kein Browser). |
| `pnpm run test:k8s:render` | K8s-Render-Delivery. |

Der Sammel-Lauf `pnpm run check:precommit` bündelt die schnellen Gates;
`pnpm run check:agent-release` fügt Build + Delivery-Checks hinzu.

## 4. Persona-Routen (Web-Delivery)

Der Fastify-Server (`apps/fachverfahren/server/`) liefert das SPA auf allen
client-seitigen Persona-Routen aus — `/` (Bürger), `/buerger`, `/amt`,
`/aufsicht` — plus Health (`/livez`/`/readyz`/`/startupz`). Siehe die Skill
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
