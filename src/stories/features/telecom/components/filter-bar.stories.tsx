import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { FilterBar } from "@/features/telecom/components/filter-bar";
import type { FilterState } from "@/features/telecom/types";

const emptyFilters: FilterState = {
  status: "",
  canal: "",
  region: "",
  operator: "",
  search: "",
  minAmount: "",
  maxAmount: "",
  hourFrom: "",
  hourTo: "",
};

const meta = {
  title: "Src/Features/Telecom/Components/FilterBar",
  component: FilterBar,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    filters: emptyFilters,
    operators: ["Ooredoo", "Orange", "Tunisie Telecom"],
    regions: ["Tunis", "Sfax", "Sousse", "Bizerte"],
    onChange: fn(),
  },
  argTypes: {
    filters: { control: false },
    operators: { control: false },
    regions: { control: false },
  },
} satisfies Meta<typeof FilterBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActiveFilters: Story = {
  args: {
    filters: {
      ...emptyFilters,
      status: "SUCCESS",
      operator: "Ooredoo",
      region: "Tunis",
      search: "216 22",
      minAmount: "10",
      maxAmount: "500",
    },
  },
};

export const TypingSearchEmitsChange: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByPlaceholderText(/Rechercher MSISDN/i);
    await userEvent.type(input, "9");
    await expect(args.onChange).toHaveBeenCalled();
  },
};

export const SelectingStatusEmitsChange: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const [statusSelect] = canvas.getAllByRole("combobox");
    await userEvent.selectOptions(statusSelect, "SUCCESS");
    await expect(args.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SUCCESS" }),
    );
  },
};
