import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Workspace-Pakete sind nur in apps/* als node_modules verlinkt. Domain-Modul-Tests laufen aber vom
// Repo-Root (vitest run). Diese Aliase lassen Modul-Tests die in module.contract.yaml ERLAUBTEN
// Plattformpakete (@senticor/*) auf ihre gebauten Pakete auflösen — ohne Provider/Infrastruktur.
const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/dist/index.js`, import.meta.url));
// Das UI-Kit ist src-only (kein dist-Build) — Root-Tests (tests/simulation) lösen es auf die Quelle auf.
const kitSrc = fileURLToPath(
  new URL("./packages/fachverfahren-kit/src/index.ts", import.meta.url),
);

const sharedExclude = [
  "**/.{git,cache,output,temp}/**",
  "**/coverage/**",
  "**/dist/**",
  "**/dist-server/**",
  "**/node_modules/**",
  // E2E baut das reale Bundle (Full-Build-Kosten) — läuft separat via `test:e2e` (vitest.e2e.config.ts).
  "tests/e2e/**",
];

export default defineConfig({
  resolve: {
    alias: {
      "@senticor/public-sector-sdk": pkg("public-sector-sdk"),
      "@senticor/platform-contracts": pkg("platform-contracts"),
      "@senticor/conformance-kit": pkg("conformance-kit"),
      "@senticor/app-store-postgres": pkg("app-store-postgres"),
      "@senticor/fachverfahren-kit": kitSrc,
    },
  },
  test: {
    // Die opencode.de-Runner sind kleine k8s-Pods („gitlab-generic-low") mit enger CPU-Quote, aber
    // Node meldet die Kerne des HOSTS (availableParallelism ist nicht cgroup-aware): Vitest forkt
    // dann weit mehr Worker, als die Quote bedient, und die Render-Tests verhungern gegenseitig.
    // Messbar in Pipeline 618235, SELBER Job: RC1 14s im 9-Dateien-Lauf (test:template), 60s+-Timeout
    // im 31-Dateien-Lauf Minuten später. Feste kleine Worker-Zahl auf CI macht Einzeltest-Zeiten
    // wieder planbar; lokal bleibt die volle Parallelität.
    maxWorkers: process.env.CI ? 2 : undefined,
    exclude: sharedExclude,
    projects: [
      {
        extends: true,
        test: {
          // Template-Engine-Tests machen echte mkdtemp-, Full-Repo-Render- und Subprozess-Arbeit
          // (render.test.ts, render.contract.test.ts, cli.test.ts). Auf den opencode.de-Runnern
          // rissen dafür unter Last sowohl 20s als auch 60s pro Test (Pipeline 618076: RC1 20014ms;
          // Pipeline 618235: RC1 60012ms, cli-Scaffold 20039ms) — GitHubs schnellere Runner treffen
          // die Grenze nie. Großzügiges Budget NUR für diese Suite, damit echte Hänger in allen
          // übrigen Tests weiterhin schnell auffallen.
          name: "template-tooling",
          include: ["tooling/template/**/*.test.ts"],
          exclude: sharedExclude,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          // Alle übrigen Tests: reine Unit-/Integrationstests ohne Full-Repo-I/O. Vitests 5s-Default
          // riss auf den opencode.de-Runnern trotzdem nicht-deterministisch — 20s stabilisieren die
          // GitLab-Pipeline, ohne echte Hänger zu verstecken.
          name: "unit",
          exclude: [...sharedExclude, "tooling/template/**"],
          testTimeout: 20000,
          hookTimeout: 20000,
        },
      },
    ],
  },
});
