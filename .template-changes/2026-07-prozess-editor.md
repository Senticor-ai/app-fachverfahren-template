---
bump: minor
updateMode: review
migration: none
---

# Grafischer BPMN-Prozess-Editor — `ProzessEditor` (a11y-primär)

Neue Kit-Komponente `ProzessEditor` (`@senticor/fachverfahren-kit`): der bisher fehlende
AUTORENPFAD für eine `ProzessDefinition` (BPMN-Subset V1: Start/Ende/UserTask/ServiceTask/
ExclusiveGateway + SequenceFlows). Bewusst **formular-/listen-basiert statt Canvas-only** —
die grafische **Anzeige** (Mermaid via `prozessDefZuMermaid`/`MermaidView`) ist Vorschau /
Progressive Enhancement, der **Edit** läuft über beschriftete Formularfelder (BITV AA: voll
tastaturbedienbar, kein Maus-/Canvas-Zwang; das war der Grund, `@xyflow`-Canvas NICHT als
primären Pfad zu nehmen).

Funktionen: Knoten/Kanten hinzufügen · entfernen (Kanten-Kaskade — kein verwaister Flow) ·
Typ/Bezeichnung/Katalog-Aktion/Vier-Augen editieren · Default-Flow markieren · **Live-
Validierung** via `validateProzessGraph` (fail-closed gegen die StatusMachine) in einer
`aria-live`-Region · Mermaid-Vorschau. Kontrolliert (`beiAenderung(neueDefinition)`),
`nurLesen` für die reine Ansicht.

Rein additiv (neue Komponente, aus dem Barrel exportiert). DOM-Test (jsdom) deckt
Hinzufügen/Entfernen+Kaskade/Validierungs-a11y/Read-only ab. css-tokens + motion + storybook
grün. Nicht-V1-BPMN-Elemente werden im Editor gar nicht erst angeboten (der Interpreter bleibt
fail-closed). Guard-Bedingungen (`Bedingung`) werden in V1 nicht im UI editiert (config-authored).

## Optionaler KI-Assistent (`kiPort`)

`ProzessEditor` nimmt optional einen `kiPort?: KiAssistPort` (die bestehende KI-Naht). Ist er
verbunden, erscheint ein „KI-Vorschlag anfordern"-Button, der über `useAiAssist` einen
transparenten Vorschlag (5 Transparenzelemente via `KiAssistPanel`) zur Vervollständigung/
Verbesserung des Prozesses holt — **strikt HITL**: `reviewErforderlich` ist im Typ `true`, der
Mensch übernimmt manuell, die KI ist nie eines der zwei Augen. **Fehlt der Port, arbeitet der
Editor vollständig ohne KI** (die KI ist strikt additiv/optional — genau die Vorgabe „KI-Funktionen
immer optional, intelligent eingewoben"). Test deckt beide Fälle (ohne Port kein Button; mit
Stub-Port erscheint der geprüfte Vorschlag).
