// landing-state — die Logik der Landing-Page ("/") als PURE Funktionen (Muster
// needsFirstRunSetup, tests/landing-state.test.ts). Die Landing ist die EINZIGE
// unauthentifizierte Route: sie zeigt je nach Session-Zustand Login, Einmal-Setup,
// API-Hinweis oder die Konto-Sicht — und leitet nach dem Login auf den ursprünglich
// angeforderten Deep-Link zurück.
import type { SessionStatus } from "./session-state.js";

export type LandingView =
  "loading" | "api-unavailable" | "bootstrap" | "login" | "authenticated";

/** Welche Sicht zeigt die Landing? Reihenfolge wie die frühere LoginPage: erst der ehrliche
 *  API-Hinweis (Formulare wären zwecklos), dann Session, dann Setup-vor-Login. „loading"
 *  bleibt eigener Zustand — kein Formular-Flackern, bevor der Session-Stand geladen ist. */
export function landingView(state: {
  status: SessionStatus;
  bootstrapped: boolean;
  apiAvailable: boolean;
}): LandingView {
  if (state.status === "loading") return "loading";
  if (!state.apiAvailable) return "api-unavailable";
  if (state.status === "authenticated") return "authenticated";
  return state.bootstrapped ? "login" : "bootstrap";
}

/** Deep-Link-Restore nach dem Login: `state.from` stammt aus dem History-State und ist damit
 *  manipulierbar — erlaubt sind nur interne Ein-Slash-Pfade (kein Schema, kein "//host").
 *  "/" selbst ist kein Ziel, sonst navigierte die Landing auf sich selbst. */
export function postLoginRedirect(from: unknown): string | null {
  if (typeof from !== "string") return null;
  if (!from.startsWith("/") || from.startsWith("//")) return null;
  if (from === "/") return null;
  return from;
}
