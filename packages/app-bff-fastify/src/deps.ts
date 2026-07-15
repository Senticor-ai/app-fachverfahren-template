// deps — die injizierten Abhängigkeiten des BFF-Plugins: Ports statt Konstruktion.
// Das Paket kennt weder Env noch Stores-Aufbau — die App-Komposition liefert alles.
import type { AuditSink, SessionResolver } from "@senticor/app-runtime-fastify";
import type {
  AppStore,
  CaseStore,
  TaskStore,
} from "@senticor/app-store-postgres";
import type {
  ProcedureRegistry,
  RbacRegistry,
} from "@senticor/public-sector-sdk";

export interface BffDeps {
  appStore: AppStore;
  /** Fall/Dossier-Datenschicht (ADR-0001). Template-Stub (Standalone); in PROD sitzt chos hinter der Naht. */
  caseStore: CaseStore;
  /** Aufgaben/Ziele/Schritte/Termine einer Akte (ADR-0001/ADR-0003). Template-Stub; in PROD chos hinter der Naht. */
  taskStore: TaskStore;
  /** Verfahren als DATEN (Zustandsmaschine + Rechtsgrundlagen) — löst Fälle zu ihrer ProcedureVersion auf. */
  procedureRegistry: ProcedureRegistry;
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
  rbacRegistry: RbacRegistry;
}
