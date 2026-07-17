// GET/POST /api/buerger/antraege — die BÜRGER-Sicht auf die EIGENEN Anträge.
//
// WARUM EINE EIGENE ROUTEN-FAMILIE statt eines `scope`-Felds auf /api/cases:
// `scopeOf` (route-auth.ts) läse den Scope aus QUERY/BODY mit Default „own", und der Handler leitete ihn
// unabhängig davon nochmal ab. Divergieren die beiden, prüft die Policy „own" und der Handler holt
// Behörden-Daten. Verschärfend: ein nicht im Schema deklariertes `scope` wirft Fastify STILL weg
// (removeAdditional) — der Fallback wäre lautlos. HIER ist der Scope durch die ROUTE impliziert und
// kommt gar nicht mehr von der Leitung: der Vektor existiert nicht, statt bewacht zu werden.
//
// EIGENTÜMERSCHAFT KOMMT AUSSCHLIESSLICH AUS DER SITZUNG (`session.actorId`), NIE aus Query/Body —
// Präzedenz mailbox.ts. Der Store filtert im PRÄDIKAT (`scope: "owner"`), nicht der Handler in einer
// Nachprüfung: ein fremder Antrag kommt gar nicht erst zurück → 404, kein 403-Existenz-Orakel.
//
// Der Server INTERPRETIERT `data` NICHT (Antragsdaten/Berechnung sind für ihn opak — die fachliche
// Config liegt ausserhalb seines rootDir). Er stempelt Kennung/Version/Zeit/Eigentümer und auditiert.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AntragDtoSchema,
  AntragEinreichenRequestSchema,
  AntragIdParamsSchema,
  AntragListDtoSchema,
  ErrorEnvelopeSchema,
  VerwaltungsaktDtoSchema,
  type AntragDto,
  type VerwaltungsaktDto,
} from "@senticor/app-bff-contracts";
import type { AppAuditEvent, AppCase } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  createFachlicheAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { canonicalSha256 } from "../canonical-hash.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

/** Die eingefrorene VA-Form, wie sie in der Audit-payload liegt. */
interface GefrorenerVa {
  content: Record<string, unknown>;
  checksumSha256: string;
}

/** Sucht den zuletzt eingefrorenen Verwaltungsakt in den Audit-Ereignissen (payload.verwaltungsakt am
 *  festsetzenden case.transitioned). `undefined`, wenn noch kein Bescheid erlassen wurde. */
function findVerwaltungsakt(events: AppAuditEvent[]): GefrorenerVa | undefined {
  // listAuditEvents ist aufsteigend — den JÜNGSTEN VA nehmen (ein späterer Änderungsbescheid überschreibt
  // die Sicht, ohne den älteren im append-only Audit zu löschen).
  for (let i = events.length - 1; i >= 0; i--) {
    const va = events[i]?.payload["verwaltungsakt"] as
      Partial<GefrorenerVa> | undefined;
    if (
      va &&
      typeof va.checksumSha256 === "string" &&
      va.content &&
      typeof va.content === "object"
    ) {
      return { content: va.content, checksumSha256: va.checksumSha256 };
    }
  }
  return undefined;
}

/** Die gefrorene VA-payload → das vollständige DTO (content-Felder + der separate Hash). */
function toVerwaltungsaktDto(va: GefrorenerVa): VerwaltungsaktDto {
  return {
    ...(va.content as Omit<VerwaltungsaktDto, "checksumSha256">),
    checksumSha256: va.checksumSha256,
  };
}

/** AppCase → AntragDto: die BÜRGER-Projektion. Interne Zuordnung (subjectIds) und Server-Topologie
 *  (tenant/authority/jurisdiction) bleiben bewusst draussen — sie gehen den Antragsteller nichts an. */
function toAntragDto(c: AppCase): AntragDto {
  return {
    antragId: c.caseId,
    procedureId: c.procedureId,
    procedureVersion: c.procedureVersion,
    state: c.state,
    version: c.version,
    eingereichtAm: c.openedAt,
    abgeschlossenAm: c.closedAt,
    data: c.data,
  };
}

