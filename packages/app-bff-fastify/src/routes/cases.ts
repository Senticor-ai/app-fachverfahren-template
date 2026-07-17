// GET/POST /api/cases — Fall/Dossier-Verwaltung (ADR-0001). Lesen erfordert `case.read`, Anlegen
// `case.decision.prepare`. Mandant/Behörde/Jurisdiktion + Akteur kommen AUSSCHLIESSLICH aus der Sitzung. Der
// Server generiert caseId/version=1/openedAt; der Initialzustand + die Rechtsgrundlage werden gegen die
// `ProcedureRegistry` (Verfahren als DATEN) validiert — eine Rechtsgrundlage wird NIE erfunden.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  CaseAllowedActionsDtoSchema,
  CaseAuditListDtoSchema,
  CaseAuditQuerySchema,
  CaseCreateRequestSchema,
  ProcedureListDtoSchema,
  CaseDtoSchema,
  CaseIdParamsSchema,
  CaseListDtoSchema,
  CaseListQuerySchema,
  CaseTransitionRequestSchema,
  ErrorEnvelopeSchema,
  type CaseAuditEventDto,
  type CaseDto,
} from "@senticor/app-bff-contracts";
import {
  CaseNotFoundError,
  CaseVersionConflictError,
  type AppAuditEvent,
  type AppCase,
} from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  createFachlicheAuditEvent,
  transitionCase,
  type Case as DomainCase,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

/**
 * Die Ereignistypen, die einen BEARBEITUNGSSCHRITT AM FALL darstellen — und damit die einzigen, an denen
 * sich die Vier-Augen-Sperre bemisst („wer diesen Schritt vorbereitet hat, gibt ihn nicht selbst frei").
 *
 * SICHERHEITSRELEVANT — beim Ergänzen eines neuen Fall-Audit-Ereignisses bewusst entscheiden:
 *  - Ein Ereignis, das eine BEARBEITUNG durch eine bedienstete Person ist, gehört HIERHER.
 *  - Ein Ereignis, das nur eine BEOBACHTUNG/Zustellung protokolliert (Bescheid-Abruf durch den Bürger,
 *    Zustellnachweis, Lesebestätigung), gehört ausdrücklich NICHT hierher: sonst verschöbe der Abruf
 *    durch einen Dritten die Bezugsgröße und der Vorbereiter dürfte seine eigene Entscheidung freigeben.
 *
 * Die Vorfassung hatte diese Menge nicht und nahm einfach das jüngste Ereignis — was genau so lange
 * gutging, wie ausschliesslich Bearbeitungs-Ereignisse in den Strom liefen.
 */
const FOUR_EYES_RELEVANT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "case.opened",
  "case.transitioned",
]);

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
    data: c.data,
  };
}

/** AppAuditEvent → CaseAuditEventDto (Server-Topologie tenant/authority/jurisdiction + requestId bleiben verborgen). */
function toAuditDto(e: AppAuditEvent): CaseAuditEventDto {
  return {
    auditEventId: e.auditEventId,
    caseId: e.caseId,
    eventType: e.eventType,
    actorId: e.actorId,
    purpose: e.purpose,
    legalBasisId: e.legalBasisId,
    payload: e.payload,
    occurredAt: e.occurredAt,
  };
}

/** AppCase → SDK-`Case` für den reinen `transitionCase`-Reducer (Guards/Vier-Augen leben im SDK, nicht im Store).
 *  `closedAt` ist im Store `null`, in der Domäne optional → per Conditional-Spread weglassen (exactOptionalPropertyTypes). */
