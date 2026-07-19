// session-state — das Laden des Session-Zustands (/auth/status + /auth/session) als PURE,
// fetch-injizierbare Funktion, damit der Vertrag ohne DOM testbar ist (tests/session-state.test.ts).
//
// WARUM defensiv: antwortet der API-Server nicht (Dev-Server ohne Runtime, Proxy down,
// Fehlkonfiguration), liefert ein SPA-Fallback für JEDEN Pfad index.html — HTTP 200, text/html.
// Ein blindes response.json() wirft dann eine UNBEHANDELTE SyntaxError-Rejection und die App
// bleibt im Lade-Zustand hängen. Deshalb gilt hier: Nicht-JSON, Fehler-Status auf /auth/status
// und Netzfehler bedeuten „API nicht erreichbar" (apiAvailable=false) — niemals ein Throw.
import { apiPath } from "./board-client.js";

/** Arbeitsbereichs-/Persona-Schlüssel — OFFEN (`string`), synchron zur Kit-`Persona` (daten-getriebene
 *  Personas; ein Fachverfahren kann beliebige definieren). NUR Erlebnis, keine Autorisierung. */
export type SessionPersona = string;
export type SessionWorkspaceRole = "admin" | "member" | "citizen";

export interface SessionPrincipal {
  actorId: string;
  tenantId?: string;
  email: string;
  displayName?: string;
  /** Workspace-Rolle + Permissions aus dem App-Identity-Modell (GET /auth/session).
   *  UI-Guards prüfen Permissions, nie Rollen-Literale — wie die Server-Routen.
   *  `role` ist der deprecated Alias von `workspaceRole` (ein Release). */
  workspaceRole?: SessionWorkspaceRole;
  role?: SessionWorkspaceRole;
  permissions?: string[];
  /** Wirksame ARBEITSBEREICHE (Personas) — Produkt-Erlebnis, keine Autorisierung.
   *  Fallback-Regeln in personas.ts (capability-gesteuert). */
  personas?: SessionPersona[];
  personaManagementMode?: "local" | "oidc_authoritative" | "oidc_additive";
  /** Versioniert jede principal-relevante Mutation (If-Match für Admin-PATCHes). */
  principalVersion?: number;
}

/** Vom Server gemeldete Schema-Fähigkeiten (GET /auth/status) — Grundlage des
 *  Legacy-Fallbacks in personas.ts. */
export interface SessionCapabilities {
  userPersonas?: boolean;
}

export type RegistrationMode = "disabled" | "open_unverified";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

/** Ergebnis EINES Ladevorgangs — „loading" existiert nur als UI-Zustand davor. */
export interface SessionSnapshot {
  status: Exclude<SessionStatus, "loading">;
  principal: SessionPrincipal | null;
  bootstrapped: boolean;
  /** false = der API-Server hat nicht mit JSON geantwortet (down/kein Proxy/Fehlkonfiguration).
   *  Die Landing zeigt dann einen Hinweis statt der Formulare — Anmelden wäre zwecklos. */
  apiAvailable: boolean;
  /** Self-Signup-Politik des Servers — steuert den Registrieren-Umschalter der Landing. */
  registration: RegistrationMode;
  capabilities: SessionCapabilities;
}

const API_UNAVAILABLE: SessionSnapshot = {
  status: "unauthenticated",
  principal: null,
  bootstrapped: false,
  apiAvailable: false,
  registration: "disabled",
  capabilities: {},
};

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("application/json");
}

/** First-Run-Gate: erzwingt das Einmal-Setup auf JEDEM Pfad, solange kein Admin existiert.
 *  Nur mit erreichbarer API (sonst würde eine reine Frontend-Vorschau ausgesperrt) und nie
 *  während des Ladens (kein Redirect-Flackern beim App-Start). */
export function needsFirstRunSetup(state: {
  status: SessionStatus;
  bootstrapped: boolean;
  apiAvailable: boolean;
}): boolean {
  return (
    state.status !== "loading" && state.apiAvailable && !state.bootstrapped
  );
}

export async function fetchSessionState(
  fetchImpl: typeof fetch = fetch,
): Promise<SessionSnapshot> {
  try {
    const statusResponse = await fetchImpl(apiPath("/auth/status"), {
      credentials: "include",
    });
    if (!statusResponse.ok || !isJsonResponse(statusResponse)) {
      return API_UNAVAILABLE;
    }
    const { bootstrapped, storeAvailable, registration, capabilities } =
      (await statusResponse.json()) as {
        bootstrapped: boolean;
        storeAvailable?: boolean;
        registration?: RegistrationMode;
        capabilities?: SessionCapabilities;
      };
    // Degradierte Server-Antwort (Web-Tier oben, Datenbank unten): der Server meldet
    // storeAvailable=false mit 200 statt 500, damit der Browser keinen Ressourcen-
    // Fehler loggt — für die UI ist das „API nicht erreichbar" (Anmelden zwecklos).
    if (storeAvailable === false) {
      return API_UNAVAILABLE;
    }
    const envelope = {
      registration:
        registration === "open_unverified" ? registration : "disabled",
      capabilities: capabilities ?? {},
    } as const;

    const sessionResponse = await fetchImpl(apiPath("/auth/session"), {
      credentials: "include",
    });
    if (sessionResponse.ok) {
      if (!isJsonResponse(sessionResponse)) return API_UNAVAILABLE;
      const principal = (await sessionResponse.json()) as SessionPrincipal;
      return {
        status: "authenticated",
        principal,
        bootstrapped,
        apiAvailable: true,
        ...envelope,
      };
    }
    return {
      status: "unauthenticated",
      principal: null,
      bootstrapped,
      apiAvailable: true,
      ...envelope,
    };
  } catch {
    return API_UNAVAILABLE;
  }
}
