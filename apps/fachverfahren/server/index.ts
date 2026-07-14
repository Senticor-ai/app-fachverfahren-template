// server/index — DÜNNE Komposition über @senticor/app-runtime-fastify: die neutrale
// Web-Delivery-Runtime lebt im Paket; hier stehen App-Identität, Store-Konstruktion und
// die Registrierung der App-Routen über die Registrar-Naht.
import { pathToFileURL } from "node:url";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import {
  appBff,
  registerOpenApiCollector,
  registerOpenApiRoute,
} from "@senticor/app-bff-fastify";
import {
  buildInternalServer as buildRuntimeInternalServer,
  buildPublicServer as buildRuntimePublicServer,
  createAuditSinkFromEnv,
  logError,
  logInfo,
  readRuntimeConfig as readRuntimeConfigBase,
  startRuntime as startRuntimeBase,
  type AuditSink,
  type RunningRuntime,
  type RuntimeConfig,
  type RuntimeMetrics,
  type RuntimeState,
  type SessionResolver,
} from "@senticor/app-runtime-fastify";
import {
  createAppStoreFromEnv,
  createAuditStoreFromEnv,
  createAuthStoreFromEnv,
  createKanbanStoreFromEnv,
  type AppStore,
  type AuditStore,
  type AuthStore,
  type KanbanStore,
} from "@senticor/app-store-postgres";
import type { FastifyInstance } from "fastify";
import { registerAuditRoutes } from "./audit/routes.js";
import { autoBootstrapAdminFromEnv } from "./auth/auto-bootstrap.js";
import { registerAuthPolicyGuard } from "./auth/authorization.js";
import { registerAuthRoutes, type RegistrationMode } from "./auth/routes.js";
import { createCookieSessionResolver } from "./auth/session-resolver.js";
import { registerBoardRoutes } from "./kanban/routes.js";
import { registerUserRoutes } from "./users/routes.js";

const APP_IDENTITY = {
  defaultStaticDir: path.join(process.cwd(), "apps/fachverfahren/dist"),
  applicationId: "fachverfahren",
  displayName: "Fachverfahren",
};

function parseRegistrationMode(value: string | undefined): RegistrationMode {
  if (value === "open_unverified") {
    console.warn(
      "[auth] AUTH_REGISTRATION_MODE=open_unverified: Registrierung ist OFFEN (ohne E-Mail-Verifikation); In-Memory-Rate-Limiter trägt nur Single-Process-Deployments.",
    );
    return "open_unverified";
  }
  return "disabled";
}

export function readRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return readRuntimeConfigBase(env, APP_IDENTITY);
}

interface AppStores {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
}

interface BffWiring {
  appStore: AppStore;
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
}

interface AppPolicy {
  bootstrapToken: string | undefined;
  registrationMode: RegistrationMode;
  demoMode: boolean;
}

function registerAppRoutes(
  app: FastifyInstance,
  stores: AppStores,
  policy: AppPolicy,
  bff: BffWiring,
): void {
  registerAuthPolicyGuard(app);
  app.register(fastifyCookie);
  registerOpenApiCollector(app);
  registerAuthRoutes(app, {
    authStore: stores.authStore,
    kanbanStore: stores.kanbanStore,
    auditStore: stores.auditStore,
    bootstrapToken: policy.bootstrapToken,
    registrationMode: policy.registrationMode,
    demoMode: policy.demoMode,
  });
  registerBoardRoutes(app, stores);
  registerUserRoutes(app, stores);
  registerAuditRoutes(app, {
    authStore: stores.authStore,
    auditStore: stores.auditStore,
  });
  app.register(appBff, bff);
}

export function buildPublicServer({
  config = readRuntimeConfig(),
  state,
  metrics,
  authStore = createAuthStoreFromEnv(),
  kanbanStore = createKanbanStoreFromEnv(),
  auditStore = createAuditStoreFromEnv(),
  appStore = createAppStoreFromEnv(),
  sessionResolver,
  auditSink = createAuditSinkFromEnv(),
  bootstrapToken = process.env["BOOTSTRAP_TOKEN"],
  registrationMode = parseRegistrationMode(
    process.env["AUTH_REGISTRATION_MODE"],
  ),
}: {
  config?: RuntimeConfig;
  state?: RuntimeState;
  metrics?: RuntimeMetrics;
  authStore?: AuthStore;
  kanbanStore?: KanbanStore;
  auditStore?: AuditStore;
  appStore?: AppStore;
  sessionResolver?: SessionResolver;
  auditSink?: AuditSink;
  bootstrapToken?: string | undefined;
  registrationMode?: RegistrationMode;
} = {}): FastifyInstance {
  return buildRuntimePublicServer({
    config,
    ...(state ? { state } : {}),
    ...(metrics ? { metrics } : {}),
    registerRoutes: (app) =>
      registerAppRoutes(
        app,
        { authStore, kanbanStore, auditStore },
        { bootstrapToken, registrationMode, demoMode: config.demoMode },
        {
          appStore,
          sessionResolver:
            sessionResolver ?? createCookieSessionResolver(authStore),
          auditSink,
        },
      ),
  });
}

export function buildInternalServer({
  config = readRuntimeConfig(),
  metrics,
  publicServer,
}: {
  config?: RuntimeConfig;
  metrics?: RuntimeMetrics;
  publicServer?: FastifyInstance;
} = {}): FastifyInstance {
  return buildRuntimeInternalServer({
    config,
    ...(metrics ? { metrics } : {}),
    ...(publicServer
      ? {
          registerRoutes: (app: FastifyInstance) =>
            registerOpenApiRoute(app, publicServer),
        }
      : {}),
  });
}

export async function startRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunningRuntime> {
  // Parse exactly once: runtime JSON, auth-status mirror and demo seeding receive
  // the same authoritative deployment value.
  const config = readRuntimeConfig(env);
  const authStore = createAuthStoreFromEnv(env);
  const kanbanStore = createKanbanStoreFromEnv(env);
  const auditStore = createAuditStoreFromEnv(env);
  const stores = { authStore, kanbanStore, auditStore };
  const policy: AppPolicy = {
    bootstrapToken: env["BOOTSTRAP_TOKEN"],
    registrationMode: parseRegistrationMode(env["AUTH_REGISTRATION_MODE"]),
    demoMode: config.demoMode,
  };
  const bff: BffWiring = {
    appStore: createAppStoreFromEnv(env),
    sessionResolver: createCookieSessionResolver(authStore),
    auditSink: createAuditSinkFromEnv(env),
  };
  return startRuntimeBase({
    env,
    config,
    registerPublicRoutes: (app) => registerAppRoutes(app, stores, policy, bff),
    registerInternalRoutes: (app, context) =>
      registerOpenApiRoute(app, context.publicServer),
    beforeListen: async () => {
      await autoBootstrapAdminFromEnv({
        authStore,
        kanbanStore,
        auditStore,
        env,
        demoMode: config.demoMode,
        log: (level, event, fields) =>
          level === "error" ? logError(event, fields) : logInfo(event, fields),
      });
    },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startRuntime().catch((error: unknown) => {
    logError("runtime.startup.failed", { error: String(error) });
    process.exitCode = 1;
  });
}
