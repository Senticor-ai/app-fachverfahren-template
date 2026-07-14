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
import { InMemoryAppStore, type AppStore } from "@senticor/app-store-postgres";
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
}: {
  session?: ResolvedSession;
  appStore?: AppStore;
} = {}): Promise<{
  app: FastifyInstance;
  auditSink: MemoryAuditSink;
  appStore: AppStore;
}> {
  const auditSink = new MemoryAuditSink();
  const app = fastify({ logger: false });
  await app.register(appBff, {
    appStore,
    sessionResolver: session ? stubResolver(session) : new NoSessionResolver(),
    auditSink,
  });
  return { app, auditSink, appStore };
}
