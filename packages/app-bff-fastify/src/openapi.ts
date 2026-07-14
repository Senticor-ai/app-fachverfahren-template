// openapi — Dokument-Sammlung und interne Auslieferung, bewusst ZWEI Funktionen:
// registerOpenApiCollector gehört auf den PUBLIC-Server und MUSS vor appBff
// registriert werden (der onRoute-Kollektor von @fastify/swagger sieht nur später
// registrierte Routen — Reihenfolge-Test in openapi.test.ts); registerOpenApiRoute
// liefert das gesammelte Dokument NUR auf dem internen Server aus. @fastify/swagger
// selbst exponiert keine Route — auf dem public Port bleibt /internal/* bei 404.
import swagger from "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { openApiInfo, openApiTags } from "@senticor/app-bff-contracts";
import { NO_STORE } from "@senticor/app-runtime-fastify";

export function registerOpenApiCollector(app: FastifyInstance): void {
  app.register(swagger, {
    openapi: {
      info: { ...openApiInfo },
      tags: openApiTags.map((tag) => ({ ...tag })),
    },
    hideUntagged: true,
  });
}

export function registerOpenApiRoute(
  internalApp: FastifyInstance,
  publicApp: FastifyInstance,
): void {
  internalApp.get("/internal/openapi.json", async (_request, reply) => {
    // ready() ist idempotent; im Betrieb hat startRuntime längst gelauscht.
    await publicApp.ready();
    return reply.header("Cache-Control", NO_STORE).send(publicApp.swagger());
  });
}
