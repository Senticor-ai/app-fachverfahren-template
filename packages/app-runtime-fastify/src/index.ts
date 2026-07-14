// @senticor/app-runtime-fastify — neutrale Web-Delivery-Runtime (Fastify): Runtime-Config,
// Metrics und Logging. Server-Bau, Static-Delivery und Shutdown folgen in der Extraktion
// aus apps/*/server/index.ts (Issue #11, Phase A/B).
export {
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  readRuntimeConfig,
  redactedConfigSummary,
  type BuildInfo,
  type CspMode,
  type RuntimeConfig,
  type RuntimeConfigOverrides,
} from "./config.js";
export { RuntimeMetrics, label } from "./metrics.js";
export { logAudit, logError, logInfo } from "./logging.js";
