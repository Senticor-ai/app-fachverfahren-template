import js from "@eslint/js";
import react from "@eslint-react/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
// ⭐ ONE TRUTH about what is build output. ESLint's flat config does NOT read `.gitignore` (unlike
// Prettier 3, which does — measured 2026-09-01: `prettier --check storybook-static/**/*.js` passes on
// minified bundles because .gitignore is a default ignore-path). So this list used to be hand-maintained,
// and it was one of the SEVEN copies that had drifted apart. It now derives from the same
// `.gitignore` every gate reads. Anything ESLint alone must skip is appended below, with its reason.
import { readFileSync } from "node:fs";
import { sourceExclusions } from "./scripts/lib/source-exclusion.ts";

const gitignore = (() => {
  try {
    return readFileSync(new URL("./.gitignore", import.meta.url), "utf8");
  } catch (error) {
    // ⛔ FAIL-CLOSED, not `catch -> ""`. An unreadable .gitignore silently produces the built-in floor
    // only; a MISSING one is an answer, anything else is a failure to look — and lint that quietly stops
    // ignoring build output would drown the real findings.
    if (error.code !== "ENOENT") throw error;
    return null;
  }
})();

const buildOutputIgnores = [...sourceExclusions(gitignore)]
  .sort()
  .flatMap((name) => [`${name}/**`, `**/${name}/**`]);

export default tseslint.config(
  {
    ignores: [
      ...buildOutputIgnores,
      // ESLint-only: git TRACKS these, so `.gitignore` cannot carry them. Generated or vendored browser
      // assets that are shipped as-is and are not authored source.
      "*.tsbuildinfo",
      "**/public/mockServiceWorker.js",
      "**/public/preview-reporter.js",
      "**/public/service-worker.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      "@eslint-react": react,
    },
    rules: {
      "@eslint-react/no-nested-component-definitions": "error",
    },
  },
  prettier,
);
