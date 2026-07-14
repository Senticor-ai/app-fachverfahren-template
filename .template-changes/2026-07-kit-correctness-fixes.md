---
bump: patch
updateMode: auto
migration: none
---

# Kit-Korrektheitsfälle gehärtet

- validiert PLZ-, E-Mail- und Telefonnummern anhand ihres Feldtyps
- stabilisiert Fristberechnungen für ISO-Zeitstempel ohne Offset
- schließt fail-open-Ränder beim Vergleich von Regelwerten
- leitet erreichte Status anhand der tatsächlich erreichbaren Übergänge ab
