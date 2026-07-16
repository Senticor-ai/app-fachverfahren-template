# ADR-0002: Authoritative CaseService

- Status: accepted
- Datum: 2026-07-16

## Kontext

Persistenz-Adapter dürfen keine `statusMachine`- oder Vier-Augen-Regeln
implementieren, sonst duplizieren InMemory, Postgres und später CHOS Fachlogik.

## Entscheidung

Fastify-Routen authentifizieren und bauen `CaseScope` aus der Sitzung.
`CaseService` lädt den Fall, löst `CaseDomainConfig` auf, validiert den
Übergang über den Event-Namen, erzwingt Vier-Augen, berechnet abgeleitete
Werte und schreibt Historie mit Server-Akteur/Zeit. `CaseStore` persistiert nur
atomar Snapshot + Event (idempotent, optimistic concurrency).

## Alternativen

| Alternative           | Vorteile          | Nachteile            | Warum verworfen     |
| --------------------- | ----------------- | -------------------- | ------------------- |
| Regeln im Store       | Weniger Schichten | Provider-Duplikation | Nicht drop-in-fähig |
| Browser als Autorität | Einfacher DEV     | Umgehbar, kein Audit | Unzulässig          |

## Konsequenzen

Vier-Augen- und Transitionstests gehören zu CaseService/Domain.
Store-Contract-Tests decken Atomizität, Scope, Idempotenz und Versionierung ab.
