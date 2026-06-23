# Strict ESM und Node 24

Dieses Repository ist strict ESM.

## Vertrag

- Node.js: `>=24 <25`
- Package Manager: `pnpm`
- Package-Format: alle Workspaces deklarieren `"type": "module"`
- TypeScript: `module` und `moduleResolution` sind `NodeNext`
- Keine CommonJS-Syntax in Quellcode
- Keine `.cjs`- oder `.cts`-Quellen
- Implementierungscode unter `apps/`, `packages/`, `jurisdictions/` und
  `modules/` ist TypeScript-only: `.ts` oder `.tsx`. `.js`, `.jsx`, `.cjs` und
  `.mjs` sind dort nicht erlaubt. Ausnahme: generierte Assets wie
  `apps/fachverfahren-template/public/mockServiceWorker.js`.

Der automatisierte Check läuft mit:

```bash
pnpm run check:esm
pnpm run check:typescript-policy
```

## Import-Regeln

Relative TypeScript-Imports verwenden die `.js`-Endung, weil sie nach dem
Build als echte ESM-Imports ausgeführt werden.

```ts
import { buildApp } from "./app.js";
```

Package-Imports laufen über Workspace-Namen wie
`@senticor/platform-contracts`.
