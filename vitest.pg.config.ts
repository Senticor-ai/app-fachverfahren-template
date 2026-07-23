import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate Konfiguration für die POSTGRES-Integration (test:pg): ein echter Postgres-Container
// (tests/pg/global-setup.ts, testcontainers) fährt hoch + migriert, dann laufen die Store-Vertragstest
// über die ECHTE DB (describe.skipIf greift nur, wenn Docker fehlt → graceful). Bewusst NICHT Teil des
// schnellen `test`-Laufs (kein Docker-Zwang dort).
const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/dist/index.js`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@senticor/platform-contracts": pkg("platform-contracts"),
      "@senticor/public-sector-sdk": pkg("public-sector-sdk"),
    },
  },
  test: {
    include: ["packages/app-store-postgres/src/**/*.test.ts"],
    globalSetup: ["tests/pg/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
