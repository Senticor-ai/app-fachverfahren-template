// GET/POST /api/cases — Fall/Dossier-Verwaltung (ADR-0001). Lesen erfordert `case.read`, Anlegen
// `case.decision.prepare`. Mandant/Behörde/Jurisdiktion + Akteur kommen AUSSCHLIESSLICH aus der Sitzung. Der
// Server generiert caseId/version=1/openedAt; der Initialzustand + die Rechtsgrundlage werden gegen die
// `ProcedureRegistry` (Verfahren als DATEN) validiert — eine Rechtsgrundlage wird NIE erfunden.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  CaseCreateRequestSchema,
  CaseDtoSchema,
  CaseIdParamsSchema,
  CaseListDtoSchema,
  CaseListQuerySchema,
  ErrorEnvelopeSchema,
  type CaseDto,
} from "@senticor/app-bff-contracts";
import type { AppCase } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  createFachlicheAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

/** AppCase → CaseDto (Server-Topologie tenant/authority/jurisdiction bleibt verborgen). */
function toCaseDto(c: AppCase): CaseDto {
  return {
    caseId: c.caseId,
    procedureId: c.procedureId,
    procedureVersion: c.procedureVersion,
    state: c.state,
    version: c.version,
    subjectIds: c.subjectIds,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
  };
}

function badRequest(
  reply: FastifyReply,
  request: FastifyRequest,
  message: string,
): FastifyReply {
  return reply
    .code(400)
    .send({ error: message, requestId: requestIdOf(request) });
}

export function registerCaseRoutes(app: FastifyInstance, deps: BffDeps): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseRead.permission },
    deps,
  );
  const writeAuth = bffRouteAuth(
    {
      kind: "rbac",
      permission: builtInPermissions.casePrepareDecision.permission,
    },
    deps,
  );
  const errorResponses = {
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
  };

  typed.get(
    "/api/cases",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary: "Fälle der Behörde lesen (Filter Status/Verfahren)",
        querystring: CaseListQuerySchema,
        response: { 200: CaseListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let cases: AppCase[];
      try {
        cases = await deps.caseStore.listCases({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          ...(request.query.state !== undefined
            ? { state: request.query.state }
            : {}),
          ...(request.query.procedureId !== undefined
            ? { procedureId: request.query.procedureId }
            : {}),
          ...(request.query.limit !== undefined
            ? { limit: request.query.limit }
            : {}),
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({ cases: cases.map(toCaseDto) });
    },
  );

  typed.get(
    "/api/cases/:id",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary: "Einen Fall lesen",
        params: CaseIdParamsSchema,
        response: { 200: CaseDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Behörden-Scope: eine Fremd-Behörde im selben Mandanten wird als 404 behandelt (keine Existenz-Leaks).
      if (!found || found.authorityId !== session.authorityId)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      return reply.send(toCaseDto(found));
    },
  );

  typed.post(
    "/api/cases",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "Fall/Akte anlegen (Initialzustand + Rechtsgrundlage aus dem Verfahren)",
        body: CaseCreateRequestSchema,
        response: { 201: CaseDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;
      // Verfahren (Zustandsmaschine + Rechtsgrundlagen als DATEN) auflösen — fail-closed, wenn unbekannt.
      const procedure = deps.procedureRegistry.get(
        body.procedureId,
        body.procedureVersion,
      );
      if (!procedure)
        return badRequest(
          reply,
          request,
          `unknown procedure ${body.procedureId}@${body.procedureVersion}`,
        );
      if (!procedure.allowedStates.includes(body.state))
        return badRequest(
          reply,
          request,
          `state '${body.state}' not allowed by procedure`,
        );
      const legalBasisId = procedure.legalBasisIds[0];
      if (legalBasisId === undefined)
        return badRequest(reply, request, "procedure has no legal basis");

      const now = new Date().toISOString();
      const created: AppCase = {
        caseId: `case.${randomUUID()}`,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        procedureId: body.procedureId,
        procedureVersion: body.procedureVersion,
        state: body.state,
        version: 1,
        subjectIds: body.subjectIds ?? [],
        openedAt: now,
        closedAt: null,
      };
      try {
        await deps.caseStore.insertCase(created);
        // Append-only Fach-Audit: Fall eröffnet (Rechtsgrundlage aus dem Verfahren, nie erfunden).
        const audit = createFachlicheAuditEvent({
          eventType: "case.opened",
          actorId: session.actorId,
          actingAuthorityId: session.authorityId,
          purpose: "case-management",
          legalBasisId,
          caseId: created.caseId,
          requestId: requestIdOf(request),
          newState: created.state,
          summary: `Fall ${created.caseId} eröffnet (${body.procedureId})`,
        });
        await deps.caseStore.appendAuditEvent({
          auditEventId: audit.auditEventId,
          caseId: created.caseId,
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actorId: session.actorId,
          eventType: audit.eventType,
          purpose: audit.purpose,
          legalBasisId: audit.legalBasisId,
          requestId: audit.requestId,
          payload: { newState: created.state, summary: audit.summary },
          occurredAt: audit.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send(toCaseDto(created));
    },
  );
}
