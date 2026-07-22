---
bump: minor
updateMode: review
migration: none
---

Ergänzt eine Löschsperre (Legal Hold) als Schutz vor der DSGVO-Löschung (Issue
#55).

Neuer Endpunkt `POST /api/cases/:id/legal-hold` (Permission `case.legal-hold`):
stellt einen Fall unter Löschsperre (`aktiv:true`) oder hebt sie auf
(`aktiv:false`), mit Pflicht-Grund. Append-only (`case.legal-hold.changed`); die
effektive Sperre ist der Stand des jüngsten Ereignisses (compute-on-read).

Ein aktiver Legal Hold BLOCKIERT die DSGVO-Löschung (`POST .../loeschung` → 409)
— Beweissicherung, laufender Rechtsstreit, Ermittlung (Art. 17 Abs. 3 lit. b/e
DSGVO). Eigene, getrennte Permission: die Sperre begrenzt das Löschrecht und darf
nicht auf ihm mitreiten (sonst höbe der Löschende seine eigene Sperre auf).

Dies ist der EXPLIZITE Hold-Mechanismus. Die AUTOMATISCHE Ableitung von Sperren
aus gesetzlichen Aufbewahrungsfristen (§-Fristen-Matrix je Verfahren/Rechtsraum)
bleibt bewusst offen — sie ist eine Fach-/Rechtsentscheidung und wird nicht
erfunden; sie kann später als zusätzlicher Vor-Guard vor der Löschung andocken.
