---
bump: minor
updateMode: review
migration: none
---

# KommuneTheme: kontrastrobustere Markenfarbe im Dark Mode

`KommuneTheme` behandelt die injizierte Markenfarbe `--primary` theme-adaptiv
und behebt dabei zwei konkrete Kontrastfehler:

- Ein scoped Stylesheet kann für `:root` und `.dark` unterschiedliche Primary-
  Werte setzen, ohne die übrigen Markenvariablen zu verändern.
- `darkModePrimary` hellt eine zu dunkle Markenfarbe bis zum definierten
  Kontrastziel auf; `pickForeground` verwendet den korrekten Schwarz-/Weiß-
  Übergang und `parseColor` versteht auch HSL-Farben.

Unit-Tests sichern Farbparsing, Vordergrund-Auswahl und Dark-Mode-Ableitung ab.
Sie prüfen nicht alle Markenfarben oder UI-Zustände und begründen keine
vollständige WCAG-/BITV-Konformität. Konsumenten sollten eigene Markenfarben
visuell sowie mit manuellen Accessibility-Prüfungen abnehmen. Keine API-Änderung.
