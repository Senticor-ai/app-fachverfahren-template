# UX/UI-Vertrag fuer Fachverfahren

Dieses Dokument integriert das lokale UX/UI-Guidance-Set in den App-Stack. Es
ist der verbindliche Vertrag fuer generierte Fachverfahren-Apps,
Buergerportale, interne Sachbearbeitung und Storybook-Abnahme.

Der aktuelle Abgleich mit dem Fachverfahren Design Manual steht in
`docs/ux-ui/fachverfahren-design-manual-audit.md`.
Der aktuelle Abgleich mit der generischen Public-Sector-UX-Methodik steht in
`docs/ux-ui/ux-methodik-public-sector-audit.md`.

## Grundsatz

Fachverfahren werden aus Beduerfnis, Rolle und Prozess gebaut, nicht aus
einzelnen Features. Jede fachliche Aussage braucht eine Quelle, eine
Requirement-ID oder den Status `Annahme zu validieren`. Keine Rechtsregeln
werden erfunden.

## Trennung der Guidance

- Generische UX-Methodik und Design Manual werden hier als Plattformvertrag
  uebernommen.
- Fachliche Beispielprompts bleiben unter `docs/examples/<domain>/`. Sie duerfen
  keine Fachlogik in Template-Runtime, Plattformpakete oder UI-Tokens
  zurueckkopieren.
- Domain-spezifische Werte wie Betraege, Fristen, Schwellen, Rechtsverweise und
  Berechnungen leben immer als Daten in einem Domain-/Regelmodul.

## Pflichtartefakte vor UI-Bau

Ein Domain-Modul startet mit diesen Artefakten:

- Problemstatement und Zielbild.
- Rollen/Personas mit Faehigkeits-Flags.
- Jobs to be Done je Rolle.
- Journey oder Service Blueprint mit Frontstage, Backstage und Support.
- KI-Strategie mit Autonomiegrad, menschlicher Aufsicht, Quellen und
  Override-Punkten.
- Offene Fragen und zu validierende Annahmen.
- Screen Contracts fuer alle Screens.

Erst danach wird UI implementiert.

## Source-Set-Regel

Beispielprompts bleiben kurz. Wiederverwendbare Regeln fuer Shell, Tabellen,
Formulare, Einstellungen, Accessibility, Tokens, Storybook und HCAI gehoeren in
diesen Vertrag, die UX/UI-Skill-Referenzen, Storybook-Konventionen oder
Template-Guardrails. Domain-Beispiele beschreiben nur fachliche Annahmen,
synthetische Werte, Modulpfad, Akzeptanz und offene Validierungsfragen.

## IA-Grammatik

Alle Fachverfahren nutzen dieselbe Informationsarchitektur:

- Persistente Shell um den Arbeitsbereich, kein Neuaufbau beim Routenwechsel.
- Rollen- oder profilgefilterte Navigation.
- Global erreichbare Einstellungen, Info/Hilfe und Accessibility-Feedback.
- Breadcrumbs in Detail- und Workspace-Sichten.
- Unabhaengig scrollende Panels, keine fachlichen Arbeitsseiten mit Body-Scroll
  als Hauptmechanik.
- Mobile Navigation ueber Sheet/Drawer; Tabellen auf Mobil horizontal scrollend,
  ohne eingefrorene Spalten.
- Einklappbare Navigation braucht statischen Modus und optionalen verzögerten
  Hover-Modus ohne Flackern. Umschalten wirkt live und respektiert reduzierte
  Bewegung.
- Role-/Profil-Wechsel reskopiert Navigation und Aktionen sofort. Nicht
  erlaubte Routen leiten sauber um.

Persona-Dichte:

- Buergerportal: gefuehrt, mobile-first, ein Fokus pro Schritt.
- Sachbearbeitung: dicht, tastatureffizient, List-Detail, Filter, Bulk-Review.
- Management/Audit: Ueberblick, Drilldown, Audit-Trail.

## Design-System-Regeln

- `packages/public-sector-ui` ist der oeffentliche UI-Vertrag.
- ShadCN-Primitives sind Implementierungsdetail.
- Tailwind v4 und CSS-first Tokens sind Standard.
- Semantische Tokens sind Pflicht; keine Rohfarben in Komponenten.
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

