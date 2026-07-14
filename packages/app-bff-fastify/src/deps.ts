// deps — die injizierten Abhängigkeiten des BFF-Plugins: Ports statt Konstruktion.
// Das Paket kennt weder Env noch Stores-Aufbau — die App-Komposition liefert alles.
import type { AuditSink, SessionResolver } from "@senticor/app-runtime-fastify";
import type { AppStore } from "@senticor/app-store-postgres";
import type { RbacRegistry } from "@senticor/public-sector-sdk";

export interface BffDeps {
  appStore: AppStore;
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
  rbacRegistry: RbacRegistry;
}
