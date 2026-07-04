# Hundesteuer als GTC-Builder-Vorhaben-Brief

`agent-prompt.md` und `app.spec.yaml` in diesem Verzeichnis sind für einen Coding
Agenten geschrieben, der direkt im Root dieses Template-Repositories arbeitet (Package-
Scripts `agent:discover`/`agent:context`/`app:new`, Ausgabe unter `modules/dog-tax/`).
GTC Builder (`Senticor-ai/gtc-builder`, betrieben über CHOS-CODE-Innovation) ist ein
anderes Werkzeug: es nimmt keinen mehrteiligen Spec/Prompt-Satz entgegen, sondern genau
ein freitextliches **Vorhaben**-Feld beim Anlegen eines neuen Projekts, aus dem seine
eigene governte Pipeline (Intake → Grounding → Fachkonzept → Build → …) das restliche
Fachkonzept selbst ableitet.

Dieses Dokument ist die freitextliche Vorhaben-Variante derselben fachlichen Annahmen —
gleiche Steuersätze, Rollen und FIM-Bezüge wie oben, nur als ein einzelner Absatz statt
als Prompt+Spec-Paar. Es ist die Quelle, an der sich der Hundesteuer-Vorhaben-Text im
Hundesteuer-E2E-Suite von `Senticor-ai/infrastructure`
(`codesphere-vendorportal/chos-code-opencode/e2e/lib/hundesteuer-fixture.ts`) orientiert.
Bei einer Änderung hier bitte dort gegenprüfen (und umgekehrt).

## Vorhaben-Text

```
Hundesteuer-Verwaltung für die Gemeinde Musterstadt: Bürger:innen können ihren Hund
online anmelden, ummelden oder abmelden; Sachbearbeitung prüft Fälle und bereitet
Entscheidungen vor. Die Hundesteuer beträgt jährlich 120 Euro für den ersten Hund,
180 Euro für den zweiten Hund und 220 Euro für jeden weiteren Hund im selben
Haushalt, sowie 800 Euro für als gefährlich eingestufte Hunde (Listenhunde).
Steuerpflicht beginnt ab dem 3. Lebensmonat, in der Regel zum Folgemonat der
Aufnahme, endet mit Monatsablauf und wird monatsgenau anteilig abgerechnet; die
Anzeige ist binnen 14 Tagen fällig. Befreiungen oder Ermäßigungen sind mit Nachweis
möglich. KI darf nur assistieren oder Vorschläge machen — Steuerfestsetzung,
Gefährlichkeitseinstufung, Befreiung und Ermäßigung bleiben menschlich bestätigte
Entscheidungen. Alle Daten, Werte und Fristen sind synthetisch (Demo, keine echte
Steuerfestsetzung, keine echte Zahlung, kein Produktivdeploy).
```

Ersetze `Musterstadt` durch den Namen der Zielkommune, wenn ein konkretes Beispiel
gebraucht wird. Die infrastructure-E2E-Suite substituiert hier bewusst echte deutsche
Städtenamen (München, Hamburg, …) statt der synthetischen Demo-Kommune, um
strukturell identische, aber nicht textidentische Runs für OpenRouters Prompt-Cache zu
erzeugen — siehe die Suite's eigenes README für die Begründung.

## FIM-Bezug (optional in der Kurzfassung)

Der FIM-Steckbrief `99 102 013 000 000` (`https://fimportal.de/leistung-steckbriefe/99102013000000/hierarchy`)
beschreibt dieselbe Leistung `Hundesteuer` wie in `agent-prompt.md`. GTC Builder erwartet
keinen expliziten FIM-Verweis im Vorhaben-Text; wer ihn dennoch mitgeben möchte, kann
einen Satz wie `Fachliche Grundlage: FIM-Leistung 99 102 013 000 000 (Hundesteuer).`
anhängen.

## Demo-Grenzen

Wie in `agent-prompt.md`: keine echte Steuerfestsetzung mit Rechtsfolge, keine echte
Zahlung, keine echten Registerdaten oder Bürgerdaten, kein Produktivdeploy — alle Werte,
Fristen und Fallbeispiele sind synthetisch.
