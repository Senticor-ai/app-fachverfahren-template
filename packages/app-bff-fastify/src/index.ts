// @senticor/app-bff-fastify — Fastify-Plugin, das die vorhandenen Ports (AppStore,
// SessionResolver, AuditSink, RBAC-Registry) als HTTP-BFF exponiert. Routen tragen
// config.auth (bffRouteAuth) — der Startup-Guard der App verlangt das auf /api/*.
export { registerOpenApiCollector, registerOpenApiRoute } from "./openapi.js";
export { appBff, type AppBffOptions, type BffSurface } from "./plugin.js";
export type { BffDeps } from "./deps.js";
export {
  bffRouteAuthLabel,
  requestIdOf,
  scopeOf,
  sessionOf,
  type BffRouteAuth,
} from "./route-auth.js";
