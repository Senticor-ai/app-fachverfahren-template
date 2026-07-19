// VERFAHRENS-WIKI-Routen — das generelle, KI-gestützte Wissen EINES Fachverfahrens (verfahrens-scoped,
// append-only, behörden-scoped). Die durable Wiki-Ebene der Brücke Mensch↔KI-Agent↔Composable: Mensch UND
// Agent hinterlassen Wissen/Fähigkeiten/Reflexionen mit strukturierten, agenten-konsumierbaren Metadaten.
// Kontext (tenant/authority/actor) kommt AUSSCHLIESSLICH aus der Sitzung. Dieselben Guardrails wie der Fall-
// Blackboard: der KI-Agent liest die bisherigen Einträge (injektions-neutralisiert) als Kontext.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ErrorEnvelopeSchema,
  KiWissenRequestSchema,
  VerfahrenWissenParamsSchema,
  WissenEintragRequestSchema,
  WissenVerfahrenExportDtoSchema,
  WissenViewDtoSchema,
  WissenViewListDtoSchema,
  type WissenExportEintragDto,
  type WissenViewDto,
} from "@senticor/app-bff-contracts";
import type { VerfahrensWissenEintrag } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  neutralisiereInjektion,
  scanInjection,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

const KINDS = new Set<WissenViewDto["kind"]>([
  "hypothese",
  "teilergebnis",
  "frage",
  "befund",
  "entscheidung",
  "reflexion",
  "metadatum",
  "evidenz",
  "wissen",
  "faehigkeit",
  "notiz",
]);
function asKind(v: string): WissenViewDto["kind"] {
  return KINDS.has(v as WissenViewDto["kind"])
    ? (v as WissenViewDto["kind"])
    : "notiz";
}

/** Store-Eintrag → Ansicht (quelle aus dem urheber-Peer abgeleitet; Injektions-Verdacht compute-on-read). */
function toWissenView(e: VerfahrensWissenEintrag): WissenViewDto {
  return {
    eintragId: e.eintragId,
    procedureId: e.procedureId,
    procedureVersion: e.procedureVersion,
    kind: asKind(e.art),
    quelle: e.urheber.startsWith("human:") ? "mensch" : "ki",
    urheber: e.urheber,
    text: e.text,
    metadaten: e.metadaten,
    verdacht: scanInjection(e.text).suspicious,
    erstelltAm: e.occurredAt,
  };
}

/** Store-Eintrag → Export-Form (Text injektions-NEUTRALISIERT für die Agent-Weiterverarbeitung). */
function toExportEintrag(e: VerfahrensWissenEintrag): WissenExportEintragDto {
  return {
    eintragId: e.eintragId,
    kind: asKind(e.art),
    quelle: e.urheber.startsWith("human:") ? "mensch" : "ki",
    urheber: e.urheber,
    text: neutralisiereInjektion(e.text),
    metadaten: e.metadaten,
    erstelltAm: e.occurredAt,
  };
}

export function registerVerfahrenWissenRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseRead.permission },
    deps,
  );
  const writeAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseNoteWrite.permission },
    deps,
  );
  const errorResponses = {
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
  };

  async function append(
    session: ReturnType<typeof sessionOf>,
    procedureId: string,
    procedureVersion: string,
    art: string,
    urheber: string,
    text: string,
    metadaten: Record<string, unknown>,
  ): Promise<VerfahrensWissenEintrag> {
    return deps.wissenStore.appendEintrag({
      eintragId: `wissen.${randomUUID()}`,
      procedureId,
      procedureVersion,
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      jurisdictionId: session.jurisdictionId,
      actorId: session.actorId,
      art,
      urheber,
      text,
      metadaten,
      occurredAt: new Date().toISOString(),
    });
  }

  // ── Wissens-Eintrag schreiben (Mensch) ─────────────────────────────────────────────────────────
  typed.post(
    "/api/verfahren/:procedureId/:version/wissen",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Verfahrens-Wissen schreiben (Mensch) — append-only",
        params: VerfahrenWissenParamsSchema,
        body: WissenEintragRequestSchema,
        response: { 201: WissenViewDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintrag: VerfahrensWissenEintrag;
      try {
        eintrag = await append(
          session,
          request.params.procedureId,
          request.params.version,
          request.body.kind ?? "wissen",
          `human:${session.rbacRoles[0] ?? "mitarbeitend"}`,
          request.body.text,
          request.body.metadaten ?? {},
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send(toWissenView(eintrag));
    },
  );

  // ── KI-Wissens-Eintrag (via AiAssistPort, mit Wiki-Kontext) ────────────────────────────────────
  typed.post(
    "/api/verfahren/:procedureId/:version/wissen/ki",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "KI-Verfahrens-Wissen erzeugen (liest das bisherige Wiki als Kontext)",
        params: VerfahrenWissenParamsSchema,
        body: KiWissenRequestSchema,
        response: {
          201: WissenViewDtoSchema,
          422: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // AGENTISCHE TEILNAHME: der Agent liest das bisherige Verfahrens-Wiki (injektions-neutralisiert).
      let bisher: VerfahrensWissenEintrag[];
      try {
        bisher = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const wiki = bisher.map((e) => ({
        art: e.art,
        urheber: e.urheber,
        text: neutralisiereInjektion(e.text),
      }));

      const result = await deps.aiAssist.suggest(
        {
          requestId: requestIdOf(request),
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          actor: { actorId: session.actorId, actorType: "employee" },
          purpose: "verfahren-wissen",
        },
        {
          task: request.body.task,
          input: {
            ...(request.body.input ?? {}),
            verfahren: {
              procedureId: request.params.procedureId,
              version: request.params.version,
            },
            wiki,
          },
        },
      );
      if (!result.ok) {
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply.code(status).send({
          error: result.error.message,
          requestId: requestIdOf(request),
        });
      }
      const text =
        typeof result.value.value === "string"
          ? result.value.value
          : JSON.stringify(result.value.value);
      let eintrag: VerfahrensWissenEintrag;
      try {
        eintrag = await append(
          session,
          request.params.procedureId,
          request.params.version,
          request.body.kind ?? "teilergebnis",
          result.value.modelId,
          text,
          {
            konfidenz: result.value.confidence,
            quellen: result.value.sources,
            rationale: result.value.rationale,
          },
        );
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send(toWissenView(eintrag));
    },
  );

  // ── Verfahrens-Wiki lesen ──────────────────────────────────────────────────────────────────────
  typed.get(
    "/api/verfahren/:procedureId/:version/wissen",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Das Wissen eines Verfahrens lesen (chronologisch, behörden-scoped)",
        params: VerfahrenWissenParamsSchema,
        response: { 200: WissenViewListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintraege: VerfahrensWissenEintrag[];
      try {
        eintraege = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({ eintraege: eintraege.map(toWissenView) });
    },
  );

  // ── Verfahrens-Wissens-EXPORT (Brücke für die agentische Weiterverarbeitung) ──────────────────
  typed.get(
    "/api/verfahren/:procedureId/:version/wissen/export",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["verfahren-wissen"],
        summary: "Kontext-Bundle des Verfahrens-Wissens (neutralisiert) für die agentische Weiterverarbeitung",
        params: VerfahrenWissenParamsSchema,
        response: { 200: WissenVerfahrenExportDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let eintraege: VerfahrensWissenEintrag[];
      try {
        eintraege = await deps.wissenStore.listEintraege({
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          procedureId: request.params.procedureId,
          procedureVersion: request.params.version,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({
        procedureId: request.params.procedureId,
        procedureVersion: request.params.version,
        eintraege: eintraege.map(toExportEintrag),
      });
    },
  );
}
