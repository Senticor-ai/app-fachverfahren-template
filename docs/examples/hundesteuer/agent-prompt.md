# Beispielprompt: Hundesteuer

Dieser Prompt ist ein kompaktes Validierungsbeispiel fuer externe Coding
Agents. Er enthaelt nur fachliche Hundesteuer-Annahmen. Alle generischen
UX/UI-, Storybook-, Screen-Contract-, Accessibility-, Design-System-,
Architektur- und Toolchain-Regeln stehen in:

- `AGENTS.md`
- `.claude/skills/fachverfahren-app/SKILL.md`
- `.claude/skills/ux-ui/SKILL.md`
- `docs/ux-ui/fachverfahren-ux-contract.md`
- `docs/reference/test-driven-development.md`
- `docs/reference/storybook.md`

## Aufgabe

Baue aus dieser Plattform ein Buergerportal und ein internes Fachverfahren fuer
Hundesteuer als Domain-Modul unter `modules/dog-tax/`. Aendere Kernpakete nur,
wenn ein echter Plattformvertrag fehlt.

## Fachannahmen

- Kommune: synthetische Demo-Kommune `Musterstadt`.
- Rollen: `citizen`, `caseworker`, optional Management/Audit als lesende
  Sicht.
- Steuerdimensionen: Hundezahl-Staffel, gefaehrlicher Hund, Befreiung oder
  Ermaessigung mit Nachweis.
- Beispielwerte: erster Hund 120 EUR, zweiter Hund 180 EUR, jeder weitere Hund
  220 EUR, gefaehrlicher Hund 800 EUR.
- Zeitlogik: steuerpflichtig ab dem 3. Lebensmonat, Beginn in der Regel im
  Folgemonat der Aufnahme, Ende mit Monatsablauf, monatsgenaue anteilige
  Abrechnung, Anzeige binnen 14 Tagen.
- KI darf nur assistieren oder Vorschlaege machen. Steuerfestsetzung,
  Gefaehrlichkeitseinstufung, Befreiung und Ermaessigung bleiben menschlich
  bestaetigte Entscheidungen.

Alle Werte, Fristen, Rechtsverweise, Rassen-/Gefaehrlichkeitsregeln und
Berechnungen sind synthetisch und muessen als Daten im Domain-/Regelmodul
liegen, nie in Template- oder Plattformcode.

## FIM-Bezug

Nutze das FIM-Portal als fachliche Strukturquelle:
`https://fimportal.de/leistung-steckbriefe/99102013000000/hierarchy`.

Der FIM-Steckbrief `99 102 013 000 000` beschreibt die Leistung
`Hundesteuer`. Die Hierarchie zeigt diese Verrichtungen:

| FIM-ID               | Leistung                 |
| -------------------- | ------------------------ |
| `99 102 013 002 000` | Hundesteuer Festsetzung  |
| `99 102 013 010 000` | Hundesteuer Befreiung    |
| `99 102 013 011 000` | Hundesteuer Aenderung    |
| `99 102 013 070 000` | Hundesteuer Abmeldung    |
| `99 102 013 104 000` | Hundesteuer Anmeldung    |
| `99 102 013 149 000` | Hundesteuer Ermaessigung |

Modelliere diese FIM-IDs als fachliche Referenzen im Domain-Modul, zum Beispiel
im Manifest, in Screen Contracts, Events oder Compliance-Profilen. FIM liefert
die Leistungsstruktur und Bezeichnungen; kommunale Satzungswerte und konkrete
Rechtsgrundlagen bleiben separat zu validieren.

## Demo-Grenzen

- Keine echte Steuerfestsetzung mit Rechtsfolge.
- Keine echte Zahlung.
- Keine echten Registerdaten oder Buergerdaten.
- Kein Produktivdeploy.
- Mockdaten muessen vollstaendig synthetisch und deterministisch sein.

## Akzeptanz

- `modules/dog-tax/domain.module.yaml` beschreibt Routen, Capabilities, Rechte,
  Events, FIM-Referenzen, Datenkategorien, Retention und Migrationen.
- Screen Contracts liegen fuer Buergerportal, Sachbearbeitung und Audit vor.
- Storybook-Stories zeigen Default, Loading, Empty, Error, Success und relevante
  Accessibility-Zustaende.
- Fachliche Daten nutzen Plattform-Ports, zum Beispiel `PaymentPort` und
  `MailboxPort`, statt Provider direkt anzusprechen.
- Fachliche Audit-Events sind modelliert und append-only.
- Vier-Augen-Entscheidungen sind serverseitig autorisiert.
- Compliance-Profil enthaelt Rechtsgrundlagen, Datenkategorien und Retention.
- Kein Hundesteuer-Code landet ausserhalb des Domain-Moduls oder dieses
  Beispielverzeichnisses.

## Offene Validierungsfragen

- Sind die angenommenen Pain Points von Buergerinnen und Sachbearbeitung real?
- Welche Satzungsparameter gelten fuer die Zielkommune?
- Welche Nachweise und Befreiungstatbestaende sind fachlich korrekt?
- Ab welcher Automatisierungsschwelle wuerde der KI-Einsatz hochriskant?
- Wie werden streitanfaellige Einstufungen nachvollziehbar und fair geprueft?
