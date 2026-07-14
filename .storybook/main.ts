import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../apps/fachverfahren/src/**/*.stories.@(ts|tsx)",
    "../packages/fachverfahren-kit/src/**/*.stories.@(ts|tsx)",
    "../modules/**/ui/**/*.stories.@(ts|tsx)",
    "../packages/public-sector-ui/src/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-vitest",
  ],
  typescript: {
    reactDocgen: "react-docgen",
  },
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    // `@senticor/public-sector-ui` ist ein Workspace-Paket, das (absichtlich) von keinem anderen Paket
    // als Dependency deklariert wird — pnpm verlinkt es daher nicht in node_modules, und Rolldown kann den
    // Bare-Import aus den Kit-Stories nicht auflösen. Storybook lädt die public-sector-ui-Stories ohnehin
    // aus dem Quellcode (siehe stories-Glob), also mappen wir den Import deterministisch auf den src-Entry.
    const publicSectorUiSrc = path.resolve(
      repoRoot,
      "packages/public-sector-ui/src/index.ts",
    );
    config.resolve ??= {};
    const existingAlias = config.resolve.alias;
    if (Array.isArray(existingAlias)) {
      existingAlias.push({
        find: "@senticor/public-sector-ui",
        replacement: publicSectorUiSrc,
      });
    } else {
      config.resolve.alias = {
        ...(existingAlias ?? {}),
        "@senticor/public-sector-ui": publicSectorUiSrc,
      };
    }
    config.server ??= {};
    config.server.fs ??= {};
    config.server.fs.strict = false;
    config.server.fs.allow = [
      ...(config.server.fs.allow ?? []),
      repoRoot,
      path.resolve(repoRoot, "apps/fachverfahren"),
      path.resolve(repoRoot, "packages/fachverfahren-kit"),
      path.resolve(repoRoot, "modules"),
      path.resolve(repoRoot, "packages/public-sector-ui"),
    ];
    return config;
  },
};

export default config;
