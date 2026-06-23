import { defineConfig } from "vitest/config";

export default defineConfig({
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
