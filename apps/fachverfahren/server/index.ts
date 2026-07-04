import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

const NO_STORE = "no-store";
const IMMUTABLE = "public, max-age=31536000, immutable";
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_HEADER_TIMEOUT_MS = 10_000;

type CspMode = "enforce" | "report-only";

interface BuildInfo {
  version: string;
  gitSha: string;
  buildTime: string;
  imageDigest: string;
}

interface RuntimeConfig {
  staticDir: string;
  host: string;
  port: number;
  internalPort: number;
  publicBaseUrl?: string;
  serviceWorkerEnabled: boolean;
  enableHsts: boolean;
  cspMode: CspMode;
  frameAncestors: string;
  trustProxy: boolean | string;
  allowedHosts: Set<string>;
  maxBodyBytes: number;
  shutdownTimeoutMs: number;
  requiredUpstreams: URL[];
  buildInfo: BuildInfo;
  publicRuntimeConfig: Record<string, unknown>;
}

interface RuntimeState {
  startupComplete: boolean;
  shuttingDown: boolean;
}

interface RequestMetric {
  count: number;
  durationSeconds: number;
}

interface RequestContext {
  startedAt: bigint;
  requestId: string;
}

class RuntimeMetrics {
  private readonly requests = new Map<string, RequestMetric>();

  observe({
    method,
    route,
    statusCode,
    durationSeconds,
  }: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }) {
    const key = `${method}\t${route}\t${statusCode}`;
    const current = this.requests.get(key) ?? {
      count: 0,
      durationSeconds: 0,
    };
    current.count += 1;
    current.durationSeconds += durationSeconds;
    this.requests.set(key, current);
  }

  render(buildInfo: BuildInfo): string {
    const lines = [
      "# HELP http_requests_total HTTP requests processed by the app runtime.",
      "# TYPE http_requests_total counter",
    ];
    for (const [key, metric] of [...this.requests.entries()].sort()) {
      const [method, route, status] = key.split("\t");
      lines.push(
        `http_requests_total{method="${label(method)}",route="${label(
          route,
        )}",status="${label(status)}"} ${metric.count}`,
      );
    }
    lines.push(
      "# HELP http_request_duration_seconds_sum Total HTTP request duration.",
      "# TYPE http_request_duration_seconds_sum counter",
    );
    for (const [key, metric] of [...this.requests.entries()].sort()) {
      const [method, route, status] = key.split("\t");
      lines.push(
        `http_request_duration_seconds_sum{method="${label(
          method,
        )}",route="${label(route)}",status="${label(status)}"} ${
          metric.durationSeconds
        }`,
      );
    }
    lines.push(
      "# HELP app_build_info Build metadata for the deployed app image.",
      "# TYPE app_build_info gauge",
      `app_build_info{version="${label(buildInfo.version)}",git_sha="${label(
        buildInfo.gitSha,
      )}",image_digest="${label(buildInfo.imageDigest)}"} 1`,
      "",
    );
    return lines.join("\n");
  }
}

const requestContexts = new WeakMap<FastifyRequest, RequestContext>();

export function readRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const staticDir = path.resolve(
    env["STATIC_DIR"] ?? path.join(process.cwd(), "apps/fachverfahren/dist"),
  );
  const publicBaseUrl = optionalUrl(env["PUBLIC_BASE_URL"]);
  const serviceWorkerEnabled = parseBoolean(
    env["APP_ENABLE_SERVICE_WORKER"],
    false,
  );
  const enableHsts = parseBoolean(
    env["APP_ENABLE_HSTS"],
    env["NODE_ENV"] === "production",
  );
  const cspMode = parseCspMode(env["APP_CSP_MODE"] ?? "enforce");
  const frameAncestors = env["APP_FRAME_ANCESTORS"]?.trim() || "'self'";
  const allowedHosts = parseAllowedHosts(
    env["APP_ALLOWED_HOSTS"],
    publicBaseUrl,
  );
  const buildInfo = {
    version: env["APP_VERSION"] ?? env["npm_package_version"] ?? "0.0.0",
    gitSha: env["GIT_SHA"] ?? env["CI_COMMIT_SHA"] ?? "unknown",
    buildTime: env["BUILD_TIME"] ?? "unknown",
    imageDigest: env["IMAGE_DIGEST"] ?? "unknown",
  };
  return {
    staticDir,
    host: env["HOST"] ?? "0.0.0.0",
    port: parsePort(env["PORT"], 8080),
    internalPort: parsePort(env["INTERNAL_PORT"], 9090),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    serviceWorkerEnabled,
    enableHsts,
    cspMode,
    frameAncestors,
    trustProxy: parseTrustProxy(env["APP_TRUST_PROXY"] ?? "false"),
    allowedHosts,
    maxBodyBytes: parsePositiveInt(
      env["APP_MAX_BODY_BYTES"],
      DEFAULT_MAX_BODY_BYTES,
    ),
    shutdownTimeoutMs: parsePositiveInt(
      env["APP_SHUTDOWN_TIMEOUT_MS"],
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
    ),
    requiredUpstreams: parseUrlList(env["APP_REQUIRED_UPSTREAMS"]),
    buildInfo,
    publicRuntimeConfig: buildPublicRuntimeConfig(env, {
      serviceWorkerEnabled,
      publicBaseUrl,
      buildInfo,
    }),
  };
}

