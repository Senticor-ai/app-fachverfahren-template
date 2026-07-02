import type { Preview } from "@storybook/react";
// Das Design-System lebt im Kit — Storybook lädt DIE Kit-Tokens (keine App-eigene zweite Wahrheit).
import "../packages/fachverfahren-kit/src/styles.css";

const preview: Preview = {
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
