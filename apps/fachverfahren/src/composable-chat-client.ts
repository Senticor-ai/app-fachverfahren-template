// composable-chat-client — die HTTP-Naht des COMPOSABLE-CHATS (Ziel-1 S5): Discovery über GET /api/composables
// und der KiChatPort-ADAPTER auf POST /api/composables/:id/chat. REUSE=MOUNTEN: der Adapter macht die fertige
// Chat-Insel des Kits (AssistentPanel + KiChatPort) mit dem governed BFF-Endpunkt chattbar — er baut KEIN
// eigenes Chat-UI und KEINE eigene KI-Naht. DIESELBE Konvention wie case-/verfahren-wissen-client
// (Session-Cookie, BASE_URL-Präfix, DTOs aus @senticor/app-bff-contracts — nicht dupliziert).
import type {
  ComposableChatReplyDto,
  ComposableChatRequestDto,
  ComposableListDto,
  ComposableSummaryDto,
} from "@senticor/app-bff-contracts";
import type { KiChatNachricht, KiChatPort } from "@senticor/fachverfahren-kit";
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
      const text =
        typeof reply.antwort.value === "string"
          ? reply.antwort.value
          : JSON.stringify(reply.antwort.value);
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
