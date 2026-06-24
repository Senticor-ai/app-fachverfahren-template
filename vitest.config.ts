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
    exclude: [
      "**/.{git,cache,output,temp}/**",
      "**/coverage/**",
      "**/dist/**",
      "**/dist-server/**",
      "**/node_modules/**",
    ],
  },
});
