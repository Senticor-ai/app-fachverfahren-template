# Audit: Fachverfahren Design Manual

Quelle: repo-lokale UX/UI-Skill-Referenz
`.agents/skills/ux-ui/references/fachverfahren-design-manual.md`

Stand: 2026-06-23.

## Ergebnis

Dok. 2 ist jetzt für die Template-App als App-, Storybook-, Skill- und
Coverage-Vertrag abgebildet:

- Sachbearbeitung nutzt eine Fachanwendungs-Shell mit linker Navigation,
  Countern, Profil-/Einstellungsmenü, Breadcrumbs und Master-Detail-Arbeitsraum.
- Die Vorgangstabelle zeigt Sticky Header, zwei gefrorene Leitspalten,
  Sortier-/Filter-Affordances, Suche, gespeicherte Ansichten, Pagination,
  Bulk-Auswahl, Status-Badges mit Text/Icon und Tastaturzeilen.
- Bürger:in-Regeln sind dort codifiziert, wo sie für das Bürgerportal gelten:
  geführter Flow, einfache Sprache, Once-Only, Review/Bestätigung und
  personalisierbare Accessibility.
- Storybook enthält eine eigene Abnahmefläche:
  `Design Manual/Fachverfahren`.
- `pnpm run check:storybook` prüft, dass die Dok.-2-Abdeckung sichtbar bleibt.

## Sachbearbeitung

| Manual-Callout                                        |               Status | App-/Storybook-Nachweis                                                                                                                                                 |
| ----------------------------------------------------- | -------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persona-gerechte Dichte, fachlich präzise Sprache     |              Erfüllt | Sachbearbeitung zeigt Arbeitsvorrat, Vorgangsliste, Detailpanel, Fristen und Review ohne Bürgerportal-Copy.                                                             |
| Persistente Shell mit Navigation, Profil und Settings |              Erfüllt | Linke Fachnavigation, Profilmenü, Icon-Rail, verzögertes Hover-Ausklappen, statischer Modus und persistierte Einstellung sind in der App.                               |
| Rollen-/Rechte-Gating                                 |              Erfüllt | Bürgerin und Sachbearbeitung erhalten getrennte Navigation und Datenoberfläche. Serverseitige Policy bleibt maßgeblich.                                                 |
| Breadcrumbs und Wayfinding                            | Erfüllt für Referenz | Sachbearbeitung zeigt `Vorgänge / Ansicht / Vorgang`. Storybook codifiziert den Detailpfad.                                                                             |
| Unabhängig scrollende Panels                          |              Erfüllt | Caseworker-Content scrollt im Arbeitsbereich, Tabelle im eigenen Frame, Detailpanel bleibt daneben sichtbar.                                                            |
| Tabellen/List-Detail                                  |              Erfüllt | App und Storybook zeigen Master-Detail, Sticky Header, zwei gefrorene Leitspalten, Status-Badges, Tastaturzeilen, Filter, Suche, gespeicherte Ansichten und Pagination. |
| Bulk-Review                                           |   Erfüllt als Muster | Review-Bedarf und Vier-Augen-Aktion sind sichtbar; Arbeitslisten unterstützen seitenbezogene Mehrfachauswahl mit deaktivierten Sammelaktionen ohne Auswahl.             |
| HCAI/KI-Patterns                                      |     Nicht zutreffend | Die fachneutrale Template-App enthält keine KI-Funktion. Domain-Module mit KI müssen Kennzeichnung, Quelle, Konfidenz, Warum, Override und Audit liefern.               |
| Zustände und Feedback                                 |              Erfüllt | Storybook codifiziert Loading, Empty, Error und Success; die laufende App hat Login-, Session-, leere Postfach- und Fehlerzustände für die vorhandenen Arbeitsbereiche. |

## Bürgerportal

| Manual-Callout                               |              Status | App-/Storybook-Nachweis                                                                                                                                                                            |
| -------------------------------------------- | ------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile-first, geführt, ein Fokus pro Schritt | Erfüllt im Template | Bürgerportal zeigt Übersicht, Vorgangsliste, öffnbaren Entwurf, neuen generischen Vorgang, Posteingang und Ausgang. Der Formular-Stepper ist als Storybook- und Screen-Contract-Pflicht vorhanden. |
| Einfache Sprache und kurze Microcopy         |             Erfüllt | Sichtbare Copy nutzt konkrete Aufgaben, keine Basisdienst- oder Architekturbegriffe.                                                                                                               |
| Datensparsamkeit und Once-Only               | Erfüllt als Vertrag | Storybook zeigt übernommene, editierbare Daten. Konkrete Once-Only-Quellen werden pro Domain-Modul angebunden.                                                                                     |
| Review und Bestätigung                       | Erfüllt als Vertrag | Storybook codifiziert Review/Bestätigung mit Vorgangsnummer. Konkrete Absende-/Bestätigungspfade gehören zum Domain-Modul.                                                                         |
| Accessibility-Optionen                       | Erfüllt im Template | Hell/Dunkel/System, mehr Kontrast, größere Schrift, weniger Bewegung und mehr Abstand sind nutzerseitig steuerbar und persistiert.                                                                 |
| Gebärdensprache und Leichte Sprache          |    Bewusst entfernt | Die Live-App rendert keine inaktiven Platzhalter-Controls. Die UI-Komponente bleibt für spätere echte Modi im UI-Paket verfügbar.                                                                  |

## Design-System

| Callout                                              |                   Status | Nachweis                                                      |
| ---------------------------------------------------- | -----------------------: | ------------------------------------------------------------- |
| React, Tailwind v4, shadcn-Primitives, Inter, Lucide |                  Erfüllt | Toolchain und App verwenden diese Basis.                      |
| Semantische HSL-Tokens, keine Rohfarben              | Erfüllt für neue Flächen | App-, Storybook- und Statusstyles nutzen Token.               |
| Status nicht nur über Farbe                          |                  Erfüllt | Status-Badges und Storybook-Zustände tragen Icon/Text.        |
| `tabular-nums` für Zahlen und Daten                  |                  Erfüllt | Tabellen, Fristen und Counter nutzen tabular numbers.         |
| Dark Mode                                            |                  Erfüllt | App- und Storybook-Flächen nutzen dieselben Tokens.           |
| Reduzierte Bewegung                                  |                  Erfüllt | `prefers-reduced-motion` und Nutzerpräferenz sind verdrahtet. |

## Erweiterungspunkte

Diese Punkte bleiben bewusst als fach- oder produktabhängige Erweiterungen
sichtbar:

1. Dedizierte Settings-Route statt Einstellungen nur im Profilmenü.
2. Generischer Formular-Blueprint als Domain-Modul-Skeleton mit Stepper,
   Once-Only, Review, Draft-Recovery und err/warn/ok-Validierung.
3. Manuelle Abnahme für Screenreader, 400-Prozent-Zoom und Tastaturpfade.

## Konflikt zur Entscheidung

Dok. 2 bevorzugt shadcn als direktes Designsystem und grenzt sich von KERN-artiger
Über-Spacing ab. Dieses Repository hält `packages/public-sector-ui` als stabile
Verwaltungs-UI-Fassade vor shadcn. Empfehlung: Fassade beibehalten. Dadurch
bleiben Fachverfahren upgradefähig, während shadcn weiterhin die Primitive
liefert.
