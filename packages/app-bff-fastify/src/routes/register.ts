// POST /api/register/evidence — die BFF-Naht auf den EvidenceRetrievalPort (Register-/Nachweis-Abruf, NOOTS/
// Once-Only). Die Behörde ruft einen Nachweis ZWECKGEBUNDEN ab, damit die Bürger:in ihn nicht erneut einreichen
// muss. Der Aufruf-Kontext (inkl. Zweckbindung) kommt aus Sitzung + Request; ein `capabilityFailure` wird EHRLICH
// gemappt (retryable → 503, sonst 502). Der Abruf ist auditpflichtig (DSGVO-Nachvollzug: Typ + Zweck, NICHT die Daten).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  EvidenceRequestDtoSchema,
  EvidenceRecordDtoSchema,
  ErrorEnvelopeSchema,
} from "@senticor/app-bff-contracts";
import type { PortCallContext } from "@senticor/platform-contracts";
import {
  builtInPermissions,
  createAppDataAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { sendPortFailure } from "../port-route-safety.js";

/** Retryable-Fehler → 503, sonst 502 (das Register lehnte ab). Literal für die getypte reply.code(). */
const failStatus = (retryable: boolean): 502 | 503 => (retryable ? 503 : 502);

export function registerRegisterRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.registerAbruf.permission },
    deps,
  );

  typed.post(
    "/api/register/evidence",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["register"],
        summary: "Einen Nachweis aus einem Register abrufen (Once-Only, zweckgebunden)",
        body: EvidenceRequestDtoSchema,
        response: {
          200: EvidenceRecordDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // Kontext aus der Sitzung; die Zweckbindung (purpose) + optionaler Einwilligungs-/Rechtsgrundlagen-Bezug aus dem Request.
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "employee" },
        purpose: request.body.purpose,
        ...(request.body.consentRef
          ? { legalBasisId: request.body.consentRef }
          : {}),
      };
      const result = await deps.evidenceRetrieval.requestEvidence(context, {
        evidenceType: request.body.evidenceType,
        subjectId: request.body.subjectId,
        purpose: request.body.purpose,
        acceptedSchemaVersions: request.body.acceptedSchemaVersions,
        ...(request.body.consentRef
          ? { consentRef: request.body.consentRef }
          : {}),
      });
      if (!result.ok) {
        return sendPortFailure(reply, deps, request, result.error, failStatus(result.error.retryable), "register.evidence.failed");
      }
      // Datensparsam auditiert: Nachweis-TYP + Zweck + Aussteller — NICHT die abgerufenen Personendaten.
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "register.evidence.requested",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Nachweis '${request.body.evidenceType}' abgerufen (Zweck: ${request.body.purpose})`,
          resource: { type: "evidence", id: result.value.evidenceId },
        }),
      });
      return reply.code(200).send(result.value);
    },
  );
}
