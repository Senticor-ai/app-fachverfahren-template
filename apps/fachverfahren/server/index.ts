// server/index — DÜNNE Komposition über @senticor/app-runtime-fastify: die neutrale
// Web-Delivery-Runtime (Config, Dual-Port, Health, Static, Security-Header, Metrics,
// Shutdown) lebt im Paket; hier stehen nur App-Identität, Store-Konstruktion und die
// Registrierung der App-Routen über die Registrar-Naht. Die Exporte bleiben stabil
// (index.test.ts, tests/e2e/personas.e2e.test.ts importieren sie).
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import {
  appBff,
  registerOpenApiCollector,
  registerOpenApiRoute,
  type BescheidPdfRenderer,
  type BffSurface,
} from "@senticor/app-bff-fastify";
import { renderBescheidPdf } from "./bescheid/pdf.js";
import {
  buildInternalServer as buildRuntimeInternalServer,
  buildPublicServer as buildRuntimePublicServer,
  createAuditSinkFromEnv,
  logError,
  logInfo,
  readRuntimeConfig as readRuntimeConfigBase,
  startRuntime as startRuntimeBase,
  type AuditSink,
  type RunningRuntime,
  type RuntimeConfig,
  type RuntimeMetrics,
  type RuntimeState,
  type SessionResolver,
} from "@senticor/app-runtime-fastify";
import {
  createAppStoreFromEnv,
  createAuditStoreFromEnv,
  createAuthStoreFromEnv,
  createCaseStoreFromEnv,
  createKanbanStoreFromEnv,
  createTaskStoreFromEnv,
  createWissenStoreFromEnv,
  type AppStore,
  type AuditStore,
  type AuthStore,
  type CaseStore,
  type KanbanStore,
  type TaskStore,
  type WissenStore,
} from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureRegistry,
} from "@senticor/public-sector-sdk";
import type { AiAssistPort } from "@senticor/platform-contracts";
import type { FastifyInstance } from "fastify";
import { registerAuditRoutes } from "./audit/routes.js";
import { createAiAssistPortFromEnv } from "./platform/ai-assist.js";
import { autoBootstrapAdminFromEnv } from "./auth/auto-bootstrap.js";
import { registerAuthPolicyGuard } from "./auth/authorization.js";
import { registerAuthRoutes, type RegistrationMode } from "./auth/routes.js";
import { oidcConfigFromEnv, type OidcConfig } from "./auth/oidc-routes.js";
import { createCookieSessionResolver } from "./auth/session-resolver.js";
import { seedReferenceDemo } from "./dev/reference-seed.js";
import { seedGoldenMesh } from "./dev/golden-fixture.js";
import { registerBoardRoutes } from "./kanban/routes.js";
import { antragProcedure, dossierProcedure } from "./procedure.config.js";
import { registerUserRoutes } from "./users/routes.js";

// App-Identität: der Renderer schreibt Domain-Token beim Scaffolding um — deshalb stehen
// sie HIER (consumer-seitig) und nicht im template-verwalteten Runtime-Paket.
//
// STATIC-DIR MODUL-RELATIV, NICHT cwd-relativ: eine App darf NICHT davon abhängen, aus WELCHEM Verzeichnis sie
// gestartet wird. Die Vorfassung nahm `process.cwd()` = Repo-Wurzel an — aber `start` ist `node dist-server/index.js`
// und läuft aus dem APP-Verzeichnis. Ergebnis: apps/fachverfahren + "apps/fachverfahren/dist" = VERDOPPELT →
// „ENOENT … /apps/fachverfahren/apps/fachverfahren/dist/index.html" → runtime.startup.failed → die App bootet NICHT
// (am E2E-Lauf belegt: Boot-Smoke ✗ health 500). Das Modul kennt seinen eigenen Ort: dist-server/index.js → ../dist
// und server/index.ts (dev) → ../dist treffen BEIDE das richtige Verzeichnis, unabhängig von der cwd.
const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // dist-server/… bzw. server/… → App-Wurzel
const APP_IDENTITY = {
  defaultStaticDir: path.join(APP_DIR, "dist"),
  applicationId: "fachverfahren",
  displayName: "Fachverfahren",
};

