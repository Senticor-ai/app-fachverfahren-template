// GET /api/composables — DISCOVERY der Agentic Composables (CHOS Blueprint v5.0). Read-only Data Plane:
// Lesen/Auffinden braucht keinen Capability-Token (Blueprint §15), nur eine Sitzung (session.read). Die
// deterministische Naht existiert IMMER (Plattformregel §9); ohne registrierte Composables ist die Liste leer.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ComposableDetailDtoSchema,
  ComposableListDtoSchema,
  ComposableSpineParamsSchema,
  SpineRunRequestSchema,
  SpineRunResultDtoSchema,
  ErrorEnvelopeSchema,
  CaseIdParamsSchema,
  type ComposableDetailDto,
  type ComposableSummaryDto,
} from "@senticor/app-bff-contracts";
import {
  builtInPermissions,
  certificationReadiness,
  createAppDataAuditEvent,
  HITL_PFLICHT_AUFGABEN,
  istEnabled,
  istRechtsnah,
  type AgenticComposable,
  type SpineAufgabe,
} from "@senticor/public-sector-sdk";
import type { PortCallContext } from "@senticor/platform-contracts";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";

function toSummary(c: AgenticComposable): ComposableSummaryDto {
  return {
    id: c.id,
    version: c.version,
    displayName: c.displayName,
    klasse: c.klasse,
    status: c.status,
    assurance: c.assurance,
    enabled: istEnabled(c),
    hasSpine: c.spine !== undefined,
  };
}

function toDetail(c: AgenticComposable): ComposableDetailDto {
  return {
    id: c.id,
    version: c.version,
    displayName: c.displayName,
    klasse: c.klasse,
    status: c.status,
    assurance: c.assurance,
    enabled: istEnabled(c),
    outcome: {
      fuerWen: c.outcome.fuerWen,
      ergebnis: c.outcome.ergebnis,
      messung: c.outcome.messung,
      nichtScope: c.outcome.nichtScope,
    },
    owners: { ...c.owners } as Record<string, string>,
    ...(c.moduleId !== undefined ? { moduleId: c.moduleId } : {}),
    ...(c.spine
      ? {
          spine: {
            role: c.spine.role,
            autonomy: c.spine.autonomy,
            aufgaben: [...c.spine.aufgaben],
            skills: [...c.spine.skills],
            knowledgeDomains: [...c.spine.knowledgeDomains],
            rechtsnah: istRechtsnah(c.spine),
          },
        }
      : {}),
    evals: [...c.evals],
    replaceableBy: [...c.replaceableBy],
    certification: certificationReadiness(c),
  };
}

export function registerComposableRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.sessionRead.permission },
    deps,
  );
  // Den Spine AUSFÜHREN ist eine agentische (KI-)Handlung → ai.assist-Permission (nur Sachbearbeitung),
  // getrennt vom read-only Discovery (session.read).
  const spineAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.aiAssist.permission },
    deps,
  );
  const errorResponses = {
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
  };

  typed.get(
    "/api/composables",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Agentic Composables auflisten (Discovery — versionierte Fähigkeitseinheiten mit Spine-Agent)",
        response: { 200: ComposableListDtoSchema, ...errorResponses },
      },
    },
    async () => {
      const list = deps.composableRegistry?.list() ?? [];
      return { composables: list.map(toSummary) };
    },
  );

  typed.get(
    "/api/composables/:id",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Ein Composable im Detail — inkl. Contract Envelope, Spine-Agent und Zertifizierungsreife",
        params: CaseIdParamsSchema,
        response: { 200: ComposableDetailDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const found = deps.composableRegistry?.get(request.params.id);
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      return reply.send(toDetail(found));
    },
  );

  // POST /api/composables/:id/spine/:aufgabe — den SPINE-AGENT eine Aufgabe ausführen lassen (Nutzer-Mandat:
  // Assistenz → Prüfung/Subsumtion/Review/Strukturierung). Läuft über den AiAssistPort (AAL-2 „Advise"): das
  // Ergebnis ist IMMER ein Vorschlag mit reviewRequired=true — nie eine Entscheidung. Für rechtsnahe Aufgaben
  // (HITL-pflichtig) bleibt die Entscheidung zwingend menschlich (Vier-Augen serverseitig). Die Aufgabe muss am
  // Spine DEKLARIERT sein (sonst 422) — ein Agent kann keine Fähigkeit erfinden, die das Composable nicht trägt.
  typed.post(
    "/api/composables/:id/spine/:aufgabe",
    {
      config: spineAuth.config,
      preHandler: spineAuth.preHandler,
      schema: {
        tags: ["composables"],
        summary:
          "Den Spine-Agent eine Aufgabe ausführen lassen (assistiv, HCAI — reviewRequired, nie eine Entscheidung)",
        params: ComposableSpineParamsSchema,
        body: SpineRunRequestSchema,
        response: {
          200: SpineRunResultDtoSchema,
          422: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
          ...errorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, aufgabe } = request.params;
      const found = deps.composableRegistry?.get(id);
      if (!found)
        return reply
          .code(404)
          .send({ error: "not found", requestId: requestIdOf(request) });
      if (!found.spine)
        return reply.code(404).send({
          error: "dieses Composable hat keinen Spine-Agent",
          requestId: requestIdOf(request),
        });
      // Die Aufgabe muss am Spine deklariert sein — deckt zugleich ungültige Aufgaben-Namen ab.
      if (!found.spine.aufgaben.includes(aufgabe as SpineAufgabe))
        return reply.code(422).send({
          error: `Aufgabe '${aufgabe}' ist für diesen Spine nicht deklariert`,
          requestId: requestIdOf(request),
        });

      const session = sessionOf(request);
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "employee" },
        purpose: "spine-run",
      };
      // Der Spine berät nur (limited-risk) — high-risk-Autonomie lehnt der Port ab; reviewRequired bleibt true.
      const result = await deps.aiAssist.suggest(context, {
        task: `spine:${id}:${aufgabe}`,
        input: request.body.input,
        maxClass: "limited-risk",
      });
      if (!result.ok) {
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply.code(status).send({
          error: result.error.message,
          requestId: requestIdOf(request),
        });
      }

      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "spine.suggestion.created",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Spine-Vorschlag '${aufgabe}' für Composable '${id}' erzeugt (${result.value.modelId})`,
          resource: { type: "composable-spine", id: `${id}:${aufgabe}` },
        }),
      });
      return reply.code(200).send({
        composableId: id,
        aufgabe,
        rechtsnah: HITL_PFLICHT_AUFGABEN.includes(aufgabe as SpineAufgabe),
        autonomy: found.spine.autonomy,
        suggestion: result.value,
      });
    },
  );
}
