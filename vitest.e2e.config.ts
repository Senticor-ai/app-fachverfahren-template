import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate Konfiguration für den End-to-End-Rauchtest (test:e2e). Er baut in beforeAll das reale Bundle
// (vite build → dist/) und prüft das Ausliefern via fastify app.inject() — bewusst NICHT Teil des schnellen
// `test`-Laufs (dort ausgeschlossen), damit Unit-Tests ohne Full-Build-Kosten schnell bleiben.
const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/dist/index.js`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@senticor/public-sector-sdk": pkg("public-sector-sdk"),
      "@senticor/platform-contracts": pkg("platform-contracts"),
      "@senticor/conformance-kit": pkg("conformance-kit"),
    },
  },
  test: {
    include: ["tests/e2e/**/*.e2e.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
