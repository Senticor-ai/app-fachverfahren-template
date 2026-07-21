// plugin — der BFF als Fastify-Plugin. BEWUSST NICHT fp()-gewrappt: der gekapselte
// setErrorHandler (400-Envelope für Validation-Fehler, 500-Envelope sonst) gilt dadurch
// NUR für die BFF-Routen — App-Routen (/auth/*, /api/v1/*) behalten ihre Fehlerform.
// Kein console.* in diesem Paket: Denials laufen über die AuditSink, technische Fehler
// über request.log (in der Runtime bewusst still).
import type { FastifyError, FastifyInstance } from "fastify";
import { builtInRbacRegistry } from "@senticor/public-sector-sdk";
import type { AuditSink, SessionResolver } from "@senticor/app-runtime-fastify";
import {
  InMemoryWissenStore,
  type AppStore,
  type CaseStore,
  type TaskStore,
  type WissenStore,
} from "@senticor/app-store-postgres";
import type {
  ProcedureRegistry,
  RbacRegistry,
} from "@senticor/public-sector-sdk";
import {
  createLocalAiAssistPort,
  createLocalBlobStoragePort,
  createLocalEvidenceRetrievalPort,
  createLocalIdentityAndTrustPort,
  createLocalMailboxPort,
  createLocalPaymentPort,
  type AiAssistPort,
  type BlobStoragePort,
  type EvidenceRetrievalPort,
  type IdentityAndTrustPort,
  type MailboxPort,
  type PaymentPort,
} from "@senticor/platform-contracts";
import type { BescheidPdfRenderer, BffDeps } from "./deps.js";
import { requestIdOf } from "./route-auth.js";
import { registerAiAssistRoutes } from "./routes/ai-assist.js";
import { registerPaymentRoutes } from "./routes/payment.js";
import { registerIdentityRoutes } from "./routes/identity.js";
import { registerZustellungRoutes } from "./routes/zustellung.js";
import { registerRegisterRoutes } from "./routes/register.js";
import { registerCapabilitiesRoute } from "./routes/capabilities.js";
import { registerBuergerRoutes } from "./routes/buerger.js";
import { registerCaseRoutes } from "./routes/cases.js";
import { registerMailboxRoutes } from "./routes/mailbox.js";
import { registerPreferencesRoutes } from "./routes/preferences.js";
import { registerSessionRoute } from "./routes/session.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerVerfahrenWissenRoutes } from "./routes/verfahren-wissen.js";
import { registerVermerkRoutes } from "./routes/vermerke.js";