/** ZONEN-ROUTE-ENFORCEMENT: die erlaubten Flächen dieser Instanz aus dem Deploy-Env ZONE_SURFACES (csv, aus derselben
 *  readZoneModel-Wahrheit wie die Netz-Segmentierung). Das SIGNAL ist die PRÄSENZ des Env-Schlüssels, NICHT sein Inhalt
 *  (Wurzel eines Green-Wash-Befunds): der Deploy setzt ZONE_SURFACES auf JEDEM zonierten Pod (auch "" für eine reine
 *  STRUKTUR-Zone). Also:
 *    • Schlüssel FEHLT      ⇒ undefined ⇒ NICHT zoniert ⇒ fail-open (ALLE Familien = heutiger Ein-App-Zustand).
 *    • Schlüssel GESETZT="" ⇒ [] ⇒ zonierte Struktur-Zone ⇒ KEINE Fläche (nur Infra) — NIE fail-open.
 *    • Schlüssel="buerger,…"⇒ die kanonischen Flächen (unbekannte Tokens still verworfen ⇒ ggf. []). */
const ZONE_SURFACE_KANON: readonly BffSurface[] = [
  "buerger",
  "sachbearbeitung",
  "aufsicht",
];
function parseZoneSurfaces(
  env: NodeJS.ProcessEnv,
): readonly BffSurface[] | undefined {
  const raw = env["ZONE_SURFACES"];
  if (raw === undefined) return undefined; // Schlüssel nicht gesetzt ⇒ keine Zonen-Trennung (fail-open)
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is BffSurface =>
      (ZONE_SURFACE_KANON as readonly string[]).includes(s),
    );
}

/** Self-Signup-Politik aus der Env: default AUS; `open_unverified` heißt ehrlich so,
 *  bis E-Mail-Verifikation existiert. Unbekannte Werte fallen GESCHLOSSEN zurück. */
function parseRegistrationMode(value: string | undefined): RegistrationMode {
  if (value === "open_unverified") {
    // Der Default-Rate-Limiter zählt im Prozess: bei mehreren App-Instanzen drosselt
    // jede für sich — für Multi-Instanz-Deployments einen verteilten RateLimiter
    // konfigurieren (auth/rate-limit.ts).
    console.warn(
      "[auth] AUTH_REGISTRATION_MODE=open_unverified: Registrierung ist OFFEN (ohne E-Mail-Verifikation); In-Memory-Rate-Limiter trägt nur Single-Process-Deployments.",
    );
    return "open_unverified";
  }
  return "disabled";
}

export function readRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return readRuntimeConfigBase(env, APP_IDENTITY);
}

interface AppStores {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
}

interface BffWiring {
  appStore: AppStore;
  caseStore: CaseStore;
  taskStore: TaskStore;
  /** Verfahrens-Wissens-Store (Verfahrens-Wiki), per Env gewählt — wie jeder andere Store. Ohne diesen
   *  Durchstich fiele appBff auf einen plugin-internen, ephemeren In-Memory-Store zurück (folgte nie dem
   *  APP_STORE_MODE und wäre nicht seedbar). */
  wissenStore: WissenStore;
  procedureRegistry: ProcedureRegistry;
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
  /** KI-Assistenz-Port, per Env gewählt (local-fake ODER echter Adapter). */
  aiAssist: AiAssistPort;
  /** Bescheid-PDF-Renderer (pdf-lib, template-getrieben) — App-seitige Impl hinter dem BFF-Port (#60). */
  bescheidPdf?: BescheidPdfRenderer;
  /** Erlaubte Flächen dieser Zone (aus ZONE_SURFACES) — undefined ⇒ keine Zonen-Trennung (fail-open). */
  allowedSurfaces?: readonly BffSurface[];
}

function registerAppRoutes(
  app: FastifyInstance,
  stores: AppStores,
  policy: {
    bootstrapToken: string | undefined;
    registrationMode: RegistrationMode;
    oidcConfig?: OidcConfig;
  },
  bff: BffWiring,
): void {
  // K2: /auth-/api-Route ohne Autorisierungs-Policy = Boot-Fehler, nicht erst Test-Rot.
  registerAuthPolicyGuard(app);
  app.register(fastifyCookie);
  // Collector VOR den BFF-Routen — der onRoute-Kollektor von @fastify/swagger sieht
  // nur später registrierte Routen (Reihenfolge-Vertrag, openapi.test.ts im Paket).
  registerOpenApiCollector(app);
  registerAuthRoutes(app, {
    authStore: stores.authStore,
    kanbanStore: stores.kanbanStore,
    auditStore: stores.auditStore,
    bootstrapToken: policy.bootstrapToken,
    registrationMode: policy.registrationMode,
    ...(policy.oidcConfig ? { oidcConfig: policy.oidcConfig } : {}),
  });
  registerBoardRoutes(app, stores);
  registerUserRoutes(app, stores);
  registerAuditRoutes(app, {
    authStore: stores.authStore,
    auditStore: stores.auditStore,
  });
  app.register(appBff, bff);
}

