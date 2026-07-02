# Domain-Module

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für dieses Verzeichnis (leer), PLAN für das Modul-Layout und die
> App-Einbindung.
> Quellen: `tooling/template/lib/agent-platform.ts` (`app:new`),
> `schemas/module-contract.schema.json`, `AGENTS.md` (Root).
> Pflicht-Lektüre vorher: `AGENTS.md`.

## IST-Stand

Dieses Verzeichnis enthält KEINE Modul-Instanz — nur diese Dokumentation. Die
EINE ausgelieferte App (`apps/fachverfahren`) nutzt den Modul-Weg nicht: Sie
rendert vollständig aus der Austausch-Naht
`apps/fachverfahren/src/leistung.config.ts`. Das ist der kanonische Weg für
ein neues Fachverfahren in diesem Repository (siehe `AGENTS.md`,
„DIE EINE Austausch-Naht").

## Generator-Pfad (PLAN für die App-Einbindung)

Der Generator `pnpm run app:new -- --task <app-spec>` erzeugt aus einer
App-Spezifikation (`docs/examples/*/app.spec.yaml`) ein Modul-Gerüst unter
`modules/<domain>/` mit `AGENTS.md`, `module.contract.yaml`,
`domain.module.yaml`, Screen Contracts, Form-Schema, Permissions, Events,
Migrationen, Tests und Compliance-Profil. Die Struktur validieren:

```bash
pnpm run check:domain-contracts
pnpm run check:module-contracts
pnpm run check:module-boundaries
```

WICHTIG (PLAN-Grenze): Die laufende App entdeckt und mountet solche Module
NICHT — es gibt keinen Modul-Mount, kein `import.meta.glob` und keinen
Server, der `modules/<domain>/server/` einbindet. Ein generiertes Modul ist
ein geprüftes Artefakt-Gerüst, keine sichtbare Oberfläche. Wer die Einbindung
baut, entfernt diese PLAN-Markierung im selben Change.

## Regeln, wenn hier Module entstehen

- Wiederverwendbare UI-Bausteine liegen in
  `packages/fachverfahren-kit/src/components/` (Katalog:
  `docs/reference/fachverfahren-kit-components.md`) und werden importiert,
  nicht kopiert.
- Fachliche Werte (Tarife, Fristen, Schwellen) sind Daten im Modul, nie
  Inline-Konstanten in Plattformcode; Unbelegtes folgt der
  Annahme-DATEN-Konvention aus `AGENTS.md`.
- Vor einem Screen steht sein Screen Contract
  (Vorlage: `docs/ux-ui/screen-contract.template.yaml`).
- Der Template-Runtime-Code bleibt domain-neutral; nichts aus einem Modul
  wandert in Plattformpakete zurück.
