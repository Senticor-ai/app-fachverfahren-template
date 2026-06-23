# Testing Skill

Nutze diese Anleitung, wenn ein Agent Änderungen in diesem Repository
verifiziert.

## Standardreihenfolge

1. `pnpm run check:esm`
2. `pnpm run check:typescript-policy`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run test:k8s:render`
6. `pnpm run evidence:build`

Für Template-Lifecycle-Änderungen zusätzlich:

```bash
pnpm run test:template
pnpm run check:template-invariants
pnpm run check:scaffold
pnpm run check:scaffold-reproducible
```

Bei schmalen Änderungen darf zunächst ein Pakettest laufen. Vor Abschluss
einer plattformweiten Änderung müssen die Standardchecks versucht werden.

## Evidence

Fehler nicht nur im Chat beschreiben. Wenn ein Test Evidence erzeugt, nutze den
generierten Report als Quelle. Das Compliance-Evidence-Bundle liegt unter
`dist/evidence/`.
