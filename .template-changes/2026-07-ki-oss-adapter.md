---
bump: minor
updateMode: auto
migration: none
---

# OSS-first KI-Adapter (OpenAI-kompatibel) — echte KI statt nur Heuristik

Neu: `apps/fachverfahren/server/ai-openai-adapter.ts` — ein vendor-neutraler KI-Assistenz-Adapter,
der per OpenAI-kompatiblem Protokoll **jeden** solchen Server anspricht (Ollama / vLLM / LocalAI /
OpenAI). Er erfüllt denselben `KiAssistPort` wie die bisherige `HeuristicKiAssist` und ist 1:1
austauschbar. Damit ist die KI nicht mehr nur ein deterministischer Stub — ein echtes lokales/OSS-
Modell kann Priorität/Zuweisung/Labels/Entscheidungs-**Entwurf** vorschlagen.

Leitplanken (unverhandelbar, getestet):

- **Strikt assistiv (EU-AI-Act Art. 50 / HITL):** `marking:"ki-vorschlag"`, `reviewRequired:true`
  und `euAiActClass:"limited-risk"` werden IMMER serverseitig gesetzt — nie aus der Modell-Antwort
  übernommen. Ein Test weist nach, dass ein Modell, das diese Felder kippen will, ignoriert wird.
- **Fail-closed:** Timeout / Netzfehler / HTTP-Fehler / unverwertbare Antwort → ein „KI nicht
  verfügbar"-Vorschlag (Konfidenz 0), der Mensch prüft manuell (kein Absturz, kein 500).
- **PII-arm:** nur neutralisierte Signale (Priorität/Frist/Labels + `daten`) verlassen den Prozess.

**Aktivierung (opt-in, sonst unverändert):** ohne `AI_ASSIST_BASE_URL`+`AI_ASSIST_MODEL` liefert
`createAiAssistFromEnv` `null` → es greift fail-closed die lokale Heuristik (kein Netz, heutiges
Verhalten). Env: `AI_ASSIST_BASE_URL` (z. B. `http://localhost:11434/v1`), `AI_ASSIST_MODEL`,
optional `AI_ASSIST_API_KEY`, `AI_ASSIST_TIMEOUT_MS`.

Hinweis: Der Port wird in einem Folgeschritt auf den kanonischen `platform-contracts AiAssistPort`
kollabiert (EINE Wahrheit); der Adapter wandert dann mit (gleiche Semantik).
