// dev-api.test.mjs — Env-Vertrag von `pnpm dev:api` (lokale App-Runtime für den Vite-Dev-Proxy).
// Die Defaults MÜSSEN zu den anderen Dev-Verträgen passen: PORT 8080 = Default des
// Vite-Dev-Proxys (apps/fachverfahren/dev-proxy.ts), APP_PG_URL = Zugangsdaten des
// mitgelieferten Dev-Postgres (dev/postgres.yaml: app/app/app).
import { describe, expect, it } from "vitest";

import { resolveDevApiEnv } from "./dev-api.mjs";

describe("resolveDevApiEnv", () => {
  it("Defaults passen zu Dev-Proxy (8080) und dev/postgres.yaml (app/app/app)", () => {
    const env = resolveDevApiEnv({});
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe("8080");
    expect(env.INTERNAL_PORT).toBe("9090");
    expect(env.APP_PG_URL).toBe("postgres://app:app@127.0.0.1:5432/app");
    expect(env.BOOTSTRAP_TOKEN).toBe("dev-setup");
  });

  it("respektiert vorhandene Werte (eigene DB, eigener Port, eigenes Token)", () => {
    const env = resolveDevApiEnv({
      APP_PG_URL:
        "postgres://postgres:postgres@127.0.0.1:5432/fachverfahren_dev",
      PORT: "8090",
      BOOTSTRAP_TOKEN: "mein-token",
    });
    expect(env.APP_PG_URL).toBe(
      "postgres://postgres:postgres@127.0.0.1:5432/fachverfahren_dev",
    );
    expect(env.PORT).toBe("8090");
    expect(env.BOOTSTRAP_TOKEN).toBe("mein-token");
  });

  it("injiziert KEIN Default-Bootstrap-Token, wenn Auto-Bootstrap konfiguriert ist", () => {
    const env = resolveDevApiEnv({
      AUTH_BOOTSTRAP_ADMIN_EMAIL: "admin@example.org",
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: "sicheres-dev-passwort", // pragma: allowlist-secret
    });
    expect(env.BOOTSTRAP_TOKEN).toBeUndefined();
  });
});
