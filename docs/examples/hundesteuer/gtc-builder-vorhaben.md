> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST — der Vorhaben-Text ist real und bereits gegen 3 echte
> Durchstich-Läufe getestet (siehe unten).
> Quellen: `docs/examples/hundesteuer/agent-prompt.md`,
> `docs/examples/hundesteuer/app.spec.yaml`
> Pflicht-Lektüre vorher: `AGENTS.md`, `docs/examples/hundesteuer/agent-prompt.md`

# Hundesteuer als GTC-Builder-Vorhaben-Brief

`agent-prompt.md` und `app.spec.yaml` in diesem Verzeichnis sind für einen Coding
Agenten geschrieben, der direkt im Root dieses Template-Repositories arbeitet (Package-
Scripts `agent:discover`/`agent:context`/`app:new`, Ausgabe unter `modules/dog-tax/`).
GTC Builder (`Senticor-ai/gtc-builder`, betrieben über CHOS-CODE-Innovation) ist ein
anderes Werkzeug: es nimmt keinen mehrteiligen Spec/Prompt-Satz entgegen, sondern genau
ein freitextliches **Vorhaben**-Feld beim Anlegen eines neuen Projekts, aus dem seine
eigene governte Pipeline (Intake → Grounding → Fachkonzept → Build → …) das restliche
Fachkonzept selbst ableitet. Da dieses eine Feld die gesamte Eingabe ist, muss es alles
Wesentliche selbst tragen — Rollen, Capabilities und FIM-Bezug eingeschlossen, nicht nur
als optionale Fußnote (siehe PR-Review-Feedback unten).

Dieses Dokument ist die freitextliche Vorhaben-Variante derselben fachlichen Annahmen —
gleiche Steuersätze, Rollen und FIM-Bezüge wie oben, nur als ein einzelner Absatz statt
als Prompt+Spec-Paar. Es ist die Quelle, an der sich der Hundesteuer-Vorhaben-Text in
der Hundesteuer-E2E-Suite des externen Repositories
[`Senticor-ai/infrastructure`](https://github.com/Senticor-ai/infrastructure)
(Pfad dort: `codesphere-vendorportal/chos-code-opencode/e2e/lib/hundesteuer-fixture.ts`,
außerhalb dieses Scaffolds) orientiert. Bei einer Änderung hier bitte dort gegenprüfen
(und umgekehrt).

## Vorhaben-Text

```
Hundesteuer-Verwaltung für die Gemeinde Musterstadt: Bürger:innen melden sich
authentifiziert an und können ihren Hund online anmelden, ummelden oder
abmelden; Sachbearbeitung (ebenfalls authentifiziert) prüft Fälle und bereitet
Entscheidungen vor; eine lesende Audit-Sicht macht Entscheidungen
nachvollziehbar. Bescheide werden per Postfach zugestellt. Die Hundesteuer
beträgt jährlich 120 Euro für den ersten Hund, 180 Euro für den zweiten Hund
und 220 Euro für jeden weiteren Hund im selben Haushalt, sowie 800 Euro für
als gefährlich eingestufte Hunde (Listenhunde) — Annahmewerte, keine reale
Satzung der genannten Gemeinde. Steuerpflicht beginnt ab dem 3. Lebensmonat,
in der Regel zum Folgemonat der Aufnahme, endet mit Monatsablauf und wird
monatsgenau anteilig abgerechnet; die Anzeige ist binnen 14 Tagen fällig.
Befreiungen oder Ermäßigungen sind mit Nachweis möglich. Zahlungen laufen nur
als Sandbox-Simulation, keine echte Zahlungsabwicklung. KI darf nur
assistieren oder Vorschläge machen — Steuerfestsetzung,
Gefährlichkeitseinstufung, Befreiung und Ermäßigung bleiben menschlich
bestätigte Entscheidungen. Fachliche Grundlage: FIM-Leistung 99 102 013 000
000 (Hundesteuer). Alle Daten, Werte und Fristen sind synthetische Annahmen
(Demo, keine echte Steuerfestsetzung, keine echte Zahlung, kein
Produktivdeploy) — auch wenn eine reale Gemeinde eingesetzt wird.
```

Ersetze `Musterstadt` durch den Namen der Zielkommune, wenn ein konkretes Beispiel
gebraucht wird. Die infrastructure-E2E-Suite substituiert hier bewusst echte deutsche
Städtenamen (München, Hamburg, …) statt der synthetischen Demo-Kommune, um
strukturell identische, aber nicht textidentische Runs für OpenRouters Prompt-Cache zu
erzeugen — siehe die Suite's eigenes README für die Begründung. Der Text markiert die
Steuersätze/Fristen ausdrücklich als Annahmewerte, gerade weil eine reale Gemeinde
eingesetzt werden kann: ohne diese Markierung könnte ein generiertes Projekt so lesen,
als behaupte es echtes Ortsrecht der genannten Stadt.

Rollen (inkl. Authentifizierung), Audit-Sicht, Postfach-Zustellung, Sandbox-Zahlung und
FIM-Bezug (`99 102 013 000 000`) stehen absichtlich direkt im Text oben, nicht nur als
Randnotiz: da GTC Builder ausschließlich dieses eine Feld erhält, würde ein Weglassen
hier zu generierten Projekten (und zur infra-Fixture, die sich daran orientiert) führen,
die vom kanonischen Umfang aus `app.spec.yaml` abweichen (Rollen
`citizen`/`caseworker`/`auditor`, `requiredCapabilities`
`identity-and-trust`/`payment`/`mailbox`/`audit`/`workflow`, `fimLeistung`).

## Demo-Grenzen

Wie in `agent-prompt.md`: keine echte Steuerfestsetzung mit Rechtsfolge, keine echte
Zahlung (nur Sandbox-Simulation), keine echten Registerdaten oder Bürgerdaten, kein
Produktivdeploy — alle Werte, Fristen und Fallbeispiele sind synthetische Annahmen, auch
wenn der Vorhaben-Text eine reale Gemeinde nennt.
