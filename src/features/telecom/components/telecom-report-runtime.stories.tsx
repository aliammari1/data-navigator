import type { Meta, StoryObj } from "@storybook/nextjs";

import { TelecomReportRuntime } from "./telecom-report-runtime";

const meta = {
  title: "Src/Features/Telecom/Components/TelecomReportRuntime",
  component: TelecomReportRuntime,
  tags: ["autodocs"],
} satisfies Meta<typeof TelecomReportRuntime>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
