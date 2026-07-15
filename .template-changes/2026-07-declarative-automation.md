---
bump: minor
updateMode: review
migration: none
---

# Deklarative Automationsregeln als auswertbare Intentionen

Ergänzt einen optionalen, verfahrensneutralen Regelvertrag auf `LeistungConfig`
und eine reine Auswertung im `fachverfahren-kit`. Die Auswertung prüft Auslöser
und Bedingungen und liefert typisierte Aktions-Intentionen zurück.

Der Change ist keine Automationsplattform: Er enthält keinen Scheduler, Worker,
Event-Bus, Effekt-Adapter, Persistenz- oder Retry-Modell. Er führt keine Aktion
aus und umgeht weder Autorisierung noch Vier-Augen-Regeln. Diese Laufzeitfragen
benötigen eine separate Architekturentscheidung mit Idempotenz-, Audit- und
Betriebskonzept.