export interface AppBffOptions {
  appStore: AppStore;
  caseStore: CaseStore;
  taskStore: TaskStore;
  procedureRegistry: ProcedureRegistry;
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
  rbacRegistry?: RbacRegistry;
  /** KI-Assistenz-Port. OPTIONAL: fehlt er, nutzt der BFF den local-fake (deterministisch, ohne Netz) —
   *  eine App wählt in der Komposition per Env den echten Adapter. */
  aiAssist?: AiAssistPort;
  /** Zahlungs-Port (ePayBL). OPTIONAL: fehlt er, nutzt der BFF den local-fake (deterministischer Roundtrip,
   *  ohne Netz) — eine App wählt in der Komposition per Env den echten Adapter. */
  payment?: PaymentPort;
  /** Identitäts-/Vertrauens-Port (BundID/eID). OPTIONAL: fehlt er, nutzt der BFF den local-fake (liest das
   *  Subjekt aus der Sitzung) — eine App wählt in der Komposition per Env den echten Adapter. */
  identityAndTrust?: IdentityAndTrustPort;
  /** Bescheid-Zustellungs-Port (De-Mail/eBO). OPTIONAL: fehlt er, nutzt der BFF den local-fake (sofort
   *  "delivered") — eine App wählt in der Komposition per Env den echten Adapter. */
  mailbox?: MailboxPort;
  /** Register-/Nachweis-Abruf-Port (NOOTS/Once-Only). OPTIONAL: fehlt er, nutzt der BFF den local-fake
   *  (synthetischer Nachweis) — eine App wählt in der Komposition per Env den echten Adapter. */
  evidenceRetrieval?: EvidenceRetrievalPort;
  /** Byte-Storage-Port. OPTIONAL: fehlt er, nutzt der BFF den In-Memory-Fake. */
  blobStorage?: BlobStoragePort;
  /** Verfahrens-Wiki-Store. OPTIONAL: fehlt er, nutzt der BFF den In-Memory-Store. */
  wissenStore?: WissenStore;
  /** Bescheid-PDF-Renderer (pdf-lib). OPTIONAL: fehlt er, liefert die `.pdf`-Route 501 — der JSON-/BescheidView-
   *  Pfad bleibt unberührt. KEIN local-fake, weil das PDF-Rendering App-seitig (asset-nah) verortet ist. */
  bescheidPdf?: BescheidPdfRenderer;
  /** ZONEN-ROUTE-ENFORCEMENT (BSI-Netzsegmentierung, Angriffsflächen-Reduktion): die Flächen, die DIESE Instanz servieren
   *  darf — aus dem Deploy-Env ZONE_SURFACES (aus derselben readZoneModel-Wahrheit wie die Netz-Segmentierung). Eine
   *  Routen-Familie wird NUR registriert, wenn ihre Flächen diese Menge schneiden (Infra-Familien ohne Flächen-Tag immer).
   *  UNDEFINED ⇒ keine Zonen-Trennung deklariert ⇒ ALLE Familien (heutiger Ein-App-Zustand, fail-open). RBAC bleibt die
   *  PRIMÄRE Autorisierung INNERHALB der Zone — dies ist die zusätzliche, gröbere Grenze (Back-Office nie in der Bürger-Zone). */
  allowedSurfaces?: readonly BffSurface[];
}

/** Die Flächen-Vokabular-Kontrakt mit dem Deploy-Env ZONE_SURFACES (= Engine SURFACE_KEYS). Bewusst lokal literal, damit
 *  der BFF kein Domänen-/Persona-Paket importieren muss; die drei kanonischen Verfahrens-Flächen sind stabil. */
export type BffSurface = "buerger" | "sachbearbeitung" | "aufsicht";

