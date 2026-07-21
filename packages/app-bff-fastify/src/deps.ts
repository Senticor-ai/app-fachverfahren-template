// deps — die injizierten Abhängigkeiten des BFF-Plugins: Ports statt Konstruktion.
// Das Paket kennt weder Env noch Stores-Aufbau — die App-Komposition liefert alles.
import type { AuditSink, SessionResolver } from "@senticor/app-runtime-fastify";
import type {
  AppStore,
  CaseStore,
  TaskStore,
  WissenStore,
} from "@senticor/app-store-postgres";
import type {
  ProcedureRegistry,
  RbacRegistry,
} from "@senticor/public-sector-sdk";
import type {
  AiAssistPort,
  BlobStoragePort,
  EvidenceRetrievalPort,
  IdentityAndTrustPort,
  MailboxPort,
  PaymentPort,
} from "@senticor/platform-contracts";

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
  /** KI-Assistenz als PORT (austauschbar: local-fake ODER echter Adapter, z.B. Ollama). Die App-Komposition
   *  wählt die Impl per Env; der BFF konsumiert nur den Vertrag — nie einen konkreten Anbieter. */
  aiAssist: AiAssistPort;
  /** Zahlung/Gebühr als PORT (austauschbar: local-fake ODER echter Adapter, z.B. ePayBL/XBezahldienste). Die
   *  App-Komposition wählt die Impl per Env; der BFF konsumiert nur den Vertrag — nie einen konkreten Anbieter. */
  payment: PaymentPort;
  /** Identität/Vertrauen als PORT (austauschbar: local-fake ODER echter Adapter, z.B. BundID/DeutschlandID/eIDAS).
   *  Liest das angemeldete Subjekt + prüft Vertrauensniveaus (Step-up); der BFF konsumiert nur den Vertrag. */
  identityAndTrust: IdentityAndTrustPort;
  /** Bescheid-Zustellung als PORT (austauschbar: local-fake ODER echter Adapter, z.B. De-Mail/eBO/ZaPuK).
   *  Hoheitliche Außenwirkung (VwZG); der BFF konsumiert nur den Vertrag — nie einen konkreten Anbieter. */
  mailbox: MailboxPort;
  /** Register-/Nachweis-Abruf als PORT (austauschbar: local-fake ODER echter Adapter, z.B. NOOTS/Once-Only).
   *  Zweckgebundener Nachweis-Abruf; der BFF konsumiert nur den Vertrag — nie einen konkreten Anbieter. */
  evidenceRetrieval: EvidenceRetrievalPort;
  /** Byte-Storage für Nachweise/Dokumente (austauschbar: In-Memory-Fake / Dateisystem / Objekt-Store). */
  blobStorage: BlobStoragePort;
  /** Verfahrens-weites Wiki (generelles Wissen + Fähigkeiten je Verfahren) — die durable Wiki-Ebene. */
  wissenStore: WissenStore;
}
