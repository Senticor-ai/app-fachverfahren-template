# ADR-0003: Ziele, Schritte und Termine als typisierte Aufgaben (eine polymorphe Tabelle)

- Status: proposed
- Datum: 2026-07-14

## Kontext

Eine Akte (ADR-0001) trägt heterogene Unter-Elemente: **Integrationsziele** (mit Kategorie/Status/
Deadline/Fortschritt), deren **Schritte/Checkliste** (abhakbar), **Termine** und **Fristen**. Der
SDK-`domain-kernel` modelliert diese als getrennte Typen (`Task`, `Deadline`), lässt aber offen, WIE
sie persistiert werden und wie der Ziel-Fortschritt (n von m Schritten erledigt) entsteht. Ohne
Entscheidung droht ein Wildwuchs aus je-Element-Typ-Tabellen (app_goals, app_goal_steps,
app_appointments, …) mit dupliziertem Scope/Audit/Locking.

## Entscheidung

Ziele, Schritte, Termine und generische Aufgaben werden als **typisierte Aufgaben in EINER
polymorphen Tabelle `app_tasks`** (TaskStore, ADR-0001) abgebildet:

- Ein `task_kind`-Diskriminator (`aufgabe` | `ziel` | `checkliste-item` | `termin`) unterscheidet die
  Element-Typen; `parent_task_id` bildet die Hierarchie (Schritt → Ziel); `data jsonb` trägt die
  frei-formige, typ-spezifische Nutzlast (Ziel: Kategorie/Status; Schritt: `erledigt`-Flag; Termin:
  Anlass); `due_at` trägt Termin/Frist.
- Der **Ziel-Fortschritt ist COMPUTE-ON-READ** (`aggregateChildFlag`): je Ziel wird die Zahl der
  Schritt-Kinder + wie viele ihr `erledigt`-Flag gesetzt haben gezählt; der Prozentwert rechnet der
  Aufrufer. Der Fortschritt wird NIE persistiert (keine Denormalisierungs-Drift).
- Mandanten-Scope + Fall-Bindung (`FK → app_cases ON DELETE CASCADE`) + Optimistic-Locking +
  `data`-Merge liegen EINMAL im TaskStore, nicht je Element-Typ.

## Alternativen

| Alternative                                                                       | Vorteile                      | Nachteile                                                                                   | Warum verworfen                                             |
| --------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **B — je Element-Typ eine Tabelle** (app_goals, app_goal_steps, app_appointments) | starke Typisierung je Tabelle | 3–4× Scope/Audit/Locking/Migrationen dupliziert; neue Element-Typen = neue Tabelle          | verworfen — Rule-of-Three-Duplikation                       |
| **C — Ziele/Schritte als jsonb-Array in `app_cases.data`**                        | keine zweite Tabelle          | keine eigene Abfrage/Frist/Zuweisung je Ziel; kein Locking je Ziel; unhandliche Massendaten | verworfen — Ziele sind erst-klassige, adressierbare Objekte |
| **D — persistierter Fortschritt** (progress-Spalte am Ziel)                       | ein Read weniger              | Denormalisierungs-Drift; jede Schritt-Änderung muss das Ziel nachziehen                     | verworfen — compute-on-read ist driftfrei                   |

## Konsequenzen

**Leichter:** ein Store/Contract/Migration deckt alle Fall-Unter-Elemente; neue Element-Typen sind
ein neuer `task_kind` + `data`-Konvention, keine Migration; Fortschritt ist immer korrekt.

**Schwerer:** die Typisierung je `task_kind` lebt in Konventionen (`data`-Schlüssel) + der Config,
nicht in der Tabelle — die App/Config muss die `data`-Form je `task_kind` kennen (das leistet die
`leistung.config`-Naht). `aggregateChildFlag` deckt nur boolesche Flags (für den Ziel-Fortschritt
ausreichend).

**Betroffene Module/Verträge:** `@senticor/app-store-postgres` (`app_tasks`, `TaskStore`); Konsum in
der BFF-Naht (ADR-0001) + der Dossier-360-Komponente. Baut auf ADR-0001.
