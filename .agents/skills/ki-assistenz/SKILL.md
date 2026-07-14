---
name: ki-assistenz
description: Bind transparent, human-in-the-loop, fail-closed AI assistance to a Fachverfahren via the ONE canonical AiAssistPort seam — assistive-only, never authoritative (EU-AI-Act Art. 50 / DSGVO Art. 22).
---

# KI-Assistenz

Wie ein Fachverfahren aus diesem Template KI anbindet: assistiv, transparent,
fail-closed und mit erzwungenem Human-in-the-Loop (HITL). Für automatisierte
Build-Agenten (chos-code/gtc-builder) genauso wie für Entwickler:innen.
Root-Policy und Pfad-Karte: `AGENTS.md`. Der Naht-Grundvertrag des Templates:
`.agents/skills/fachverfahren-app/SKILL.md`.

## Kernprinzip

Es gibt GENAU EINE Naht für KI: den kanonischen Port
`AiAssistPort` aus `@senticor/platform-contracts`. Ein Verfahren bindet KI an,
indem es eine `AiAssistPort`-Implementierung in `DomainApiDeps.aiAssist`
übergibt — mehr nicht. Die KI liefert NIE eine Entscheidung, nur einen
`AiSuggestion` mit `value` (dem fachlichen Vorschlag), einer Begründung, Quellen
und den fixen Transparenz-/Review-Feldern.

```text
packages/platform-contracts/src/ports.ts   → AiAssistPort / AiSuggestRequest / AiSuggestion (EINE Wahrheit)
DomainApiDeps.aiAssist                      → die Anbindungs-Naht (optional; fehlt sie, gibt es KEINE /api/tasks/:id/ai/*-Routen)
```

Der Port ist provider-neutral: DIESELBE Schnittstelle trägt sowohl die lokale,
deterministische `HeuristicKiAssist` (DEV/Test, kein Netz, kein Zufall) als auch
den OSS-`createOpenAiAssist`-Adapter (OpenAI-kompatibles Protokoll: Ollama /
vLLM / LocalAI / OpenAI). Es wird KEIN verfahrensspezifischer KI-Server, kein
Inline-Key und keine zweite Vorschlags-Wahrheit gebaut — der fachliche Vorschlag
steckt generisch in `AiSuggestion.value`, das die Route projiziert.

## Wie ein Build-Agent (chos-code/gtc-builder) es nutzt

1. Naht-Kontext ziehen (vendor-neutral):

   ```bash
   pnpm run agent:bootstrap -- --json
   pnpm run agent:discover  -- --json
   pnpm run agent:context   -- --task <app-spec> --paths apps/fachverfahren/server
   ```

2. **Provider wählen — meist NICHTS bauen.** Der Default reicht für die meisten
   Verfahren: `createAiAssistFromEnv(env) ?? new HeuristicKiAssist()` (siehe
   `apps/fachverfahren/server/index.ts`). Für ein echtes OSS-Modell nur die
   Umgebung setzen, kein Code:

   ```text
   AI_ASSIST_BASE_URL   z. B. http://localhost:11434/v1  (Ollama/vLLM/LocalAI/OpenAI)
   AI_ASSIST_MODEL      z. B. qwen2.5 / gpt-4o-mini
   AI_ASSIST_API_KEY    optional (bei lokalen Servern meist leer)
   AI_ASSIST_TIMEOUT_MS optional (Default 8000)
   ```

   Fehlt `BASE_URL`/`MODEL`, greift fail-closed die lokale Heuristik — es
   verlässt KEIN Datum den Prozess.

3. **Nur wenn ein verfahrensspezifischer Adapter nötig ist** (eigene Heuristik,
   eigener Broker): `AiAssistPort` implementieren (`descriptor` + `suggest`), den
   fachlichen Vorschlag in `AiSuggestion.value` legen und die Leitplanken UNVER-
   ÄNDERT lassen (siehe nächster Abschnitt). Das Interface ist 1:1 austauschbar —
   keine Route, kein Client, kein Kit-Code ändert sich.