export function registerBuergerRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  // NICHT `rbac-scoped`: es gibt hier keine Scope-WAHL zu treffen — die Route IST der Scope.
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseOwnRead.permission },
    deps,
  );
  const submitAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseOwnSubmit.permission },
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
    "/api/buerger/antraege",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Die eigenen Anträge lesen",
        response: { 200: AntragListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let cases: AppCase[];
      try {
        cases = await deps.caseStore.listCases({
          tenantId: session.tenantId,
          // Der Eigentümer kommt aus der SITZUNG — es gibt keinen Weg, ihn von aussen zu setzen.
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({ antraege: cases.map(toAntragDto) });
    },
  );

  typed.get(
    "/api/buerger/antraege/:id",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Einen eigenen Antrag lesen",
        params: AntragIdParamsSchema,
        response: { 200: AntragDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      // Ein FREMDER Antrag kommt aus dem Prädikat gar nicht erst zurück — 404 ist die einzig
      // mögliche Antwort. Kein 403, das die Existenz fremder Vorgänge verriete.
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      return reply.send(toAntragDto(found));
    },
  );

  typed.get(
    "/api/buerger/antraege/:id/bescheid",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Den eigenen (eingefrorenen) Bescheid abrufen — Bekanntgabe",
        params: AntragIdParamsSchema,
        // Response VOLLSTÄNDIG deklariert — sonst wirft Fastifys removeAdditional den checksumSha256
        // STILL weg und der Beweiswert ginge lautlos verloren.
        response: { 200: VerwaltungsaktDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // Owner-Scope aus der SITZUNG — fremder/nicht vorhandener Fall ⇒ 404, nie 403 (kein Existenz-Orakel).
      let found: AppCase | undefined;
      try {
        found = await deps.caseStore.getCase({
          tenantId: session.tenantId,
          caseId: request.params.id,
          scope: "owner",
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });

      // Den EINGEFRORENEN VA aus dem append-only Audit holen (KEIN Live-Render-Fallback: fehlt er,
      // ist der Fall noch nicht festgesetzt ⇒ 404).
      let events: AppAuditEvent[];
      try {
        events = await deps.caseStore.listAuditEvents({
          tenantId: session.tenantId,
          caseId: found.caseId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const va = findVerwaltungsakt(events);
      if (!va)
        return reply
          .code(404)
          .send({ error: "kein Bescheid", requestId: requestIdOf(request) });

      // DEFENSE-IN-DEPTH: den Hash über die gelieferten Bytes NACHRECHNEN. Weicht er ab, wurde die
      // Audit-Zeile trotz Trigger manipuliert — dann NICHT ausliefern (500), nie einen unbewiesenen
      // Bescheid herausgeben.
      if (canonicalSha256(va.content) !== va.checksumSha256)
        return reply.code(500).send({
          error: "bescheid integrity check failed",
          requestId: requestIdOf(request),
        });

      // BEKANNTGABE als eigenes, auditiertes Ereignis (Fristlauf-Anker). EIGENER eventType
      // `case.disclosed` — bewusst NICHT in FOUR_EYES_RELEVANT_EVENT_TYPES: ein Bürger-Abruf ist eine
      // BEOBACHTUNG, kein Bearbeitungsschritt; er darf die Vier-Augen-Bezugsgröße nicht verschieben.
      const bekanntgabe = createFachlicheAuditEvent({
        eventType: "case.disclosed",
        actorId: session.actorId,
        actingAuthorityId: found.authorityId,
        purpose: "bekanntgabe",
        legalBasisId: String(va.content["fiktionNorm"] ?? "§ 41 Abs. 2 VwVfG"),
        caseId: found.caseId,
        requestId: requestIdOf(request),
        summary: `Bescheid ${found.caseId} durch die/den Eigentümer:in abgerufen (Bekanntgabe)`,
      });
      try {
        await deps.caseStore.appendAuditEvent({
          auditEventId: bekanntgabe.auditEventId,
          caseId: found.caseId,
          tenantId: session.tenantId,
          authorityId: found.authorityId,
          jurisdictionId: found.jurisdictionId,
          actorId: session.actorId,
          eventType: bekanntgabe.eventType,
          purpose: bekanntgabe.purpose,
          legalBasisId: bekanntgabe.legalBasisId,
          requestId: bekanntgabe.requestId,
          payload: { summary: bekanntgabe.summary },
          occurredAt: bekanntgabe.occurredAt,
        });
      } catch {
        return storeUnavailable(request, reply);
      }

      // inline: die SPA rendert den Bescheid (BescheidView) und bietet window.print() an.
      void reply.header("content-disposition", "inline");
      return reply.send(toVerwaltungsaktDto(va));
    },
  );

  typed.post(
    "/api/buerger/antraege",
    {
      config: submitAuth.config,
      preHandler: submitAuth.preHandler,
      schema: {
        tags: ["buerger"],
        summary: "Einen eigenen Antrag einreichen",
        body: AntragEinreichenRequestSchema,
        response: { 201: AntragDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;
      // Das Verfahren muss REGISTRIERT sein (Verfahren = DATEN) und liefert Initialzustand +
      // Rechtsgrundlage — beides wird NIE aus dem Body übernommen und nie erfunden.
      const procedure = deps.procedureRegistry.get(
        body.procedureId,
        body.procedureVersion,
      );
      if (!procedure)
        return reply.code(400).send({
          error: `unknown procedure ${body.procedureId}@${body.procedureVersion}`,
          requestId: requestIdOf(request),
        });
      const initialState = procedure.allowedStates[0];
      const legalBasisId = procedure.legalBasisIds[0];
      if (initialState === undefined || legalBasisId === undefined)
        return reply.code(400).send({
          error: "procedure has no initial state or legal basis",
          requestId: requestIdOf(request),
        });

      const now = new Date().toISOString();
      const created: AppCase = {
        caseId: `case.${randomUUID()}`,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        procedureId: procedure.procedureId,
        procedureVersion: procedure.version,
        state: initialState,
        version: 1,
        subjectIds: [],
        openedAt: now,
        closedAt: null,
        data: body.data,
        // DER KERN: der Eigentümer ist die anfragende Sitzung — nicht verhandelbar, nicht überschreibbar.
        ownerActorId: session.actorId,
      };
      try {
        await deps.caseStore.insertCase(created);
        // EIGENER EREIGNISTYP, nicht `case.opened`: Letzteres steht in
        // FOUR_EYES_RELEVANT_EVENT_TYPES (cases.ts) und bedeutet „ein Bearbeitungsschritt am Fall durch
        // eine bedienstete Person". Die Einreichung durch die Bürgerin ist der AUSLÖSER des Verfahrens,
        // keine Bearbeitung — sie darf die Vier-Augen-Bezugsgröße nicht verschieben. Genau die
        // Unterscheidung, die die Menge dort als Entscheidungsregel festhält.
        const audit = createFachlicheAuditEvent({
          eventType: "case.submitted",
          actorId: session.actorId,
          actingAuthorityId: session.authorityId,
          purpose: "case-management",
          legalBasisId,
          caseId: created.caseId,
          requestId: requestIdOf(request),
          newState: created.state,
          summary: `Antrag ${created.caseId} eingereicht (${created.procedureId})`,
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
      return reply.code(201).send(toAntragDto(created));
    },
  );
}
