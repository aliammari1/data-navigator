import type { Meta, StoryObj } from "@storybook/nextjs";

import { AnomalyDetectorPanel } from "./anomaly-detector-panel";

const meta = {
  title: "Src/Features/Telecom/Components/AnomalyDetectorPanel",
  component: AnomalyDetectorPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof AnomalyDetectorPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
