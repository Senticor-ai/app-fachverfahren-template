import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRuntimeConfig, redactedConfigSummary } from "./config.js";

describe("readRuntimeConfig", () => {
  it("liefert neutrale Defaults ohne Env und ohne Overrides", () => {
    const config = readRuntimeConfig({});
    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(8080);
    expect(config.internalPort).toBe(9090);
    expect(config.staticDir).toBe(path.join(process.cwd(), "dist"));
    expect(config.serviceWorkerEnabled).toBe(false);
    expect(config.enableHsts).toBe(false);
    expect(config.cspMode).toBe("enforce");
    expect(config.frameAncestors).toBe("'self'");
    expect(config.trustProxy).toBe(false);
    expect(config.allowedHosts.size).toBe(0);
    expect(config.maxBodyBytes).toBe(1_048_576);
    expect(config.shutdownTimeoutMs).toBe(10_000);
    expect(config.requiredUpstreams).toEqual([]);
    expect(config.buildInfo).toEqual({
      version: "0.0.0",
      gitSha: "unknown",
      buildTime: "unknown",
      imageDigest: "unknown",
    });
    expect(config.publicRuntimeConfig).toMatchObject({
      schemaVersion: "public-runtime.v1",
      application: { applicationId: "app", displayName: "App" },
      tenant: { tenantId: "default", label: "Standardmandant" },
      delivery: { publicBaseUrl: "", serviceWorkerEnabled: false },
    });
    // SENTINEL-DISZIPLIN: ohne ZONE_SURFACES-Schlüssel gibt es KEIN `zone`-Feld ⇒ das Frontend läuft fail-open (Ein-App).
    expect(
      (config.publicRuntimeConfig as { zone?: unknown }).zone,
    ).toBeUndefined();
  });

  it("ZONE + ZONE_SURFACES ⇒ Zonen-Flächen in publicRuntimeConfig (Frontend-Filter-Quelle)", () => {
    const config = readRuntimeConfig({
      ZONE: "oeffentlich",
      ZONE_SURFACES: "buerger",
    });
    expect(config.publicRuntimeConfig).toMatchObject({
      zone: { id: "oeffentlich", allowedSurfaces: ["buerger"] },
    });
    const backoffice = readRuntimeConfig({
      ZONE: "intern-fach",
      ZONE_SURFACES: "sachbearbeitung, aufsicht",
    });
    expect(backoffice.publicRuntimeConfig).toMatchObject({
      zone: {
        id: "intern-fach",
        allowedSurfaces: ["sachbearbeitung", "aufsicht"],
      },
    });
  });

  it('ZONE_SURFACES="" (zonierte STRUKTUR-Zone) ⇒ `zone` VORHANDEN mit leerer Fläche — NICHT fail-open', () => {
    // Schlüssel gesetzt aber leer: das `zone`-Feld existiert (zoniert), allowedSurfaces=[] ⇒ Frontend blendet ALLES aus.
    const config = readRuntimeConfig({
      ZONE: "datenhaltung",
      ZONE_SURFACES: "",
    });
    expect(config.publicRuntimeConfig).toMatchObject({
      zone: { id: "datenhaltung", allowedSurfaces: [] },
    });
    expect(
      (config.publicRuntimeConfig as { zone?: unknown }).zone,
    ).toBeDefined();
  });

  it("lässt App-Identität und Static-Dir-Fallback per Overrides setzen", () => {
    const config = readRuntimeConfig(
      {},
      {
        defaultStaticDir: "/srv/meine-app/dist",
        applicationId: "meine-app",
        displayName: "Meine App",
      },
    );
    expect(config.staticDir).toBe("/srv/meine-app/dist");
    expect(config.publicRuntimeConfig).toMatchObject({
      application: { applicationId: "meine-app", displayName: "Meine App" },
    });
  });

  it("Env-Variablen gewinnen gegenüber Overrides", () => {
    const config = readRuntimeConfig(
      {
        STATIC_DIR: "/srv/env/dist",
        APP_APPLICATION_ID: "env-app",
        APP_DISPLAY_NAME: "Env App",
      },
      {
        defaultStaticDir: "/srv/override/dist",
        applicationId: "override-app",
        displayName: "Override App",
      },
    );
    expect(config.staticDir).toBe("/srv/env/dist");
    expect(config.publicRuntimeConfig).toMatchObject({
      application: { applicationId: "env-app", displayName: "Env App" },
    });
  });

  it("parst Booleans tolerant (1/true/yes bzw. 0/false/no) und wirft sonst", () => {
    expect(
      readRuntimeConfig({ APP_ENABLE_SERVICE_WORKER: "yes" })
        .serviceWorkerEnabled,
    ).toBe(true);
    expect(
      readRuntimeConfig({ APP_ENABLE_SERVICE_WORKER: "0" })
        .serviceWorkerEnabled,
    ).toBe(false);
    expect(() =>
      readRuntimeConfig({ APP_ENABLE_SERVICE_WORKER: "banane" }),
    ).toThrow(/invalid boolean/);
  });

  it("HSTS folgt NODE_ENV=production als Default", () => {
    expect(readRuntimeConfig({ NODE_ENV: "production" }).enableHsts).toBe(true);
    expect(
      readRuntimeConfig({ NODE_ENV: "production", APP_ENABLE_HSTS: "false" })
        .enableHsts,
    ).toBe(false);
  });

  it("wirft bei ungültigem CSP-Modus und ungültigen Ports", () => {
    expect(() => readRuntimeConfig({ APP_CSP_MODE: "aus" })).toThrow(
      /APP_CSP_MODE/,
    );
    expect(() => readRuntimeConfig({ PORT: "70000" })).toThrow(
      /invalid port value/,
    );
    expect(() => readRuntimeConfig({ PORT: "-1" })).toThrow(
      /invalid positive integer/,
    );
    expect(() => readRuntimeConfig({ PORT: "abc" })).toThrow(
      /invalid positive integer/,
    );
  });

  it("versteht die trustProxy-Varianten true/all/false/leer/custom", () => {
    expect(readRuntimeConfig({ APP_TRUST_PROXY: "true" }).trustProxy).toBe(
      true,
    );
    expect(readRuntimeConfig({ APP_TRUST_PROXY: "ALL" }).trustProxy).toBe(true);
    expect(readRuntimeConfig({ APP_TRUST_PROXY: "false" }).trustProxy).toBe(
      false,
    );
    expect(readRuntimeConfig({ APP_TRUST_PROXY: "" }).trustProxy).toBe(false);
    expect(
      readRuntimeConfig({ APP_TRUST_PROXY: "10.0.0.0/8" }).trustProxy,
    ).toBe("10.0.0.0/8");
  });

  it("mischt PUBLIC_BASE_URL-Host in die Allow-List (lowercased, ohne Trailing-Slash)", () => {
    const config = readRuntimeConfig({
      APP_ALLOWED_HOSTS: "App.Example.org, zweite.example.org",
      PUBLIC_BASE_URL: "https://Portal.Example.org/",
    });
    expect([...config.allowedHosts].sort()).toEqual([
      "app.example.org",
      "portal.example.org",
      "zweite.example.org",
    ]);
    expect(config.publicBaseUrl).toBe("https://portal.example.org");
    expect(config.publicRuntimeConfig).toMatchObject({
      delivery: { publicBaseUrl: "https://portal.example.org" },
    });
  });

  it("parst APP_REQUIRED_UPSTREAMS als URL-Liste und wirft bei Müll", () => {
    const config = readRuntimeConfig({
      APP_REQUIRED_UPSTREAMS:
        "https://idp.example.org, https://api.example.org/health",
    });
    expect(config.requiredUpstreams.map((url) => url.origin)).toEqual([
      "https://idp.example.org",
      "https://api.example.org",
    ]);
    expect(() =>
      readRuntimeConfig({ APP_REQUIRED_UPSTREAMS: "kein-url" }),
    ).toThrow();
  });
});

describe("redactedConfigSummary", () => {
  it("fasst die Konfiguration ohne Secrets zusammen (Hosts sortiert)", () => {
    const summary = redactedConfigSummary(
      readRuntimeConfig({
        APP_ALLOWED_HOSTS: "b.example.org,a.example.org",
        APP_VERSION: "1.2.3",
      }),
    );
    expect(summary.allowedHosts).toEqual(["a.example.org", "b.example.org"]);
    expect(summary.publicBaseUrl).toBe("");
    expect(summary.cspMode).toBe("enforce");
    expect(Object.keys(summary)).not.toContain("buildInfo");
  });
});
