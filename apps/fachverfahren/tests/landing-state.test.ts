// landing-state.test.ts — Vertrag der Landing-Page-Logik: welche Sicht zeigt "/" für welchen
// Session-Zustand, und wohin darf nach dem Login zurückgeleitet werden. Die Landing ist die
// EINZIGE unauthentifizierte Route; alle Persona- und Workspace-Routen bouncen unangemeldet
// mit `state.from` hierher. Beide Funktionen sind pur (Muster needsFirstRunSetup), damit der
// Vertrag ohne DOM testbar bleibt.
import { describe, expect, it } from "vitest";

import { landingView, postLoginRedirect } from "../src/landing-state.js";

describe("landingView", () => {
  const base = {
    status: "unauthenticated",
    bootstrapped: true,
    apiAvailable: true,
  } as const;

  it("lädt noch → loading (kein Formular-Flackern beim App-Start)", () => {
    expect(landingView({ ...base, status: "loading" })).toBe("loading");
  });

  it("API nicht erreichbar → api-unavailable (Formulare wären zwecklos)", () => {
    expect(landingView({ ...base, apiAvailable: false })).toBe(
      "api-unavailable",
    );
  });

  it("angemeldet → authenticated (Konto-Karte statt Login)", () => {
    expect(landingView({ ...base, status: "authenticated" })).toBe(
      "authenticated",
    );
  });

  it("kein Admin eingerichtet → bootstrap (Einmal-Setup)", () => {
    expect(landingView({ ...base, bootstrapped: false })).toBe("bootstrap");
  });

  it("eingerichtet, keine Session → login", () => {
    expect(landingView(base)).toBe("login");
  });
});

// postLoginRedirect: `state.from` kommt aus dem History-State und ist damit MANIPULIERBAR —
// nur interne Ein-Slash-Pfade sind erlaubt (kein Schema, kein protokoll-relatives "//host").
// "/" selbst ist kein Ziel: die Landing würde sonst auf sich selbst navigieren.
describe("postLoginRedirect", () => {
  it("interner Pfad → wird übernommen (Deep-Link-Restore)", () => {
    expect(postLoginRedirect("/amt/vorgang/7?tab=historie")).toBe(
      "/amt/vorgang/7?tab=historie",
    );
  });

  it("fehlend/undefined → null", () => {
    expect(postLoginRedirect(undefined)).toBe(null);
  });

  it("kein String (History-State manipuliert) → null", () => {
    expect(postLoginRedirect({ pathname: "/amt" })).toBe(null);
    expect(postLoginRedirect(42)).toBe(null);
  });

  it("absolute URL mit Schema → null (kein Open-Redirect)", () => {
    expect(postLoginRedirect("https://evil.example/phish")).toBe(null);
  });

  it("protokoll-relative URL // → null", () => {
    expect(postLoginRedirect("//evil.example")).toBe(null);
  });

  it("Pfad ohne führenden Slash → null", () => {
    expect(postLoginRedirect("amt")).toBe(null);
  });

  it('"/" selbst → null (Landing navigiert nicht auf sich selbst)', () => {
    expect(postLoginRedirect("/")).toBe(null);
  });
});