export function buildPublicServer({
  config = readRuntimeConfig(),
  state = createRuntimeState(),
  metrics = new RuntimeMetrics(),
}: {
  config?: RuntimeConfig;
  state?: RuntimeState;
  metrics?: RuntimeMetrics;
} = {}): FastifyInstance {
  const app = fastify({
    logger: false,
    bodyLimit: config.maxBodyBytes,
    trustProxy: config.trustProxy,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
  });
  app.server.headersTimeout = DEFAULT_HEADER_TIMEOUT_MS;
  registerPublicHooks(app, config, metrics);
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
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return reply
        .code(405)
        .header("Allow", "GET, HEAD")
        .header("Cache-Control", NO_STORE)
        .send({ status: "method-not-allowed" });
    }
    return serveStatic(request, reply, config);
  });
  return app;
}

export function buildInternalServer({
  config = readRuntimeConfig(),
  metrics = new RuntimeMetrics(),
}: {
  config?: RuntimeConfig;
  metrics?: RuntimeMetrics;
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
  app.setNotFoundHandler(async (_request, reply) => {
    return reply
      .code(404)
      .header("Cache-Control", NO_STORE)
      .send({ status: "not-found" });
  });
  return app;
}

export async function startRuntime(env: NodeJS.ProcessEnv = process.env) {
  const config = readRuntimeConfig(env);
  await assertStaticDir(config);
  const state = createRuntimeState();
  const metrics = new RuntimeMetrics();
  const publicServer = buildPublicServer({ config, state, metrics });
  const internalServer = buildInternalServer({ config, metrics });
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
    logInfo("runtime.shutdown.finished", { result });
    process.exit(result === "closed" ? 0 : 1);
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  return { config, state, publicServer, internalServer };
}

function createRuntimeState(): RuntimeState {
  return { startupComplete: false, shuttingDown: false };
}

function registerPublicHooks(
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

async function serveStatic(
  request: FastifyRequest,
  reply: FastifyReply,
  config: RuntimeConfig,
) {
  const pathname = safePathname(request.url);
  const staticFile = await resolveStaticFile(config.staticDir, pathname);
  if (!staticFile) {
    if (path.extname(pathname)) {
      return reply
        .code(404)
        .header("Cache-Control", NO_STORE)
        .send({ status: "not-found" });
    }
    return sendFile({
      request,
      reply,
      filePath: path.join(config.staticDir, "index.html"),
      cacheControl: NO_STORE,
    });
  }
  return sendFile({
    request,
    reply,
    filePath: staticFile,
    cacheControl: cachePolicy(pathname),
  });
}

async function sendFile({
  request,
  reply,
  filePath,
  cacheControl,
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  filePath: string;
  cacheControl: string;
}) {
  const body = await readFile(filePath);
  reply.header("Cache-Control", cacheControl).type(contentType(filePath));
  if (request.method === "HEAD") {
    return reply.send();
  }
  return reply.send(body);
}

async function resolveStaticFile(
  staticDir: string,
  pathname: string,
): Promise<string | null> {
  const normalized = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const relative = normalized.replace(/^[/\\]+/, "");
  let candidate = path.join(staticDir, relative);
  if (
    candidate !== staticDir &&
    !candidate.startsWith(`${staticDir}${path.sep}`)
  ) {
    return null;
  }
  try {
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      candidate = path.join(candidate, "index.html");
    }
    await access(candidate, constants.R_OK);
    return candidate;
  } catch {
    return null;
  }
}

function cachePolicy(pathname: string): string {
  if (
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname === "/runtime-config.json" ||
    pathname === "/service-worker.js"
  ) {
    return NO_STORE;
  }
  if (
    /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|svg)$/.test(pathname)
  ) {
    return IMMUTABLE;
  }
  return NO_STORE;
}

