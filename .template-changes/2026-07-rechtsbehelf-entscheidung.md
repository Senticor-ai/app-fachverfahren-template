---
bump: minor
updateMode: review
migration: none
---

Ergänzt die behördenseitige ENTSCHEIDUNG über einen eingelegten Rechtsbehelf
(Issue #61, Akzeptanzkriterium „Abhilfe/Nichtabhilfe als auditierte Übergänge").

Neuer Endpunkt `POST /api/cases/:id/rechtsbehelf/entscheidung` (Permission
`case.decision.prepare`): dokumentiert den Ausgang der Prüfung als append-only
Ereignis `case.objection.decided` — regime-neutral (`abhilfe` / `teilabhilfe` /
`nichtabhilfe` / `verworfen`, gültig für Widerspruch wie Einspruch). Die
Entscheidung ist zu begründen (Pflicht-`begruendung`) und referenziert die
Einlegung (`case.objection`) als Beweiskette; die Rechtsgrundlage wird aus dem
eingelegten Rechtsbehelf übernommen (nicht erfunden). Einmalig (409 bei einer
zweiten Entscheidung), setzt einen eingelegten Rechtsbehelf voraus (404 sonst).

Als auditiertes Ereignis modelliert — symmetrisch zur Einlegung, die ebenfalls
kein Zustandsübergang ist (nicht jedes Verfahren hat einen Widerspruchs-Zustand).
Die eigentliche VA-Rechtsfolge (Abhilfebescheid bzw. Vorlage an die
Widerspruchsbehörde → Widerspruchsbescheid, § 72 VwGO) läuft über die bestehende
Übergangs-/VA-Maschinerie; dieser Schritt dokumentiert den Ausgang.

Zusammen mit der Fristprüfung (verfristeter Rechtsbehelf erkannt) und dem
regime-neutralen Rechtsbehelf schließt das den Fall-Zweig aus Issue #61.
