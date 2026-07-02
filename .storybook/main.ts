import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "..");

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../packages/fachverfahren-kit/src/**/*.stories.@(ts|tsx)",
    "../modules/**/ui/**/*.stories.@(ts|tsx)",
    "../packages/public-sector-ui/src/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  typescript: {
    reactDocgen: "react-docgen",
  },
  viteFinal: async (config) => {
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    config.server ??= {};
    config.server.fs ??= {};
    config.server.fs.strict = false;
    config.server.fs.allow = [
      ...(config.server.fs.allow ?? []),
      repoRoot,
      path.resolve(repoRoot, "packages/fachverfahren-kit"),
      path.resolve(repoRoot, "modules"),
      path.resolve(repoRoot, "packages/public-sector-ui"),
    ];
    return config;
  },
};

export default config;
