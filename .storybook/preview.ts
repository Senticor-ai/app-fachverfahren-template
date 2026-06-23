import type { Preview } from "@storybook/react";
import "../apps/fachverfahren-template/src/styles/index.css";

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
