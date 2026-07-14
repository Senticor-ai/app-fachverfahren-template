// @senticor/app-runtime-fastify — neutrale Web-Delivery-Runtime (Fastify): Runtime-Config,
// Dual-Port-Server (public/internal), Health, Static/SPA-Auslieferung, Security-Header,
// Metrics, Logging und Graceful Shutdown. Apps komponieren ihre BFF-Routen über die
// Registrar-Nähte (RouteRegistrar/InternalRouteRegistrar) — das Paket bleibt domainfrei.
export {
  ConsoleAuditSink,
  createAuditSinkFromEnv,
  MemoryAuditSink,
  NoopAuditSink,
  type AuditSink,
  type AuditSinkEvent,
} from "./audit-sink.js";
export {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  parseBoolean,
  readRuntimeConfig,
  redactedConfigSummary,
  type BuildInfo,
  type CspMode,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "./config.js";
export {
  createDevSessionResolverFromEnv,
  NoSessionResolver,
  type ResolvedSession,
  type SessionResolver,
} from "./session-resolver.js";
export { IMMUTABLE, NO_STORE } from "./constants.js";
export {
  assertStaticDir,
  checkRequiredUpstreams,
  staticDirIsReadable,
} from "./health.js";
export {
  readHeader,
  registerPublicHooks,
  routeForMetrics,
  safePathname,
} from "./hooks.js";
export { logAudit, logError, logInfo } from "./logging.js";
export { RuntimeMetrics, label } from "./metrics.js";
export {
  startRuntime,
  type InternalRouteRegistrar,
  type RunningRuntime,
  type StartRuntimeOptions,
} from "./runtime.js";
export { applySecurityHeaders } from "./security-headers.js";
export {
  buildInternalServer,
  buildPublicServer,
  createRuntimeState,
  type RouteRegistrar,
  type RuntimeContext,
  type RuntimeState,
} from "./servers.js";
export { cachePolicy, registerStaticDelivery } from "./static.js";
