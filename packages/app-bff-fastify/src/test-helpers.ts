// test-helpers — gemeinsame Bausteine der Routen-Tests: Stub-Resolver (feste Sitzung),
// InMemoryAppStore, MemoryAuditSink und der Plugin-Aufbau. Kein vitest-Import — die
// Datei ist ein normales Modul (landet wirkungslos im dist wie alle *.test.ts hier).
import fastify, { type FastifyInstance } from "fastify";
import {
  MemoryAuditSink,
  NoSessionResolver,
  type ResolvedSession,
  type SessionResolver,
} from "@senticor/app-runtime-fastify";
import {
  InMemoryAppStore,
  InMemoryCaseStore,
  InMemoryTaskStore,
  type AppStore,
  type CaseStore,
  type TaskStore,
} from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureRegistry,
} from "@senticor/public-sector-sdk";
import { appBff } from "./plugin.js";

export function stubResolver(session: ResolvedSession): SessionResolver {
  return { resolve: async () => session };
}

export function citizenSession(
  overrides: Partial<ResolvedSession> = {},
): ResolvedSession {
  return {
    actorId: "actor-citizen",
    tenantId: "tenant-1",
    authorityId: "authority-1",
    jurisdictionId: "de",
    rbacRoles: ["citizen"],
    ...overrides,
  };
}

export function caseworkerSession(
  overrides: Partial<ResolvedSession> = {},
): ResolvedSession {
  return citizenSession({
    actorId: "actor-caseworker",
    rbacRoles: ["caseworker"],
    ...overrides,
  });
}

export async function buildBffApp({
  session,
  appStore = new InMemoryAppStore(),
  caseStore = new InMemoryCaseStore(),
  taskStore = new InMemoryTaskStore(),
  procedureRegistry = createInMemoryProcedureRegistry([]),
}: {
  session?: ResolvedSession;
  appStore?: AppStore;
  caseStore?: CaseStore;
  taskStore?: TaskStore;
  procedureRegistry?: ProcedureRegistry;
} = {}): Promise<{
  app: FastifyInstance;
  auditSink: MemoryAuditSink;
  appStore: AppStore;
  caseStore: CaseStore;
  taskStore: TaskStore;
}> {
  const auditSink = new MemoryAuditSink();
  const app = fastify({ logger: false });
  await app.register(appBff, {
    appStore,
    caseStore,
    taskStore,
    procedureRegistry,
    sessionResolver: session ? stubResolver(session) : new NoSessionResolver(),
    auditSink,
  });
  return { app, auditSink, appStore, caseStore, taskStore };
}
