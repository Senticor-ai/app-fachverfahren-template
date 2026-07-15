---
name: ki-assistenz
description: Bind transparent, human-in-the-loop, fail-closed AI assistance to a Fachverfahren via the ONE canonical AiAssistPort contract in platform-contracts — assistive-only, never authoritative (EU-AI-Act Art. 50 / DSGVO Art. 22). Use when asked "wie binde ich KI-Assistenz ein", how to add an AI suggestion / assistant / KI-Vorschlag to a case or task, or how a chos provider sits behind the port.
---

# KI-Assistenz

Wie ein Fachverfahren aus diesem Template KI anbindet: assistiv, transparent,
fail-closed und mit erzwungenem Human-in-the-Loop (HITL). KI liefert NIE eine
Entscheidung — nur einen gekennzeichneten Vorschlag, den ein Mensch prüft.
Root-Policy und Pfad-Karte: `AGENTS.md`. Naht-Grundvertrag des Templates:
`.agents/skills/fachverfahren-app/SKILL.md`.

## Kernprinzip

KI ist strikt **assistiv**; der Mensch entscheidet. Es gibt GENAU EINE
serverseitige Naht für KI-Vorschläge: den kanonischen Port `AiAssistPort` in
`@senticor/platform-contracts`. Ein Verfahren bindet KI an, indem es eine
`AiAssistPort`-Implementierung bereitstellt — mehr nicht. Der Vorschlag steckt
generisch in `AiSuggestion.value`; die Transparenz-/Review-Leitplanken sind fix.

## Was auf diesem Branch WIRKLICH existiert

Zwei getrennte Nähte sind vorhanden und getestet:

```text
packages/platform-contracts/src/ports.ts        → AiAssistPort · AiSuggestRequest · AiSuggestion · AiAssistClass  (die EINE Server-Wahrheit)
packages/platform-contracts/src/ports.ts        → PlatformPorts.aiAssist  (der Port-Slot im Plattform-Vertrag)
packages/platform-contracts/src/capabilities.ts → capability-id "ai-assist"
packages/platform-contracts/src/local-fakes.ts  → aiAssist: AiAssistPort  (lauffähige Referenz-/DEV-Implementierung, kein Netz)
packages/fachverfahren-kit/src/lib/ai-assist.ts → KiAssistPort · KiChatPort  (kit-seitiger Client-Port + deterministischer Stub)
packages/fachverfahren-kit/src/hooks/use-ai-assist.ts     → Hook (idle → laden → ergebnis/fehler)
packages/fachverfahren-kit/src/components/KiAssistPanel.tsx → UI, rendert die Transparenzelemente
```

Server-Contract (`ports.ts`) — die Formen sind fix:

- `AiAssistClass = "minimal" | "limited-risk" | "high-risk"`.
- `AiSuggestRequest { task, input, maxClass? }` — `input` trägt NUR PII-arme,
  strukturierte Domänensignale (kein Freitext/Name). `maxClass` ist die höchste
  akzeptierte Klasse.
- `AiSuggestion { value, confidence, modelId, rationale, sources, marking, euAiActClass, reviewRequired }`
  — der fachliche Vorschlag steckt in `value` (der Aufrufer castet ihn fachlich),
  NIE eine Entscheidung.
- `AiAssistPort { descriptor, suggest(context, request) }` →
  `CapabilityResponse<AiSuggestion>` (`capabilityOk` / `capabilityFailure`).
  `context` (`PortCallContext`) trägt Identität/Mandant.

Der kit-seitige `KiAssistPort` ist eine **eigene, vendor-neutrale** Naht für die
UI: `schlageVor(eingabe) → KiAssistErgebnis` mit den fünf Transparenzelementen
(`wert`, `quelle`, `konfidenz`, `begruendung`, `kennzeichnung`) und dem nie
abschaltbaren Literal `reviewErforderlich: true`. Der Kit liefert nur einen
deterministischen Stub — KEIN Modell, KEIN Netz, KEINE platform-contracts-
Abhängigkeit.

## Leitplanken (strukturell erzwungen, nicht nur Konvention)

- **HITL im Typ.** `reviewRequired` ist als Literal `true` typisiert
  (kit-seitig `reviewErforderlich: true`). Der Review-Zwang lässt sich nicht
  wegkonfigurieren; sonst bricht `tsc`.
- **Transparenz fix.** `marking` ist als Literal `"ki-vorschlag"` typisiert;
  `euAiActClass` bleibt `limited-risk`. Eine Implementierung setzt diese Felder
  serverseitig und übernimmt sie NIE aus einer Modell-Antwort.
- **high-risk wird abgelehnt.** `maxClass === "high-risk"` →
  `capabilityFailure("ai-assist/high-risk-refused", …)`. Kein autonomes
  rechtsnahes Entscheiden (EU-AI-Act Art. 50; DSGVO Art. 22). Die lokale
  Referenz in `local-fakes.ts` macht genau das vor.
- **Fail-closed.** Timeout / Netz-/HTTP-Fehler / unverwertbare Antwort →
  `capabilityFailure`. Kein halber Vorschlag, HITL bleibt.
