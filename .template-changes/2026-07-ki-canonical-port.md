---
bump: minor
updateMode: review
migration: none
---

# KI „eine Wahrheit": Server-Port auf kanonischen platform-contracts AiAssistPort kollabiert

Der Server führte bisher einen **eigenen, duplizierten** `KiAssistPort` + `AiSuggestion` +
`EuAiActClass` — eine zweite Wahrheit neben dem kanonischen `platform-contracts AiAssistPort`.
Jetzt implementieren `HeuristicKiAssist` UND der OSS-OpenAI-Adapter direkt den **kanonischen** Port:

```
suggest(context: PortCallContext, request: AiSuggestRequest): Promise<CapabilityResponse<AiSuggestion>>
```

Der fachliche Vorschlag steckt generisch in `AiSuggestion.value` (das Verfahren castet zu
`VorgangKiVorschlag`). Transparenz/HITL (`marking`/`reviewRequired`/`euAiActClass`) bleiben
strukturell serverseitig erzwungen; `high-risk` wird per `capabilityFailure` abgelehnt.

- `apps/fachverfahren` deklariert jetzt `@senticor/platform-contracts` als Dependency.
- Die Route `/api/tasks/:id/ai/assist` baut einen `PortCallContext` (jurisdictionId defaultet auf
  authorityId, bis ein echtes Jurisdiktions-Modell existiert) + `AiSuggestRequest` (PII-arme
  Signale in `input`) und **projiziert** die kanonische `AiSuggestion` auf die **heutige** Wire-Form
  `{ vorschlag }` — Client + `domain-api.test` bleiben unverändert (server-only Refactor).
- Fail-closed: `capabilityFailure` → „KI nicht verfügbar"-Hinweis (Konfidenz 0), Mensch entscheidet.

Konsumenten, die den Server-`KiAssistPort`/`AiSuggestion`-Typ direkt importierten, wechseln auf
`@senticor/platform-contracts` (`AiAssistPort`/`AiSuggestion`) bzw. `VorgangKiVorschlag` aus
`server/ai-assist.ts`. Der Client-Vertrag (Wire) ist unverändert.
