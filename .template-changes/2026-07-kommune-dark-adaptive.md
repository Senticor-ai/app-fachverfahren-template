---
bump: minor
updateMode: review
migration: none
---

# KommuneTheme: dark-adaptive Marken-Primary + korrigierte Vordergrund-Schwelle (Dark-Mode BITV)

`KommuneTheme` (kommunales White-Labeling) machte die injizierte Marken-`--primary` jetzt
**theme-adaptiv**, sodass Dark-Mode BITV-/WCAG-2.1-AA-konform ist:

- **Injektion des Primary-Trios (`--primary`/`-foreground`/`--ring`) via scoped Stylesheet statt
  Inline.** Inline-Styles auf `<html>` schlagen per Spezifität jede `.dark`-Regel — damit war kein
  theme-abhängiger Wert möglich. Jetzt injiziert `applyKommuneTheme` ein `<style data-kommune-theme>`
  mit `:root`- **und** `.dark`-Regel. Die übrigen Marken-Variablen (accent/surface/rail) bleiben
  inline (unverändert).
- **Dark-Mode-Aufhellung (`darkModePrimary`):** eine dunkle Markenfarbe (z. B. die Default-Kommune
  `hsl(174 62% 26%)`) ist als `text-primary` auf dunklen Cards unlesbar (war 1.95:1). Im Dark-Mode
  wird die Lightness angehoben, bis sie als Text auf der hellsten dunklen Fläche ≥ 4.6:1 erreicht —
  Hue/Sättigung bleiben, die Marke bleibt erkennbar.
- **`pickForeground`-Schwelle 0.4 → 0.179** (der korrekte WCAG-Schwarz/Weiß-Übergang). Die alte
  Schwelle wählte für mittelhelle Farben fälschlich Weiß (die aufgehellte Primary bekam Weiß mit nur
  2.76:1 statt Schwarz mit 7.8:1). `parseColor` versteht zudem `hsl()/hsla()` (viele Marken liefern
  hsl) — sonst wurde gar kein Vordergrund abgeleitet.

Verifikation (axe-core, playwright): **alle 12 Routen in Light UND Dark = 0 WCAG-2.1-AA-Verstöße**
(vorher 18 im Dark). Neue Unit-Tests für die Vordergrund-Ableitung.

**Konsumenten mit eigenen Marken-Farben** sollten den Dark-Mode einmal sichtprüfen — die Primary
wird dort jetzt automatisch aufgehellt (gewollt) und der Vordergrund kann sich (kontrast-korrekt)
von Weiß auf Schwarz ändern. Keine API-Änderung.
