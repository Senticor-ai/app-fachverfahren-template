---
bump: minor
updateMode: review
migration: none
---

# Verfahrens-Modus-Diskriminator `LeistungConfig.kind`

Führt EIN optionales Feld `kind?: "vorgang" | "dossier"` auf `LeistungConfig` ein
(Default-Semantik `"vorgang"`) — als kleine, typisierte Grundlage für eine mögliche
spätere Architekturentscheidung. `"vorgang"` bezeichnet das heutige antrag-/
vorgang-zentrierte Verfahren; `"dossier"` reserviert einen zweiten Wert für
langlebiges Fallmanagement.

Der Change aktiviert keinen zweiten Laufzeitmodus: Es gibt weder eine alternative
UI-Komposition noch Store-, Migrations-, Routing- oder Governance-Logik. Diese
Folgen benötigen vor einer Implementierung eine eigene Architekturentscheidung.
`toContractSnapshot` projiziert `kind` nur, wenn es gesetzt ist; bestehende Configs
erhalten dadurch keine zusätzliche Snapshot-Zeile.

Konsumenten müssen nichts ändern. Das Setzen von `kind: "dossier"` allein stellt
ausdrücklich noch keinen nutzbaren Dossier-Modus bereit.
