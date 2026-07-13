# UX/UI-Vertrag für Fachverfahren

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für den generischen UX/UI-Vertrag; PLAN-Stellen sind einzeln
> markiert.
> Quellen: `.agents/skills/ux-ui/references/`,
> `packages/fachverfahren-kit/src/stories/`,
> `packages/public-sector-ui/src/`.
> Pflicht-Lektüre vorher: `AGENTS.md`, `.agents/skills/ux-ui/SKILL.md`.

Dieses Dokument integriert das lokale UX/UI-Guidance-Set in den App-Stack. Es
ist der verbindliche Vertrag für generierte Fachverfahren-Apps,
Bürgerportale, interne Sachbearbeitung und Storybook-Abnahme.

Der aktuelle Abgleich mit Design Manual, Public-Sector-UX-Methodik und dem
repo-lokalen Source-Set steht gebündelt in
`docs/ux-ui/template-conformance.md`.

## Grundsatz

Fachverfahren werden aus Bedürfnis, Rolle und Prozess gebaut, nicht aus
einzelnen Features. Jede fachliche Aussage braucht eine Quelle, eine
Requirement-ID oder den Status `Annahme zu validieren`. Keine Rechtsregeln
werden erfunden.

## Trennung der Guidance

- Generische UX-Methodik und Design Manual werden hier als Plattformvertrag
  übernommen.
- Fachliche Beispielprompts bleiben unter `docs/examples/<domain>/`. Sie dürfen
  keine Fachlogik in Template-Runtime, Plattformpakete oder UI-Tokens
  zurückkopieren.
- Domain-spezifische Werte wie Beträge, Fristen, Schwellen, Rechtsverweise und
  Berechnungen leben immer als Daten in einem Domain-/Regelmodul.

## Pflichtartefakte vor UI-Bau

Ein Domain-Modul startet mit diesen Artefakten:

- Problemstatement und Zielbild.
- Rollen/Personas mit Fähigkeits-Flags.
- Jobs to be Done je Rolle.
- Journey oder Service Blueprint mit Frontstage, Backstage und Support.
- KI-Strategie mit Autonomiegrad, menschlicher Aufsicht, Quellen und
  Override-Punkten.
- Offene Fragen und zu validierende Annahmen.
- Screen Contracts für alle Screens.

Erst danach wird UI implementiert.

## Source-Set-Regel

Beispielprompts bleiben kurz. Wiederverwendbare Regeln für Shell, Tabellen,
Formulare, Einstellungen, Accessibility, Tokens, Storybook und HCAI gehören in
diesen Vertrag, die UX/UI-Skill-Referenzen, Storybook-Konventionen oder
Template-Guardrails. Domain-Beispiele beschreiben nur fachliche Annahmen,
synthetische Werte, Modulpfad, Akzeptanz und offene Validierungsfragen.

## IA-Grammatik

Alle Fachverfahren nutzen dieselbe Informationsarchitektur:

- Persistente Shell um den Arbeitsbereich, kein Neuaufbau beim Routenwechsel.
- Rollen- oder profilgefilterte Navigation.
- Global erreichbare Einstellungen, Info/Hilfe und Accessibility-Feedback.
- Breadcrumbs in Detail- und Workspace-Sichten.
- Unabhängig scrollende Panels, keine fachlichen Arbeitsseiten mit Body-Scroll
  als Hauptmechanik.
- Mobile Navigation über Sheet/Drawer; dichte Tabellen reflowen auf Mobil zuerst
  in touchfähige Kartenlisten oder bleiben horizontal scrollend, ohne
  eingefrorene Spalten.
- Einklappbare Navigation braucht statischen Modus und optionalen verzögerten
  Hover-Modus ohne Flackern. Umschalten wirkt live und respektiert reduzierte
  Bewegung.
- Role-/Profil-Wechsel reskopiert Navigation und Aktionen sofort. Nicht
  erlaubte Routen leiten sauber um.

Persona-Dichte:

- Bürgerportal: geführt, mobile-first, ein Fokus pro Schritt.
- Sachbearbeitung: dicht, tastatureffizient, List-Detail, Filter, Bulk-Review.
- Management/Audit: Überblick, Drilldown, Audit-Trail.

## Design-System-Regeln

- `packages/public-sector-ui` ist der öffentliche UI-Vertrag.
- ShadCN-Primitives sind Implementierungsdetail.
- Tailwind v4 und CSS-first Tokens sind Standard.
- Semantische Tokens sind Pflicht; keine Rohfarben in Komponenten.
- Rohe HSL-Komponententokens wie `--foreground: 220 25% 10%` werden nur im
  Token-Quellblock definiert. UI-Code nutzt direkt einsetzbare Aliasse wie
  `--color-text`, `--color-primary`, `--color-sidebar` und
  `--color-status-warn`.
- Direkte CSS-Nutzung von Komponententokens, zum Beispiel
  `color: var(--foreground)`, ist ungültig. Nutze `var(--color-text)` oder in
  Token-Definitionen bewusst `hsl(var(--foreground))`.
- Status immer mit Farbe plus Text/Icon, nie Farbe allein.
- Inter ist die Standardschrift; Zahlen nutzen `tabular-nums`.
- Radius: `0.5rem`.
- Motion ist sparsam, semantisch und respektiert `prefers-reduced-motion`.
- Print-Regeln blenden Shell-Chrome aus, wenn ein fachlicher Nachweis gedruckt
  wird.

Token-Familien:

- `--background`, `--foreground`, `--surface`, `--border`, `--ring`.
- `--status-ok`, `--status-warn`, `--status-block`, `--status-info`,
  `--status-muted` mit `-soft` Varianten.
