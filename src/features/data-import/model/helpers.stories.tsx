import type { Meta, StoryObj } from "@storybook/nextjs";

import { Helpers } from "./helpers";

const meta = {
  title: "Src/Features/DataImport/Model/Helpers",
  component: Helpers,
  tags: ["autodocs"],
} satisfies Meta<typeof Helpers>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
