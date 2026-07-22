// GET /api/composables — DISCOVERY der Agentic Composables (CHOS Blueprint v5.0). Read-only Data Plane:
// Lesen/Auffinden braucht keinen Capability-Token (Blueprint §15), nur eine Sitzung (session.read). Die
// deterministische Naht existiert IMMER (Plattformregel §9); ohne registrierte Composables ist die Liste leer.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ComposableDetailDtoSchema,
  ComposableListDtoSchema,
  ErrorEnvelopeSchema,
  CaseIdParamsSchema,
  type ComposableDetailDto,
  type ComposableSummaryDto,
} from "@senticor/app-bff-contracts";
import {
  builtInPermissions,
  certificationReadiness,
  istEnabled,
  istRechtsnah,
  type AgenticComposable,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf } from "../route-auth.js";

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
}
