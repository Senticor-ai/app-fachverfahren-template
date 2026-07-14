// hooks — Querschnitt des public Ports: X-Request-ID, Security-Header, Host-Allow-List
// (421 misdirected-request) auf onRequest; Metrics-Beobachtung + strukturiertes
// Request-Log auf onResponse.
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "./config.js";
import { NO_STORE } from "./constants.js";
import { logAudit, logInfo } from "./logging.js";
import type { RuntimeMetrics } from "./metrics.js";
import { applySecurityHeaders } from "./security-headers.js";

interface RequestContext {
  startedAt: bigint;
  requestId: string;
}

const requestContexts = new WeakMap<FastifyRequest, RequestContext>();

export function registerPublicHooks(
  app: FastifyInstance,
  config: RuntimeConfig,
  metrics: RuntimeMetrics,
) {
  app.addHook("onRequest", async (request, reply) => {
    const requestId = readHeader(request, "x-request-id") ?? randomUUID();
    requestContexts.set(request, {
      startedAt: process.hrtime.bigint(),
      requestId,
    });
    reply.header("X-Request-ID", requestId);
    applySecurityHeaders(reply, config);
    if (!hostAllowed(request, config)) {
      logAudit("runtime.security.host_denied", {
        host: readHeader(request, "host") ?? "",
        requestId,
      });
      return reply
        .code(421)
        .header("Cache-Control", NO_STORE)
        .send({ status: "misdirected-request" });
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    const context = requestContexts.get(request);
    const durationSeconds = context
      ? Number(process.hrtime.bigint() - context.startedAt) / 1_000_000_000
      : 0;
    metrics.observe({
      method: request.method,
      route: request.routeOptions.url ?? routeForMetrics(request.url),
      statusCode: reply.statusCode,
      durationSeconds,
    });
    logInfo("runtime.request", {
      method: request.method,
      route: request.routeOptions.url ?? routeForMetrics(request.url),
      statusCode: reply.statusCode,
      durationMs: Math.round(durationSeconds * 1000),
      requestId: context?.requestId ?? request.id,
      traceparent: readHeader(request, "traceparent") ?? "",
    });
  });
}

function hostAllowed(request: FastifyRequest, config: RuntimeConfig): boolean {
  if (config.allowedHosts.size === 0) return true;
  const host = readHeader(request, "host");
  if (!host) return false;
  return config.allowedHosts.has(host.toLowerCase());
}

export function safePathname(rawUrl: string): string {
  const parsed = new URL(rawUrl, "http://runtime.local");
  return decodeURIComponent(parsed.pathname);
}

export function readHeader(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function routeForMetrics(url: string): string {
  const pathname = safePathname(url);
  if (pathname.startsWith("/assets/")) return "/assets/*";
  if (path.extname(pathname)) return pathname;
  return "spa";
}
