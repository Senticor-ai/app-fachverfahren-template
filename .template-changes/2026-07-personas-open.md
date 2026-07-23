---
bump: minor
updateMode: review
migration: none
---

# Personas geöffnet (Server + DB)

Personas (Arbeitsbereiche = Navigation/Erlebnis, NIE Autorisierung) sind jetzt
serverseitig OFFEN: ein Fachverfahren kann beliebige Personas führen (Beschaffung:
`requester`/`approver`/`einkauf`/`lieferant`; HR: `antragsteller`/`vorgesetzter`/
`personalstelle`) — nicht nur die 3 kanonischen `buerger`/`sachbearbeitung`/`aufsicht`.

- `UserPersona` von der 3er-Union auf `string` geöffnet; `normalizePersonas` verwirft
  unbekannte Personas NICHT mehr (dedup + kanonische Sortierung: Defaults zuerst).
- `isPersonaArray` (Admin-PATCH) + der OIDC-Persona-Claim-Parser akzeptieren beliebige
  nicht-leere Strings (kein Enum-Filter mehr); die Admin-UI leitet die zuweisbaren
  Arbeitsbereiche aus `config.personas` ab.
- Migration `20260719000001_personas_open`: der DB-CHECK erlaubte bisher nur die 3
  kanonischen Personas und `cardinality <= 3`; das wird gelockert (nur die
  NULL-Element-Integrität bleibt). Rückwärtskompatibel; die neue DB-Migration wird vom
  bestehenden `db:migrate`-Schritt mitgezogen (`migration: none`).

Gegen echtes Postgres verifiziert: ein Konto mit 4 Personas inkl. verfahrens-eigener
(`einkauf`/`lieferant`) ist einfügbar; NULL-Elemente bleiben verboten.
