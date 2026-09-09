import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { type Dataset, useDataStore } from "@/core/stores/data-store";
import { ChatComposer } from "@/features/data-formulator/components/moudir-chat/chat-composer";
import { useMoudirChatStore } from "@/features/data-formulator/store/moudir-chat-store";
import { useAIRuntimeStore } from "@/platform/ai/provider";

const createMockDataset = (
  overrides: Partial<Dataset> & { id: string; name: string },
): Dataset => ({
  tableName: overrides.name,
  viewName: `v_${overrides.name}`,
  source: "upload",
  format: "csv",
  rowCount: 1000,
  colCount: overrides.columns?.length ?? 2,
  sizeBytes: 2048,
  columns: [],
  tags: [],
  description: "",
  createdAt: "2024-06-01T00:00:00.000Z",
  updatedAt: "2024-06-01T00:00:00.000Z",
  qualityScore: 100,
  ...overrides,
});

const mockDatasets: Dataset[] = [
  createMockDataset({
    id: "ds_telecom",
    name: "telecom_transactions",
    rowCount: 24812,
    columns: [
      { name: "canal", type: "string", nullCount: 0, distinctCount: 4, sample: ["USSD", "WEB"] },
      { name: "montant", type: "number", nullCount: 0, distinctCount: 300, sample: [5000, 10000] },
      {
        name: "statut",
        type: "string",
        nullCount: 0,
        distinctCount: 2,
        sample: ["SUCCESS", "FAILED"],
      },
      {
        name: "date_transaction",
        type: "date",
        nullCount: 0,
        distinctCount: 30,
        sample: ["2024-06-01"],
      },
    ],
  }),
  createMockDataset({
    id: "ds_clients",
    name: "clients_abonnements",
    rowCount: 5400,
    columns: [
      { name: "client_id", type: "string", nullCount: 0, distinctCount: 5400, sample: ["CLI_001"] },
      {
        name: "region",
        type: "string",
        nullCount: 0,
        distinctCount: 10,
        sample: ["Centre", "Littoral"],
      },
    ],
  }),
];

function resetComposerStores() {
  useDataStore.setState({
    datasets: mockDatasets,
    activeDatasetId: "ds_telecom",
  });
  useAIRuntimeStore.setState({
    model: "granite-3.2-8b.gguf",
  });
  useMoudirChatStore.setState({
    status: "idle",
    followUps: ["Analyse du chiffre d'affaires", "Top 10 des clients"],
    messages: [],
    activeFilters: [],
  });
}

/**
 * ChatComposer is the primary prompt input for Moudir AI Chat.
 *
 * Features covered:
 * - Empty state with suggestions and disabled submit gating
 * - Text entry with dynamic submit enabling
 * - Attachment upload strip
 * - Offline model selector menu
 * - Context-aware @-mentions popover for datasets and columns
 */
const meta = {
  title: "Src/Features/DataFormulator/Components/ChatComposer",
  component: ChatComposer,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {},
  decorators: [
    (Story) => {
      resetComposerStores();
      return (
        <div className="w-full max-w-3xl mx-auto p-4 bg-background border border-border/40 rounded-xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ChatComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/Posez une question sur vos données/i);
    await expect(textarea).toBeInTheDocument();
    await expect(textarea).toHaveValue("");

    const submitBtn = canvas.getByRole("button", { name: /Envoyer le message/i });
    await expect(submitBtn).toBeDisabled();

    // Verify follow-up suggestion chips are visible
    await expect(canvas.getByText(/Analyse du chiffre d'affaires/i)).toBeInTheDocument();
  },
};

export const WithText: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/Posez une question sur vos données/i);
    await userEvent.type(textarea, "Quel est le volume des transactions par canal ?");
    await expect(textarea).toHaveValue("Quel est le volume des transactions par canal ?");

    const submitBtn = canvas.getByRole("button", { name: /Envoyer le message/i });
    await expect(submitBtn).toBeEnabled();
  },
};

export const WithAttachments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File(["id,valeur\n1,100\n2,200"], "rapport-q2.csv", {
      type: "text/csv",
    });

    const hiddenFileInput = canvasElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    if (hiddenFileInput) {
      await userEvent.upload(hiddenFileInput, file);
      await expect(await canvas.findByText("rapport-q2.csv")).toBeInTheDocument();
    }
  },
};

export const ModelSwitching: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const modelButton = canvas.getByRole("button", { name: /Changer le modèle actif/i });
    await expect(modelButton).toBeInTheDocument();

    await userEvent.click(modelButton);

    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByText(/Choisir un modèle/i)).toBeInTheDocument();
  },
};

export const WithMentionTrigger: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByPlaceholderText(/Posez une question sur vos données/i);

    await userEvent.clear(textarea);
    await userEvent.type(textarea, "@");

    const body = within(canvasElement.ownerDocument.body);
    // Popover opens showing datasets and column groups
    await expect(await body.findByText("telecom_transactions")).toBeInTheDocument();
    await expect(await body.findByText("canal")).toBeInTheDocument();

    // Select column mention
    const canalOption = body.getByText("canal");
    await userEvent.click(canalOption);

    // Verify mention token was inserted into composer textarea
    await expect(textarea).toHaveValue("@canal ");
  },
};
