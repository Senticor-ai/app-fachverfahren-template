// server/pm-module-manifest — die DATENSCHUTZ-/Governance-Deklaration der Management-Ebene (PM-Upgrade).
//
// Die neuen Tabellen tragen personenbezogene Daten: Vermerke (`app_task_comments.body/author`), der Aktivitäts-Feed
// (`app_task_activity.actor`) und gespeicherte Ansichten (`app_saved_views.owner`). DSGVO verlangt, dass JEDE
// Personendaten-Fläche eine Datenklassifikation + eine Aufbewahrungsregel benennt. Dieses Manifest instanziiert die
// Deklaration EINMAL, `assertDomainModuleManifest` prüft sie beim Start (fail-fast), und der Server verankert sie im
// Startup-Log — so ist die Compliance-Aussage nicht nur Prosa, sondern geprüftes, auffindbares Artefakt.
import {
  assertDomainModuleManifest,
  type DomainModuleManifest,
} from "@senticor/public-sector-sdk";

/**
 * Manifest der verfahrensübergreifenden Management-Ebene (Aufgaben/Board/Inbox/Vermerke/Aktivität/Ansichten).
 * `dataCategories` klassifiziert die exponierten Personendaten, `retentionPolicies` benennt die Aufbewahrung.
 */
export const pmModuleManifest: DomainModuleManifest =
  assertDomainModuleManifest({
    id: "workspace-management",
    version: "1.0.0",
    displayName: "Sachbearbeitungs-Workspace (verfahrensübergreifend)",
    routes: [
      { path: "/api/tasks", surface: "caseworker" },
      { path: "/api/tasks/:id/comments", surface: "caseworker" },
      { path: "/api/tasks/:id/activity", surface: "caseworker" },
      { path: "/api/inbox", surface: "caseworker" },
      { path: "/api/views", surface: "caseworker" },
    ],
    requiredCapabilities: ["workflow", "audit"],
    permissions: [
      {
        permission: "task.read",
        description: "Aufgaben im Mandanten-Scope lesen",
      },
      {
        permission: "task.write",
        description:
          "Aufgaben-Metadaten (Priorität/Zuweisung/Label/Board) ändern",
      },
      { permission: "inbox.read", description: "Triage-Eingang lesen" },
      {
        permission: "inbox.triage",
        description: "Eingang annehmen/ablehnen (erzeugt Vorgang)",
      },
      {
        permission: "comment.read",
        description:
          "Interne Vermerke einer Aufgabe lesen (nur Sachbearbeitung)",
      },
      {
        permission: "comment.write",
        description: "Internen Vermerk anlegen (append-only)",
      },
      { permission: "view.read", description: "Gespeicherte Ansichten lesen" },
      {
        permission: "view.write",
        description:
          "Ansicht speichern/löschen (geteilt erfordert erhöhtes Recht)",
      },
      {
        permission: "audit.read",
        description: "Append-only Audit eines Falls lesen",
      },
    ],
    events: {
      publishes: [
        { eventType: "task.commented", version: "1" },
        { eventType: "task.activity", version: "1" },
      ],
      consumes: [],
    },
    // Datenklassifikation je exponierter Personendaten-Fläche.
    //  - Vermerke (Freitext + Autor): confidential (interne Einschätzung, § 29 VwVfG-relevant).
    //  - Aktivitäts-Feed (handelnder Akteur): internal.
    //  - Gespeicherte Ansichten (Eigentümer): internal.
    dataCategories: ["confidential", "internal"],
    retentionPolicies: [
      // Vermerke/Aktivität teilen die Aufbewahrung der zugehörigen Akte (kein eigenständiger Lebenszyklus).
      "task-comments:retain-with-case",
      "task-activity:retain-with-case",
      // Persönliche Ansichten sind Arbeitsmittel, kein Aktenbestandteil → mit dem Nutzerkonto löschbar.
      "saved-views:delete-with-account",
    ],
    migrations: {
      database: "20260709120000_pm_tasks_board",
    },
  });
