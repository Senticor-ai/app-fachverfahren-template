import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Workspace-Pakete sind nur in apps/* als node_modules verlinkt. Domain-Modul-Tests laufen aber vom
// Repo-Root (vitest run). Diese Aliase lassen Modul-Tests die in module.contract.yaml ERLAUBTEN
// Plattformpakete (@senticor/*) auf ihre gebauten Pakete auflösen — ohne Provider/Infrastruktur.
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
    // Template-Scaffold-/Render-/Agent-Contract-Tests machen echte mkdtemp-, Full-Repo-Render- und
    // Subprozess-Arbeit. Auf den langsameren opencode.de-CI-Runnern reißt Vitests 5s-Default unter Last
    // (nicht-deterministisch mal 2, mal 6 Timeouts) — GitHubs schnellere Runner treffen die Grenze nie.
    // Ein großzügigeres Budget stabilisiert die GitLab-Pipeline, ohne echte Hänger zu verstecken.
    // Die Full-Repo-Render-Tests (render.test.ts, render.contract.test.ts) tragen zusätzlich ein
    // eigenes 60s-Budget pro Test — 20s riss dort unter Runner-Last erneut (RC1: 20014ms).
    testTimeout: 20000,
    hookTimeout: 20000,
    exclude: [
      "**/.{git,cache,output,temp}/**",
      "**/coverage/**",
      "**/dist/**",
      "**/dist-server/**",
      "**/node_modules/**",
      // E2E baut das reale Bundle (Full-Build-Kosten) — läuft separat via `test:e2e` (vitest.e2e.config.ts).
      "tests/e2e/**",
    ],
  },
});
