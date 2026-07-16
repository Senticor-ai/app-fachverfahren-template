# ADR-0004: Kanban is a view over Thing + Action stores

- Status: accepted
- Datum: 2026-07-16
- Supersedes: boards-independence clause of ADR-0003

## Kontext

Kanban wurde als unabhängige Collaboration-Fläche modelliert. Fachlich ist es
aber nur eine Sicht auf Aktionen an Entitäten (Schema.org-artig): Freigabe
einer `CreativeWork`, Kontakt zu `Person`/`Organization`, Review eines
`Product`/`Offer`, usw.

## Entscheidung

Wir führen `ThingStore` und `ActionStore` als System of Record ein
(`@senticor/app-store-contracts`, Typen in `@senticor/fachverfahren-domain`).
Kanban/`KanbanStore`/`BoardPort` sind eine **Projektion** von `WorkAction`
(object → Thing). Materialisierung in Board-Tabellen ist optionaler Cache;
`sourceKey = action:<actionId>` und `CardReference` kinds `Action`/`Thing`
verknüpfen die Sicht. Kein Dual-Write von Fachregeln in den Board-Store.
`projectActionsToBoardView` ist die kanonische View-Abbildung.

## Alternativen

| Alternative          | Vorteile       | Nachteile                     | Warum verworfen |
| -------------------- | -------------- | ----------------------------- | --------------- |
| Boards bleiben SoR   | Weniger Umbau  | Semantik falsch für CHOS/BMS  | Verworfen       |
| Nur Cases als Karten | Passt Anträgen | Deckt Person/Org/Media/Action | Zu eng          |

## Konsequenzen

ADR-0003 gilt weiter für Case-Snapshot/Events/Attachments; die Aussage
„Boards bleiben unabhängig“ ist durch dieses ADR ersetzt. Postgres-Board-
Tabellen dürfen als Cache bleiben, bis BoardPort direkt aus ActionStore
bedient wird. Provider-chos zielt primär auf Thing/Action (und Case), nicht
auf ein eigenständiges Kanban-Produkt.