export async function appBff(
  app: FastifyInstance,
  opts: AppBffOptions,
): Promise<void> {
  const deps: BffDeps = {
    appStore: opts.appStore,
    caseStore: opts.caseStore,
    taskStore: opts.taskStore,
    procedureRegistry: opts.procedureRegistry,
    sessionResolver: opts.sessionResolver,
    auditSink: opts.auditSink,
    rbacRegistry: opts.rbacRegistry ?? builtInRbacRegistry,
    aiAssist: opts.aiAssist ?? createLocalAiAssistPort(),
    payment: opts.payment ?? createLocalPaymentPort(),
    identityAndTrust:
      opts.identityAndTrust ?? createLocalIdentityAndTrustPort(),
    mailbox: opts.mailbox ?? createLocalMailboxPort(),
    evidenceRetrieval:
      opts.evidenceRetrieval ?? createLocalEvidenceRetrievalPort(),
    blobStorage: opts.blobStorage ?? createLocalBlobStoragePort(),
    wissenStore: opts.wissenStore ?? new InMemoryWissenStore(),
    // exactOptionalPropertyTypes: nur setzen, wenn geliefert (kein `bescheidPdf: undefined`).
    ...(opts.bescheidPdf ? { bescheidPdf: opts.bescheidPdf } : {}),
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
  // Die Routen-Familien mit ihrer FLÄCHEN-Zugehörigkeit als DATEN (die Selbstbeschreibung des BFF). `surfaces: null` =
  // Infra (session/capabilities/preferences/ai-assist): quer, exponiert KEINE Fall-Daten → in JEDER Zone registriert.
  // INVARIANTE (Angriffsflächen-Reduktion): KEINE Back-Office-Familie (cases/tasks/vermerke/verfahren-wissen) trägt
  // "buerger" → die internet-exponierte Bürger-Zone (ZONE_SURFACES=buerger) bekommt NUR Infra + buerger + mailbox(own).
  // Back-Office trägt sachbearbeitung+aufsicht großzügig (beide sind cluster-INTERN, nicht exponiert) — so bricht die
  // Aufsichts-Zone (nur-lesend) nicht, wenn sie Fälle/Vermerke/Wissen liest. mailbox ist scope-split (own=Bürger,
  // authority=Sachbearbeitung) → buerger+sachbearbeitung. RBAC bleibt die primäre Autorisierung innerhalb der Zone.
  const familien: {
    surfaces: readonly BffSurface[] | null;
    register: () => void;
  }[] = [
    { surfaces: null, register: () => registerSessionRoute(app, deps) },
    { surfaces: null, register: () => registerCapabilitiesRoute(app, deps) },
    { surfaces: null, register: () => registerAiAssistRoutes(app, deps) },
    // Identität/Vertrauen (BundID/eID): das SITZUNGS-eigene Subjekt — Infra (quer, keine Fall-Daten), RBAC session.read.
    { surfaces: null, register: () => registerIdentityRoutes(app, deps) },
    { surfaces: null, register: () => registerPreferencesRoutes(app, deps) },
    {
      surfaces: ["buerger", "sachbearbeitung"],
      register: () => registerMailboxRoutes(app, deps),
    },
    {
      surfaces: ["sachbearbeitung", "aufsicht"],
      register: () => registerCaseRoutes(app, deps),
    },
    {
      surfaces: ["sachbearbeitung", "aufsicht"],
      register: () => registerTaskRoutes(app, deps),
    },
    {
      surfaces: ["sachbearbeitung", "aufsicht"],
      register: () => registerVermerkRoutes(app, deps),
    },
    {
      surfaces: ["sachbearbeitung", "aufsicht"],
      register: () => registerVerfahrenWissenRoutes(app, deps),
    },
    // Bürger-Sicht auf die EIGENEN Anträge (eigene Familie: der Scope ist durch die Route impliziert).
    { surfaces: ["buerger"], register: () => registerBuergerRoutes(app, deps) },
    // Zahlung/Gebühr für den EIGENEN Vorgang (ePayBL-Naht) — Bürger-Fläche, RBAC payment.initiate.
    { surfaces: ["buerger"], register: () => registerPaymentRoutes(app, deps) },
    // Bescheid-Zustellung (De-Mail/eBO) — behördliche Außenwirkung, Back-Office-Fläche, RBAC bescheid.versand.
    {
      surfaces: ["sachbearbeitung"],
      register: () => registerZustellungRoutes(app, deps),
    },
    // Register-/Nachweis-Abruf (Once-Only/NOOTS) — Back-Office-Fläche, RBAC register.abruf.
    {
      surfaces: ["sachbearbeitung"],
      register: () => registerRegisterRoutes(app, deps),
    },
  ];
  // SENTINEL-DISZIPLIN (Wurzel eines Green-Wash-Befunds): UNDEFINED ⇒ NICHT zoniert ⇒ ALLE registrieren (fail-open,
  // heutiger Ein-App-Zustand). Ein LEERES Array ist etwas ANDERES — eine zonierte STRUKTUR-Zone (z. B. datenhaltung), die
  // KEINE Fläche servieren darf ⇒ nur Infra (surfaces:null), keine persona-/Back-Office-Familie. Nie `[]` wie `undefined`
  // behandeln — sonst servierte genau die Daten-Zone alles (das Gegenteil ihrer Deklaration).
  const allow =
    opts.allowedSurfaces === undefined
      ? null
      : new Set<BffSurface>(opts.allowedSurfaces);
  for (const f of familien) {
    if (
      allow === null ||
      f.surfaces === null ||
      f.surfaces.some((s) => allow.has(s))
    )
      f.register();
  }
}
