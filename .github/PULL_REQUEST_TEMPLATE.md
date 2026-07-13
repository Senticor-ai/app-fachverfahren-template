## Was & Warum

<!-- Kurz: was ändert dieser PR und aus welchem Grund (Root-Cause, nicht Symptom)? -->

## Art der Änderung

- [ ] fix (Fehlerbehebung)
- [ ] feat (neue Funktion)
- [ ] chore / docs / refactor / test

## Checkliste

- [ ] `pnpm run check:precommit` ist grün
- [ ] Änderung ist additiv/rückwärtskompatibel und bleibt generierbar
      (`check:scaffold`, `check:template-invariants`)
- [ ] Fachlogik liegt in der Austausch-Naht (`leistung.config.ts`), nicht als Sonderlogik
- [ ] Keine personenbezogenen Daten, Geheimnisse oder internen Referenzen im Diff
      (`check:no-internal-leaks`)
- [ ] Neue Personendaten-Tabellen: Datenkategorien + Retention gepflegt
- [ ] Commit-Nachrichten folgen Conventional Commits

## Lizenz

Mit diesem PR bestätige ich, dass mein Beitrag unter der **EUPL-1.2** eingebracht wird.
