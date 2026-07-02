---
name: accessibility-bitv
description: Make and prove Fachverfahren surfaces accessible (BITV 2.0 / EN 301 549 / WCAG 2.2 AA). Use when building or reviewing screens, screen contracts, Storybook states, or accessibility evidence.
---

# Accessibility & BITV Skill

Anleitung für barrierefreie Oberflächen eines Fachverfahrens. GENERISCH (jede
Leistung). BITV 2.0 / EN 301 549 / WCAG 2.2 AA sind in diesem Template die
verbindliche, blockierende Qualitätslatte; dieser Skill sagt, WIE man sie
einhält und belegt — er ergänzt den `ux-ui`-Skill um die konkrete
A11y-Prüf-Schleife.

## Pflicht je Screen (vor der UI im Screen Contract verankert)

- **Semantik + Landmarks**: genau ein `main`, dazu `nav`/`search`/
  `complementary` nach Bedarf; Überschriften-Hierarchie ohne Sprünge; native
  Elemente vor ARIA (ARIA nur, wenn nötig).
- **Tastatur**: jede Aktion ohne Maus erreichbar; logische Tab-Reihenfolge =
  `a11y.focusOrder` des Screen Contracts; sichtbarer `:focus-visible`; keine
  Tastatur-Fallen.
- **Status nie nur über Farbe**: Fehler/Warnung/Erfolg zusätzlich als Text +
  `role`/`aria-live`.
- **Kontrast** ≥ 4,5:1 (Text) / 3:1 (große Schrift/UI); nur Token-Farben
  (`--color-*`), kein Hardcode.
- **Zoom/Reflow**: bei 400 % kein Inhaltsverlust, kein horizontales Scrollen;
  Touch-Ziele ≥ 44 px.
- **Formulare**: Label fest verknüpft (`for`/`id`), Fehler programmatisch +
  lösungsorientiert, Pflichtfelder ausgezeichnet, Once-Only-Felder markiert +
  editierbar.

## Prüf-Schleife (Beleg, kein Overclaim)

1. Storybook-States je Screen vollständig (loading/empty/error/ready/success)
   — diese sind die Prüf-Oberfläche (`pnpm run storybook`,
   `pnpm run check:storybook`).
2. Automatisierte Prüfung (axe via Storybook-a11y-Addon, ergänzend
   axe-core/pa11y) auf den Stories; **critical/serious blockt**.
3. Manuelle Tastatur-Durchquerung gegen `a11y.focusOrder`;
   Screenreader-Stichprobe.
4. Belege (axe-Report, Story, Tastatur-Notiz) gehen in das Evidence-Bundle:
   `pnpm run evidence:build` schreibt nach `dist/evidence/`; Rahmen in
   `docs/compliance/evidence.md`.

`a11y`-Sektionen der Screen Contracts müssen vollständig sein, bevor die UI
gebaut wird — der Screen Contract ist der Eintritts-Beleg, nicht nachträgliche
Doku.