- **PII-arm.** An das Modell gehen nur neutralisierte Signale aus
  `request.input`; Betreiber verantworten, dass diese PII-arm bzw. der Endpunkt
  lokal/vertrauenswürdig ist.

## So bindest du KI an (Minimalbeispiel)

Implementiere `AiAssistPort`, lege den fachlichen Vorschlag in `value`, lass die
Leitplanken UNVERÄNDERT. KEIN Domänen-Hardcode — die Felder kommen als DATEN aus
`request.input`.

```ts
import {
  capabilityFailure,
  capabilityOk,
  type AiAssistPort,
  type AiSuggestion,
  type AiSuggestRequest,
  type CapabilityResponse,
  type CapabilityDescriptor,
  type PortCallContext,
} from "@senticor/platform-contracts";

export function createLeistungAssist(
  descriptor: CapabilityDescriptor, // z. B. via descriptor("ai-assist", …) wie in local-fakes.ts
  now = () => Date.now(),
): AiAssistPort {
  return {
    descriptor,
    async suggest(
      _context: PortCallContext,
      request: AiSuggestRequest,
    ): Promise<CapabilityResponse<AiSuggestion>> {
      // 1) Rechtsnahe (high-risk) Aufgaben ablehnen — KI entscheidet nie autonom.
      if (request.maxClass === "high-risk") {
        return capabilityFailure(
          "ai-assist/high-risk-refused",
          "KI darf rechtsnahe Entscheidungen nicht autonom treffen (assistiv/limited-risk).",
          { retryable: false, classification: "confidential" },
        );
      }

      // 2) Vorschlag aus PII-armen Signalen ableiten (erklaerbar, deterministisch).
      const input = request.input as { faelligIso?: string | null };
      const sources: string[] = [];
      let prioritaet = "niedrig";
      if (typeof input.faelligIso === "string") {
        const restTage = (Date.parse(input.faelligIso) - now()) / 86_400_000;
        sources.push(`Restfrist ~ ${Math.round(restTage)} Tage`);
        prioritaet =
          restTage <= 3 ? "hoch" : restTage <= 14 ? "mittel" : "niedrig";
      }

      // 3) Transparenz-/Review-Felder IMMER serverseitig fix — nie aus einer Modell-Antwort.
      return capabilityOk({
        value: { prioritaet }, // der fachliche Vorschlag; NIE eine Entscheidung
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
```

Für DEV/Test genügt die lauffähige Referenz in
`packages/platform-contracts/src/local-fakes.ts` (Slot `aiAssist`): sie zeigt
Descriptor, high-risk-Refusal und die fixen Transparenzfelder vor, ohne Netz.

## Noch offen / geplant (NICHT auf diesem Branch verdrahtet)

Ehrlich abgegrenzt — der Contract steht, die Verdrahtung nach außen fehlt:

- **Keine HTTP-Route.** Es gibt heute KEINE `/api/**/ai/*`-Route und kein
  `registerDomainApi`, das `aiAssist` konsumiert. Ein Verfahren ruft
  `port.suggest(...)` derzeit direkt; eine BFF-Route (analog zu den Fall-/Task-
  Routen in `packages/app-bff-fastify/src/routes/`) ist geplant.
- **Kein Provider-Adapter / keine Env-Verdrahtung.** `createAiAssistFromEnv`,
  ein OpenAI-/Ollama-Adapter oder `AI_ASSIST_*`-Variablen existieren NICHT.
  Vorhanden ist nur der lokale Fake. Ein echter Provider dockt am selben Port an
  (Descriptor + `suggest`), ohne Contract/Kit zu ändern.
- **Kein Manifest-Eintrag.** Die capability-id `"ai-assist"` steht im TS-Union
  (`capabilities.ts`), aber NICHT in `platform/capabilities.json`.
- **chos als Provider — Muster, nicht verdrahtet.** chos (Cognitive Hive OS)
  dockt wie jeder andere Provider hinter dem Port an: ein chos-Adapter
  implementiert `suggest` und ruft die chos-Assist-API; Contract/Kit ändern sich
  nicht. **IP-Grenze (unverhandelbar):** chos-interne IP (Cognitive Firewall,
  Lens-Bindung, Subsumption, Inference-Router, outputGuard/Audit) bleibt
  AUSSCHLIESSLICH hinter der chos-API; das OSS-Template bettet KEINE chos-IP ein
  und setzt `marking`/`reviewRequired`/`euAiActClass` weiterhin selbst. Analog
  zum Provider-hinter-Port-Muster bei Fall/Workflow — auf diesem Branch NOCH
  NICHT verdrahtet.

## Gates & Verifikation

```bash
pnpm run typecheck
pnpm run test
```

Absichernd vorhanden:

- `packages/platform-contracts/src/local-fakes.test.ts` — der `aiAssist`-Fake
  (high-risk-Refusal, fixe Transparenzfelder).
- `packages/fachverfahren-kit/src/lib/ai-assist.test.ts` — der kit-seitige
  `KiAssistPort`/`KiChatPort`-Stub mit den fünf Transparenzelementen.
