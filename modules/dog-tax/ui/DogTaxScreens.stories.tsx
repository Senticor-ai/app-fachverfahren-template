import type { Meta, StoryObj } from "@storybook/react";
import { AuditScreen, CaseworkerScreen, CitizenScreen } from "./screens.js";

const meta = {
  title: "Hundesteuer/Screens",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const CitizenReady: Story = {
  render: () => <CitizenScreen />,
};

export const CaseworkerReady: Story = {
  render: () => <CaseworkerScreen />,
};

export const AuditReady: Story = {
  render: () => <AuditScreen />,
};