function applySecurityHeaders(reply: FastifyReply, config: RuntimeConfig) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${config.frameAncestors}`,
  ].join("; ");
  reply.header(
    config.cspMode === "report-only"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    csp,
  );
  if (config.enableHsts) {
    reply.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  reply.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
}

async function assertStaticDir(config: RuntimeConfig) {
  await access(path.join(config.staticDir, "index.html"), constants.R_OK);
}

async function staticDirIsReadable(config: RuntimeConfig): Promise<boolean> {
  try {
    await assertStaticDir(config);
    return true;
  } catch {
    return false;
  }
}

async function checkRequiredUpstreams(upstreams: URL[]): Promise<string[]> {
  const failures = [];
  for (const upstream of upstreams) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(upstream, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (!response.ok) {
        failures.push(`${upstream.origin}: ${response.status}`);
      }
    } catch (error) {
      failures.push(`${upstream.origin}: ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  return failures;
}

function buildPublicRuntimeConfig(
  env: NodeJS.ProcessEnv,
  {
    serviceWorkerEnabled,
    publicBaseUrl,
    buildInfo,
  }: {
    serviceWorkerEnabled: boolean;
    publicBaseUrl: string | undefined;
    buildInfo: BuildInfo;
  },
): Record<string, unknown> {
  return {
    schemaVersion: "public-runtime.v1",
    application: {
      applicationId: env["APP_APPLICATION_ID"] ?? "fachverfahren",
      displayName: env["APP_DISPLAY_NAME"] ?? "Fachverfahren",
      version: buildInfo.version,
    },
    tenant: {
      tenantId: env["APP_TENANT_ID"] ?? "default",
      label: env["APP_TENANT_LABEL"] ?? "Standardmandant",
    },
    localization: {
      defaultLocale: "de-DE",
      supportedLocales: ["de-DE"],
    },
    delivery: {
      publicBaseUrl: publicBaseUrl ?? "",
      serviceWorkerEnabled,
    },
  };
}

function redactedConfigSummary(config: RuntimeConfig) {
  return {
    staticDir: config.staticDir,
    port: config.port,
    internalPort: config.internalPort,
    publicBaseUrl: config.publicBaseUrl ?? "",
    serviceWorkerEnabled: config.serviceWorkerEnabled,
    enableHsts: config.enableHsts,
    cspMode: config.cspMode,
    trustProxy: config.trustProxy,
    allowedHosts: [...config.allowedHosts].sort(),
    maxBodyBytes: config.maxBodyBytes,
    requiredUpstreams: config.requiredUpstreams.map((url) => url.origin),
  };
}

function hostAllowed(request: FastifyRequest, config: RuntimeConfig): boolean {
  if (config.allowedHosts.size === 0) return true;
  const host = readHeader(request, "host");
  if (!host) return false;
  return config.allowedHosts.has(host.toLowerCase());
}

function parseAllowedHosts(
  raw: string | undefined,
  publicBaseUrl: string | undefined,
): Set<string> {
  const hosts = new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (publicBaseUrl) {
    hosts.add(new URL(publicBaseUrl).host.toLowerCase());
  }
  return hosts;
}

function parseTrustProxy(raw: string): boolean | string {
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "all") return true;
  if (value === "false" || value === "") return false;
  return value;
}

function parseCspMode(raw: string): CspMode {
  if (raw === "enforce" || raw === "report-only") return raw;
  throw new Error("APP_CSP_MODE must be enforce or report-only");
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  if (/^(1|true|yes)$/i.test(raw)) return true;
  if (/^(0|false|no)$/i.test(raw)) return false;
  throw new Error(`invalid boolean value: ${raw}`);
}

function parsePort(raw: string | undefined, fallback: number): number {
  const value = parsePositiveInt(raw, fallback);
  if (value > 65_535) throw new Error(`invalid port value: ${value}`);
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid positive integer value: ${raw}`);
  }
  return value;
}

function parseUrlList(raw: string | undefined): URL[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value));
}

function optionalUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return new URL(raw).toString().replace(/\/$/, "");
}

function safePathname(rawUrl: string): string {
  const parsed = new URL(rawUrl, "http://runtime.local");
  return decodeURIComponent(parsed.pathname);
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function routeForMetrics(url: string): string {
  const pathname = safePathname(url);
  if (pathname.startsWith("/assets/")) return "/assets/*";
  if (path.extname(pathname)) return pathname;
  return "spa";
}

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
    case ".webmanifest":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function label(value: string | undefined): string {
  return (value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

function logError(event: string, fields: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", event, ...fields }));
}

function logAudit(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "warn", event, audit: true, ...fields }));
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
