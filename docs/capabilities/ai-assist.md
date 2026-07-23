# Capability: ai-assist

Verwende `AiAssistPort` für **assistive** KI-Vorschläge (Adressvorschlag,
Vollständigkeitshinweis, Zusammenfassung). Die KI entscheidet NIE rechtsnah:
jeder Vorschlag trägt das Pflicht-Transparenzmuster (`marking:"ki-vorschlag"`,
Konfidenz, Begründung, Quellen) und `reviewRequired:true`; die Entscheidung
bleibt menschlich (serverseitig, Vier-Augen). EU-AI-Act: Assistenz ist
`limited-risk`, `high-risk` wird abgelehnt.

## Austauschbare Anbieter (OSS-first)

Das Modell kommt aus dem Provider, nie als Inline-Key. Zwei mitgelieferte,
gegeneinander austauschbare Implementierungen bestehen **denselben** Vertrag
(`aiAssistContractScenarios` in `@senticor/platform-contracts`):

- **local-fake** (`createLocalAiAssistPort`, `@senticor/platform-contracts`) —
  deterministischer Vorschlag ohne Netz, für Tests und DEV.
- **Ollama** (`createOllamaAiAssistPort` / `…FromEnv`,
  `@senticor/provider-ai-ollama`) — echter HTTP-Adapter gegen einen lokalen
  oder selbstgehosteten Ollama-Server (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`).

Ein eigener Anbieter (Broker, anderes LLM) implementiert `AiAssistPort` und ist
substituierbar, sobald er die Conformance-Szenarien besteht. Drei Invarianten
muss jeder Adapter wahren, egal was das Modell liefert: (1) die HCAI-Marker hart
setzen, (2) `high-risk` vor jedem Modellaufruf ablehnen, (3) ehrlich
fail-closed sein — kein erreichbares Modell ergibt eine `capabilityFailure`,
nie einen fabrizierten Vorschlag oder eine erfundene Konfidenz.

## Erweiterungspunkte

- `model-provider` — welcher Anbieter/welches Modell den Vorschlag erzeugt.
- `prompt-template` — wie Aufgabe und Kontext zum Prompt werden.
- `confidence-policy` — wie mit (oft nicht kalibrierter) Konfidenz umzugehen ist.
