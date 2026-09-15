// composable-chat-client — die HTTP-Naht des COMPOSABLE-CHATS (Ziel-1 S5): Discovery über GET /api/composables
// und der KiChatPort-ADAPTER auf POST /api/composables/:id/chat. REUSE=MOUNTEN: der Adapter macht die fertige
// Chat-Insel des Kits (AssistentPanel + KiChatPort) mit dem governed BFF-Endpunkt chattbar — er baut KEIN
// eigenes Chat-UI und KEINE eigene KI-Naht. DIESELBE Konvention wie case-/verfahren-wissen-client
// (Session-Cookie, BASE_URL-Präfix, DTOs aus @senticor/app-bff-contracts — nicht dupliziert).
//
// THE REVIEWER BEHIND THE CASE MASK (Z3) lives here too, next to the private `request<T>`: `createCaseReviewer` is
// the kit's KiAssistPort on `POST /api/composables/:id/spine/pruefung` — the same composable, asked to check ONE
// case instead of chatting. `loadComposableDetail` reads the tasks its spine declares, so the mask only offers what
// the spine route will run.
import type {
  ComposableChatReplyDto,
  ComposableChatRequestDto,
  ComposableDetailDto,
  ComposableListDto,
  ComposableSummaryDto,
  SpineRunResultDto,
} from "@senticor/app-bff-contracts";
import {
  STANDARD_KI_KENNZEICHNUNG,
  type CaseReviewer,
  type KiChatNachricht,
  type KiChatPort,
} from "@senticor/fachverfahren-kit";
import type { SpineAufgabe } from "@senticor/public-sector-sdk";
import { apiPath, CaseRequestError } from "./case-client.js";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CaseRequestError(
      response.status,
      `Composable-Chat ${path} fehlgeschlagen (${response.status}): ${text}`,
    );
  }
  return (await response.json()) as T;
}

/** Die registrierten Agentic Composables entdecken (Discovery, session.read). */
export async function ladeComposables(): Promise<ComposableSummaryDto[]> {
  const body = await request<ComposableListDto>("/api/composables");
  return body.composables;
}

/** One composable in detail — its spine's DECLARED tasks are the list the spine route checks before it runs one. */
export async function loadComposableDetail(
  composableId: string,
): Promise<ComposableDetailDto> {
  return request<ComposableDetailDto>(
    `/api/composables/${encodeURIComponent(composableId)}`,
  );
}

/** A suggestion's value as display text — the ONE rule both adapters apply: a provider may answer with structure
 *  (the local echo answers with its input object), and "[object Object]" is not an answer. */
function suggestionText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Eine governed Chat-Runde mit dem Spine-Agent eines Composables (geerdet + evidenziert, HITL). */
export async function composableChatRunde(
  composableId: string,
  runde: ComposableChatRequestDto,
): Promise<ComposableChatReplyDto> {
  return request<ComposableChatReplyDto>(
    `/api/composables/${encodeURIComponent(composableId)}/chat`,
    { method: "POST", body: JSON.stringify(runde) },
  );
}

/**
 * Der KiChatPort-ADAPTER: macht das AssistentPanel des Kits gegen den governed Composable-Chat chattbar.
 * `sende(verlauf)` erhält den Verlauf INKLUSIVE der neuen Nutzer-Nachricht (use-assistent-Vertrag) — der
 * Adapter trennt Nachricht und Vorverlauf und streamt die Antwort als EIN Token (die Route ist Request/
 * Response; echtes Token-Streaming ist ein späteres Hardening). Die Abschluss-Metadaten tragen Modell +
 * ERDUNG (geerdet auf n Wissenseinträge) — Transparenzelemente „source" + „marking" bleiben sichtbar.
 */
export function erstelleComposableChatPort(composableId: string): KiChatPort {
  return {
    async *sende(verlauf: KiChatNachricht[]) {
      const letzte = verlauf[verlauf.length - 1];
      const nachricht = letzte?.rolle === "nutzer" ? letzte.text : "";
      const vorverlauf = (
        letzte?.rolle === "nutzer" ? verlauf.slice(0, -1) : verlauf
      ).map((n) => ({ rolle: n.rolle, text: n.text }));
      const reply = await composableChatRunde(composableId, {
        nachricht,
        ...(vorverlauf.length > 0 ? { verlauf: vorverlauf } : {}),
      });
      const text = suggestionText(reply.antwort.value);
      yield text;
      return {
        quelle: `${reply.antwort.modelId} · ${
          reply.erdung.geerdet
            ? `geerdet auf ${reply.erdung.wissensEintraege} Wissenseinträge`
            : "ungeerdet (kein Verfahrens-Wissen)"
        }`,
        kennzeichnung: "KI-generiert, bitte prüfen",
      };
    },
  };
}

/** The spine task the reviewer behind the case mask runs: a check against norms and criteria. The SDK lists it among
 *  the HITL-bound tasks — its result is a suggestion, the decision stays human. */
export const CASE_REVIEW_TASK: SpineAufgabe = "pruefung";

/**
 * The reviewer behind the case mask, bound to ONE case: the kit's KiAssistPort on
 * `POST /api/composables/:id/spine/pruefung`. The input is what the kit hands over (PII-poor by construction, see the
 * kit's `caseReviewContext`); `caseId` travels beside it for the evidence ledger only — the model never sees it.
 *
 * RISK CLASS: the route runs every spine task with `maxClass: "limited-risk"` (routes/composables.ts), so this
 * reviewer declares "begrenzt". A result classified high-risk is REFUSED here rather than rendered under a badge that
 * understates it — fail-closed, the same direction as the port's own high-risk refusal.
 */
export function createCaseReviewer(
  composable: Pick<ComposableSummaryDto, "id" | "displayName">,
  caseId: string,
): CaseReviewer {
  return {
    label: composable.displayName,
    riskClass: "begrenzt",
    port: {
      async schlageVor(query) {
        const run = await request<SpineRunResultDto>(
          `/api/composables/${encodeURIComponent(composable.id)}/spine/${CASE_REVIEW_TASK}`,
          {
            method: "POST",
            body: JSON.stringify({
              input: {
                text: query.text,
                ...(query.kontext ? { context: query.kontext } : {}),
              },
              caseId,
            }),
          },
        );
        const suggestion = run.suggestion;
        if (suggestion.euAiActClass === "high-risk")
          throw new Error(
            `The review by ${composable.id} came back classified high-risk; it is not shown under a limited-risk badge.`,
          );
        return {
          wert: suggestionText(suggestion.value),
          quelle: `${composable.displayName} · ${suggestion.modelId}`,
          konfidenz: suggestion.confidence,
          begruendung: suggestion.rationale,
          kennzeichnung: STANDARD_KI_KENNZEICHNUNG,
          reviewErforderlich: true,
        };
      },
    },
  };
}
