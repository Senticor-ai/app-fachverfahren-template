// GET/POST /api/cases — Fall/Dossier-Verwaltung (ADR-0001). Lesen erfordert `case.read`, Anlegen
// `case.decision.prepare`. Mandant/Behörde/Jurisdiktion + Akteur kommen AUSSCHLIESSLICH aus der Sitzung. Der
// Server generiert caseId/version=1/openedAt; der Initialzustand + die Rechtsgrundlage werden gegen die
// `ProcedureRegistry` (Verfahren als DATEN) validiert — eine Rechtsgrundlage wird NIE erfunden.
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  CaseAllowedActionsDtoSchema,
  CaseApprovalRequestSchema,
  CaseApprovalResultDtoSchema,
  CaseAuditListDtoSchema,
  CaseAuditQuerySchema,
  CaseCreateRequestSchema,
  CaseErasureRequestSchema,
  CaseErasureResultDtoSchema,
  RechtsbehelfEntscheidungRequestSchema,
  RechtsbehelfEntscheidungDtoSchema,
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
  redactData,
  verifyAuditChain,
  type AppAuditEvent,
  type AppCase,
} from "@senticor/app-store-postgres";
import {
  berechneTarif,
  builtInPermissions,
  createFachlicheAuditEvent,
  requiredApprovalsOf,
  transitionCase,
  type Case as DomainCase,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { canonicalSha256 } from "../canonical-hash.js";
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

// N-AUGEN (Issue #56): eine explizite Freigabe eines Akteurs für EINEN bestimmten Übergang. BEWUSST KEIN
// FOUR_EYES_RELEVANT-Typ — eine Freigabe ist kein Bearbeitungsschritt und darf die „letzter Bearbeiter"-
// Bezugsgröße der 2-Augen-Separation NICHT verschieben.
const CASE_APPROVAL_EVENT_TYPE = "case.approval.recorded";

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
    prevHash: e.prevHash ?? null,
    ...(e.entryHash !== undefined ? { entryHash: e.entryHash } : {}),
  };
}

/** Liest einen Punkt-Pfad (z. B. "anliegen.kategorie") aus den (opaken) Falldaten. Defensiv: fehlt ein Glied,
 *  → undefined. NUR für den DEKLARIERTEN Sollstellungs-Diskriminator (eine Kategorie-WAHL, kein Betrag). */
