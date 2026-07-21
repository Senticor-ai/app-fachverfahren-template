// runtime — Dual-Port-Bootstrap und Graceful Shutdown. Die App liefert Routen über die
// Registrar-Nähte; beforeListen ist der Platz für idempotente Startarbeit (z.B.
// Auto-Bootstrap eines Admin-Kontos), NACH dem Serverbau und VOR listen().
import type { FastifyInstance } from "fastify";
import {
  readRuntimeConfig,
  redactedConfigSummary,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "./config.js";
import { assertStaticDir } from "./health.js";
import { logError, logInfo } from "./logging.js";
import { RuntimeMetrics } from "./metrics.js";
import { startTelemetry } from "./telemetry.js";
import {
  buildInternalServer,
  buildPublicServer,
  createRuntimeState,
  type RouteRegistrar,
  type RuntimeContext,
  type RuntimeState,
} from "./servers.js";

/** Interne Registrare sehen zusätzlich den public Server — z.B. um ein dort
 *  gesammeltes OpenAPI-Dokument intern auszuliefern (Issue #11, Phase E). */
export type InternalRouteRegistrar = (
  app: FastifyInstance,
  context: RuntimeContext & { publicServer: FastifyInstance },
) => void;

export interface StartRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  config?: RuntimeConfig;
  configOverrides?: RuntimeConfigOverrides;
  registerPublicRoutes?: RouteRegistrar;
  registerInternalRoutes?: InternalRouteRegistrar;
  beforeListen?: (
    context: RuntimeContext & {
      publicServer: FastifyInstance;
      internalServer: FastifyInstance;
    },
  ) => Promise<void> | void;
}

export interface RunningRuntime {
  config: RuntimeConfig;
  state: RuntimeState;
  publicServer: FastifyInstance;
  internalServer: FastifyInstance;
}

export async function startRuntime(
  options: StartRuntimeOptions = {},
): Promise<RunningRuntime> {
  const env = options.env ?? process.env;
  const config =
    options.config ?? readRuntimeConfig(env, options.configOverrides ?? {});
  await assertStaticDir(config);
  // OpenTelemetry-Traces (Issue #54): startet NUR bei gesetztem OTEL_EXPORTER_OTLP_ENDPOINT — sonst undefined
  // (No-op-Tracer, kein Export). Vor dem Serverbau, damit die Request-Spans (hooks.ts) exportiert werden.
  const telemetry = startTelemetry({
    serviceName: env["APP_APPLICATION_ID"] ?? "app-runtime-fastify",
    buildInfo: config.buildInfo,
    env,
  });
  const state = createRuntimeState();
  const metrics = new RuntimeMetrics();
  const registerInternalRoutes = options.registerInternalRoutes;
  const publicServer = buildPublicServer({
    config,
    state,
    metrics,
    ...(options.registerPublicRoutes
      ? { registerRoutes: options.registerPublicRoutes }
      : {}),
  });
  const internalServer = buildInternalServer({
    config,
    metrics,
    state,
    ...(registerInternalRoutes
      ? {
          registerRoutes: (app: FastifyInstance, context: RuntimeContext) =>
            registerInternalRoutes(app, { ...context, publicServer }),
        }
      : {}),
  });
  await options.beforeListen?.({
    config,
    state,
    metrics,
    publicServer,
    internalServer,
  });
  await Promise.all([
    publicServer.listen({ host: config.host, port: config.port }),
    internalServer.listen({ host: config.host, port: config.internalPort }),
  ]);
  state.startupComplete = true;
  logInfo("runtime.started", {
    publicPort: config.port,
    internalPort: config.internalPort,
    staticDir: config.staticDir,
    config: redactedConfigSummary(config),
  });

  const shutdown = async (signal: NodeJS.Signals) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    logInfo("runtime.shutdown.started", { signal });
    const timeout = delay(config.shutdownTimeoutMs).then(() => "timeout");
    const closed = Promise.all([publicServer.close(), internalServer.close()])
      .then(() => "closed")
      .catch((error: unknown) => {
        logError("runtime.shutdown.error", { error: String(error) });
        return "error";
      });
    const result = await Promise.race([closed, timeout]);
    // OTel-Exporter sauber flushen/schließen (best-effort — blockiert den Shutdown nicht).
    await telemetry?.shutdown().catch((error: unknown) => {
      logError("runtime.telemetry.shutdown.error", { error: String(error) });
    });
    logInfo("runtime.shutdown.finished", { result });
    process.exit(result === "closed" ? 0 : 1);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  return { config, state, publicServer, internalServer };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
