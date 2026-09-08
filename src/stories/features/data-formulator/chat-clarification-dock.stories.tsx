import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { useDataStore, type Dataset } from "@/core/stores/data-store";
import { ChatClarificationDock } from "@/features/data-formulator/components/moudir-chat/chat-clarification-dock";
import {
  type ChatMessage,
  useMoudirChatStore,
} from "@/features/data-formulator/store/moudir-chat-store";

const mockDataset: Dataset = {
  id: "ds_telecom",
  name: "telecom_transactions",
  tableName: "telecom_transactions",
  viewName: "v_telecom_transactions",
  source: "upload",
  format: "csv",
  rowCount: 10000,
  colCount: 4,
  sizeBytes: 4096,
  tags: [],
  description: "",
  createdAt: "2024-06-01T00:00:00.000Z",
  updatedAt: "2024-06-01T00:00:00.000Z",
  qualityScore: 100,
  columns: [
    { name: "canal", type: "string", nullCount: 0, distinctCount: 4, sample: ["USSD", "WEB"] },
    { name: "montant", type: "number", nullCount: 0, distinctCount: 200, sample: [5000, 10000] },
    { name: "frais", type: "number", nullCount: 0, distinctCount: 50, sample: [100, 200] },
    { name: "volume", type: "number", nullCount: 0, distinctCount: 150, sample: [1, 5] },
  ],
};

const singleChoiceMessage: ChatMessage = {
  id: "msg_clarif_1",
  role: "assistant",
  content: "Précisez le canal",
  status: "done",
  parts: [
    {
      kind: "clarification",
      question: "Quel canal de distribution souhaitez-vous filtrer ?",
      options: ["USSD", "WEB", "ORANGE_MONEY", "AGENCE"],
      multiSelect: false,
    },
  ],
  createdAt: Date.now(),
};

const multiChoiceMessage: ChatMessage = {
  id: "msg_clarif_2",
  role: "assistant",
  content: "Précisez les métriques",
  status: "done",
  parts: [
    {
      kind: "clarification",
      question: "Quelles colonnes de métriques souhaitez-vous inclure ?",
      options: ["montant", "frais", "volume", "taux_succes"],
      multiSelect: true,
    },
  ],
  createdAt: Date.now(),
};

const multiQuestionMessage: ChatMessage = {
  id: "msg_clarif_3",
  role: "assistant",
  content: "Deux clarifications requises",
  status: "done",
  parts: [
    {
      kind: "clarification",
      question: "Sélectionnez le type d'agrégation",
      options: ["Somme", "Moyenne", "Médiane", "Comptage"],
      multiSelect: false,
    },
    {
      kind: "clarification",
      question: "Sur quelle plage horaire ?",
      options: ["Heures de pointe (8h-18h)", "Heures creuses (18h-8h)", "Toute la journée"],
      multiSelect: false,
    },
  ],
  createdAt: Date.now(),
};

/**
 * ChatClarificationDock renders interactive clarification questionnaires when
 * the assistant needs additional parameters or user input to disambiguate intent.
 */
const meta = {
  title: "Src/Features/DataFormulator/Components/ChatClarificationDock",
  component: ChatClarificationDock,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {},
  decorators: [
    (Story) => {
      useDataStore.setState({
        datasets: [mockDataset],
        activeDatasetId: "ds_telecom",
      });
      return (
        <div className="w-full max-w-3xl mx-auto p-4 bg-background border border-border/40 rounded-xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ChatClarificationDock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleChoiceQuestionnaire: Story = {
  play: async ({ canvasElement }) => {
    const answerClarificationMock = fn();
    useMoudirChatStore.setState({
      messages: [singleChoiceMessage],
      answerClarification: answerClarificationMock,
      status: "idle",
    });

    const canvas = within(canvasElement);

    // Verify question header
    await expect(
      await canvas.findByText("Quel canal de distribution souhaitez-vous filtrer ?"),
    ).toBeInTheDocument();

    // Verify option chips
    await expect(canvas.getByText("USSD")).toBeInTheDocument();
    await expect(canvas.getByText("WEB")).toBeInTheDocument();
    await expect(canvas.getByText("ORANGE_MONEY")).toBeInTheDocument();
    await expect(canvas.getByText("AGENCE")).toBeInTheDocument();

    // Select single choice option
    await userEvent.click(canvas.getByText("USSD"));
    expect(answerClarificationMock).toHaveBeenCalledWith(
      "msg_clarif_1",
      "Quel canal de distribution souhaitez-vous filtrer ?",
      "USSD",
    );
  },
};

export const MultiChoiceQuestionnaire: Story = {
  play: async ({ canvasElement }) => {
    const answerClarificationMock = fn();
    useMoudirChatStore.setState({
      messages: [multiChoiceMessage],
      answerClarification: answerClarificationMock,
      status: "idle",
    });

    const canvas = within(canvasElement);

    // Verify multi-select mode indication
    await expect(
      await canvas.findByText("Quelles colonnes de métriques souhaitez-vous inclure ?"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Sélection multiple ✓")).toBeInTheDocument();

    // Select multiple options
    await userEvent.click(canvas.getByText("montant"));
    await userEvent.click(canvas.getByText("frais"));

    // Confirmation bar surfaces count
    await expect(await canvas.findByText(/2 options sélectionnées/i)).toBeInTheDocument();

    // Confirm multi selection
    const validateBtn = canvas.getByRole("button", { name: /Valider la sélection/i });
    await userEvent.click(validateBtn);

    expect(answerClarificationMock).toHaveBeenCalledWith(
      "msg_clarif_2",
      "Quelles colonnes de métriques souhaitez-vous inclure ?",
      "montant, frais",
    );
  },
};

export const WriteInAnswers: Story = {
  play: async ({ canvasElement }) => {
    const answerClarificationMock = fn();
    useMoudirChatStore.setState({
      messages: [singleChoiceMessage],
      answerClarification: answerClarificationMock,
      status: "idle",
    });

    const canvas = within(canvasElement);

    // Click "Autre réponse…" to toggle custom input
    const otherButton = await canvas.findByRole("button", { name: /Autre réponse…/i });
    await userEvent.click(otherButton);

    const input = canvas.getByPlaceholderText(/Précisez votre propre réponse personnalisée…/i);
    await expect(input).toBeInTheDocument();

    await userEvent.type(input, "Filtrer uniquement le canal USSD avec statut SUCCESS");

    const submitCustomBtn = canvas.getByRole("button", { name: /^Valider$/i });
    await userEvent.click(submitCustomBtn);

    expect(answerClarificationMock).toHaveBeenCalledWith(
      "msg_clarif_1",
      "Quel canal de distribution souhaitez-vous filtrer ?",
      "Filtrer uniquement le canal USSD avec statut SUCCESS",
    );
  },
};

export const PaginatedQuestionnaires: Story = {
  play: async ({ canvasElement }) => {
    const answerClarificationMock = fn();
    useMoudirChatStore.setState({
      messages: [multiQuestionMessage],
      answerClarification: answerClarificationMock,
      status: "idle",
    });

    const canvas = within(canvasElement);

    // First question is visible
    await expect(await canvas.findByText("Sélectionnez le type d'agrégation")).toBeInTheDocument();

    // Navigate to next question via pagination button
    const nextButton = canvas.getByRole("button", { name: /Question suivante/i });
    await userEvent.click(nextButton);

    // Second question is now visible
    await expect(await canvas.findByText("Sur quelle plage horaire ?")).toBeInTheDocument();
  },
};