- `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`.
- `--color-bg`, `--color-surface`, `--color-text`, `--color-primary`,
  `--color-primary-fg`, `--color-sidebar`, `--color-sidebar-fg`,
  `--color-sidebar-accent`, `--color-status-*`.

Komponenten entstehen zuerst in `packages/public-sector-ui` oder nutzen dessen
Vertrag. ShadCN-Primitives bleiben austauschbares Implementierungsdetail.

## Formulare

- Pfadentscheidende Fragen kommen zuerst.
- Progressive Disclosure statt alle Felder auf einmal.
- Once-Only-Vorausfüllung wird als übernommen gekennzeichnet und bleibt
  editierbar.
- Es gibt echte `form`-Elemente mit passenden `autoComplete`-Tokens.
- Quelle für Feldnamen, Pflichtfelder und einfache Constraints wie `pattern`
  ist im IST-Stand `antrag.steps` der `LeistungConfig`-Naht; Formularschemas
  unter `modules/<domain>/forms/*.form.schema.json` gehören zum
  Generator-Pfad (PLAN, siehe `modules/README.md`).
- Clientseitige Formular-UI leitet unterstützte Constraints aus dieser Quelle
  ab und zeigt Inline-Fehler mit Korrekturpfad vor dem Absenden.
  Serverseitige Route-Schemas bleiben die verbindliche Prüfung (PLAN,
  Backend-Zielarchitektur).
- Nicht unterstützte Schema-Regeln werden im Screen Contract als
  Validierungslücke oder bewusste serverseitige Prüfung benannt.
- Validierung trennt `err`, `warn` und `ok`; nur `err` blockiert.
- Freie Schrittnavigation ist erlaubt; Absenden erst bei voller Gültigkeit.
- Der Review-Schritt zeigt alle Angaben, Quellen und offenen Warnungen.
- Der letzte Schritt benennt bei Lücken den ersten unvollständigen Schritt und
  bietet einen Sprung dorthin.
- Drafts dürfen bei Navigation oder Reload nicht verloren gehen, wenn ein
  Fachverfahren Zwischenspeicherung vorsieht.
- React-Hilfskomponenten für Formulare stehen auf Modulebene. Innerhalb eines
  Formulars sind nur Render-Helfer wie `{renderStep()}` erlaubt; neue
  Komponenten dürfen nicht in der Render-Funktion definiert werden.

## Tabellen

- Desktop: sticky Header, horizontaler Scroll, zwei eingefrorene Leitspalten wo
  fachlich sinnvoll.
- Mobil: keine eingefrorenen Spalten; für Arbeitsvorräte ist eine Kartenliste
  mit den wichtigsten Vorgangsdaten, Status, Frist und Sortierkontrolle der
  bevorzugte Reflow.
- Pro Spalte Sortierung und Filter.
- Schnellfilter-Chips sind mehrfach wählbar, zeigen Anzahl und lassen den
  letzten aktiven Filter nicht abwählen.
- Ganze Zeilen sind tastaturaktivierbar.
- Zahlen rechtsbündig mit `tabular-nums`.
- Tabellen haben genug deterministische synthetische Daten, um Scrollen,
  Sortieren, Filtern, horizontale Enge und Tastaturpfad sichtbar zu testen.
- Zeilenaktionen brauchen Enter/Space, `aria-label` und klaren Fokuszustand.

## KI/HCAI

KI bleibt assistiv oder vorschlagend. Rechtsnahe Entscheidungen werden nicht
autonom getroffen.

Pflichtmuster:

- KI-Kennzeichnung.
- Quelle und Konfidenz an Vorschlägen.
- Warum-Affordance mit Progressive Disclosure.
- Bestätigen, Ablehnen und Überschreiben.
- Draft-Zustand vor Festsetzung.
- Auditierbare Überschreibungen.
- Ehrliche Unsicherheit statt scheinbarer Sicherheit.
- Missing-source, low-confidence und disputed states führen zu Review oder
  Eskalation, nicht zu stiller Automatisierung.

## Accessibility

Ziel ist BITV 2.0 / WCAG 2.2 AA:

- Sichtbare Labels und Fokuszustände.
- Vollständige Tastaturbedienbarkeit.
- 400 Prozent Zoom ohne Funktionsverlust.
- Status nie allein über Farbe.
- Fehlermeldungen mit Korrekturpfad und programmatischer Feldverknüpfung.
- Hochkontrast, größere Schrift, reduzierte Dichte und reduzierte Bewegung als
  persistierte Einstellungen, nicht automatisch für alle erzwungen.
- Inaktive Platzhalter für Accessibility- oder Sprachmodi werden in der
  Live-App nicht gerendert.

## Definition of Ready für UI

Ein Screen ist bereit für Implementierung, wenn ein Screen Contract existiert
und folgende Tests beschrieben sind:

- Loading, empty, error, success.
- Tastaturpfad und Fokusreihenfolge.
- Rolle/Rechte-Sichtbarkeit.
- Validierungs- und Recovery-Pfade.
- Storybook-Stories für die relevanten Zustände.

## Definition of Done für UI

- Unit-/Contract-Tests bestehen.
- Storybook-Story deckt Default, Edge, Error und Accessibility-relevante States.
- `pnpm run check:storybook` besteht.
- `pnpm run check:css-tokens` besteht.
- `pnpm run lint` besteht inklusive Guard gegen verschachtelte React-Komponenten
  in Render-Funktionen.
- Keine Rohfarben in neuen Komponenten.
- A11y-Akzeptanz ist dokumentiert.
- Keine domain-spezifischen Demo-Texte außerhalb von Validierungs- oder
  Beispiel- oder Domain-Modul-Artefakten.
