import fastifyStatic from "@fastify/static";
import sensible from "@fastify/sensible";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import {
  createAppStoreFromEnv,
  type AppStore,
} from "@senticor/app-store-postgres";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appDataRoutes } from "./routes/app-data.js";
import { mockSessionRoutes } from "./routes/mock-session.js";
import { platformRoutes } from "./routes/platform.js";
import { runtimeConfigRoutes } from "./routes/runtime-config.js";
import {
  createMemorySessionStore,
  type SessionStore,
} from "./session-store.js";

declare module "fastify" {
  interface FastifyInstance {
    shuttingDown: boolean;
  }
}

export interface BuildAppOptions {
  enableMockAuth?: boolean;
  appStore?: AppStore;
  logger?: boolean;
  sessionStore?: SessionStore;
  staticDir?: string;
  startedAt?: number;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: Number(process.env["APP_MAX_BODY_BYTES"] ?? 10 * 1024 * 1024),
    onProtoPoisoning: "remove",
    onConstructorPoisoning: "remove",
    genReqId: (request) => {
      const incoming =
        request.headers["x-request-id"] ?? request.headers["x-req-id"];
      return incoming
        ? String(incoming)
        : `app-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
    },
  });

  app.decorate("shuttingDown", false);
  const sessionStore = options.sessionStore ?? createMemorySessionStore();
  const appStore = options.appStore ?? createAppStoreFromEnv();

  app.register(sensible);
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Fachverfahren Template API",
        description:
          "Generic public-sector application template API. Route schemas are the OpenAPI source of truth.",
        version: "0.1.0-rc.1",
      },
      servers: [{ url: "/" }],
      tags: [
        {
          name: "Auth",
          description:
            "Local mock identity/session endpoints for early template validation.",
        },
        { name: "Platform", description: "Operational platform endpoints" },
        {
          name: "Runtime",
          description: "Public runtime configuration endpoints",
        },
      ],
    },
  });
  app.register(fastifySwaggerUi, {
    routePrefix: "/api/v1/docs",
    uiConfig: {
      docExpansion: "none",
      deepLinking: true,
      operationsSorter: "alpha",
      tagsSorter: "alpha",
    },
  });

  app.get(
    "/api/openapi.json",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      reply.type("application/json");
      return app.swagger();
    },
  );

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "route error");
    const statusCode = getErrorStatusCode(error);
    const message = error instanceof Error ? error.message : "request failed";
    reply.code(statusCode);
    return {
      ok: false,
      error: statusCode >= 500 ? "internal_server_error" : message,
      requestId: request.id,
    };
  });

  app.register(platformRoutes, { startedAt: options.startedAt ?? Date.now() });
  if (isMockAuthEnabled(options.enableMockAuth)) {
    app.register(mockSessionRoutes, { sessionStore });
  }
  app.register(appDataRoutes, { appStore, sessionStore });
  app.register(runtimeConfigRoutes);

  const staticDir = options.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.register(fastifyStatic, {
      root: staticDir,
      prefix: "/",
      decorateReply: true,
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== "GET" || request.url.startsWith("/api")) {
        reply.code(404);
        return { ok: false, error: "not_found" };
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

export function resolveStaticDir(env: NodeJS.ProcessEnv = process.env) {
  return env["STATIC_DIR"] ?? join(process.cwd(), "dist");
}

function getErrorStatusCode(error: unknown): number {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

function isMockAuthEnabled(explicitValue: boolean | undefined): boolean {
  if (typeof explicitValue === "boolean") {
    return explicitValue;
  }
  return process.env["APP_ENABLE_MOCK_AUTH"] === "true";
}