Komponenten entstehen zuerst in `packages/public-sector-ui` oder nutzen dessen
Vertrag. ShadCN-Primitives bleiben austauschbares Implementierungsdetail.

## Formulare

- Pfadentscheidende Fragen kommen zuerst.
- Progressive Disclosure statt alle Felder auf einmal.
- Once-Only-Vorausfuellung wird als uebernommen gekennzeichnet und bleibt
  editierbar.
- Es gibt echte `form`-Elemente mit passenden `autoComplete`-Tokens.
- Validierung trennt `err`, `warn` und `ok`; nur `err` blockiert.
- Freie Schrittnavigation ist erlaubt; Absenden erst bei voller Gueltigkeit.
- Der Review-Schritt zeigt alle Angaben, Quellen und offenen Warnungen.
- Der letzte Schritt benennt bei Luecken den ersten unvollstaendigen Schritt und
  bietet einen Sprung dorthin.
- Drafts duerfen bei Navigation oder Reload nicht verloren gehen, wenn ein
  Fachverfahren Zwischenspeicherung vorsieht.

## Tabellen

- Desktop: sticky Header, horizontaler Scroll, zwei eingefrorene Leitspalten wo
  fachlich sinnvoll.
- Mobil: keine eingefrorenen Spalten.
- Pro Spalte Sortierung und Filter.
- Schnellfilter-Chips sind mehrfach waehlbar, zeigen Anzahl und lassen den
  letzten aktiven Filter nicht abwaehlen.
- Ganze Zeilen sind tastaturaktivierbar.
- Zahlen rechtsbuendig mit `tabular-nums`.
- Tabellen haben genug deterministische synthetische Daten, um Scrollen,
  Sortieren, Filtern, horizontale Enge und Tastaturpfad sichtbar zu testen.
- Zeilenaktionen brauchen Enter/Space, `aria-label` und klaren Fokuszustand.

## KI/HCAI

KI bleibt assistiv oder vorschlagend. Rechtsnahe Entscheidungen werden nicht
autonom getroffen.

Pflichtmuster:

- KI-Kennzeichnung.
- Quelle und Konfidenz an Vorschlaegen.
- Warum-Affordance mit Progressive Disclosure.
- Bestaetigen, Ablehnen und Ueberschreiben.
- Draft-Zustand vor Festsetzung.
- Auditierbare Ueberschreibungen.
- Ehrliche Unsicherheit statt scheinbarer Sicherheit.
- Missing-source, low-confidence und disputed states fuehren zu Review oder
  Eskalation, nicht zu stiller Automatisierung.

## Accessibility

Ziel ist BITV 2.0 / WCAG 2.2 AA:

- Sichtbare Labels und Fokuszustaende.
- Vollstaendige Tastaturbedienbarkeit.
- 400 Prozent Zoom ohne Funktionsverlust.
- Status nie allein ueber Farbe.
- Fehlermeldungen mit Korrekturpfad und programmatischer Feldverknuepfung.
- Hochkontrast, groessere Schrift, reduzierte Dichte und reduzierte Bewegung als
  persistierte Einstellungen, nicht automatisch fuer alle erzwungen.
- Inaktive Platzhalter fuer Accessibility- oder Sprachmodi werden in der
  Live-App nicht gerendert.

## Definition of Ready fuer UI

Ein Screen ist bereit fuer Implementierung, wenn ein Screen Contract existiert
und folgende Tests beschrieben sind:

- Loading, empty, error, success.
- Tastaturpfad und Fokusreihenfolge.
- Rolle/Rechte-Sichtbarkeit.
- Validierungs- und Recovery-Pfade.
- Storybook-Stories fuer die relevanten Zustaende.

## Definition of Done fuer UI

- Unit-/Contract-Tests bestehen.
- Storybook-Story deckt Default, Edge, Error und Accessibility-relevante States.
- `pnpm run check:storybook` besteht.
- Keine Rohfarben in neuen Komponenten.
- A11y-Akzeptanz ist dokumentiert.
- Keine domain-spezifischen Demo-Texte ausserhalb von Validierungs- oder
  Beispiel- oder Domain-Modul-Artefakten.
