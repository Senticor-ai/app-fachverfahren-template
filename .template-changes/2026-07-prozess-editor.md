---
bump: minor
updateMode: review
migration: none
---

# BPMN-inspiriertes Prozessmodell mit formularbasiertem Editor

Ergänzt eine eigene, BPMN-inspirierte `ProzessDefinition` für Start, Ende, Benutzer- und
Systemaufgaben, XOR-Gateways und Sequenzflüsse. Das Modell ist ausdrücklich kein vollständiger
BPMN-Standard und unterstützt weder BPMN-XML-Import noch -Export. Die neue Kit-Komponente
`ProzessEditor` bearbeitet das Modell formular- und listenbasiert; eine Mermaid-Darstellung dient
nur als Vorschau.

Funktionen: Knoten/Kanten hinzufügen · entfernen (Kanten-Kaskade — kein verwaister Flow) ·
Typ/Bezeichnung/Katalog-Aktion/Vier-Augen editieren · Default-Flow markieren · **Live-
Validierung** via `validateProzessGraph` (fail-closed gegen die StatusMachine) in einer
`aria-live`-Region · Mermaid-Vorschau. Kontrolliert (`beiAenderung(neueDefinition)`),
`nurLesen` für die reine Ansicht.

Der reine Validator prüft Graphstruktur und Bezüge zur Statusmaschine; der reine Planer ermittelt
lediglich mögliche Folgeknoten. Der Change enthält keine Prozess-Engine, Persistenz, Worker,
Automationsausführung oder KI-Unterstützung und bindet den Editor noch nicht an eine App-Route.
Nicht unterstützte Knotentypen werden vom Validator abgelehnt. Guard-Bedingungen (`Bedingung`)
werden in dieser Version nicht im Editor bearbeitet.

Unit-Tests decken Graphvalidierung, reine Planung und Darstellung ab. Storybook zeigt einen
editierbaren und einen Nur-Lesen-Zustand und prüft das Hinzufügen eines Knotens im Browser;
manuelle Tastatur-, Screenreader- und Reflow-Prüfung bleibt Teil der UI-Abnahme.
