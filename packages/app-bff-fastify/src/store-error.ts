// store-error — Store-Ausfälle (UnavailableAppStore ohne APP_PG_URL, echter
// PG-Ausfall) antworten einheitlich 503 mit Envelope. Bewusst KEIN instanceof:
// jeder Wurf einer Store-Methode gilt als „Speicher nicht verfügbar" — grob,
// aber ehrlich für diese Endpunktmenge (Revisit bei echten Domain-APIs).
import type { FastifyReply, FastifyRequest } from "fastify";
import { requestIdOf } from "./route-auth.js";

export function storeUnavailable(
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  return reply.code(503).send({
    error: "app data storage unavailable",
    requestId: requestIdOf(request),
  });
}
