# ADR-0001: Provider-neutrale Store-Contracts

- Status: accepted
- Datum: 2026-07-16

## Kontext

Eine spätere CHOS-Persistenz darf Browser-Ports und Fastify-Routen nicht ändern.
`KanbanStore` und verwandte Interfaces lagen in `@senticor/app-store-postgres`,
sodass ein Nicht-Postgres-Provider die Postgres-Implementierung importieren müsste.

## Entscheidung

Wir führen `@senticor/app-store-contracts` ein und legen dort `CaseStore`,
`KanbanStore`, `AttachmentStore` und `AppStore` ab. Implementierungen bleiben in
`@senticor/app-store-postgres` (Postgres, InMemory, Unavailable). Fachliche
Kopf-Typen und reine Transitions leben in `@senticor/fachverfahren-domain`.

## Alternativen

| Alternative                                 | Vorteile       | Nachteile                                     | Warum verworfen          |
| ------------------------------------------- | -------------- | --------------------------------------------- | ------------------------ |
| Interfaces in `platform-contracts`          | Weniger Pakete | Vermischt Capability-Ports mit App-Persistenz | Semantik unterschiedlich |
| Interfaces in `app-store-postgres` belassen | Kein Move      | Provider hängt an Postgres-Paket              | Blockiert CHOS-Drop-in   |

## Konsequenzen

Provider können Contracts ohne React/Zustand/Fastify/Postgres importieren.
Bestehende Importe aus `app-store-postgres` bleiben durch Re-Exports gültig.
