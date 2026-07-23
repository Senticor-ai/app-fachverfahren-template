// config — Runtime-Konfiguration der neutralen Web-Delivery-Runtime. Domain-Identität
// (Static-Dir-Fallback, applicationId, displayName) ist bewusst PARAMETER der App
// (RuntimeConfigOverrides): das Paket bleibt frei von Domain-Literalen, damit
// Template-Updates es wholesale ersetzen können, ohne Konsumenten zu brechen.
import path from "node:path";

export const DEFAULT_MAX_BODY_BYTES = 1_048_576;
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export type CspMode = "enforce" | "report-only";

export interface BuildInfo {
  version: string;
  gitSha: string;
  buildTime: string;
  imageDigest: string;
}

export interface RuntimeConfig {
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

/** App-Identität und Pfad-Defaults, die vor der Extraktion als Domain-Literale im
 *  App-Server standen. Env-Variablen (STATIC_DIR, APP_APPLICATION_ID, APP_DISPLAY_NAME)
 *  gewinnen weiterhin gegenüber diesen Fallbacks. */
export interface RuntimeConfigOverrides {
  defaultStaticDir?: string;
  applicationId?: string;
  displayName?: string;
}

export function readRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeConfigOverrides = {},
): RuntimeConfig {
  const staticDir = path.resolve(
    env["STATIC_DIR"] ??
      overrides.defaultStaticDir ??
      path.join(process.cwd(), "dist"),
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
      overrides,
    }),
  };
}

function buildPublicRuntimeConfig(
  env: NodeJS.ProcessEnv,
  {
    serviceWorkerEnabled,
    publicBaseUrl,
    buildInfo,
    overrides,
  }: {
    serviceWorkerEnabled: boolean;
    publicBaseUrl: string | undefined;
    buildInfo: BuildInfo;
    overrides: RuntimeConfigOverrides;
  },
): Record<string, unknown> {
  return {
    schemaVersion: "public-runtime.v1",
    application: {
      applicationId:
        env["APP_APPLICATION_ID"] ?? overrides.applicationId ?? "app",
      displayName: env["APP_DISPLAY_NAME"] ?? overrides.displayName ?? "App",
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
    // ZONE (BSI-Netzsegmentierung): die Flächen, die DIESE Instanz servieren darf — aus dem Deploy-Env ZONE_SURFACES
    // (dieselbe readZoneModel-Wahrheit wie die Netz-Segmentierung + das BFF-Route-Gate). Das Frontend blendet Flächen
    // außerhalb dieser Menge aus (Experience-Filter). Das SIGNAL ist die PRÄSENZ des Schlüssels, NICHT sein Inhalt: fehlt
    // ZONE_SURFACES ⇒ KEIN `zone`-Feld ⇒ das Frontend läuft fail-open (ALLE Flächen, Ein-App). Gesetzt (auch "") ⇒ zoniert:
    // `allowedSurfaces` (leer bei einer reinen Struktur-Zone ⇒ das Frontend zeigt KEINE Fläche, NIE fail-open).
    ...(env["ZONE_SURFACES"] === undefined
      ? {}
      : {
          zone: {
            id: env["ZONE"]?.trim() ?? "",
            allowedSurfaces: env["ZONE_SURFACES"]
              .split(",")
              .map((surface) => surface.trim())
              .filter(Boolean),
          },
        }),
  };
}

export function redactedConfigSummary(config: RuntimeConfig) {
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
