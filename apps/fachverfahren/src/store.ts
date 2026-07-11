// Die EINE Quelle der Wahrheit dieser App — jetzt VERFAHRENSÜBERGREIFEND: EIN Workspace-Store aggregiert alle
// Verfahren der `verfahren.registry`. Die Bürger-/Prüf-Bausteine konsumieren pro Verfahren einen `VorgangPort`
// (`workspace.portFor(procedureId)`); die neue Sachbearbeiter-Sicht („Alle Verfahren") konsumiert den
// verfahrensübergreifenden `WorkspacePort` direkt (Aufgaben/Board über alle Verfahren).
//
// Das ist weiterhin der gesamte „fachliche" Code der App: NULL. Verfahren stecken in den Configs (verfahren.registry
// → leistung.config), die UX in den Kit-Bausteinen. Ein weiteres Verfahren = ein weiterer Registry-Eintrag.
import {
  createWorkspacePortFromEnv,
  waehleVerfahren,
} from "@senticor/fachverfahren-kit";
import { workspaceConfig } from "./verfahren.registry.js";

// PORTAL-NAHT (mehrere Bürger-Applikationen aus EINER Registry): `VITE_ENABLED_PROCEDURES` (komma-separierte
// procedureIds) beschränkt DIESES Portal auf eine Teilmenge der Verfahren; unset ⇒ alle (rückwärtskompatibel).
const enabledProcedures = (
  import.meta.env.VITE_ENABLED_PROCEDURES as string | undefined
)
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const portalConfig = waehleVerfahren(workspaceConfig, enabledProcedures);

// PROD-NAHT (die EINE austauschbare Datenquelle): ist `VITE_API_BASE_URL` gesetzt, spricht der Workspace die
// server-autoritative Fastify-Domain-API (/api/*) über den `HttpWorkspacePort` (async Fetch → synchroner Snapshot,
// der den `useSyncExternalStore`-Reaktivitätsvertrag erfüllt); sonst (DEV/Standalone) den synchronen In-Memory-Store
// mit Seed-Daten. `import.meta.env` wird von Vite zur BUILD-Zeit statisch eingesetzt (synchron verfügbar, anders als
// das async `/runtime-config.json`) — passend zum modul-globalen `workspace`-Export.
// Exportiert, damit weitere PROD-Nähte (z. B. der Notification-Client #18) DIESELBE API-Basis + Auth-Naht nutzen.
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined;

// OPTIONAL für lokale Full-Stack-Tests mit Header-Auth (DEV): setzt man `VITE_DEV_ACTOR`, gehen die `x-*`-Header des
// Header-Session-Resolvers mit. In echtem PROD bleibt das leer — die Session kommt aus dem Cookie/OIDC (credentials).
const devActor = import.meta.env.VITE_DEV_ACTOR as string | undefined;
export const devHeaders = devActor
  ? {
      "x-actor-id": devActor,
      "x-tenant-id": workspaceConfig.tenantId,
      "x-authority-id": workspaceConfig.authorityId,
      "x-jurisdiction-id": workspaceConfig.jurisdictionId,
      "x-permissions":
        (import.meta.env.VITE_DEV_PERMISSIONS as string | undefined) ??
        "task.read,task.write,case.read,case.transition,case.decide,inbox.read,inbox.triage,comment.read,comment.write,audit.read",
    }
  : undefined;

// ── PROD-Senken: der modul-globale `workspace` lebt AUSSERHALB von React. Diese setzbaren Haken lassen React-
//    Komponenten (App-Root/Inbox) server-autoritative Fehler (403/409/Vier-Augen/Netz) anzeigen und die ASYNCHRONE
//    Inbox-Annahme (die die neue Aufgaben-Id synchron nicht liefern kann) an eine Navigation koppeln. Im In-Memory-
//    DEV-Modus ruft der Store diese Haken nie — dort bleibt alles synchron. ──
let fehlerSenke: ((fehler: unknown, kontext: string) => void) | undefined;
export function setWorkspaceFehlerSenke(
  cb: ((fehler: unknown, kontext: string) => void) | undefined,
): void {
  fehlerSenke = cb;
}

let angenommenHandler: ((aufgabeId: string) => void) | undefined;
export function setWorkspaceAufgabeAngenommen(
  cb: ((aufgabeId: string) => void) | undefined,
): void {
  angenommenHandler = cb;
}

/** Der verfahrensübergreifende Workspace-Store — In-Memory (DEV) oder HTTP (PROD, `VITE_API_BASE_URL`). Beide erfüllen
 *  denselben synchronen `WorkspaceStore`-Vertrag; die Bausteine merken den Unterschied nicht. */
export const workspace = createWorkspacePortFromEnv(portalConfig, {
  ...(apiBaseUrl ? { apiBaseUrl } : {}),
  ...(apiBaseUrl && !devHeaders ? { credentials: "include" as const } : {}),
  ...(devHeaders ? { headers: devHeaders } : {}),
  onError: (fehler, kontext) => fehlerSenke?.(fehler, kontext),
  onAccepted: (aufgabeId) => angenommenHandler?.(aufgabeId),
});

/** Das PRIMÄRE Verfahren (erster Registry-Eintrag) — trägt die bestehenden Ein-Verfahren-Routen (Bürger-Antrag,
 *  Eingangskorb). Rückwärtskompatibel: `store`/`config` verhalten sich wie zuvor für dieses eine Verfahren. */
export const primaryProcedureId = portalConfig.verfahren[0]!.procedureId;

/** Der fachliche `VorgangPort` des primären Verfahrens (mit workspace-integriertem `einreichen`). */
export const store = workspace.portFor(primaryProcedureId)!;

/** Die `LeistungConfig` des primären Verfahrens (für die Kit-Bausteine, die ihre UX daraus rendern). */
export const config = workspace.configFor(primaryProcedureId)!;