export function buildPublicServer({
  config = readRuntimeConfig(),
  state,
  metrics,
  authStore = createAuthStoreFromEnv(),
  kanbanStore = createKanbanStoreFromEnv(),
  auditStore = createAuditStoreFromEnv(),
  appStore = createAppStoreFromEnv(),
  caseStore = createCaseStoreFromEnv(),
  taskStore = createTaskStoreFromEnv(),
  wissenStore = createWissenStoreFromEnv(),
  // Verfahren-Registry: DEFAULT LEER (fail-closed — ohne Verfahren kein Fall). Der Consumer/Generator
  // (leistung.config → ProcedureVersion, ADR-0002) füllt sie; in PROD kann chos sie hinter der Naht liefern.
  procedureRegistry = createInMemoryProcedureRegistry([]),
  sessionResolver,
  auditSink = createAuditSinkFromEnv(),
  aiAssist = createAiAssistPortFromEnv(),
  bootstrapToken = process.env["BOOTSTRAP_TOKEN"],
  registrationMode = parseRegistrationMode(
    process.env["AUTH_REGISTRATION_MODE"],
  ),
  oidcConfig = oidcConfigFromEnv(),
  allowedSurfaces = parseZoneSurfaces(process.env),
}: {
  config?: RuntimeConfig;
  state?: RuntimeState;
  metrics?: RuntimeMetrics;
  authStore?: AuthStore;
  kanbanStore?: KanbanStore;
  auditStore?: AuditStore;
  appStore?: AppStore;
  caseStore?: CaseStore;
  taskStore?: TaskStore;
  wissenStore?: WissenStore;
  procedureRegistry?: ProcedureRegistry;
  sessionResolver?: SessionResolver;
  auditSink?: AuditSink;
  aiAssist?: AiAssistPort;
  bootstrapToken?: string | undefined;
  registrationMode?: RegistrationMode;
  oidcConfig?: OidcConfig;
  allowedSurfaces?: readonly BffSurface[] | undefined;
} = {}): FastifyInstance {
  return buildRuntimePublicServer({
    config,
    ...(state ? { state } : {}),
    ...(metrics ? { metrics } : {}),
    registerRoutes: (app) =>
      registerAppRoutes(
        app,
        { authStore, kanbanStore, auditStore },
        {
          bootstrapToken,
          registrationMode,
          ...(oidcConfig ? { oidcConfig } : {}),
        },
        {
          appStore,
          caseStore,
          taskStore,
          wissenStore,
          procedureRegistry,
          // Default: der ECHTE Cookie/AuthStore-Flow (deny-by-default) — Tests
          // injizieren Stubs über den Parameter.
          sessionResolver:
            sessionResolver ?? createCookieSessionResolver(authStore),
          auditSink,
          aiAssist,
          ...(allowedSurfaces ? { allowedSurfaces } : {}),
        },
      ),
  });
}

export function buildInternalServer({
  config = readRuntimeConfig(),
  metrics,
  publicServer,
}: {
  config?: RuntimeConfig;
  metrics?: RuntimeMetrics;
  /** Mit Referenz auf den public Server liefert der interne Port zusätzlich
   *  GET /internal/openapi.json (dort gesammeltes Dokument) aus. */
  publicServer?: FastifyInstance;
} = {}): FastifyInstance {
  return buildRuntimeInternalServer({
    config,
    ...(metrics ? { metrics } : {}),
    ...(publicServer
      ? {
          registerRoutes: (app: FastifyInstance) =>
            registerOpenApiRoute(app, publicServer),
        }
      : {}),
  });
}

