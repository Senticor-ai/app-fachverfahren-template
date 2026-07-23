// port-route-safety — EINE Wahrheit für das EHRLICHE + SICHERE Scheitern eines Port-Aufrufs (payment/identity/mailbox/
// register). Zwei Härtungen (aus dem adversarialen Audit):
//  (1) KLASSIFIKATIONS-SICHERER Body: bei vertraulichen Fehler-Klassen (confidential/restricted/secret) NICHT die
//      (evtl. PII-tragende) Anbieter-Message durchreichen — nur der stabile, PII-freie Fehler-CODE. Spiegel des
//      500-Handlers (der ebenfalls generisch antwortet). Verhindert PII-Leak über echte Adapter (ePayBL/Melderegister).
//  (2) FEHLVERSUCH-AUDIT: die Routen-Header versprechen „jede Veranlassung/jeder Abruf ist auditpflichtig" — dann muss
//      auch der ABGELEHNTE Versuch (502/503) eine Spur hinterlassen (Kassen-/DSGVO-Nachvollzug), datensparsam (nur Code).
import type { FastifyReply, FastifyRequest } from "fastify";
import { createAppDataAuditEvent } from "@senticor/public-sector-sdk";
import type { BffDeps } from "./deps.js";
import { requestIdOf, sessionOf } from "./route-auth.js";

/** Der klassifikations-sichere Fehler-Body: vertrauliche Klassen → nur der Code; sonst die Anbieter-Message. */
function safeError(err: { code: string; message: string; classification: string }): string {
  const sensitive =
    err.classification === "confidential" ||
    err.classification === "restricted" ||
    err.classification === "secret";
  return sensitive ? `Dienst nicht verfügbar (${err.code})` : err.message;
}

/** Sendet einen gescheiterten Port-Aufruf EHRLICH + SICHER: auditiert den Fehlversuch (datensparsam, nur Code) und
 *  antwortet mit dem klassifikations-sicheren Body. `status` = 502 (Anbieter lehnte ab) | 503 (retryable). `eventType`
 *  je Route/Operation (z.B. "payment.create.failed") — DISTINKT vom Erfolgs-Event, damit Erfolgs-Audit-Tests halten. */
export async function sendPortFailure(
  reply: FastifyReply,
  deps: BffDeps,
  request: FastifyRequest,
  err: { code: string; message: string; classification: string; retryable: boolean },
  status: 502 | 503,
  eventType: string,
): Promise<FastifyReply> {
  const requestId = requestIdOf(request);
  const session = sessionOf(request);
  await deps.auditSink.emit({
    kind: "app-data",
    event: createAppDataAuditEvent({
      eventType,
      actorId: session.actorId,
      tenantId: session.tenantId,
      requestId,
      summary: `Port-Aufruf abgelehnt (${err.code}${err.retryable ? ", retryable" : ""})`,
      resource: { type: "port-failure", id: err.code },
    }),
  });
  return reply.code(status).send({ error: safeError(err), requestId });
}
