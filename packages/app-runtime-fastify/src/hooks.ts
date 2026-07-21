// hooks — Querschnitt des public Ports: X-Request-ID, Security-Header, Host-Allow-List
// (421 misdirected-request) auf onRequest; Metrics-Beobachtung + strukturiertes
// Request-Log auf onResponse.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "./config.js";
import { NO_STORE } from "./constants.js";
import { logAudit, logInfo } from "./logging.js";
import type { RuntimeMetrics } from "./metrics.js";
import { applySecurityHeaders } from "./security-headers.js";

// OpenTelemetry-Tracer (Issue #54). Ohne gestartete NodeSDK (telemetry.ts) ist dies ein NO-OP-Tracer:
// startSpan liefert einen nicht-aufzeichnenden Span, alle Aufrufe sind nahe-null teuer → Standalone unberührt.
const tracer = trace.getTracer("app-runtime-fastify");

interface RequestContext {
  startedAt: bigint;
  requestId: string;
  span: Span;
}

const requestContexts = new WeakMap<FastifyRequest, RequestContext>();

export function registerPublicHooks(
  app: FastifyInstance,
  config: RuntimeConfig,
  metrics: RuntimeMetrics,
) {
  app.addHook("onRequest", async (request, reply) => {
    const requestId = readHeader(request, "x-request-id") ?? randomUUID();
    const span = tracer.startSpan(`${request.method} ${request.url}`);
    requestContexts.set(request, {
      startedAt: process.hrtime.bigint(),
      requestId,
      span,
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
    // Die Wildcard-Route des Static-Plugins ("/*") wäre als Label wertlos — Static-/
    // SPA-Treffer werden wie ungeroutete Pfade beschriftet (/assets/*, spa, Datei).
    const routeUrl = request.routeOptions.url;
    const route =
      routeUrl && routeUrl !== "/*" ? routeUrl : routeForMetrics(request.url);
    metrics.observe({
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationSeconds,
    });
    logInfo("runtime.request", {
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Math.round(durationSeconds * 1000),
      requestId: context?.requestId ?? request.id,
      traceparent: readHeader(request, "traceparent") ?? "",
    });
    // OTel-Span abschließen (Issue #54): Attribute nach Semantic Conventions, ERROR ab 5xx. Route (nicht die
    // rohe URL) als http.route → niedrige Kardinalität; KEINE PII in Attributen (nur pseudonyme Kennungen).
    if (context) {
      context.span.setAttribute("http.request.method", request.method);
      context.span.setAttribute("http.route", route);
      context.span.setAttribute("http.response.status_code", reply.statusCode);
      if (reply.statusCode >= 500) {
        context.span.setStatus({ code: SpanStatusCode.ERROR });
      }
      context.span.end();
    }
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
