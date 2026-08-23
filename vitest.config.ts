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
    // 20000 -> 60000 (2026-08-23): dieselbe Begruendung wie oben, eine Stufe weiter. Der Codesphere-
    // Deploy fuehrt dieses Gate auf einem Workspace aus, und dort war das 20s-Budget zu knapp. 60s
    // bleibt weit unter dem, was ein echter Haenger braeuchte — versteckt also nichts.
    testTimeout: 60000,
    hookTimeout: 60000,
    exclude: [
      "**/.{git,cache,output,temp}/**",
      "**/coverage/**",
      "**/dist/**",
      "**/dist-server/**",
      "**/node_modules/**",
      // E2E baut das reale Bundle (Full-Build-Kosten) — läuft separat via `test:e2e` (vitest.e2e.config.ts).
      "tests/e2e/**",
      // Selbsttests der VORLAGEN-MASCHINERIE (Scaffold-Determinismus, Render-Contracts, Template-CLI,
      // Agent-Platform-Contracts). Sie pruefen den GENERATOR, nicht das erzeugte Fachverfahren, und
      // machen mkdtemp-, Full-Repo-Render- und Subprozess-Arbeit. Im Deploy-Tor einer generierten App
      // blockierten sie den Rollout: 8 Fehlschlaege auf einem Codesphere-Workspace, 5 davon selbst bei
      // 120s Timeout (2026-08-23). Im Vorlagen-Repo laufen sie weiter — dort gehoeren sie hin, denn
      // dort IST der Generator das Produkt. Siehe scripts/test-template.* / `pnpm run test:template`.
      "tooling/template/**",
    ],
  },
});
