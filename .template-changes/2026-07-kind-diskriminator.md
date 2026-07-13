---
bump: minor
updateMode: review
migration: none
---

# Verfahrens-Modus-Diskriminator `LeistungConfig.kind`

Führt EIN optionales Feld `kind?: "vorgang" | "dossier"` auf `LeistungConfig` ein
(Default-Semantik `"vorgang"`) — der Modus-Diskriminator, der später die
UI-Komposition und den `case_kind` treibt. `"vorgang"` = das heutige antrag-/
vorgang-zentrierte Verfahren; `"dossier"` = langlebiges, akkumulierendes Subjekt-/
Fallmanagement (interne Sachbearbeitung, Sub-Sammlungen an EINER Akte, wie das
Ziel-Fachverfahren „integrai").

Rein additiv, keine Store-/Migrations-Änderung, keine Governance/Persona-Änderung.
`toContractSnapshot` projiziert `kind` nur, wenn gesetzt (conditional-spread) —
Bestands-Verträge bleiben **byte-identisch** (Null-Diff bewiesen: kind-lose Config
erzeugt keine Vertrags-Zeile; `check:leistung-contract` FRISCHE-Check bleibt grün).

Konsumenten müssen NICHTS tun: fehlt `kind`, verhält sich alles unverändert wie
`"vorgang"`. Wer den Dossier-Modus nutzen will, setzt `kind: "dossier"` und pflegt
die Folge-Bausteine (Store-Träger `app_cases.data`/`app_tasks.data`, Dossier-Screens)
über die späteren additiven Phasen ein.
