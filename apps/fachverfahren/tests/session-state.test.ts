// session-state.test.ts — Vertrag des Session-Ladens (fetchSessionState) INKLUSIVE der Fälle,
// in denen der API-Server nicht antwortet. Regression: unter `pnpm dev` (nur Vite, kein
// API-Server) beantwortet der SPA-Fallback /auth/status mit index.html (HTTP 200, text/html);
// ein blindes response.json() warf dann eine UNBEHANDELTE SyntaxError-Rejection und /boards
// blieb als leere Seite im Lade-Zustand hängen. Nicht-JSON, Fehler-Status und Netzfehler
// bedeuten deshalb „API nicht erreichbar" (apiAvailable=false) — niemals ein Throw.
import { describe, expect, it } from "vitest";

import { fetchSessionState, needsFirstRunSetup } from "../src/session-state.js";

const SPA_FALLBACK_HTML = "<!doctype html>\n<html><body>app</body></html>";

function htmlResponse(status = 200): Response {
  return new Response(SPA_FALLBACK_HTML, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** fetch-Stub über Pfad-Suffix (apiPath("/auth/status") → "/auth/status" bei BASE_URL "/"). */
function fetchStub(routes: Record<string, () => Response>): typeof fetch {
  return (input) => {
    const url = String(input);
    const match = Object.entries(routes).find(([path]) => url.endsWith(path));
    if (!match) return Promise.reject(new Error(`unerwarteter fetch: ${url}`));
    return Promise.resolve(match[1]());
  };
}

describe("fetchSessionState", () => {
  it("Vite-SPA-Fallback (HTML statt JSON) → apiAvailable=false, kein Throw", async () => {
    const snapshot = await fetchSessionState(
      fetchStub({
        "/auth/status": () => htmlResponse(),
        "/auth/session": () => htmlResponse(),
      }),
    );
    expect(snapshot).toEqual({
      status: "unauthenticated",
      principal: null,
      bootstrapped: false,
      apiAvailable: false,
      registration: "disabled",
      capabilities: {},
    });
  });

  it("API-Server down hinter Proxy (502) → apiAvailable=false", async () => {
    const snapshot = await fetchSessionState(
      fetchStub({ "/auth/status": () => htmlResponse(502) }),
    );
    expect(snapshot.apiAvailable).toBe(false);
    expect(snapshot.status).toBe("unauthenticated");
  });

  it("Netzfehler → apiAvailable=false, kein Throw", async () => {
    const snapshot = await fetchSessionState(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    expect(snapshot.apiAvailable).toBe(false);
    expect(snapshot.status).toBe("unauthenticated");
  });

  it("Web-Tier oben, Datenbank unten (storeAvailable=false) → apiAvailable=false", async () => {
    // Der Server antwortet OHNE erreichbaren Auth-Store bewusst degradiert mit 200 +
    // storeAvailable=false statt 500 — kein Konsolen-Fehler im Browser (PWA-Audit),
    // aber Anmelden wäre zwecklos: die Landing zeigt den API-Hinweis.
    const snapshot = await fetchSessionState(
      fetchStub({
        "/auth/status": () =>
          jsonResponse({ bootstrapped: false, storeAvailable: false }),
        // Selbst wenn /auth/session antworten würde: storeAvailable=false zählt.
        "/auth/session": () => jsonResponse({ error: "unauthorized" }, 401),
      }),
    );
    expect(snapshot).toEqual({
      status: "unauthenticated",
      principal: null,
      bootstrapped: false,
      apiAvailable: false,
      registration: "disabled",
      capabilities: {},
    });
  });

  it("bootstrapped ohne Session (401) → unauthenticated, apiAvailable=true", async () => {
    const snapshot = await fetchSessionState(
      fetchStub({
        "/auth/status": () => jsonResponse({ bootstrapped: true }),
        "/auth/session": () => jsonResponse({ error: "unauthorized" }, 401),
      }),
    );
    expect(snapshot).toEqual({
      status: "unauthenticated",
      principal: null,
      bootstrapped: true,
      apiAvailable: true,
      // Alt-Server ohne Envelope: Registrierung geschlossen, keine Capabilities.
      registration: "disabled",
      capabilities: {},
    });
  });

  it("reicht registration-Modus und capabilities aus /auth/status durch", async () => {
    const snapshot = await fetchSessionState(
      fetchStub({
        "/auth/status": () =>
          jsonResponse({
            bootstrapped: true,
            registration: "open_unverified",
            capabilities: { userPersonas: true },
          }),
        "/auth/session": () => jsonResponse({ error: "unauthorized" }, 401),
      }),
    );
    expect(snapshot.registration).toBe("open_unverified");
    expect(snapshot.capabilities).toEqual({ userPersonas: true });
  });

  it("gültige Session → authenticated mit Principal", async () => {
    const principal = {
      actorId: "actor-1",
      email: "sb@example.org",
      role: "admin",
      permissions: ["users.manage"],
    };
    const snapshot = await fetchSessionState(
      fetchStub({
        "/auth/status": () => jsonResponse({ bootstrapped: true }),
        "/auth/session": () => jsonResponse(principal),
      }),
    );
    expect(snapshot.status).toBe("authenticated");
    expect(snapshot.apiAvailable).toBe(true);
    expect(snapshot.principal).toEqual(principal);
  });

  it("Session-Antwort 200 aber HTML (defensiv) → apiAvailable=false", async () => {
    const snapshot = await fetchSessionState(
      fetchStub({
        "/auth/status": () => jsonResponse({ bootstrapped: true }),
        "/auth/session": () => htmlResponse(),
      }),
    );
    expect(snapshot.apiAvailable).toBe(false);
    expect(snapshot.status).toBe("unauthenticated");
  });
});

// First-Run-Gate: solange der Workspace NICHT eingerichtet ist (kein Admin existiert), soll
// JEDER Pfad zuerst das Setup erzwingen — nicht nur /boards. Ohne erreichbare API (reine
// Frontend-Vorschau, CHOS-Preview) darf das Gate NIE greifen, sonst weißt es die Personas aus.
describe("needsFirstRunSetup", () => {
  const base = {
    status: "unauthenticated",
    bootstrapped: false,
    apiAvailable: true,
  } as const;

  it("greift, wenn API da ist und noch kein Admin existiert", () => {
    expect(needsFirstRunSetup(base)).toBe(true);
  });

  it("greift NICHT während des Ladens (kein Redirect-Flackern)", () => {
    expect(needsFirstRunSetup({ ...base, status: "loading" })).toBe(false);
  });

  it("greift NICHT, wenn der Workspace eingerichtet ist", () => {
    expect(needsFirstRunSetup({ ...base, bootstrapped: true })).toBe(false);
  });

  it("greift NICHT ohne erreichbare API (Preview/Standalone-Frontend)", () => {
    expect(needsFirstRunSetup({ ...base, apiAvailable: false })).toBe(false);
  });
});
