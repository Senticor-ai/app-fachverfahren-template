# ADR-0003: Hybrid Case-Schema und Attachment-Lifecycle

- Status: accepted
- Datum: 2026-07-16

## Kontext

`app_cases` war ungenutzt und zu dünn für einen Vorgang. Historie in JSONB
erschwert konkurrente Appends und Audit-Abfragen. Nachweise werden vor
`einreichen` hochgeladen.

## Entscheidung

Hybrid-Modell: Snapshot in `app_cases.payload` plus append-only
`app_case_events`, Idempotenz in `app_case_idempotency`, Linkage in
`app_case_attachments`. Attachment-Lifecycle: unbound Token → bind bei
`einreichen` → Orphan-TTL.

> **Hinweis:** Die frühere Aussage „Boards bleiben unabhängig“ ist durch
> [ADR-0004](0004-kanban-as-action-thing-view.md) ersetzt — Kanban ist eine
> Sicht auf Action+Thing, kein zweites SoR.

## Alternativen

| Alternative             | Vorteile        | Nachteile                 | Warum verworfen      |
| ----------------------- | --------------- | ------------------------- | -------------------- |
| Nur JSONB inkl. History | Einfacher Start | Schwache Konkurrenz/Audit | Verworfen            |
| Draft-Case vor Upload   | Frühe case_id   | Mehr Zustände             | Unbound-Token reicht |

## Konsequenzen

Migration `20260716000000_case_persistence_ready` ist atomar (keine Prod-Rows
erwartet). LocalFs-Attachments sind nur DEV/Single-Node.
