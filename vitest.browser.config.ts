import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Separate Konfiguration für echte Browser-Tests (test:browser, Playwright/Chromium) — analog zu
// vitest.e2e.config.ts. Bewusst NICHT Teil des schnellen `test`-Laufs (Browser-Start ist teurer),
// aber notwendig für Interaktionen, die jsdom nicht korrekt simulieren kann — vor allem `@dnd-kit`s
// PointerSensor, der echte PointerEvent-Sequenzen mit Bewegungs-Schwellwert braucht.
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
    include: ["**/*.browser.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/dist-server/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // Desktop-Viewport festnageln: unterhalb `sm` stapelt das Kanban-Board seine Spalten
      // (WCAG-Reflow) — die Drag-and-Drop-Tests testen bewusst das Spalten-NEBENEINANDER.
      viewport: { width: 1280, height: 720 },
      instances: [{ browser: "chromium" }],
    },
  },
});
