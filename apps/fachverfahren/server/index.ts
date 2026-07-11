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
import {
  type AutomationStore,
  closePgPools,
  createActorRoleStoreFromEnv,
  createAutomationStoreFromEnv,
  createCaseStoreFromEnv,
  createNotificationStoreFromEnv,
  createTaskStoreFromEnv,
  InMemoryActorRoleStore,
  InMemoryAutomationStore,
  InMemoryCaseStore,
  InMemoryNotificationStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import {
  catalogFromStatusMachines,
  headerSession,
  registerDomainApi,
  type DomainApiDeps,
} from "./domain-api.js";
import { runConsumerTick, type ConsumerHandle } from "./event-consumer.js";
import { notificationProjector } from "./notification-projector.js";
import { pmModuleManifest } from "./pm-module-manifest.js";
import { DefaultDenyPolicyEngine } from "@senticor/public-sector-sdk";
import {
  DEFAULT_MAX_ATTEMPTS,
  runAutomationTick,
  type AutomationEngineDeps,
} from "./automation-engine.js";
import { HeuristicKiAssist } from "./ai-assist.js";

const NO_STORE = "no-store";
const IMMUTABLE = "public, max-age=31536000, immutable";
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_HEADER_TIMEOUT_MS = 10_000;
const DEFAULT_RATE_LIMIT_MAX = 600;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_KEYS = 50_000;

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
  /** Max. Anfragen je Schlüssel (actorId/Client-IP) pro Fenster auf /api/*. 0 = aus. */
  rateLimitMax: number;
  rateLimitWindowMs: number;
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

/** Korrelations-Id aus dem eingehenden `x-request-id`-Header (oder eine neue UUID). Fastify `genReqId`. */
function reqIdFromHeaders(req: { headers: Record<string, unknown> }): string {
  const h = req.headers["x-request-id"];
  const v = Array.isArray(h) ? h[0] : h;
  return typeof v === "string" && v.length > 0 ? v : randomUUID();
}

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
    rateLimitMax: parseNonNegativeInt(
      env["APP_RATELIMIT_MAX"],
      DEFAULT_RATE_LIMIT_MAX,
    ),
    rateLimitWindowMs: parsePositiveInt(
      env["APP_RATELIMIT_WINDOW_MS"],
      DEFAULT_RATE_LIMIT_WINDOW_MS,
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
  domainApi,
}: {
  config?: RuntimeConfig;
  state?: RuntimeState;
  metrics?: RuntimeMetrics;
  /** Optional: die fachliche Domain-API (/api/*). Ohne sie ist der Server reine Web-Delivery (Verhalten wie bisher). */
  domainApi?: DomainApiDeps;
} = {}): FastifyInstance {
  const app = fastify({
    logger: false,
    bodyLimit: config.maxBodyBytes,
    trustProxy: config.trustProxy,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT_MS,
    // EINE Korrelations-Id: `request.id` ist der eingehende `x-request-id` (oder eine neue UUID). Damit trägt der
    // revisionssichere Audit-Eintrag (der `request.id` nutzt) exakt die Id, die Client + Access-Log sehen.
    genReqId: reqIdFromHeaders,
  });
  app.server.headersTimeout = DEFAULT_HEADER_TIMEOUT_MS;
  registerPublicHooks(app, config, metrics);
  // Ungeplante Fehler einheitlich als problem+json ausliefern (5xx sanitisiert) — vor den Routen registrieren.
  registerErrorHandler(app);
  // Domain-API NACH den Hooks, VOR dem SPA-Fallback (setNotFoundHandler) registrieren.
  if (domainApi) registerDomainApi(app, domainApi);
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
    // Fail-soft Datenschicht-Probe: ein toter Postgres-Pool soll `/readyz` rot färben (nicht nur die Upstreams).
    const storeFailures =
      !state.shuttingDown && domainApi?.caseStore.ping
        ? await domainApi.caseStore
            .ping()
            .then(() => [] as string[])
            .catch((error: unknown) => [`caseStore: ${String(error)}`])
        : [];
    const failures = [...upstreamFailures, ...storeFailures];
    const ok = state.startupComplete && failures.length === 0;
    return reply
      .code(ok ? 200 : 503)
      .header("Cache-Control", NO_STORE)
      .send({
        status: ok ? "ok" : "not-ready",
        upstreamFailures: failures,
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
  const app = fastify({ logger: false, genReqId: reqIdFromHeaders });
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

/**
 * Baut die Domain-API-Abhängigkeiten aus der Umgebung — nur aktiv, wenn `APP_LEISTUNG_CONTRACT` auf den
 * (generierten) Vertrags-Snapshot zeigt. Daraus entsteht der Prozess-Katalog (StatusMachine → erlaubte Übergänge);
 * der CaseStore kommt aus `APP_PG_URL`/`APP_PG_DIRECT_URL` (Postgres) bzw. fällt auf In-Memory zurück. Fehlt der
 * Vertrag oder ist er unlesbar, bleibt die API AUS (Server = reine Web-Delivery wie zuvor).
 */
/**
 * Bootstrap-Sperre für die Authentifizierung. Die Domain-API löst die Sitzung heute AUSSCHLIESSLICH aus `x-*`-Headern
 * auf (der echte OIDC/JWKS-Verifier ist in `session.ts` als Naht vorbereitet, aber noch nicht im Server verdrahtet).
 * Ungeprüfte Header sind in PRODUCTION ein Voll-Bypass — jeder Client könnte `x-actor-id`/`x-permissions` setzen und
 * sich beliebige Rechte/Mandanten geben. Fail-closed: in PRODUCTION verweigert der Server den Start, es sei denn, der
 * Betreiber bekennt sich mit `APP_AUTH_MODE=dev-header` ausdrücklich zur Header-Auflösung (nur nicht-öffentliche
 * Test-/Abnahmeumgebungen). Sobald der IdP verdrahtet ist, wird diese Sperre durch die OIDC-Weiche ersetzt.
 */
export function assertHeaderAuthAllowed(env: NodeJS.ProcessEnv): void {
  if (
    env["NODE_ENV"] === "production" &&
    env["APP_AUTH_MODE"] !== "dev-header"
  ) {
    throw new Error(
      "Header-Authentifizierung ist in PRODUCTION nicht erlaubt (ungeprüfte x-*-Header = Voll-Bypass). " +
        "Binde einen echten Identity-Provider an oder setze für nicht-öffentliche Umgebungen bewusst " +
        "APP_AUTH_MODE=dev-header.",
    );
  }
}

export async function buildDomainApiFromEnv(
  env: NodeJS.ProcessEnv,
): Promise<DomainApiDeps | undefined> {
  // „Eine Behörde führt N Verfahren": `APP_LEISTUNG_CONTRACT` ist eine (komma-separierte) Liste von Contract-Pfaden.
  // Ein einzelner Pfad (ohne Komma) bleibt unverändert gültig — rückwärtskompatibel.
  const contractPaths = (env["APP_LEISTUNG_CONTRACT"] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (contractPaths.length === 0) return undefined;
  type Contract = {
    id?: string;
    statusMachine?: Parameters<
      typeof catalogFromStatusMachines
    >[0][number]["statusMachine"] & { initial?: string };
  };
  const contracts: {
    id: string;
    statusMachine: NonNullable<Contract["statusMachine"]>;
  }[] = [];
  for (const pfad of contractPaths) {
    let contract: Contract;
    try {
      contract = JSON.parse(await readFile(pfad, "utf8"));
    } catch {
      continue; // unlesbaren/defekten Contract überspringen — die übrigen Verfahren bleiben nutzbar
    }
    if (contract.id && contract.statusMachine)
      contracts.push({
        id: contract.id,
        statusMachine: contract.statusMachine,
      });
  }
  if (contracts.length === 0) return undefined;
  // Hinweis: die Header-Auth-Sperre (`assertHeaderAuthAllowed`) wird NICHT hier geprüft, sondern erst beim Verdrahten
  // des HTTP-Servers (`startRuntime`). So triggert der reine Automations-WORKER (der diese Deps nutzt, aber KEINE
  // Session auflöst / keinen HTTP-Traffic serviert) die HTTP-spezifische Auth-Policy nicht.
  const procedureVersion = env["APP_PROCEDURE_VERSION"] ?? "1";
  // Katalog aus ALLEN Verfahren der Behörde (nicht nur einem) — server-autoritativ, je procedureId@version isoliert.
  const catalog = catalogFromStatusMachines(
    contracts.map((c) => ({
      procedureId: c.id,
      procedureVersion,
      statusMachine: c.statusMachine,
    })),
  );
  const initialStates = new Map(
    contracts.map((c) => [c.id, c.statusMachine.initial] as const),
  );
  // Automations-Store ZUERST: die In-Memory-Stores teilen GENAU DIESE Instanz, damit ein in-TX emittiertes Event in
  // demselben Store landet, aus dem die Engine via `claimDueEvents` liest (Postgres schreibt ohnehin in-TX in die DB).
  const automationStore =
    createAutomationStoreFromEnv(env) ?? new InMemoryAutomationStore();
  const caseStore =
    createCaseStoreFromEnv(env) ?? new InMemoryCaseStore({ automationStore });
  // WICHTIG: der In-Memory-TaskStore muss DENSELBEN CaseStore teilen, sonst schreibt `acceptIntake` den Fall in
  // eine private Map, die `executeCaseTransition` nie liest (Split-Brain → accept→transition ergäbe 404).
  const taskStore =
    createTaskStoreFromEnv(env) ??
    new InMemoryTaskStore({ caseStore, automationStore });
  // Zuständigkeits-Lesepfad + KI-Assistenz: In-Memory/heuristisch als sichere Defaults; PROD tauscht den KI-Port
  // gegen einen echten LLM-Adapter (derselbe `KiAssistPort`). KI bleibt strukturell assistiv.
  const actorRoleStore =
    createActorRoleStoreFromEnv(env) ?? new InMemoryActorRoleStore();
  // Benachrichtigungs-Store (#18): vom Notification-Projektor (2. Fan-out-Backend) gespeist, von /api/notifications
  // gelesen. In-Memory-Default teilt den Prozess; PROD nutzt den geteilten Postgres-Store.
  const notificationStore =
    createNotificationStoreFromEnv(env) ?? new InMemoryNotificationStore();
  const aiAssist = new HeuristicKiAssist();
  // Mandanten-Allowlist dieses Deployments (komma-separiert). Gesetzt ⇒ Tenant-Pinning (fail-closed, 403 bei
  // fremdem tenantId); leer/unset ⇒ keine Einschränkung (rückwärtskompatibel).
  const allowedTenants = (env["APP_ALLOWED_TENANTS"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    caseStore,
    taskStore,
    automationStore,
    notificationStore,
    actorRoleStore,
    aiAssist,
    catalog,
    resolveSession: headerSession,
    procedureVersion,
    procedureInitialState: (procedureId) => initialStates.get(procedureId),
    ...(allowedTenants.length > 0 ? { allowedTenants } : {}),
  };
}

export async function startRuntime(env: NodeJS.ProcessEnv = process.env) {
  const config = readRuntimeConfig(env);
  await assertStaticDir(config);
  const state = createRuntimeState();
  const metrics = new RuntimeMetrics();
  const domainApi = await buildDomainApiFromEnv(env);
  // Die Domain-API wird gleich ÜBER HTTP aktiv → JETZT die Header-Auth-Sperre prüfen (schließt den Header-Voll-Bypass
  // in PRODUCTION). Bewusst hier auf dem HTTP-Pfad, nicht in `buildDomainApiFromEnv` (der Worker teilt die Deps, aber
  // nicht diese HTTP-Policy).
  if (domainApi) assertHeaderAuthAllowed(env);
  const publicServer = buildPublicServer({
    config,
    state,
    metrics,
    ...(domainApi ? { domainApi } : {}),
  });
  const internalServer = buildInternalServer({ config, metrics });
  // Bindet nur EINER der beiden Server (z. B. internalPort belegt/kollidiert), MUSS der bereits gebundene wieder
  // geschlossen werden — sonst bliebe der Public-Port (inkl. gemounteter /api/*) offen + traffic-bedienend, während
  // der Prozess sich für „nicht gestartet" hält und der offene Socket den Event-Loop am Leben hält (Zombie).
  try {
    await Promise.all([
      publicServer.listen({ host: config.host, port: config.port }),
      internalServer.listen({ host: config.host, port: config.internalPort }),
    ]);
  } catch (error) {
    await Promise.allSettled([publicServer.close(), internalServer.close()]);
    throw error;
  }
  state.startupComplete = true;
  logInfo("runtime.started", {
    publicPort: config.port,
    internalPort: config.internalPort,
    staticDir: config.staticDir,
    config: redactedConfigSummary(config),
  });
  // DSGVO-Anker: die Datenschutz-Deklaration der Management-Ebene ist beim Start geprüft (assert) und auffindbar.
  if (domainApi?.taskStore) {
    logInfo("runtime.module.manifest", {
      module: pmModuleManifest.id,
      version: pmModuleManifest.version,
      dataCategories: pmModuleManifest.dataCategories,
      retentionPolicies: pmModuleManifest.retentionPolicies,
    });
  }

  // Automations-Poller: verarbeitet fällige Outbox-Events. BEWUSST opt-in (APP_AUTOMATION_POLL_MS>0) — ein
  // Template soll nicht überraschend im Hintergrund Fälle mutieren. Multi-Replica-sicher durch `FOR UPDATE SKIP
  // LOCKED` im Store. `unref()` hält den Prozess nicht künstlich am Leben; im Shutdown wird der Timer gestoppt.
  const automationTimer = startAutomationPoller(env, domainApi);
  // Notification-Projektor als 2. Consumer im selben Intervall (opt-in via APP_AUTOMATION_POLL_MS, nur mit Stores).
  const notificationTimer = startNotificationProjectorPoller(env, domainApi);

  const shutdown = async (signal: NodeJS.Signals) => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    if (automationTimer) clearInterval(automationTimer.timer);
    if (notificationTimer) clearInterval(notificationTimer.timer);
    logInfo("runtime.shutdown.started", { signal });
    const timeout = delay(config.shutdownTimeoutMs).then(() => "timeout");
    const closed = Promise.all([publicServer.close(), internalServer.close()])
      // Zuerst die HTTP-Server schließen (keine neuen Anfragen), DANN einen ggf. LAUFENDEN Automations-Tick abwarten
      // (Drain) — sonst reißt closePgPools den DB-Pool mitten in einem bereits geclaimten Event-Batch ab und die
      // geclaimten Events blieben ohne angewandte Effekte hängen. ERST DANN die DB-Pools freigeben.
      .then(() => automationTimer?.drain())
      .then(() => notificationTimer?.drain())
      .then(() => closePgPools())
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

/**
 * Startet den Automations-Poller, wenn `APP_AUTOMATION_POLL_MS > 0` und ein `automationStore` konfiguriert ist.
 * Ein Tick verarbeitet fällige Outbox-Events durch die geprüfte Domain-Kette. Überlappende Ticks werden per
 * `laeuft`-Flag verhindert; Fehler eines Ticks brechen den Poller nicht ab. Gibt den Timer zurück (oder `undefined`).
 */
/** Baut die `AutomationEngineDeps` aus den Domain-API-Deps — GETEILT vom in-process-Poller (Web-Prozess) und vom
 *  eigenständigen Worker-Prozess (`server/worker.ts`). Voraussetzung: `domainApi.automationStore` ist gesetzt. */
export function automationEngineDepsFrom(
  domainApi: DomainApiDeps,
): AutomationEngineDeps {
  if (!domainApi.automationStore)
    throw new Error("automationEngineDepsFrom: automationStore fehlt");
  return {
    automationStore: domainApi.automationStore,
    caseStore: domainApi.caseStore,
    ...(domainApi.taskStore ? { taskStore: domainApi.taskStore } : {}),
    policy: domainApi.policy ?? new DefaultDenyPolicyEngine(),
    catalog: domainApi.catalog,
    now: domainApi.now ?? (() => new Date().toISOString()),
    newId: domainApi.newId ?? (() => randomUUID()),
    procedureVersion: domainApi.procedureVersion ?? "1",
    // Dead-Letter-Obergrenze (#9): nach so vielen Claims ohne Abschluss wird ein Event als POISON quarantänt.
    maxAttempts: parsePositiveInt(
      process.env["APP_AUTOMATION_MAX_ATTEMPTS"],
      DEFAULT_MAX_ATTEMPTS,
    ),
  };
}

/** EIN Automations-Tick (Deadline-Scan → Outbox-Verarbeitung) mit Überlappungs-Schutz + strukturiertem Log. Geteilt
 *  von Poller und Worker, damit beide Betriebsarten EXAKT dieselbe Semantik haben. `laeuft` ist prozess-lokal; die
 *  ECHTE Nebenläufigkeits-Sicherheit über mehrere Prozesse/Replicas kommt aus `FOR UPDATE SKIP LOCKED` im Store. */
/** Steuert einen Automations-Tick: `run` startet ihn (überlappungs-geschützt), `drain` wartet auf einen GERADE
 *  laufenden Tick — für sauberes Shutdown, damit der DB-Pool NICHT mitten in einem bereits geclaimten Batch
 *  abgerissen wird (sonst bleiben geclaimte Events `processed_at != NULL` ohne angewandte Effekte hängen). */
export interface AutomationTickHandle {
  run: () => void;
  drain: () => Promise<void>;
}

export function automationTickRunner(
  engineDeps: AutomationEngineDeps,
  onSettled?: () => void,
): AutomationTickHandle {
  // `laeuft` hält die in-flight-Promise (statt eines Booleans), damit `drain()` sie abwarten kann.
  let laeuft: Promise<void> | null = null;
  const run = (): void => {
    if (laeuft) return; // kein überlappender Tick IM SELBEN Prozess
    laeuft = runAutomationTick(engineDeps)
      .then((r) => {
        if (r.scanned > 0)
          logInfo("runtime.automation.deadlines", { scanned: r.scanned });
        if (r.claimed > 0)
          logInfo("runtime.automation.tick", {
            claimed: r.claimed,
            applied: r.applied,
            blocked: r.blocked,
            skipped: r.skipped,
            failed: r.failed,
            deadLettered: r.deadLettered,
          });
      })
      .catch((error: unknown) => {
        logError("runtime.automation.error", { error: String(error) });
      })
      .finally(() => {
        laeuft = null;
        // NACH Tick-Abschluss — die Worker-Liveness misst so „Tick fertig", nicht „Timer gefeuert": ein dauerhaft
        // hängender Tick lässt den Heartbeat veralten (→ /livez 503 → K8s startet neu).
        onSettled?.();
      });
  };
  const drain = (): Promise<void> => laeuft ?? Promise.resolve();
  return { run, drain };
}

function startAutomationPoller(
  env: NodeJS.ProcessEnv,
  domainApi: DomainApiDeps | undefined,
): { timer: NodeJS.Timeout; drain: () => Promise<void> } | undefined {
  const pollMs = parseNonNegativeInt(env["APP_AUTOMATION_POLL_MS"], 0);
  if (pollMs <= 0 || !domainApi?.automationStore) return undefined;
  const runner = automationTickRunner(automationEngineDepsFrom(domainApi));
  const timer = setInterval(runner.run, pollMs);
  timer.unref();
  logInfo("runtime.automation.poller", { pollMs });
  return { timer, drain: runner.drain };
}

/** Überlappungs-geschützter Tick eines FAN-OUT-Consumers (#24) — analog `automationTickRunner`, aber über
 *  `runConsumerTick` (per-Consumer-Zustellung, rührt `processed_at`/die Engine NICHT an). GETEILT von Poller + Worker. */
export function consumerTickRunner(
  automationStore: AutomationStore,
  consumer: ConsumerHandle,
  now: () => string,
  onSettled?: () => void,
): AutomationTickHandle {
  let laeuft: Promise<void> | null = null;
  const run = (): void => {
    if (laeuft) return; // kein überlappender Tick IM SELBEN Prozess
    laeuft = runConsumerTick(automationStore, consumer, { now })
      .then((r) => {
        if (r.claimed > 0)
          logInfo("runtime.consumer.tick", {
            consumer: consumer.id,
            claimed: r.claimed,
            delivered: r.delivered,
            deadLettered: r.deadLettered,
            failed: r.failed,
          });
      })
      .catch((error: unknown) =>
        logError("runtime.consumer.error", {
          consumer: consumer.id,
          error: String(error),
        }),
      )
      .finally(() => {
        laeuft = null;
        onSettled?.();
      });
  };
  return { run, drain: () => laeuft ?? Promise.resolve() };
}

/** Startet den Notification-Projektor als 2. Fan-out-Consumer im GLEICHEN Poll-Intervall wie die Engine. NUR aktiv,
 *  wenn ein Automations- UND ein Notification-Store konfiguriert ist (additiv/guarded; ohne Store keine Projektion). */
function startNotificationProjectorPoller(
  env: NodeJS.ProcessEnv,
  domainApi: DomainApiDeps | undefined,
): { timer: NodeJS.Timeout; drain: () => Promise<void> } | undefined {
  const pollMs = parseNonNegativeInt(env["APP_AUTOMATION_POLL_MS"], 0);
  if (
    pollMs <= 0 ||
    !domainApi?.automationStore ||
    !domainApi.notificationStore
  )
    return undefined;
  const now = domainApi.now ?? (() => new Date().toISOString());
  const runner = consumerTickRunner(
    domainApi.automationStore,
    notificationProjector(domainApi.notificationStore),
    now,
  );
  const timer = setInterval(runner.run, pollMs);
  timer.unref();
  logInfo("runtime.notification.projector", { pollMs });
  return { timer, drain: runner.drain };
}

/** Deutschsprachige Titel je Status (RFC-9457 `title`). Fehlt einer, greift ein generischer Fallback. */
const PROBLEM_TITLES: Record<number, string> = {
  400: "Ungültige Anfrage",
  401: "Nicht authentifiziert",
  403: "Nicht berechtigt",
  404: "Nicht gefunden",
  405: "Methode nicht erlaubt",
  409: "Konflikt",
  413: "Anfrage zu groß",
  415: "Nicht unterstützter Medientyp",
  422: "Nicht verarbeitbar",
  429: "Zu viele Anfragen",
};

/**
 * Zentrale Fehlerbehandlung als RFC-9457 `application/problem+json`. SANITISIERT: bei 5xx wird niemals die interne
 * Fehlermeldung/der Stack an den Client geleakt (nur eine generische Meldung); der echte Fehler landet server-seitig
 * im strukturierten Log samt Korrelations-Id (`request.id`). 4xx (z. B. Fastify-Validierung) dürfen eine knappe
 * Ursache im `detail` nennen. Die Domain-API sendet ihre erwarteten 4xx selbst — hier landet nur Ungeplantes.
 */
function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    const err = error as { statusCode?: unknown; message?: unknown };
    const status =
      typeof err.statusCode === "number" && err.statusCode >= 400
        ? err.statusCode
        : 500;
    const message = typeof err.message === "string" ? err.message : "";
    const title =
      PROBLEM_TITLES[status] ??
      (status >= 500 ? "Interner Serverfehler" : "Fehler");
    if (status >= 500) {
      logError("runtime.request.error", {
        requestId: request.id,
        route: request.routeOptions.url ?? routeForMetrics(request.url),
        error: message || String(error),
      });
    }
    const problem: Record<string, unknown> = {
      type: "about:blank",
      title,
      status,
      instance: request.id,
    };
    // Ursache nur für Client-Fehler (4xx) offenlegen — nie bei 5xx (Sanitisierung).
    if (status < 500 && message) problem["detail"] = message;
    return reply
      .code(status)
      .header("Cache-Control", NO_STORE)
      .type("application/problem+json")
      .send(problem);
  });
}

/**
 * Fixed-Window-Zähler mit BESCHRÄNKTER Kardinalität (max. `RATE_LIMIT_MAX_KEYS` Schlüssel) — verhindert selbst einen
 * Speicher-DoS über viele verschiedene Schlüssel. Dependency-frei (kein @fastify/rate-limit). Schlüssel = actorId
 * (aus `x-actor-id`) bzw. Client-IP. Nur auf /api/* angewandt; statische Assets/Health bleiben unlimitiert.
 */
class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Registriert einen Treffer. `null` = erlaubt; `{ retryAfterSeconds }` = überschritten (429). */
  check(key: string, nowMs: number): { retryAfterSeconds: number } | null {
    if (this.max <= 0) return null;
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= nowMs) {
      if (this.hits.size >= RATE_LIMIT_MAX_KEYS) this.hits.clear();
      entry = { count: 0, resetAt: nowMs + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > this.max) {
      return { retryAfterSeconds: Math.ceil((entry.resetAt - nowMs) / 1000) };
    }
    return null;
  }
}

function registerPublicHooks(
  app: FastifyInstance,
  config: RuntimeConfig,
  metrics: RuntimeMetrics,
) {
  const limiter = new RateLimiter(
    config.rateLimitMax,
    config.rateLimitWindowMs,
  );
  app.addHook("onRequest", async (request, reply) => {
    // `request.id` = die Korrelations-Id (genReqId) — eine Wahrheit für Audit, Access-Log und Client-Header.
    reply.header("X-Request-ID", request.id);
    applySecurityHeaders(reply, config);
    if (!hostAllowed(request, config)) {
      logAudit("runtime.security.host_denied", {
        host: readHeader(request, "host") ?? "",
        requestId: request.id,
      });
      return reply
        .code(421)
        .header("Cache-Control", NO_STORE)
        .send({ status: "misdirected-request" });
    }
    // Rate-Limit nur auf die Domain-API (mutierend/teuer); Assets + Health bleiben frei. Schlüssel = NETZWERK-Identität
    // (`request.ip`, `trustProxy`-korrekt) — NICHT der client-setzbare `x-actor-id`-Header: der wäre trivial umgehbar
    // (jede Anfrage ein neuer „Actor") UND als Waffe nutzbar (fremden Actor gezielt aussperren).
    if (config.rateLimitMax > 0 && request.url.startsWith("/api/")) {
      const key = request.ip;
      const limited = limiter.check(key, Date.now());
      if (limited) {
        logAudit("runtime.security.rate_limited", {
          key,
          route: routeForMetrics(request.url),
          requestId: request.id,
        });
        return reply
          .code(429)
          .header("Cache-Control", NO_STORE)
          .header("Retry-After", String(limited.retryAfterSeconds))
          .type("application/problem+json")
          .send({
            type: "about:blank",
            title: PROBLEM_TITLES[429],
            status: 429,
            instance: request.id,
          });
      }
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    // Fastify liefert die verstrichene Zeit (ms) — kein eigener Zeitstempel/WeakMap nötig.
    const durationSeconds = reply.elapsedTime / 1000;
    const route = request.routeOptions.url ?? routeForMetrics(request.url);
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
      durationMs: Math.round(reply.elapsedTime),
      requestId: request.id,
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
  const branding = brandingBlock(env);
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
    // Optionales White-Labeling (Skalierungsplan #4): nur wenn APP_BRAND_* gesetzt ist — sonst entfällt der Block
    // (Ausgabe byte-stabil, rückwärtskompatibel). Der Client (RuntimeConfigProvider) macht daraus ein KommuneTheme.
    ...(branding ? { branding } : {}),
    delivery: {
      publicBaseUrl: publicBaseUrl ?? "",
      serviceWorkerEnabled,
    },
  };
}

/** Optionaler `branding`-Block aus `APP_BRAND_*` — übernimmt NUR gesetzte Schlüssel; keiner gesetzt ⇒ `undefined`
 *  (der Block entfällt in `buildPublicRuntimeConfig`). Flach, passend zu `RuntimeBranding` im Client
 *  (apps/fachverfahren/src/runtime-config.tsx). */
function brandingBlock(
  env: NodeJS.ProcessEnv,
): Record<string, unknown> | undefined {
  const b: Record<string, unknown> = {};
  const put = (key: string, value: string | undefined): void => {
    if (value !== undefined && value !== "") b[key] = value;
  };
  put("name", env["APP_BRAND_NAME"]);
  put("primary", env["APP_BRAND_PRIMARY"]);
  put("accent", env["APP_BRAND_ACCENT"]);
  put("surface", env["APP_BRAND_SURFACE"]);
  put("logoSrc", env["APP_BRAND_LOGO_URL"]);
  put("logoAlt", env["APP_BRAND_LOGO_ALT"]);
  put("logoHref", env["APP_BRAND_LOGO_HREF"]);
  put("sourceUrl", env["APP_BRAND_SOURCE_URL"]);
  const verified = env["APP_BRAND_SOURCE_VERIFIED"];
  if (verified !== undefined && verified !== "") {
    b["sourceVerifiziert"] = parseBoolean(verified, false);
  }
  return Object.keys(b).length > 0 ? b : undefined;
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

/** Wie `parsePositiveInt`, erlaubt aber 0 (z. B. Rate-Limit „aus"). */
export function parseNonNegativeInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`invalid non-negative integer value: ${raw}`);
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
  if (pathname.startsWith("/api/")) return "/api/*";
  // BOUNDED Kardinalität: ein Angreifer, der /x1.a, /x2.b, … abruft, darf die Metrik-Map NICHT unbegrenzt wachsen
  // lassen (Speicher-DoS, verschärft durch HPA). Extension-Pfade fallen in EINEN Bucket statt je die volle pathname.
  if (path.extname(pathname)) return "static";
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

export function logInfo(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

export function logError(event: string, fields: Record<string, unknown>) {
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
    // process.exit statt nur exitCode: ein bei partiellem Bind noch offener Socket/Handle hielte den Event-Loop
    // sonst am Leben → der Prozess terminierte nie (halb-gestarteter Zombie), statt sauber neu zu starten.
    process.exit(1);
  });
}