function leseDatenPfad(data: Record<string, unknown>, pfad: string): unknown {
  return pfad
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      data,
    );
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
  // DSGVO-Löschung braucht eine EIGENE, eng gefasste Permission (nie auf `case.decision.prepare` mitreiten).
  const erasureAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.casePiiErase.permission },
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
          // BEHÖRDEN-Sicht: diese Route ist die Sachbearbeitungs-Sicht (case.read). Der Bürger-Pfad
          // („meine Anträge") bekommt eine EIGENE Routen-Familie mit scope "owner" — bewusst NICHT
          // ein scope-Feld auf DIESER Route: `scopeOf` läse es aus Query/Body (Default "own"), und
          // ein nicht im Schema deklariertes `scope` würde von Fastify STILL weggeworfen.
          scope: "authority",
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
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Der Behörden-Scope steckt im Store-PRÄDIKAT (getCase scope:"authority") — ein Fall einer
      // Fremd-Behörde kommt gar nicht erst zurück. Die frühere Nachprüfung hier war eine an fünf
      // Stellen duplizierte Handarbeit, die kein Gate deckte. 404 statt 403: kein Existenz-Orakel.
      if (!found)
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
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Scope steckt im Store-Prädikat (s. o.) — hier reicht „nicht gefunden".
      if (!found)
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
      // HASH-KETTE (Issue #53): der Server verifiziert die Verkettung des GESAMTEN Streams und liefert den
      // Report mit. Bewusst über den ungekürzten Stream (nicht die evtl. limitierte Sicht), damit ein
      // gekürztes `limit` nicht fälschlich als Bruch erscheint.
      let full: AppAuditEvent[] = events;
      if (request.query.limit !== undefined) {
        try {
          full = await deps.caseStore.listAuditEvents({
            tenantId: session.tenantId,
            caseId: found.caseId,
          });
        } catch {
          return storeUnavailable(request, reply);
        }
      }
      const chain = verifyAuditChain(full);
      return reply.send({
        events: events.map(toAuditDto),
        chain: {
          ok: chain.ok,
          ...(chain.brokenAt !== undefined ? { brokenAt: chain.brokenAt } : {}),
          ...(chain.reason !== undefined ? { reason: chain.reason } : {}),
        },
      });
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
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Scope steckt im Store-Prädikat (s. o.) — hier reicht „nicht gefunden".
      if (!found)
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
              // Konsistent zur Erzwingung (s. u.): true, sobald der Server die 2-Augen-Separation verlangt —
              // auch für einen reinen `requiredApprovals >= 2`-Übergang ohne gesetztes `requiresFourEyes`.
              requiresFourEyes: requiredApprovalsOf(transition) >= 2,
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
        // Diese Route ist die BEHÖRDEN-Anlage (case.decision.prepare): der entstehende Fall hat keinen
        // Bürger-Eigentümer. Der Bürger-Antrag bekommt eine eigene Route, die `ownerActorId` aus der
        // SESSION stempelt — niemals aus dem Body (sonst liesse sich fremde Zuordnung erschleichen).
        ownerActorId: null,
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

  // N-AUGEN Freigabe-Sammlung (Issue #56): ein Akteur erfasst seine Freigabe für EINEN Übergang. Erst wenn
  // genug DISTINKTE Freigebende gesammelt sind, lässt POST /transitions den `requiredApprovals`-Übergang zu.
  typed.post(
    "/api/cases/:id/approvals",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "N-Augen: eine Freigabe für einen Übergang erfassen (Freigabe-Sammlung)",
        params: CaseIdParamsSchema,
        body: CaseApprovalRequestSchema,
        response: { 200: CaseApprovalResultDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;
      let appCase: AppCase | undefined;
      try {
        appCase = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!appCase)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      // Die Freigabe bindet an den aktuellen Zustand (Optimistic-Locking) — sonst freigäbe man „ins Leere",
      // nachdem der Fall schon weitergezogen ist.
      if (appCase.version !== body.expectedVersion)
        return reply.code(409).send({
          error: "case version conflict",
          requestId: requestIdOf(request),
        });
      const procedure = deps.procedureRegistry.get(
        appCase.procedureId,
        appCase.procedureVersion,
      );
      if (!procedure) return badRequest(reply, request, "unknown procedure");
      const transition = procedure.allowedTransitions.find(
        (candidate) =>
          candidate.from === appCase!.state && candidate.action === body.action,
      );
      if (!transition)
        return badRequest(
          reply,
          request,
          `invalid case transition: ${appCase.state}/${body.action}`,
        );
      // Ein Übergang OHNE Freigabe-Pflicht braucht keine Freigabe-Sammlung (fail-closed gegen sinnlose Zellen).
      if (requiredApprovalsOf(transition) < 2)
        return badRequest(reply, request, "action requires no approval");
      const legalBasisId = procedure.legalBasisIds[0];
      if (legalBasisId === undefined)
        return badRequest(reply, request, "procedure has no legal basis");

      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const relevant = events.filter((e) =>
        FOUR_EYES_RELEVANT_EVENT_TYPES.has(e.eventType),
      );
      const letzterSchritt = relevant[relevant.length - 1];
      const dwellStartIdx = letzterSchritt
        ? events.indexOf(letzterSchritt)
        : -1;
      const approvalsInDwell = events
        .slice(dwellStartIdx + 1)
        .filter(
          (e) =>
            e.eventType === CASE_APPROVAL_EVENT_TYPE &&
            e.payload["action"] === body.action,
        );
      const alreadyApproved = approvalsInDwell.some(
        (a) => a.actorId === session.actorId,
      );

      if (!alreadyApproved) {
        const audit = createFachlicheAuditEvent({
          eventType: CASE_APPROVAL_EVENT_TYPE,
          actorId: session.actorId,
          actingAuthorityId: session.authorityId,
          purpose: "case-management",
          legalBasisId,
          caseId: appCase.caseId,
          requestId: requestIdOf(request),
          summary: `Freigabe für '${body.action}'`,
        });
        try {
          await deps.caseStore.appendAuditEvent({
            auditEventId: audit.auditEventId,
            caseId: appCase.caseId,
            tenantId: session.tenantId,
            authorityId: session.authorityId,
            jurisdictionId: session.jurisdictionId,
            actorId: session.actorId,
            eventType: CASE_APPROVAL_EVENT_TYPE,
            purpose: audit.purpose,
            legalBasisId: audit.legalBasisId,
            requestId: audit.requestId,
            payload: { action: body.action, summary: audit.summary },
            occurredAt: audit.occurredAt,
          });
        } catch {
          return storeUnavailable(request, reply);
        }
      }

      // Fortschritt: distinkte Träger dieser Entscheidung im aktuellen Dwell = letzter Bearbeiter + Freigebende
      // (inkl. der gerade erfassten). Der AUSLÖSER zählt zusätzlich erst beim tatsächlichen Übergang.
      const distinct = new Set<string>();
      if (letzterSchritt) distinct.add(letzterSchritt.actorId);
      for (const a of approvalsInDwell) distinct.add(a.actorId);
      if (!alreadyApproved) distinct.add(session.actorId);
      const needed = requiredApprovalsOf(transition);
      return reply.send({
        action: body.action,
        recorded: !alreadyApproved,
        distinctApprovers: distinct.size,
        requiredApprovals: needed,
        satisfied: distinct.size >= needed,
      });
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
        // 422 = data-driven Guard über case.data nicht erfüllt (nur diese Route kennt Guards).
        response: {
          200: CaseDtoSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
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
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Der Behörden-Scope steckt im Store-PRÄDIKAT (getCase scope:"authority") — ein Fall einer
      // Fremd-Behörde kommt gar nicht erst zurück. Die frühere Nachprüfung hier war eine an fünf
      // Stellen duplizierte Handarbeit, die kein Gate deckte. 404 statt 403: kein Existenz-Orakel.
      if (!found)
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
      //
      // N-AUGEN (Untergrenze): der Trigger liest die effektive Freigabe-Zahl (`requiredApprovalsOf`), damit ein
      // Übergang mit `requiredApprovals >= 2` (die Verallgemeinerung, engine-neutral aus dem BPMN abgeleitet)
      // NICHT ungeschützt bleibt. Erzwungen wird hier die 2-Augen-SEPARATION (auslösender ≠ letzter Bearbeiter)
      // — die Untergrenze jeder Freigabe. Die volle Zählung N DISTINKTER Freigebender (N>2) ist ein bewusster
      // Folge-Ausbau (Freigabe-Sammlung); bis dahin gilt: kein Scheinschutz (mind. 2 Augen), aber auch noch
      // nicht die volle konfigurierte Tiefe. `requiresFourEyes` bleibt exakt äquivalent (requiredApprovalsOf=2).
      if (requiredApprovalsOf(transition) >= 2) {
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

        // N-AUGEN (Issue #56): über die 2-Augen-Separation hinaus zählt der Server bei `requiredApprovals > 2`
        // die DISTINKTEN Akteure, die DIESE Entscheidung getragen haben: der letzte Bearbeiter (der in den
        // aktuellen Zustand geführt hat) + alle expliziten Freigaben IM AKTUELLEN Zustands-Dwell für genau
        // diese Action + der auslösende Akteur. Freigaben werden über POST /api/cases/:id/approvals gesammelt.
        const needed = requiredApprovalsOf(transition);
        if (needed > 2) {
          const dwellStartIdx = letzterSchritt
            ? events.indexOf(letzterSchritt)
            : -1;
          const distinct = new Set<string>();
          if (letzterSchritt) distinct.add(letzterSchritt.actorId);
          for (const e of events.slice(dwellStartIdx + 1)) {
            if (
              e.eventType === CASE_APPROVAL_EVENT_TYPE &&
              e.payload["action"] === body.action
            ) {
              distinct.add(e.actorId);
            }
          }
          distinct.add(session.actorId);
          if (distinct.size < needed)
            return reply.code(403).send({
              error: `n-augen: benötigt ${needed} distinkte Freigebende, ${distinct.size} vorhanden`,
              requestId: requestIdOf(request),
            });
        }
      }

      // Zielzustand über den reinen SDK-Reducer rechnen (Zustands-/Data-Guard + Optimistic-Locking). Der
      // data-driven Guard wird gegen `appCase.data` ausgewertet (server-autoritativ über die deklarierte
      // Datenlage). Konflikt → 409, Guard nicht erfüllt → 422, unzulässiger Übergang → 400.
      let reduced: DomainCase;
      try {
        reduced = transitionCase(
          toDomainCase(appCase),
          procedure,
          body.action,
          body.expectedVersion,
          appCase.data,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "case version conflict")
          return reply
            .code(409)
            .send({ error: message, requestId: requestIdOf(request) });
        if (message === "guard not satisfied")
          return reply
            .code(422)
            .send({ error: message, requestId: requestIdOf(request) });
        return badRequest(reply, request, message);
      }

      // VERWALTUNGSAKT EINFRIEREN: erlässt dieser Übergang einen förmlichen Bescheid, friert der Server
      // hier den bestandskräftigen VA ein und legt ihn in die payload des OHNEHIN atomar geschriebenen
      // Audit-Ereignisses (append-only-Trigger trägt die Unveränderlichkeit — app_cases ist NICHT
      // append-only). Der Tenor kommt aus der bereits gespeicherten, client-gerechneten `case.data.berechnung`
      // (server-opak) — NICHT aus dem Request-Body (keine zweite Tenor-Wahrheit; Vier-Augen prüfte den
      // Zustand, nicht einen Body-Inhalt). Rechtsbehelf/Fiktion aus dem Verfahren, issuedAt/issuedBy
      // server-autoritativ. Der `eventType` bleibt `case.transitioned` (Festsetzen IST ein Bearbeitungs-
      // schritt, four-eyes-relevant, korrekt); der VA reitet in dessen payload. Der Hash über die
      // KANONISCHEN Bytes ist das portable Beweis-Token (der Bürger re-hasht die gelieferten Bytes).
      const now = new Date().toISOString();
      let verwaltungsaktPayload: Record<string, unknown> | undefined;
      // Per-Übergang-Regime (z. B. Widerspruchsbescheid = Klage, ADR-0006 §3) hat Vorrang vor dem
      // Verfahrens-Regime; fehlt es, gilt weiter ProcedureVersion.verwaltungsakt (rückwärtskompatibel).
      const vaConfig = transition.verwaltungsakt ?? procedure.verwaltungsakt;
      if (transition.issuesVerwaltungsakt && vaConfig) {
        const content = {
          aktenzeichen: appCase.caseId,
          issuedAt: now,
          issuedBy: session.actorId,
          tenor: appCase.data["berechnung"] ?? null,
          rechtsbehelf: vaConfig.rechtsbehelf,
          fiktionTage: vaConfig.fiktionTage,
          fiktionNorm: vaConfig.fiktionNorm,
          // HERKUNFT DES TENORS — ehrlich statt falscher Sicherheit: der Betrag wurde CLIENT-seitig
          // gerechnet (der `berechne`-Escape-Hatch ist Client-TS, server-seitig nicht ausführbar) und vom
          // Server NICHT nachgerechnet. Er wird gefroren + gehasht (unveränderlich + beweisbar-unverändert),
          // aber NICHT server-verifiziert. Ein data-driven `tarif` wäre server-nachrechenbar → dann
          // „server-nachgerechnet" (deeperer Root Cause: Berechnung/Tarif-Move ins SDK, separate Scheibe).
          tenorHerkunft: "client-berechnet" as const,
        };
        verwaltungsaktPayload = {
          content,
          checksumSha256: canonicalSha256(content),
        };
      }

      // SOLLSTELLUNG (Rückforderung, ADR-0007): die Höhe ist SERVER-AUTORITATIV — sie kommt aus dem
      // hinterlegten Tarif + der client-GEWÄHLTEN Kategorie (Diskriminator), NIE als client-gelieferter
      // Betrag. Sie reitet ATOMAR in der Übergangs-payload (dasselbe Muster wie der eingefrorene VA); die
      // Read-Brücke (forderungsstandAusAudit) liest sie als forderung.gestellt.
      let forderungPayload: Record<string, unknown> | undefined;
      if (transition.stelltForderung) {
        const cfg = transition.stelltForderung;
        const kategorie = String(
          leseDatenPfad(appCase.data, cfg.diskriminator) ?? "",
        );
        const tarif = berechneTarif(cfg.tarif, kategorie);
        const faelligIso = new Date(
          Date.parse(now) + (cfg.zahlungsfristTage ?? 30) * 86_400_000,
        ).toISOString();
        forderungPayload = {
          art: "forderung.gestellt",
          betragCent: tarif.betragCent,
          faelligIso,
          kategorie,
          tarifBekannt: tarif.bekannt,
        };
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
          ...(verwaltungsaktPayload
            ? { verwaltungsakt: verwaltungsaktPayload }
            : {}),
          ...(forderungPayload ? { forderung: forderungPayload } : {}),
        },
        occurredAt: now,
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

  // POST /api/cases/:id/loeschung — DSGVO-LÖSCHUNG (Art. 17 / §84 SGB X, Issue #55). Redigiert die benannten
  // personenbezogenen Pfade in `case.data` (referenzielle Redaction → Tombstone, reine Funktion `redactData`)
  // und schreibt die Löschung ATOMAR als append-only Ereignis (`case.data.redacted`) — ohne die gelöschten
  // Werte zu wiederholen. Behörden-scoped (getCase scope:"authority"), eigene Permission `case.pii.erase`.
  //
  // BEWUSST NUR `case.data`: der eingefrorene Bescheid-VA lebt in der Audit-payload (append-only, unveränderlich)
  // und ist damit strukturell ausgenommen (Bestandskraft, Art. 17 Abs. 3) — eine Löschung der lebenden Daten
  // berührt ihn nie. Die `legalBasisId` gibt die MENSCHLICHE Sachbearbeitung an (nie erfunden). LEGAL-HOLD /
  // Retention (Löschung während gesetzlicher Aufbewahrungsfristen blockieren) ist ein bewusst getrennter,
  // spec-gated Folge-Guard — er braucht die jurisdiktions-spezifische Fristen-Matrix.
  typed.post(
    "/api/cases/:id/loeschung",
    {
      config: erasureAuth.config,
      preHandler: erasureAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "Personenbezogene Falldaten löschen (DSGVO Art. 17 / §84 SGB X, referenzielle Redaction + append-only Audit)",
        params: CaseIdParamsSchema,
        body: CaseErasureRequestSchema,
        response: {
          200: CaseErasureResultDtoSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
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
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      const appCase = found;

      // Reine Lösch-Ableitung: Tombstones je vorhandenem PII-Pfad. Fehlende/bereits getombstonete zählen nicht.
      const now = new Date().toISOString();
      const { data: redigiert, redacted } = redactData(
        appCase.data,
        body.piiPaths,
        now,
      );
      // Nichts zu löschen (Pfade fehlen oder schon getombstonet) → 422 statt eines leeren Version-Bumps.
      // Idempotenz: ein zweiter Aufruf derselben Löschung trifft leere `redacted` → 422 (nichts mehr offen).
      if (redacted.length === 0)
        return reply.code(422).send({
          error: "nichts zu löschen: keine der angegebenen PII-Pfade vorhanden",
          requestId: requestIdOf(request),
        });

      const auditEvent: AppAuditEvent = {
        auditEventId: `audit.${randomUUID()}`,
        caseId: appCase.caseId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actorId: session.actorId,
        eventType: "case.data.redacted",
        purpose: "dsgvo-loeschung",
        // Die Rechtsgrundlage kommt vom Menschen (nie erfunden); die Pfade werden protokolliert, NIE die Werte.
        legalBasisId: body.legalBasisId,
        requestId: requestIdOf(request),
        payload: {
          redactedPaths: redacted,
          ...(body.begruendung !== undefined
            ? { begruendung: body.begruendung }
            : {}),
        },
        occurredAt: now,
      };

      let updated: AppCase;
      try {
        updated = await deps.caseStore.patchCaseData({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
          expectedVersion: body.expectedVersion,
          newData: redigiert,
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
      return reply.send({ case: toCaseDto(updated), redactedPaths: redacted });
    },
  );

  // POST /api/cases/:id/rechtsbehelf/entscheidung — die behördenseitige ENTSCHEIDUNG über einen eingelegten
  // Rechtsbehelf (Issue #61, Abhilfe/Nichtabhilfe). Als AUDITIERTE Entscheidung (`case.objection.decided`),
  // symmetrisch zur Einlegung (`case.objection` ist ebenfalls ein append-only Ereignis, KEIN Zustandsübergang —
  // nicht jedes Verfahren hat einen Widerspruchs-Zustand). REGIME-NEUTRAL (der Ausgang gilt für
  // Widerspruch/Einspruch gleichermaßen). Die eigentliche VA-Rechtsfolge (Abhilfebescheid/Widerspruchsbescheid,
  // § 72 VwGO) läuft über die bestehende Übergangs-/VA-Maschinerie — hier wird der Ausgang dokumentiert.
  typed.post(
    "/api/cases/:id/rechtsbehelf/entscheidung",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["cases"],
        summary:
          "Über einen eingelegten Rechtsbehelf entscheiden (Abhilfe/Teilabhilfe/Nichtabhilfe/Verworfen, auditiert)",
        params: CaseIdParamsSchema,
        body: RechtsbehelfEntscheidungRequestSchema,
        response: {
          200: RechtsbehelfEntscheidungDtoSchema,
          ...errorResponses,
        },
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
          scope: "authority",
          authorityId: session.authorityId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      const appCase = found;

      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: appCase.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Ohne eingelegten Rechtsbehelf gibt es nichts zu entscheiden ⇒ 404 (kein Existenz-Orakel).
      const objection = events.find((e) => e.eventType === "case.objection");
      if (!objection)
        return reply.code(404).send({
          error: "kein Rechtsbehelf eingelegt",
          requestId: requestIdOf(request),
        });
      // Einmaligkeit: ein bereits entschiedener Rechtsbehelf ⇒ 409 (append-only, kein Doppel-Eintrag).
      if (events.some((e) => e.eventType === "case.objection.decided"))
        return reply.code(409).send({
          error: "Rechtsbehelf bereits entschieden",
          requestId: requestIdOf(request),
        });

      // Rechtsgrundlage = die des eingelegten Rechtsbehelfs (das eingefrorene, regime-neutrale Norm-Regime) —
      // nicht erfunden. Der Ausgang kommt aus dem Body (die fachliche Entscheidung der Behörde), die Identität
      // + Zeit server-autoritativ.
      const now = new Date().toISOString();
      const auditEvent: AppAuditEvent = {
        auditEventId: `audit.${randomUUID()}`,
        caseId: appCase.caseId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actorId: session.actorId,
        eventType: "case.objection.decided",
        purpose: "rechtsbehelf-entscheidung",
        legalBasisId: objection.legalBasisId,
        requestId: requestIdOf(request),
        payload: {
          ausgang: body.ausgang,
          begruendung: body.begruendung,
          // Beweiskette: die Entscheidung referenziert die Einlegung, auf die sie sich bezieht.
          objectionAuditEventId: objection.auditEventId,
        },
        occurredAt: now,
      };
      try {
        await deps.caseStore.appendAuditEvent(auditEvent);
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({
        aktenzeichen: appCase.caseId,
        ausgang: body.ausgang,
        entschiedenAm: now,
      });
    },
  );
}
