// server/index — DÜNNE Komposition über @senticor/app-runtime-fastify: die neutrale
// Web-Delivery-Runtime (Config, Dual-Port, Health, Static, Security-Header, Metrics,
// Shutdown) lebt im Paket; hier stehen nur App-Identität, Store-Konstruktion und die
// Registrierung der App-Routen über die Registrar-Naht. Die Exporte bleiben stabil
// (index.test.ts, tests/e2e/personas.e2e.test.ts importieren sie).
import { pathToFileURL } from "node:url";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import {
  buildInternalServer as buildRuntimeInternalServer,
  buildPublicServer as buildRuntimePublicServer,
  logError,
  logInfo,
  readRuntimeConfig as readRuntimeConfigBase,
  startRuntime as startRuntimeBase,
  type RunningRuntime,
  type RuntimeConfig,
  type RuntimeMetrics,
  type RuntimeState,
} from "@senticor/app-runtime-fastify";
import {
  createAuditStoreFromEnv,
  createAuthStoreFromEnv,
  createKanbanStoreFromEnv,
  type AuditStore,
  type AuthStore,
  type KanbanStore,
} from "@senticor/app-store-postgres";
import type { FastifyInstance } from "fastify";
import { registerAuditRoutes } from "./audit/routes.js";
import { autoBootstrapAdminFromEnv } from "./auth/auto-bootstrap.js";
import { registerAuthPolicyGuard } from "./auth/authorization.js";
import { registerAuthRoutes, type RegistrationMode } from "./auth/routes.js";
import { registerBoardRoutes } from "./kanban/routes.js";
import { registerUserRoutes } from "./users/routes.js";

// App-Identität: der Renderer schreibt Domain-Token beim Scaffolding um — deshalb stehen
// sie HIER (consumer-seitig) und nicht im template-verwalteten Runtime-Paket.
const APP_IDENTITY = {
  defaultStaticDir: path.join(process.cwd(), "apps/fachverfahren/dist"),
  applicationId: "fachverfahren",
  displayName: "Fachverfahren",
};

/** Self-Signup-Politik aus der Env: default AUS; `open_unverified` heißt ehrlich so,
 *  bis E-Mail-Verifikation existiert. Unbekannte Werte fallen GESCHLOSSEN zurück. */
function parseRegistrationMode(value: string | undefined): RegistrationMode {
  if (value === "open_unverified") {
    // Der Default-Rate-Limiter zählt im Prozess: bei mehreren App-Instanzen drosselt
    // jede für sich — für Multi-Instanz-Deployments einen verteilten RateLimiter
    // konfigurieren (auth/rate-limit.ts).
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

function registerAppRoutes(
  app: FastifyInstance,
  stores: AppStores,
  policy: {
    bootstrapToken: string | undefined;
    registrationMode: RegistrationMode;
  },
): void {
  // K2: /auth-/api-Route ohne Autorisierungs-Policy = Boot-Fehler, nicht erst Test-Rot.
  registerAuthPolicyGuard(app);
  app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore: stores.authStore,
    kanbanStore: stores.kanbanStore,
    auditStore: stores.auditStore,
    bootstrapToken: policy.bootstrapToken,
    registrationMode: policy.registrationMode,
  });
  registerBoardRoutes(app, stores);
  registerUserRoutes(app, stores);
  registerAuditRoutes(app, {
    authStore: stores.authStore,
    auditStore: stores.auditStore,
  });
}

export function buildPublicServer({
  config = readRuntimeConfig(),
  state,
  metrics,
  authStore = createAuthStoreFromEnv(),
  kanbanStore = createKanbanStoreFromEnv(),
  auditStore = createAuditStoreFromEnv(),
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
        { bootstrapToken, registrationMode },
      ),
  });
}

export function buildInternalServer({
  config = readRuntimeConfig(),
  metrics,
}: {
  config?: RuntimeConfig;
  metrics?: RuntimeMetrics;
} = {}): FastifyInstance {
  return buildRuntimeInternalServer({
    config,
    ...(metrics ? { metrics } : {}),
  });
}

export async function startRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunningRuntime> {
  const authStore = createAuthStoreFromEnv(env);
  const kanbanStore = createKanbanStoreFromEnv(env);
  const auditStore = createAuditStoreFromEnv(env);
  const stores = { authStore, kanbanStore, auditStore };
  const policy = {
    bootstrapToken: env["BOOTSTRAP_TOKEN"],
    registrationMode: parseRegistrationMode(env["AUTH_REGISTRATION_MODE"]),
  };
  return startRuntimeBase({
    env,
    configOverrides: APP_IDENTITY,
    registerPublicRoutes: (app) => registerAppRoutes(app, stores, policy),
    // Fresh-Deployment-Akzeptanz: mit AUTH_BOOTSTRAP_ADMIN_* entsteht der Admin samt
    // Team-Discovery-Board beim Start — idempotent, wirft nie (Fehler landen im Log).
    beforeListen: async () => {
      await autoBootstrapAdminFromEnv({
        authStore,
        kanbanStore,
        auditStore,
        env,
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
