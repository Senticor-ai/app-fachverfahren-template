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
   `docs/examples/hundesteuer/app.spec.yaml` nur, wenn zusätzlich das
   Modul-Gerüst `modules/hundesteuer/` erzeugt werden soll (Generator-Pfad, PLAN
   für die App-Einbindung — siehe `modules/README.md`).

## Aufgabe

Baue aus dieser Plattform das klickbare Fachverfahren Hundesteuer, indem du
die EINE Austausch-Naht `apps/fachverfahren/src/leistung.config.ts` nach dem
Vertrag aus `AGENTS.md` füllst und danach
`pnpm --filter @senticor/fachverfahren emit:contract` ausführst. Ändere
Kernpakete nur, wenn ein echter Plattformvertrag fehlt. Fachliche Werte, die
nicht belegt sind, folgen der Annahme-DATEN-Konvention aus `AGENTS.md`.

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
Berechnungen sind synthetisch und müssen als Daten in der Naht (benannte
Konstanten, `berechne` als reine Funktion) liegen, nie in Kit- oder
Plattformcode.

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

Modelliere die Leistungs-FIM-ID als `fimLeistung` in der Naht (Status
`belegt` oder `annahme-zu-validieren`); weitere FIM-Referenzen gehören in
Tests, Abschlussbericht oder — beim Generator-Pfad — in Manifest, Screen
Contracts, Events und Compliance-Profil. FIM liefert die Leistungsstruktur
und Bezeichnungen; kommunale Satzungswerte und konkrete Rechtsgrundlagen
bleiben separat zu validieren.

## Demo-Grenzen

- Keine echte Steuerfestsetzung mit Rechtsfolge.
- Keine echte Zahlung.
- Keine echten Registerdaten oder Bürgerdaten.
- Kein Produktivdeploy.
- Mockdaten müssen vollständig synthetisch und deterministisch sein.

## Akzeptanz

- Die Naht enthält `rechtsgrundlagen` (belegt oder als Annahme markiert),
  `fimLeistung`, alle Antragsschritte mit validierten Pflichtfeldern und eine
  `statusMachine` mit `terminal`-Zuständen und `vierAugen`-Übergängen für
  Festsetzung, Befreiung und Ermäßigung.
- `berechne` bildet jede Tarifstufe, Gefährlichkeits- und
  Befreiungs-/Ermäßigungsregel als eigene prüfbare Verzweigung ab (ganze
  Euro, `provisional`/`final`) und ist gegen die Beispielwerte getestet.
- `pnpm --filter @senticor/fachverfahren emit:contract` wurde ausgeführt;
  `pnpm run typecheck` und `pnpm run test` sind grün; die drei Personas sind
  nach Anmeldung unter `/buerger`, `/amt` und `/aufsicht` klickbar.
- KI bleibt assistiv (`ki.schwelleAutonom`, optional transparenter
  `vorschlag`); Entscheidungen bleiben menschlich bestätigt.
- Kein Hundesteuer-Code landet außerhalb der Naht oder dieses
  Beispielverzeichnisses.
- Beim optionalen Generator-Pfad zusätzlich: `modules/hundesteuer/` mit
  Manifest, Screen Contracts, Permissions, Events, Compliance-Profil und
  grünem `check:domain-contracts`.

## Offene Validierungsfragen

- Sind die angenommenen Pain Points von Bürgerinnen und Sachbearbeitung real?
- Welche Satzungsparameter gelten für die Zielkommune?
- Welche Nachweise und Befreiungstatbestände sind fachlich korrekt?
- Ab welcher Automatisierungsschwelle würde der KI-Einsatz hochriskant?
- Wie werden streitanfällige Einstufungen nachvollziehbar und fair geprüft?
