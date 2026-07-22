// api-base.test — die EINE Wahrheit der API-Basis-Auflösung + der M5-Schnitt (Ein-Deploy vs. getrennte Deploys).
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiPath, resolveApiBase } from "../src/api-base.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api-base — Auflösung der API-Basis (M5-Deploy-Schnitt)", () => {
  it("Ein-Deploy/same-origin (Default): ohne VITE_API_BASE gilt der Auslieferungs-Präfix BASE_URL", () => {
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("BASE_URL", "/");
    expect(resolveApiBase()).toBe("");
    // apiPath ist beim Modul-Laden fixiert (Standalone BASE_URL "/") → root-absoluter Pfad, same-origin.
    expect(apiPath("/api/cases")).toBe("/api/cases");
  });

  it("Sub-Pfad-Auslieferung (Vorschau-Proxy): BASE_URL-Präfix wird ohne doppelten Slash vorangestellt", () => {
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("BASE_URL", "/vorschau/");
    expect(resolveApiBase()).toBe("/vorschau");
  });

  it("getrennte Deploys (M5): VITE_API_BASE zeigt das Frontend auf die Origin des geteilten Backends", () => {
    vi.stubEnv("VITE_API_BASE", "https://backend.example/");
    vi.stubEnv("BASE_URL", "/");
    // Die Backend-Origin hat Vorrang vor dem Auslieferungs-Präfix; abschließender Slash wird normalisiert.
    expect(resolveApiBase()).toBe("https://backend.example");
  });
});
