import type { FastifyPluginAsync } from "fastify";
import { buildPublicRuntimeConfig } from "../runtime-config.js";

export const runtimeConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/runtime-config.json",
    {
      schema: {
        summary: "Get public runtime configuration",
        description:
          "Public, browser-visible runtime configuration. Secrets and internal upstreams are never included.",
        response: {
          200: {
            type: "object",
            required: [
              "schemaVersion",
              "application",
              "authority",
              "jurisdiction",
              "tenant",
              "localization",
              "features",
              "capabilities",
            ],
            properties: {
              schemaVersion: { type: "string" },
              application: { type: "object" },
              authority: { type: "object" },
              jurisdiction: { type: "object" },
              tenant: { type: "object" },
              localization: { type: "object" },
              features: { type: "object", additionalProperties: true },
              capabilities: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      reply.header("cache-control", "no-store");
      return buildPublicRuntimeConfig();
    },
  );
};
