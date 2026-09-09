import { describe, expect, it, vi } from "vitest";
import {
  type ChatMessage,
  type ClarificationPart,
  useMoudirChatStore,
} from "@/features/data-formulator/store/moudir-chat-store";

describe("Group B: Clarification & Question UI Store Logic", () => {
  it("records single-choice clarification answers and updates the message part", async () => {
    const question = "Quelle colonne temporelle souhaitez-vous analyser ?";
    const options = ["date_commande", "date_livraison", "date_creation"];

    const messageId = "msg-clarif-1";
    const initialMessage: ChatMessage = {
      id: messageId,
      role: "assistant",
      content: "",
      parts: [
        {
          kind: "clarification",
          question,
          options,
        },
      ],
      status: "done",
      createdAt: Date.now(),
      datasetId: "ds-sales",
    };

    useMoudirChatStore.setState({
      activeId: "conv-1",
      messages: [initialMessage],
    });

    const runTurnSpy = vi.fn();
    // Test answerClarification behavior
    await useMoudirChatStore.getState().answerClarification(messageId, question, "date_commande");

    const updatedMsg = useMoudirChatStore.getState().messages.find((m) => m.id === messageId);
    expect(updatedMsg).toBeDefined();

    const part = updatedMsg?.parts.find((p): p is ClarificationPart => p.kind === "clarification");
    expect(part?.answer).toBe("date_commande");
  });

  it("handles custom write-in answers (Idea 4)", async () => {
    const question = "Quel type de répartition voulez-vous ?";
    const options = ["Par région", "Par canal"];
    const customWriteIn = "Par catégorie de produit et par devise";

    const messageId = "msg-clarif-2";
    const initialMessage: ChatMessage = {
      id: messageId,
      role: "assistant",
      content: "",
      parts: [
        {
          kind: "clarification",
          question,
          options,
        },
      ],
      status: "done",
      createdAt: Date.now(),
    };

    useMoudirChatStore.setState({
      activeId: "conv-1",
      messages: [initialMessage],
    });

    await useMoudirChatStore.getState().answerClarification(messageId, question, customWriteIn);

    const updatedMsg = useMoudirChatStore.getState().messages.find((m) => m.id === messageId);
    const part = updatedMsg?.parts.find((p): p is ClarificationPart => p.kind === "clarification");
    expect(part?.answer).toBe(customWriteIn);
  });

  it("handles multi-select clarification answers (Idea 5)", async () => {
    const question = "Quelles métriques agréger pour ce tableau ?";
    const options = ["Ventes", "Marge", "Quantité", "Remise"];
    const multiAnswer = "Ventes, Marge, Quantité";

    const messageId = "msg-clarif-3";
    const initialMessage: ChatMessage = {
      id: messageId,
      role: "assistant",
      content: "",
      parts: [
        {
          kind: "clarification",
          question,
          options,
          multiSelect: true,
        },
      ],
      status: "done",
      createdAt: Date.now(),
    };

    useMoudirChatStore.setState({
      activeId: "conv-1",
      messages: [initialMessage],
    });

    await useMoudirChatStore.getState().answerClarification(messageId, question, multiAnswer);

    const updatedMsg = useMoudirChatStore.getState().messages.find((m) => m.id === messageId);
    const part = updatedMsg?.parts.find((p): p is ClarificationPart => p.kind === "clarification");
    expect(part?.multiSelect).toBe(true);
    expect(part?.answer).toBe("Ventes, Marge, Quantité");
  });

  it("parses synthetic markdown tables into chartable series (Chat-with-Chart Table-to-Chart)", async () => {
    const { parseHastTable } = await import(
      "@/features/data-formulator/components/moudir-chat/interactive-table-chart"
    );

    // Mock HAST table node matching the user's screenshot
    const mockHastNode = {
      type: "element",
      tagName: "table",
      children: [
        {
          tagName: "thead",
          children: [
            {
              tagName: "tr",
              children: [
                { tagName: "th", children: [{ type: "text", value: "Label" }] },
                { tagName: "th", children: [{ type: "text", value: "Value" }] },
              ],
            },
          ],
        },
        {
          tagName: "tbody",
          children: [
            {
              tagName: "tr",
              children: [
                { tagName: "td", children: [{ type: "text", value: "Janvier" }] },
                { tagName: "td", children: [{ type: "text", value: "1500" }] },
              ],
            },
            {
              tagName: "tr",
              children: [
                { tagName: "td", children: [{ type: "text", value: "Février" }] },
                { tagName: "td", children: [{ type: "text", value: "1800" }] },
              ],
            },
            {
              tagName: "tr",
              children: [
                { tagName: "td", children: [{ type: "text", value: "Mars" }] },
                { tagName: "td", children: [{ type: "text", value: "1700" }] },
              ],
            },
          ],
        },
      ],
    };

    const parsed = parseHastTable(mockHastNode);
    expect(parsed.isChartable).toBe(true);
    expect(parsed.dimensionCol).toBe("Label");
    expect(parsed.metricCol).toBe("Value");
    expect(parsed.chartRows).toHaveLength(3);
    expect(parsed.chartRows[0]).toEqual({
      Label: "Janvier",
      Value: 1500,
      x_val: "Janvier",
      y_val: 1500,
      label: "Janvier",
      value: 1500,
    });
  }, 15000);
});
