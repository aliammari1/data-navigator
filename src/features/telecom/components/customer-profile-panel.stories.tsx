import type { Meta, StoryObj } from "@storybook/nextjs";
import type { ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import type {
  ColumnMapping,
  CustomerProfileData,
} from "@/features/telecom/types";
import { CustomerProfilePanel } from "./customer-profile-panel";

type FetchCustomerProfile = ComponentProps<
  typeof CustomerProfilePanel
>["fetchCustomerProfile"];

const mapping: ColumnMapping = {
  transactionId: "transaction_id",
  transactionDate: "transaction_date",
  transactionTime: "transaction_time",
  canal: "canal",
  serviceCode: "service_code",
  serviceName: "service_name",
  transactionType: "transaction_type",
  subscriberType: "subscriber_type",
  msisdn: "msisdn",
  amount: "amount",
  status: "status",
  errorCode: "error_code",
  errorMessage: "error_message",
  operator: "operator",
  region: "region",
  processingTimeMs: "processing_time_ms",
  previousBalance: "previous_balance",
  newBalance: "new_balance",
  totalAmount: "total_amount",
  retryCount: "retry_count",
};

const profile: CustomerProfileData = {
  msisdn: "21698765432",
  name: "Abonné 21698765432",
  group: "Particulier",
  total: 142,
  success: 134,
  declined: 8,
  totalAmount: 92_400,
  avgAmount: 650.7,
  favoriteCanal: "Mobile by TTCASH",
  peakHour: 18,
  topError: "INSUFFICIENT_BALANCE",
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: hour >= 16 && hour <= 20 ? 18 : 4,
  })),
  recentTx: Array.from({ length: 14 }, (_, i) => ({
    transaction_id: `TX-${1000 + i}`,
    transaction_date: `2024-06-01 ${String(8 + i).padStart(2, "0")}:30`,
    status: i % 5 === 0 ? "DC01" : "OK",
    amount: 500 + i * 25,
    canal: "Mobile by TTCASH",
  })),
};

// Annotated with the component prop type so the meta args don't infer a
// narrower zero-arg signature that story-level overrides can't satisfy.
const fetchProfileMock: FetchCustomerProfile = async () => profile;

const meta = {
  title: "Src/Features/Telecom/Components/CustomerProfilePanel",
  component: CustomerProfilePanel,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    msisdn: "21698765432",
    m: mapping,
    onClose: fn(),
    fetchCustomerProfile: fetchProfileMock,
  },
  argTypes: {
    msisdn: { control: "text" },
    m: { control: false },
    onClose: { control: false },
    fetchCustomerProfile: { control: false },
  },
} satisfies Meta<typeof CustomerProfilePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mobile by TTCASH")).toBeInTheDocument();
  },
};

export const NoData: Story = {
  args: {
    // Mock returns null to exercise the empty state.
    fetchCustomerProfile: (async () => null) as FetchCustomerProfile,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/Aucune donnée trouvée pour ce numéro/i),
    ).toBeInTheDocument();
  },
};

export const ClosesOnClick: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const buttons = canvas.getAllByRole("button");
    // The header close (X) is the first button rendered.
    await userEvent.click(buttons[0]);
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
