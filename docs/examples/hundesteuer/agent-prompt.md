# Beispielprompt: Hundesteuer

Dieser Prompt ist ein kompaktes Validierungsbeispiel für externe Coding
Agents. Er enthält nur fachliche Hundesteuer-Annahmen. Alle generischen
UX/UI-, Storybook-, Screen-Contract-, Accessibility-, Design-System-,
Architektur- und Toolchain-Regeln stehen in:

- `AGENTS.md`
- `agent.discovery.json`
- `.agents/skills/fachverfahren-app/SKILL.md`
- `.agents/skills/ux-ui/SKILL.md`
- `docs/examples/hundesteuer/app.spec.yaml`
- `docs/ux-ui/fachverfahren-ux-contract.md`
- `docs/reference/test-driven-development.md`
- `docs/reference/storybook.md`

Wenn dies dein einziger Startprompt ist:

1. Arbeite im Root dieses Template-Repositories.
2. Führe Package-Script `agent:discover` aus.
3. Führe Package-Script `agent:context` mit
   `docs/examples/hundesteuer/app.spec.yaml` aus.
4. Lies die dort ausgewählten Pflichtdateien vor Änderungen.
5. Nutze Package-Script `app:new` mit
   `docs/examples/hundesteuer/app.spec.yaml`, wenn `modules/dog-tax/` erzeugt
   werden soll.

## Aufgabe

Baue aus dieser Plattform ein Bürgerportal und ein internes Fachverfahren für
Hundesteuer als Domain-Modul unter `modules/dog-tax/`. Ändere Kernpakete nur,
wenn ein echter Plattformvertrag fehlt.

## Fachannahmen

- Kommune: synthetische Demo-Kommune `Musterstadt`.
- Rollen: `citizen`, `caseworker`, optional Management/Audit als lesende
  Sicht.
- Steuerdimensionen: Hundezahl-Staffel, gefährlicher Hund, Befreiung oder
  Ermäßigung mit Nachweis.
- Beispielwerte: erster Hund 120 EUR, zweiter Hund 180 EUR, jeder weitere Hund
  220 EUR, gefährlicher Hund 800 EUR.
- Zeitlogik: steuerpflichtig ab dem 3. Lebensmonat, Beginn in der Regel im
  Folgemonat der Aufnahme, Ende mit Monatsablauf, monatsgenaue anteilige
  Abrechnung, Anzeige binnen 14 Tagen.
- KI darf nur assistieren oder Vorschläge machen. Steuerfestsetzung,
  Gefährlichkeitseinstufung, Befreiung und Ermäßigung bleiben menschlich
  bestätigte Entscheidungen.

Alle Werte, Fristen, Rechtsverweise, Rassen-/Gefährlichkeitsregeln und
Berechnungen sind synthetisch und müssen als Daten im Domain-/Regelmodul
liegen, nie in Template- oder Plattformcode.

## FIM-Bezug

Nutze das FIM-Portal als fachliche Strukturquelle:
`https://fimportal.de/leistung-steckbriefe/99102013000000/hierarchy`.

Der FIM-Steckbrief `99 102 013 000 000` beschreibt die Leistung
`Hundesteuer`. Die Hierarchie zeigt diese Verrichtungen:

| FIM-ID               | Leistung                |
| -------------------- | ----------------------- |
| `99 102 013 002 000` | Hundesteuer Festsetzung |
| `99 102 013 010 000` | Hundesteuer Befreiung   |
| `99 102 013 011 000` | Hundesteuer Änderung    |
| `99 102 013 070 000` | Hundesteuer Abmeldung   |
| `99 102 013 104 000` | Hundesteuer Anmeldung   |
| `99 102 013 149 000` | Hundesteuer Ermäßigung  |

Modelliere diese FIM-IDs als fachliche Referenzen im Domain-Modul, zum Beispiel
im Manifest, in Screen Contracts, Events oder Compliance-Profilen. FIM liefert
die Leistungsstruktur und Bezeichnungen; kommunale Satzungswerte und konkrete
Rechtsgrundlagen bleiben separat zu validieren.

## Demo-Grenzen

- Keine echte Steuerfestsetzung mit Rechtsfolge.
- Keine echte Zahlung.
- Keine echten Registerdaten oder Bürgerdaten.
- Kein Produktivdeploy.
- Mockdaten müssen vollständig synthetisch und deterministisch sein.

## Akzeptanz

- `modules/dog-tax/domain.module.yaml` beschreibt Routen, Capabilities, Rechte,
  Events, FIM-Referenzen, Datenkategorien, Retention und Migrationen.
- Screen Contracts liegen für Bürgerportal, Sachbearbeitung und Audit vor.
- Storybook-Stories zeigen Default, Loading, Empty, Error, Success und relevante
  Accessibility-Zustände.
- Fachliche Daten nutzen Plattform-Ports, zum Beispiel `PaymentPort` und
  `MailboxPort`, statt Provider direkt anzusprechen.
- Fachliche Audit-Events sind modelliert und append-only.
- Vier-Augen-Entscheidungen sind serverseitig autorisiert.
- Compliance-Profil enthält Rechtsgrundlagen, Datenkategorien und Retention.
- Kein Hundesteuer-Code landet außerhalb des Domain-Moduls oder dieses
  Beispielverzeichnisses.

## Offene Validierungsfragen

- Sind die angenommenen Pain Points von Bürgerinnen und Sachbearbeitung real?
- Welche Satzungsparameter gelten für die Zielkommune?
- Welche Nachweise und Befreiungstatbestände sind fachlich korrekt?
- Ab welcher Automatisierungsschwelle würde der KI-Einsatz hochriskant?
- Wie werden streitanfällige Einstufungen nachvollziehbar und fair geprüft?
