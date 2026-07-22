---
bump: minor
updateMode: review
migration: none
---

Ergänzt die Durchsetzung gesetzlicher AUFBEWAHRUNGSFRISTEN als zusätzlichen Schutz
vor der DSGVO-Löschung (Issue #55) — der data-driven Gegenpart zum expliziten
Legal Hold.

Ein Verfahren kann eine Aufbewahrungsfrist DEKLARIEREN (`ProcedureVersion.
aufbewahrungMonate`, gemessen ab Fallabschluss `closedAt`). Welche §-Frist gilt
(z. B. § 84 SGB X = 120 Monate), ist eine Fach-/Rechtsentscheidung des Konsumenten
— sie wird als DATEN am Verfahren erklärt, nicht im Code erfunden.

Solange die deklarierte Frist läuft, blockiert sie die DSGVO-Löschung
(`POST /api/cases/:id/loeschung` → 409, Art. 17 Abs. 3 lit. b DSGVO —
Aufbewahrung zur Erfüllung einer rechtlichen Verpflichtung). Fehlt die Deklaration
oder ist die Frist abgelaufen bzw. der Fall nicht abgeschlossen, gibt es keine
zusätzliche Sperre (Default unverändert).

SDK: reine, deterministische `aufbewahrungsende` / `aufbewahrungLaeuft`
(kalendergenau, Monatsende-Klemmung). Die Monats-Arithmetik ist in `kalender.ts`
zentralisiert — EINE Wahrheit, geteilt mit der Rechtsbehelfs-Fristprüfung (keine
divergierende Kalender-Arithmetik).

Damit ist die Legal-Hold-/Retention-Schicht aus #55 vollständig: expliziter Hold
(records-management-Akt) UND automatische Frist-Durchsetzung (deklariert je
Verfahren).
