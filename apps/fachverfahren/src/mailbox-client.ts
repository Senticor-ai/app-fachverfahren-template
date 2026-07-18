// mailbox-client — die HTTP-Naht des BÜRGER-Postfachs gegen /api/mailbox (scope=own). DIESELBE Konvention
// wie case-/antrag-client (Session-Cookie, BASE_URL-Präfix, DTOs aus @senticor/app-bff-contracts — nicht
// dupliziert). Der Scope „own" kommt server-seitig aus der Sitzung; der Client wählt nur den Posteingang.
import type { MailboxListDto } from "@senticor/app-bff-contracts";
import type { PostfachNachricht } from "@senticor/fachverfahren-kit";
import { apiPath, CaseRequestError } from "./case-client.js";

/** MailboxMessageDto → PostfachNachricht (die generische Postfach-Form des Kits). */
function toNachricht(
  dto: MailboxListDto["messages"][number],
): PostfachNachricht {
  return {
    id: dto.messageId,
    betreff: dto.subject,
    eingangIso: dto.createdAt,
    // „unread" = ungelesen; jeder andere Status (read/sent) gilt als gelesen.
    gelesen: dto.status !== "unread",
  };
}

/**
 * Lädt den eigenen Posteingang (owner-scoped, server-seitig aus der Sitzung). Neueste zuerst — der Server
 * liefert chronologisch, das Postfach zeigt sie in der gelieferten Reihenfolge.
 */
export async function ladePostfach(): Promise<PostfachNachricht[]> {
  const response = await fetch(
    apiPath("/api/mailbox?box=inbox&scope=own"),
    { credentials: "include", headers: { "content-type": "application/json" } },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new CaseRequestError(
      response.status,
      `Postfach-Abruf fehlgeschlagen (${response.status}): ${text}`,
    );
  }
  const body = (await response.json()) as MailboxListDto;
  return body.messages.map(toNachricht);
}
