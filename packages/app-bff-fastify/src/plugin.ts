// plugin — der BFF als Fastify-Plugin. BEWUSST NICHT fp()-gewrappt: der gekapselte
// setErrorHandler (400-Envelope für Validation-Fehler, 500-Envelope sonst) gilt dadurch
// NUR für die BFF-Routen — App-Routen (/auth/*, /api/v1/*) behalten ihre Fehlerform.
// Kein console.* in diesem Paket: Denials laufen über die AuditSink, technische Fehler
// über request.log (in der Runtime bewusst still).
import type { FastifyError, FastifyInstance } from "fastify";
import { builtInRbacRegistry } from "@senticor/public-sector-sdk";
import type { AuditSink, SessionResolver } from "@senticor/app-runtime-fastify";
import type { AppStore } from "@senticor/app-store-postgres";
import type { RbacRegistry } from "@senticor/public-sector-sdk";
import type { BffDeps } from "./deps.js";
import { requestIdOf } from "./route-auth.js";
import { registerCapabilitiesRoute } from "./routes/capabilities.js";
import { registerPreferencesRoutes } from "./routes/preferences.js";
import { registerSessionRoute } from "./routes/session.js";

export interface AppBffOptions {
  appStore: AppStore;
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
  rbacRegistry?: RbacRegistry;
}

export async function appBff(
  app: FastifyInstance,
  opts: AppBffOptions,
): Promise<void> {
  const deps: BffDeps = {
    appStore: opts.appStore,
    sessionResolver: opts.sessionResolver,
    auditSink: opts.auditSink,
    rbacRegistry: opts.rbacRegistry ?? builtInRbacRegistry,
  };
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply
        .code(400)
        .send({ error: "invalid request", requestId: requestIdOf(request) });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      // z.B. kaputtes JSON (FST_ERR_CTP_*) oder überschrittenes Body-Limit.
      return reply
        .code(statusCode)
        .send({ error: "invalid request", requestId: requestIdOf(request) });
    }
    request.log.error({ err: error }, "bff route failed");
    return reply
      .code(500)
      .send({ error: "internal error", requestId: requestIdOf(request) });
  });
  registerSessionRoute(app, deps);
  registerCapabilitiesRoute(app, deps);
  registerPreferencesRoutes(app, deps);
}
