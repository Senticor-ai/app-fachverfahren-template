import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../apps/fachverfahren-template/src/**/*.stories.@(ts|tsx)",
    "../modules/**/ui/**/*.stories.@(ts|tsx)",
    "../packages/public-sector-ui/src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  typescript: {
    reactDocgen: "react-docgen",
  },
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(repoRoot, "apps/fachverfahren-template/src"),
    };
    config.server ??= {};
    config.server.fs ??= {};
    config.server.fs.strict = false;
    config.server.fs.allow = [
      ...(config.server.fs.allow ?? []),
      repoRoot,
      path.resolve(repoRoot, "apps/fachverfahren-template"),
      path.resolve(repoRoot, "modules"),
      path.resolve(repoRoot, "packages/public-sector-ui"),
    ];
    return config;
  },
};

export default config;
