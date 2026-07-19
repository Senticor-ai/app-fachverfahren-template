// mesh-harness — bootet den BFF (appBff) IN-PROCESS gegen In-Memory-Stores + die Golden Fixture, mit einer
// festen Caseworker-Sitzung. KEIN Netzwerk, KEIN Server-Boot, KEIN finaler Build: eine FastifyInstance, die
// via .inject(...) die ECHTEN Mesh-Routen faehrt (RBAC · Review · Fail-safe · Injektions-Guardrail bleiben
// EINE Wahrheit — die CLI reimplementiert nichts). Genutzt vom Golden-Fixture-Selbsttest UND der Agenten-CLI,
// die sich damit exakt dieselbe Verdrahtung teilen. NUR DEV/Selbsttest — kein PROD-Pfad (fest injizierte Session).
import { appBff } from "@senticor/app-bff-fastify";
import {
  InMemoryAppStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
  InMemoryWissenStore,
} from "@senticor/app-store-postgres";
import {
  NoopAuditSink,
  type ResolvedSession,
  type SessionResolver,
} from "@senticor/app-runtime-fastify";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";
import fastify, { type FastifyInstance } from "fastify";
import {
  DEFAULT_AUTHORITY_ID,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_TENANT_ID,
} from "../auth/bootstrap.js";
import { antragProcedure, dossierProcedure } from "../procedure.config.js";
import { seedGoldenMesh } from "./golden-fixture.js";

/** Die feste Caseworker-Sitzung, unter der CLI/Selbsttest fahren (Rolle mit case.read + case.note.write). */
export function meshCaseworkerSession(
  overrides: Partial<ResolvedSession> = {},
): ResolvedSession {
  return {
    actorId: "actor.mesh-cli",
    tenantId: DEFAULT_TENANT_ID,
    authorityId: DEFAULT_AUTHORITY_ID,
    jurisdictionId: DEFAULT_JURISDICTION_ID,
    rbacRoles: ["caseworker"],
    ...overrides,
  };
}

export interface SeededMeshApp {
  app: FastifyInstance;
  caseStore: InMemoryCaseStore;
  wissenStore: InMemoryWissenStore;
}

/** Bootet appBff in-process mit In-Memory-Stores, seedet die Golden Fixture (Fall + Vermerke + Wissen) und
 *  injiziert eine feste Caseworker-Sitzung. `seed: false` startet leer (fuer Tests, die den Leerzustand
 *  pruefen). Der Aufrufer schliesst die App mit `app.close()`. */
export async function buildSeededMeshApp(
  opts: { seed?: boolean; session?: ResolvedSession } = {},
): Promise<SeededMeshApp> {
  const caseStore = new InMemoryCaseStore();
  const wissenStore = new InMemoryWissenStore();
  const taskStore = new InMemoryTaskStore();
  const appStore = new InMemoryAppStore();
  if (opts.seed !== false) {
    await seedGoldenMesh({ caseStore, wissenStore });
  }
  const session = opts.session ?? meshCaseworkerSession();
  // Actor-bewusst: ein Request-Header `x-mesh-actor` überschreibt die Akteurs-Kennung (Rolle/Mandant bleiben).
  // So kann die CLI (`--as`) einen ZWEI-PERSONEN-Fluss fahren und den POSITIVEN Vier-Augen-Abschluss zeigen —
  // NUR für dieses DEV-Harness; PROD authentifiziert echte Sitzungen (Cookie/AuthStore), nie per Header.
  const resolver: SessionResolver = {
    resolve: async (request) => {
      const override = request.headers["x-mesh-actor"];
      return typeof override === "string" && override.length > 0
        ? { ...session, actorId: override }
        : session;
    },
  };
  const app = fastify({ logger: false });
  await app.register(appBff, {
    appStore,
    caseStore,
    taskStore,
    wissenStore,
    procedureRegistry: createInMemoryProcedureRegistry([
      dossierProcedure,
      antragProcedure,
    ]),
    sessionResolver: resolver,
    auditSink: new NoopAuditSink(),
  });
  await app.ready();
  return { app, caseStore, wissenStore };
}