4. **Zuständigkeitsprüfung verdrahten.** Für die `/ai/apply`-Zuweisung
   `DomainApiDeps.actorRoleStore` mitgeben — sonst wird jede KI-Zuweisung
   fail-closed als „nicht zuständig" (422) abgelehnt.

5. **KEIN neuer Client-Code.** Die Route projiziert die kanonische
   `AiSuggestion` auf die bestehende Wire-Form
   (`{ vorschlag, konfidenz, begruendung, quellen, marking, reviewRequired, euAiActClass }`).
   Der Build-Agent füllt die Naht, nicht die UI.

## Vertrag & Leitplanken

Vertrag (`packages/platform-contracts/src/ports.ts` +
`.../capabilities.ts`):

- `AiSuggestRequest { task, input, maxClass? }` — `input` trägt NUR PII-arme
  Domänensignale (kein Freitext/Name). `maxClass` ist die höchste akzeptierte
  `AiAssistClass` (`"minimal" | "limited-risk" | "high-risk"`).
- `AiSuggestion { value, confidence, modelId, rationale, sources, marking, euAiActClass, reviewRequired }`
  — der fachliche Vorschlag steckt in `value` (NIE eine Entscheidung).
- `suggest(context: PortCallContext, request)` → `CapabilityResponse<AiSuggestion>`
  (`capabilityOk` / `capabilityFailure`). `PortCallContext` trägt Identität/
  Mandant (`tenantId`/`authorityId`/`jurisdictionId`/`requestId`).

ERZWUNGEN (strukturell, nicht nur konventionell):

- **HITL im Typ.** `reviewRequired` ist als Literal `true` typisiert — der
  Review-Zwang lässt sich nicht wegkonfigurieren. `tsc` bricht sonst.
- **Transparenz server-seitig gesetzt.** `marking:"ki-vorschlag"`,
  `reviewRequired:true` und `euAiActClass:"limited-risk"` werden IMMER vom
  Server gesetzt — NIE aus einer Modell-Antwort übernommen (siehe
  `ai-openai-adapter.ts`). Die KI ist damit strukturell nie eines der zwei
  Augen; der Mensch entscheidet.
- **high-risk abgelehnt.** `maxClass === "high-risk"` →
  `capabilityFailure("ai-assist/high-risk-refused", …)`. Keine autonome
  rechtsnahe Entscheidung (EU-AI-Act Art. 50; DSGVO Art. 22).
- **Fail-closed.** Timeout / Netzfehler / HTTP-Fehler / unverwertbare Antwort →
  `capabilityFailure`. Die Route (`/api/tasks/:id/ai/assist`) projiziert das auf
  einen „KI nicht verfügbar"-Hinweis (Konfidenz 0); HITL bleibt, der Mensch
  prüft manuell.
- **Route-Trennung.** `/ai/assist` ist REIN (keine Mutation, keine Persistenz;
  `task.read` + `ai.assist`). `/ai/apply` erlaubt AUSSCHLIESSLICH nicht-
  autoritative Metadaten (Priorität/Zuweisung/Label; `task.write` + `ai.assist`),
  ruft NIE `executeCaseTransition`, schreibt NIE ein `case.*`-Audit. Jede
  übernommene Änderung wird als `task.ki-uebernommen`-Aktivität mit
  `marking:"ki-vorschlag"` protokolliert (append-only Provenienz), eine
  Zuweisung nur an einen aktiv Zuständigen (`actorRoleStore`, sonst 422).
- **PII-arm.** An das Modell gehen nur neutralisierte Signale
  (Priorität/Frist/Labels + `daten`). Betreiber verantworten, dass `daten`
  PII-arm bzw. der Endpunkt lokal/vertrauenswürdig ist.

## Gates & Verifikation

Nach jeder Änderung an der Naht/am Adapter selbst verifizieren und im Loop grün
machen:

```bash
pnpm run typecheck
pnpm run test
```

Was die Gates absichern:

- `apps/fachverfahren/server/ai-assist.test.ts` — deterministische Heuristik,
  high-risk-Refusal, fixe Transparenzfelder.
