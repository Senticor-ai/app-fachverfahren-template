# Testing Skill

Nutze diese Anleitung, wenn ein Agent Aenderungen in diesem Repository
verifiziert.

## Standardreihenfolge

1. `pnpm run check:esm`
2. `pnpm run check:typescript-policy`
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run test:k8s:render`
6. `pnpm run evidence:build`

Bei schmalen Aenderungen darf zunaechst ein Pakettest laufen. Vor Abschluss
einer plattformweiten Aenderung muessen die Standardchecks versucht werden.

## Evidence

Fehler nicht nur im Chat beschreiben. Wenn ein Test Evidence erzeugt, nutze den
generierten Report als Quelle. Das Compliance-Evidence-Bundle liegt unter
`dist/evidence/`.
