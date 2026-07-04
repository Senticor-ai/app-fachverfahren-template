import type { Preview } from "@storybook/react";
// Das Design-System lebt im Kit — Storybook lädt DIE Kit-Tokens (keine App-eigene zweite Wahrheit).
import "../packages/fachverfahren-kit/src/styles.css";
import "../packages/fachverfahren-kit/src/public-sector-ui.css";

// A11y-/Theme-Modi über die Symbolleiste: schaltet die vom Kit definierten Klassen (styles.css) an <html>.
// So lässt sich JEDE Story in light / dark / High-Contrast und mit Groß-Text prüfen (WCAG 2.2, BITV, EN 301 549).
const THEME_CLASSES = ["dark", "high-contrast", "large-text"] as const;

function applyTheme(theme: string) {
  const root =
    typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return;
  for (const c of THEME_CLASSES) root.classList.remove(c);
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "high-contrast") root.classList.add("high-contrast");
  else if (theme === "large-text") root.classList.add("large-text");
  else if (theme === "dark-large-text") {
    root.classList.add("dark");
    root.classList.add("large-text");
  }
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description:
        "Theme-/A11y-Modus (light · dark · High-Contrast · Groß-Text)",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "contrast",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "high-contrast", title: "High Contrast" },
          { value: "large-text", title: "Groß-Text" },
          { value: "dark-large-text", title: "Dark + Groß-Text" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      applyTheme(
        typeof context.globals["theme"] === "string"
          ? context.globals["theme"]
          : "light",
      );
      return Story();
    },
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      values: [
        { name: "Public sector light", value: "#f6f7fa" },
        { name: "Public sector dark", value: "#20283b" },
        { name: "White", value: "#ffffff" },
      ],
    },
    a11y: {
      test: "todo",
    },
  },
  tags: ["autodocs"],
};

export default preview;