- `apps/fachverfahren/server/ai-openai-adapter.test.ts` — OSS-Adapter,
  fail-closed bei Timeout/HTTP/ungültiger Antwort, server-seitig gesetzte
  Marking-/Review-Felder.
- `apps/fachverfahren/server/domain-api.test.ts` — `/ai/assist` (rein) und
  `/ai/apply` (nur Metadaten, Zuständigkeit, `task.ki-uebernommen`), RBAC,
  Behörden-Scope (404).
- `packages/fachverfahren-kit/src/lib/ai-assist.test.ts` — der generische
  Client-Port mit den fünf Transparenzelementen.
- Der Port lebt in `@senticor/platform-contracts`
  (`pnpm run test:platform-contracts`) — EINE Vertrags-Wahrheit für alle
  Adapter.

## Minimalbeispiel

Ein generischer Verfahrens-Adapter auf dem kanonischen Port. Der fachliche
Vorschlag zu einem `vorgang`/`dossier` steckt in `value`; die Leitplanken sind
fix. KEIN Domänen-Hardcode — die konkreten Felder kommen als DATEN aus
`request.input`.

```ts
import {
  capabilityFailure,
  capabilityOk,
  defaultSemantics,
  type AiAssistPort,
  type AiSuggestion,
  type AiSuggestRequest,
  type CapabilityResponse,
  type PortCallContext,
} from "@senticor/platform-contracts";

/** Der fachliche Vorschlagswert (AiSuggestion.value) — NIE eine Entscheidung, nur Vorlage. */
interface LeistungVorschlag {
  prioritaet?: string;
  labels?: string[];
  entscheidungsentwurf?: string; // nur ENTWURF, der Mensch entscheidet
}

export function createLeistungAssist(
  now = () => new Date().toISOString(),
): AiAssistPort {
  return {
    descriptor: {
      id: "ai-assist",
      name: "Verfahrens-KI-Assistenz (assistiv)",
      version: "0.1.0",
      provider: "domain-heuristic",
      dataClassification: "internal",
      schemas: [],
      semantics: defaultSemantics,
    },
    async suggest(
      _context: PortCallContext,
      request: AiSuggestRequest,
    ): Promise<CapabilityResponse<AiSuggestion>> {
      // 1) Rechtsnahe (high-risk) Aufgaben werden abgelehnt — KI entscheidet nie autonom.
      if (request.maxClass === "high-risk") {
        return capabilityFailure(
          "ai-assist/high-risk-refused",
          "KI darf rechtsnahe Entscheidungen nicht autonom treffen (assistiv/limited-risk).",
          { retryable: false, classification: "internal" },
        );
      }

      // 2) Vorschlag aus PII-armen Signalen der Naht ableiten (erklärbar, deterministisch).
      const input = request.input as { faelligIso?: string | null };
      const value: LeistungVorschlag = {};
      const sources: string[] = [];
      if (typeof input.faelligIso === "string") {
        const restTage =
          (Date.parse(input.faelligIso) - Date.parse(now())) / 86_400_000;
        sources.push(`Restfrist ≈ ${Math.round(restTage)} Tage`);
        value.prioritaet =
          restTage <= 3 ? "hoch" : restTage <= 14 ? "mittel" : "niedrig";
      }

      // 3) Transparenz-/Review-Felder IMMER server-seitig fix — nie aus einer Modell-Antwort.
      return capabilityOk({
        value,
        confidence: sources.length > 0 ? 0.7 : 0.4,
        modelId: "domain-heuristik:frist",
        rationale:
          sources.length > 0
            ? `Abgeleitet aus: ${sources.join("; ")}.`
            : "Keine ableitbaren Signale — nur schwacher Vorschlag.",
        sources,
        marking: "ki-vorschlag",
        euAiActClass: "limited-risk",
        reviewRequired: true,
      });
    },
  };
}

// Anbindung an das Verfahren (die EINE Naht): entweder OSS aus der Umgebung, sonst der Adapter.
//   const aiAssist = createAiAssistFromEnv(process.env) ?? createLeistungAssist();
//   registerDomainApi(app, { ...deps, aiAssist, actorRoleStore });
```
