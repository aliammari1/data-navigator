import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HourlyChart } from "@/features/telecom/components/hourly-chart";
import type { HourlyRow } from "@/features/telecom/types";

const data: HourlyRow[] = Array.from({ length: 24 }, (_, hour) => {
  const base = Math.round(400 + 900 * Math.sin((hour / 24) * Math.PI));
  const total = Math.max(60, base);
  const declined = Math.round(total * 0.04);
  return {
    hour,
    total,
    success: total - declined,
    declined,
    amount: total * 18.4,
  };
});

const meta = {
  title: "Src/Features/Telecom/Components/HourlyChart",
  component: HourlyChart,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data,
  },
  argTypes: {
    data: { control: false },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HourlyChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { data: [] },
};
