import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type {
  ColumnMapping,
  CustomerProfileData,
  OperatorRow,
  RawRow,
  RegionRow,
  StatusMapping,
} from "@/features/telecom/types";
import { RawDataTab } from "@/features/telecom/components/raw-data-tab";

const mapping: ColumnMapping = {
  transactionId: "TRANSACTION_ID",
  transactionDate: "TRANSACTION_DATE",
  transactionTime: "TRANSACTION_TIME",
  canal: "CANAL",
  serviceCode: "SERVICE_CODE",
  serviceName: "SERVICE_NAME",
  transactionType: "TRANSACTION_TYPE",
  subscriberType: "SUBSCRIBER_TYPE",
  msisdn: "MSISDN",
  amount: "AMOUNT",
  status: "STATUS",
  errorCode: "ERROR_CODE",
  errorMessage: "ERROR_MESSAGE",
  operator: "OPERATOR",
  region: "REGION",
  processingTimeMs: "PROCESSING_TIME_MS",
  previousBalance: "PREVIOUS_BALANCE",
  newBalance: "NEW_BALANCE",
  totalAmount: "TOTAL_AMOUNT",
  retryCount: "RETRY_COUNT",
};

const operators: OperatorRow[] = [
  {
    operator: "Ooredoo",
    total: 12_400,
    success: 11_980,
    amount: 248_100,
    successRate: 96.6,
    accountType: "source",
  },
  {
    operator: "Orange",
    total: 8_100,
    success: 7_540,
    amount: 121_500,
    successRate: 93.1,
    accountType: "source",
  },
  {
    operator: "Tunisie Telecom",
    total: 4_300,
    success: 3_650,
    amount: 64_500,
    successRate: 84.9,
    accountType: "destination",
  },
];

const regions: RegionRow[] = [
  { region: "Tunis", total: 14_200, success: 13_700, amount: 261_300 },
  { region: "Sfax", total: 6_100, success: 5_820, amount: 112_400 },
  { region: "Sousse", total: 4_512, success: 4_350, amount: 77_600 },
];

const statusMapping: StatusMapping[] = [
  {
    rawCode: "00",
    label: "Réussie",
    semantic: "success",
    color: "emerald",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    rawCode: "51",
    label: "Refusée",
    semantic: "declined",
    color: "red",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
];

const sampleRows: RawRow[] = Array.from({ length: 12 }, (_, i) => ({
  TRANSACTION_ID: `TX-20240601-${(1000 + i).toString()}`,
  TRANSACTION_DATE: "2024-06-01",
  TRANSACTION_TIME: `1${i % 9}:0${i % 6}`,
  MSISDN: `2162${(2_000_000 + i).toString()}`,
  AMOUNT: 10 + (i % 5) * 5,
  STATUS: i % 7 === 0 ? "DECLINED" : "SUCCESS",
  OPERATOR: ["Ooredoo", "Orange", "Tunisie Telecom"][i % 3],
  REGION: ["Tunis", "Sfax", "Sousse"][i % 3],
}));

const fetchFiltered = async () => ({
  rows: sampleRows,
  total: sampleRows.length,
});

const fetchCustomerProfile = async (
  _m: ColumnMapping,
  msisdn: string,
): Promise<CustomerProfileData> => ({
  msisdn,
  name: "Abonné Démo",
  group: "Particulier",
  total: 142,
  success: 136,
  declined: 6,
  totalAmount: 2_840.5,
  avgAmount: 20.0,
  favoriteCanal: "Paiement facture",
  peakHour: 12,
  topError: "51",
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, total: (hour % 6) + 1 })),
  recentTx: sampleRows.slice(0, 5),
});

const meta = {
  title: "Src/Features/Telecom/Components/RawDataTab",
  component: RawDataTab,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    m: mapping,
    operators,
    regions,
    statusMapping,
    tableName: "telecom_2024_06_01",
    fetchFiltered,
    fetchCustomerProfile,
  },
  argTypes: {
    m: { control: false },
    operators: { control: false },
    regions: { control: false },
    statusMapping: { control: false },
    fetchFiltered: { control: false },
    fetchCustomerProfile: { control: false },
    tableName: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 16 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RawDataTab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    operators: [],
    regions: [],
    fetchFiltered: async () => ({ rows: [], total: 0 }),
  },
};
