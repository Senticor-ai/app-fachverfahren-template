import type { FastifyPluginAsync } from "fastify";

const probeResponseSchema = {
  type: "object",
  required: ["ok", "probe"],
  properties: {
    ok: { type: "boolean" },
    probe: { type: "string" },
    reason: { type: "string" },
    uptimeMs: { type: "number" },
  },
} as const;

export interface PlatformRoutesOptions {
  startedAt: number;
}

export const platformRoutes: FastifyPluginAsync<PlatformRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    "/livez",
    {
      schema: {
        summary: "Get liveness probe status",
        description:
          "Kubernetes liveness probe. It reports process liveness only and must not check external dependencies.",
        response: {
          200: probeResponseSchema,
          503: probeResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const isShuttingDown = app.shuttingDown;
      reply.code(isShuttingDown ? 503 : 200);
      return {
        ok: !isShuttingDown,
        probe: "liveness",
        ...(isShuttingDown ? { reason: "shutting_down" } : {}),
      };
    },
  );

  app.get(
    "/startupz",
    {
      schema: {
        summary: "Get startup probe status",
        response: {
          200: probeResponseSchema,
        },
      },
    },
    async () => ({
      ok: true,
      probe: "startup",
      uptimeMs: Date.now() - options.startedAt,
    }),
  );

  app.get(
    "/readyz",
    {
      schema: {
        summary: "Get readiness probe status",
        description:
          "Readiness can later include bounded critical dependency checks. It does not expose hostnames or credentials.",
        response: {
          200: probeResponseSchema,
          503: probeResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      if (app.shuttingDown) {
        reply.code(503);
        return { ok: false, probe: "readiness", reason: "shutting_down" };
      }
      return { ok: true, probe: "readiness" };
    },
  );

  app.get(
    "/api/health",
    {
      schema: {
        summary: "Get public API health",
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get(
    "/internal/metrics",
    {
      schema: {
        hide: true,
      },
    },
    async (_request, reply) => {
      reply.type("text/plain; version=0.0.4; charset=utf-8");
      return (
        "# HELP app_uptime_ms Application uptime.\n" +
        "# TYPE app_uptime_ms gauge\n" +
        `app_uptime_ms ${Date.now() - options.startedAt}\n`
      );
    },
  );
};
