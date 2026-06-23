# TypeScript Strict Skill

Nutze diese Anleitung fuer TypeScript- und ESM-Aenderungen.

## Regeln

- Alle Packages deklarieren `"type": "module"`.
- TypeScript verwendet `NodeNext`, `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` und `noUnusedLocals`.
- Relative Imports in TS-Quellen verwenden die zur Laufzeit entstehende
  `.js`-Endung.
- Keine CommonJS-Syntax, keine `.cjs`-/`.cts`-Dateien.
- Implementierungscode unter `apps/`, `packages/`, `jurisdictions/` und
  `modules/` ist TypeScript-only. Keine `.js`, `.jsx`, `.cjs` oder `.mjs` in
  diesen Bereichen, außer generierte Assets wie der MSW Worker.
- Optional Properties nicht als `undefined` serialisieren; Felder nur setzen,
  wenn ein Wert vorhanden ist.

## Check

```bash
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run typecheck
```
