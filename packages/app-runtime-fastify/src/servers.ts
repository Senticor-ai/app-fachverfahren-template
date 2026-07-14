// servers — Bau der beiden Fastify-Instanzen. Public: Hooks (Security/Metrics/Log),
// App-Routen über die registerRoutes-NAHT, Health, runtime-config.json, /internal/*→404,
// NotFound = 405 (nicht GET/HEAD) oder Static/SPA. Internal: Metrics + Build-Info,
// NIE öffentlich routen. Die App komponiert ihre BFF-Routen ausschließlich über die Naht —
// das Paket kennt keine Stores, keine Auth, keine Domain.
import fastify, { type FastifyInstance } from "fastify";
import { readRuntimeConfig, type RuntimeConfig } from "./config.js";
import { NO_STORE } from "./constants.js";
import { checkRequiredUpstreams, staticDirIsReadable } from "./health.js";
import { registerPublicHooks } from "./hooks.js";
import { RuntimeMetrics } from "./metrics.js";
import { redactedConfigSummary } from "./config.js";
import { registerStaticDelivery } from "./static.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_HEADER_TIMEOUT_MS = 10_000;

export interface RuntimeState {
  startupComplete: boolean;
  shuttingDown: boolean;
}

export function createRuntimeState(): RuntimeState {
  return { startupComplete: false, shuttingDown: false };
}

export interface RuntimeContext {
  config: RuntimeConfig;
  state: RuntimeState;
  metrics: RuntimeMetrics;
}

/** Die Naht zur App: hier registriert die Komposition Plugins (z.B. @fastify/cookie),
 *  Guards und Routen. Synchron — `app.register()` queued selbst; Abhängigkeiten
 *  (Stores, Resolver, Sinks) reichen Kompositionen per Closure hinein. */
export type RouteRegistrar = (
  app: FastifyInstance,
  context: RuntimeContext,
) => void;

export function buildPublicServer({
  config = readRuntimeConfig(),
  state = createRuntimeState(),
  metrics = new RuntimeMetrics(),
  registerRoutes,
}: {
  config?: RuntimeConfig;
  state?: RuntimeState;
  metrics?: RuntimeMetrics;
  registerRoutes?: RouteRegistrar;
} = {}): FastifyInstance {
  const app = fastify({
    logger: false,
    bodyLimit: config.maxBodyBytes,
    trustProxy: config.trustProxy,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
  });
  app.server.headersTimeout = DEFAULT_HEADER_TIMEOUT_MS;
  registerPublicHooks(app, config, metrics);
  registerRoutes?.(app, { config, state, metrics });
  app.get("/livez", async (_request, reply) => {
    return reply.header("Cache-Control", NO_STORE).send({ status: "ok" });
  });
  app.get("/startupz", async (_request, reply) => {
    const ok = state.startupComplete && (await staticDirIsReadable(config));
    return reply
      .code(ok ? 200 : 503)
      .header("Cache-Control", NO_STORE)
      .send({
        status: ok ? "ok" : "starting",
        staticDir: ok ? "readable" : "unavailable",
        config: "valid",
      });
  });
  app.get("/readyz", async (_request, reply) => {
    const upstreamFailures = state.shuttingDown
      ? ["shutdown in progress"]
      : await checkRequiredUpstreams(config.requiredUpstreams);
    const ok = state.startupComplete && upstreamFailures.length === 0;
    return reply
      .code(ok ? 200 : 503)
      .header("Cache-Control", NO_STORE)
      .send({
        status: ok ? "ok" : "not-ready",
        upstreamFailures,
      });
  });
  app.get("/runtime-config.json", async (_request, reply) => {
    return reply
      .header("Cache-Control", NO_STORE)
      .type("application/json; charset=utf-8")
      .send(config.publicRuntimeConfig);
  });
  app.get("/internal/*", async (_request, reply) => {
    return reply
      .code(404)
      .header("Cache-Control", NO_STORE)
      .send({ status: "not-found" });
  });
  registerStaticDelivery(app, config);
  return app;
}

export function buildInternalServer({
  config = readRuntimeConfig(),
  metrics = new RuntimeMetrics(),
  state = createRuntimeState(),
  registerRoutes,
}: {
  config?: RuntimeConfig;
  metrics?: RuntimeMetrics;
  state?: RuntimeState;
  registerRoutes?: RouteRegistrar;
} = {}): FastifyInstance {
  const app = fastify({ logger: false });
  app.get("/internal/metrics", async (_request, reply) => {
    return reply
      .header("Cache-Control", NO_STORE)
      .type("text/plain; version=0.0.4; charset=utf-8")
      .send(metrics.render(config.buildInfo));
  });
  app.get("/internal/build-info", async (_request, reply) => {
    return reply.header("Cache-Control", NO_STORE).send({
      ...config.buildInfo,
      config: redactedConfigSummary(config),
    });
  });
  registerRoutes?.(app, { config, state, metrics });
  app.setNotFoundHandler(async (_request, reply) => {
    return reply
      .code(404)
      .header("Cache-Control", NO_STORE)
      .send({ status: "not-found" });
  });
  return app;
}
