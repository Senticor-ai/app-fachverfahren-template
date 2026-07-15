---
bump: minor
updateMode: review
migration: none
---

# OpenAI-kompatibler Provider für KI-Assistenz

Das neue Paket `@senticor/provider-openai-compatible` implementiert den
bestehenden `AiAssistPort` für OpenAI-kompatible Endpunkte.

Der Provider sendet ausschließlich explizit freigegebene Aufgaben und
Eingabefelder, verlangt freigegebene Zwecke und Rechtsgrundlagen, begrenzt Ein-
und Ausgabe und lehnt High-Risk-Aufgaben ab. Entfernte Endpunkte benötigen TLS;
Kennzeichnung sowie Prüfpflicht werden unabhängig von der Modellantwort gesetzt.

Diese technischen Egress-Grenzen sind keine vollständige AI-Data-Governance und
kein Nachweis einer DSGVO-, AI-Act- oder fachlichen Freigabe. Endpunktzulassung,
Auftragsverarbeitung, Löschfristen, Datenschutz-Folgenabschätzung,
Modellbewertung, Audit-Integration und organisatorische Freigabe bleiben vor
einer produktiven Nutzung offen.