export async function startRuntime(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunningRuntime> {
  const authStore = createAuthStoreFromEnv(env);
  const kanbanStore = createKanbanStoreFromEnv(env);
  const auditStore = createAuditStoreFromEnv(env);
  const stores = { authStore, kanbanStore, auditStore };
  const oidcConfig = oidcConfigFromEnv(env);
  const policy = {
    bootstrapToken: env["BOOTSTRAP_TOKEN"],
    registrationMode: parseRegistrationMode(env["AUTH_REGISTRATION_MODE"]),
    ...(oidcConfig ? { oidcConfig } : {}),
  };
  const allowedSurfaces = parseZoneSurfaces(env);
  const bff: BffWiring = {
    appStore: createAppStoreFromEnv(env),
    caseStore: createCaseStoreFromEnv(env),
    taskStore: createTaskStoreFromEnv(env),
    wissenStore: createWissenStoreFromEnv(env),
    // Der Runtime-Entrypoint registriert das Verfahren aus der procedure.config-Naht (der generische
    // buildPublicServer-Default bleibt fail-closed/leer — Unit-Tests injizieren ihre eigene Registry).
    // Eine generierende App überschreibt procedure.config.ts; in PROD kann chos die Naht liefern.
    // BEIDE Verfahrens-Arten: das Dossier-Verfahren (Fall/Akte) UND das Antrags-Verfahren (aus
    // leistung.config abgeleitet, drift-gesichert) — sonst liefe ein Bürger-Antrag in „unknown procedure".
    procedureRegistry: createInMemoryProcedureRegistry([
      dossierProcedure,
      antragProcedure,
    ]),
    sessionResolver: createCookieSessionResolver(authStore),
    auditSink: createAuditSinkFromEnv(env),
    // Port-Registry: KI-Anbieter per Env (local-fake default; AI_ASSIST_PROVIDER=ollama für den echten Adapter).
    aiAssist: createAiAssistPortFromEnv(env),
    // Bescheid-PDF-Renderer (pdf-lib, template-getrieben) — App-seitige Impl hinter dem BFF-Port (#60).
    bescheidPdf: renderBescheidPdf,
    // Zonen-Route-Enforcement: nur die Flächen dieser Zone (ZONE_SURFACES) — undefined ⇒ alle (fail-open).
    ...(allowedSurfaces ? { allowedSurfaces } : {}),
  };
  return startRuntimeBase({
    env,
    configOverrides: APP_IDENTITY,
    registerPublicRoutes: (app) => registerAppRoutes(app, stores, policy, bff),
    registerInternalRoutes: (app, context) =>
      registerOpenApiRoute(app, context.publicServer),
    // Fresh-Deployment-Akzeptanz: mit AUTH_BOOTSTRAP_ADMIN_* entsteht der Admin samt
    // Team-Discovery-Board beim Start — idempotent, wirft nie (Fehler landen im Log).
    beforeListen: async () => {
      const log = (
        level: "info" | "error",
        event: string,
        fields: Record<string, unknown>,
      ): void => {
        if (level === "error") logError(event, fields);
        else logInfo(event, fields);
      };
      await autoBootstrapAdminFromEnv({
        authStore,
        kanbanStore,
        auditStore,
        env,
        log,
      });
      // DEV-Komfort NUR im ephemeren In-Memory-Modus: ein anmeldbarer Sachbearbeitungs-Account + ein
      // synthetisches Demo-Dossier (Fall + Ziele/Schritte/Termine), damit die Referenz-App den Integrations-
      // management-Dossier-Flow ohne Postgres sofort zeigt. In PROD (Postgres) NIE. Idempotent, wirft nie.
      if (env["APP_STORE_MODE"] === "memory") {
        await seedReferenceDemo({
          authStore,
          kanbanStore,
          caseStore: bff.caseStore,
          taskStore: bff.taskStore,
          appStore: bff.appStore,
          env,
          log,
        });
        // Die Golden Fixture ergänzt das Demo-Dossier um die MESH-Ebene (Blackboard-Vermerke inkl. offenem
        // KI-Entwurf + Verfahrens-Wissen) — dieselbe Wahrheit, die Selbsttest und Agenten-CLI fahren. So zeigt
        // die Live-DEV-App den vollen Mesh-Fluss (lesen · prüfen · exportieren) sofort. Idempotent, wirft nie.
        await seedGoldenMesh({
          caseStore: bff.caseStore,
          wissenStore: bff.wissenStore,
          taskStore: bff.taskStore,
          log,
        });
      }
    },
  });
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