function toDomainCase(c: AppCase): DomainCase {
  return {
    caseId: c.caseId,
    procedureId: c.procedureId,
    procedureVersion: c.procedureVersion,
    tenantId: c.tenantId,
    authorityId: c.authorityId,
    jurisdictionId: c.jurisdictionId,
    state: c.state,
    version: c.version,
    subjectIds: c.subjectIds,
    openedAt: c.openedAt,
    ...(c.closedAt !== null ? { closedAt: c.closedAt } : {}),
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
    "/api/procedures",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "Registrierte Verfahren in Kurzform (für die Wahl beim Anlegen einer Akte)",
        response: { 200: ProcedureListDtoSchema, ...errorResponses },
      },
    },
    async (_request, reply) => {
      // Verfahren als DATEN aus der Registry — kein Store-Zugriff, kein Mandanten-Scope (die Zustandsmaschine
      // ist nicht mandantenspezifisch). Nur die Kurzform (id/version/Zustände); Übergänge/Rechtsgrundlagen
      // bleiben server-seitig und kommen später über die Akte.
      const procedures = deps.procedureRegistry.list().map((procedure) => ({
        procedureId: procedure.procedureId,
        version: procedure.version,
        allowedStates: [...procedure.allowedStates],
      }));
      return reply.send({ procedures });
    },
  );

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

  typed.get(
    "/api/cases/:id/audit",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary: "Verlauf/Audit einer Akte lesen (append-only, chronologisch)",
        params: CaseIdParamsSchema,
        querystring: CaseAuditQuerySchema,
        response: { 200: CaseAuditListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // Behörden-Scope zuerst: fehlt der Fall bzw. gehört er einer Fremd-Behörde → 404 (keine Existenz-/Audit-Leaks),
      // BEVOR überhaupt Audit-Einträge gelesen werden.
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found || found.authorityId !== session.authorityId)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
          ...(request.query.limit !== undefined
            ? { limit: request.query.limit }
            : {}),
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({ events: events.map(toAuditDto) });
    },
  );

  typed.get(
    "/api/cases/:id/allowed-actions",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "Erlaubte Aktionen (Übergänge) eines Falls im aktuellen Zustand — abgeleitet aus dem Verfahren",
        params: CaseIdParamsSchema,
        response: { 200: CaseAllowedActionsDtoSchema, ...errorResponses },
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
      // Behörden-Scope: Fremd-Behörde/fehlend → 404 (keine Existenz-Leaks).
      if (!found || found.authorityId !== session.authorityId)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      const appCase = found;

      // Erlaubte Aktionen = die Übergänge des Verfahrens, deren `from` der aktuelle Zustand ist. Zielzustand,
      // Rechtsgrundlage und Vier-Augen-Pflicht stammen AUSSCHLIESSLICH aus dem Verfahren (DATEN) — der Client
      // bekommt nur die `action`-Kennung, die er an POST /transitions senden darf. Unbekanntes Verfahren →
      // leere Liste (fail-safe: der Fall lässt sich nicht bewegen), kein Fehler auf einem Lese-Endpunkt.
      const procedure = deps.procedureRegistry.get(
        appCase.procedureId,
        appCase.procedureVersion,
      );
      const actions = procedure
        ? procedure.allowedTransitions
            .filter((transition) => transition.from === appCase.state)
            .map((transition) => ({
              action: transition.action,
              to: transition.to,
              requiredPermission: transition.requiredPermission,
              requiresFourEyes: transition.requiresFourEyes ?? false,
            }))
        : [];
      return reply.send({
        state: appCase.state,
        version: appCase.version,
        actions,
      });
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
        // Fachliche Nutzlast unverändert durchreichen — der Server interpretiert sie NICHT.
        data: body.data ?? {},
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

  typed.post(
    "/api/cases/:id/transitions",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "Zustandswechsel eines Falls (Übergang aus dem Verfahren, atomar + Vier-Augen)",
        params: CaseIdParamsSchema,
        body: CaseTransitionRequestSchema,
        response: { 200: CaseDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;

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
      const appCase = found;

      // Verfahren (Zustandsmaschine + Rechtsgrundlagen als DATEN) auflösen — fail-closed, wenn unbekannt.
      const procedure = deps.procedureRegistry.get(
        appCase.procedureId,
        appCase.procedureVersion,
      );
      if (!procedure)
        return badRequest(
          reply,
          request,
          `unknown procedure ${appCase.procedureId}@${appCase.procedureVersion}`,
        );
      const legalBasisId = procedure.legalBasisIds[0];
      if (legalBasisId === undefined)
        return badRequest(reply, request, "procedure has no legal basis");

      // Passenden Übergang finden (from=aktueller Zustand & action) — der Zielzustand wird NIE aus dem Body gelesen.
      const transition = procedure.allowedTransitions.find(
        (candidate) =>
          candidate.from === appCase.state && candidate.action === body.action,
      );
      if (!transition)
        return badRequest(
          reply,
          request,
          `invalid case transition: ${appCase.state}/${body.action}`,
        );

      // Vier-Augen (root-cause: zwei verschiedene Personen): wer den letzten BEARBEITUNGSSCHRITT am Fall
      // gemacht hat, darf den requiresFourEyes-Übergang nicht selbst auslösen.
      //
      // WARUM GEFILTERT WIRD: die Vorfassung nahm schlicht das JÜNGSTE Audit-Ereignis („events[length-1]")
      // ohne Rücksicht auf dessen Typ. Damit war die Sperre keine Eigenschaft der ENTSCHEIDUNG, sondern
      // davon, wer zuletzt IRGENDETWAS in den Fall-Strom schrieb — jeder neue Audit-Schreiber hätte sie
      // ausgehebelt: schreibt ein beliebiger anderer Akteur (z. B. ein Bürger, der seinen Bescheid abruft —
      // ein Vorgang, den die Bekanntgabe zwingend auditieren MUSS) nach dem Vorbereiter, rutscht dessen
      // Ereignis aus der letzten Position und er dürfte seine EIGENE Vorbereitung freigeben. Heute fällt das
      // nur nicht auf, weil zufällig ausschliesslich BEARBEITUNGS-Ereignisse in diesen Strom laufen.
      // Die Sperre bezieht sich deshalb explizit auf die Ereignisse, die einen Bearbeitungsschritt am Fall
      // DARSTELLEN — neue Ereignistypen (Abruf, Zustellung, Vermerk) verschieben die Bezugsgröße nicht mehr.
      if (transition.requiresFourEyes) {
        let events: AppAuditEvent[];
        try {
          events = await deps.caseStore.listAuditEvents({
            tenantId: session.tenantId,
            caseId: appCase.caseId,
          });
        } catch {
          return storeUnavailable(request, reply);
        }
        // listAuditEvents ist aufsteigend nach occurredAt sortiert → der letzte Treffer ist der jüngste.
        const bearbeitungsschritte = events.filter((e) =>
          FOUR_EYES_RELEVANT_EVENT_TYPES.has(e.eventType),
        );
        const letzterSchritt =
          bearbeitungsschritte[bearbeitungsschritte.length - 1];
        if (letzterSchritt && letzterSchritt.actorId === session.actorId)
          return reply.code(403).send({
            error: "four-eyes: der auslösende Akteur muss ein anderer sein",
            requestId: requestIdOf(request),
          });
      }

      // Zielzustand über den reinen SDK-Reducer rechnen (Guards + Optimistic-Locking). Konflikt → 409, sonst 400.
      let reduced: DomainCase;
      try {
        reduced = transitionCase(
          toDomainCase(appCase),
          procedure,
          body.action,
          body.expectedVersion,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "case version conflict")
          return reply
            .code(409)
            .send({ error: message, requestId: requestIdOf(request) });
        return badRequest(reply, request, message);
      }

      const auditEvent: AppAuditEvent = {
        auditEventId: `audit.${randomUUID()}`,
        caseId: appCase.caseId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actorId: session.actorId,
        eventType: "case.transitioned",
        purpose: "case-management",
        legalBasisId,
        requestId: requestIdOf(request),
        payload: {
          previousState: appCase.state,
          newState: reduced.state,
          ...(body.detail !== undefined ? { detail: body.detail } : {}),
        },
        occurredAt: new Date().toISOString(),
      };

      let updated: AppCase;
      try {
        updated = await deps.caseStore.patchCaseState({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
          expectedVersion: body.expectedVersion,
          newState: reduced.state,
          // Immer den NEUEN Wert setzen: ein schließender Übergang stempelt `closedAt`, ein nicht-
          // schließender (z. B. Wiederaufnahme) räumt es via `null` wieder ab — sonst bliebe eine
          // veraltete Schließzeit an einem wiederaufgenommenen Fall hängen.
          closedAt: reduced.closedAt ?? null,
          auditEvent,
        });
      } catch (error) {
        if (error instanceof CaseVersionConflictError)
          return reply.code(409).send({
            error: "case version conflict",
            requestId: requestIdOf(request),
          });
        if (error instanceof CaseNotFoundError)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        return storeUnavailable(request, reply);
      }
      return reply.send(toCaseDto(updated));
    },
  );
}
