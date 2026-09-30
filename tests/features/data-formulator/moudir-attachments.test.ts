import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import {
  type ChatMessage,
  useMoudirChatStore,
} from "@/features/data-formulator/store/moudir-chat-store";
import { deleteConversationRemote } from "@/platform/chat/chat-history-client";

// Mock platform IPC clients
const mockSendChatPrompt = vi.fn();
const mockOpenChatSession = vi.fn();
const mockAppendMessageRemote = vi.fn();
const mockGetMessagesRemote = vi.fn();
const mockLoadTelecomContext = vi.fn();

vi.mock("@/features/telecom/lib/moudir-report-context", () => ({
  loadTelecomReportContextForMoudir: (...args: unknown[]) => mockLoadTelecomContext(...args),
}));

vi.mock("@/platform/chat/chat-session-client", () => ({
  sendChatPrompt: (...args: any[]) => mockSendChatPrompt(...args),
  openChatSession: (...args: any[]) => mockOpenChatSession(...args),
  disposeChatSession: vi.fn().mockResolvedValue(true),
  suggestChatFollowUps: vi.fn().mockResolvedValue([]),
  generateChatTitle: vi.fn().mockResolvedValue("Test Title"),
  ChatModelUnavailableError: class ChatModelUnavailableError extends Error {},
}));

vi.mock("@/platform/chat/chat-history-client", () => ({
  appendMessageRemote: (...args: any[]) => mockAppendMessageRemote(...args),
  getMessagesRemote: (...args: any[]) => mockGetMessagesRemote(...args),
  createConversationRemote: vi.fn().mockResolvedValue({ id: "conv-1" }),
  listConversationsRemote: vi.fn().mockResolvedValue([]),
  setConversationPinnedRemote: vi.fn().mockResolvedValue(undefined),
  renameConversationRemote: vi.fn().mockResolvedValue(undefined),
  setConversationModelRemote: vi.fn().mockResolvedValue(undefined),
  deleteConversationRemote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/platform/settings/settings-client", () => ({
  getAppSettingRemote: vi.fn().mockResolvedValue(null),
}));

describe("Moudir AI Elements Attachments Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadTelecomContext.mockResolvedValue(null);
    mockOpenChatSession.mockResolvedValue({ model: "test-model.gguf", reused: false });
    mockSendChatPrompt.mockResolvedValue({ text: "Assistant response", toolEvents: [] });
    mockAppendMessageRemote.mockResolvedValue({ id: 1 });

    useMoudirChatStore.setState({
      activeId: "conv-1",
      messages: [],
      followUps: [],
      status: "idle",
      canvasArtifact: null,
      lastNotice: null,
      conversations: [
        {
          id: "conv-1",
          title: "Test Conversation",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pinned: false,
          datasetId: null,
          model: "test-model.gguf",
          messageCount: 0,
        },
      ],
    });
  });

  it("sends the selected report context to the model without changing stored user text", async () => {
    mockLoadTelecomContext.mockResolvedValue(
      "\n<telecom_report_context>precomputed KPI</telecom_report_context>",
    );
    await useMoudirChatStore.getState().send("Quel est le taux de réussite ?", {
      datasetId: "ds-telecom",
    });

    expect(mockLoadTelecomContext).toHaveBeenCalledWith("ds-telecom");
    expect(mockSendChatPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: "ds-telecom",
        text: expect.stringContaining("precomputed KPI"),
      }),
    );
    expect(
      useMoudirChatStore.getState().messages.find((message) => message.role === "user")?.content,
    ).toBe("Quel est le taux de réussite ?");
    expect(mockAppendMessageRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        content: "Quel est le taux de réussite ?",
      }),
    );
  });

  it("waits for an aborted turn to save before deleting its conversation", async () => {
    const events: string[] = [];
    mockAppendMessageRemote.mockImplementation(async (input: { role: string }) => {
      events.push(`append:${input.role}`);
      return { id: 1 };
    });
    vi.mocked(deleteConversationRemote).mockImplementation(async () => {
      events.push("delete");
    });
    mockSendChatPrompt.mockImplementation(
      ({ onToken, signal }: { onToken: (text: string) => void; signal: AbortSignal }) => {
        onToken("partial");
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    );

    const sending = useMoudirChatStore.getState().send("Analyse les données");
    await vi.waitFor(() => expect(mockSendChatPrompt).toHaveBeenCalled());
    const removing = useMoudirChatStore.getState().remove("conv-1");
    await Promise.all([sending, removing]);

    expect(events).toEqual(["append:user", "append:assistant", "delete"]);
  });

  it("attaches files to user message and informs sendChatPrompt", async () => {
    const sampleAttachment: AttachmentData = {
      id: "att-1",
      type: "file",
      filename: "test-report.csv",
      mediaType: "text/csv",
      url: "data:text/csv;base64,Y29sMSxjb2wyCjEsMgo=",
    };

    await useMoudirChatStore.getState().send("Analyse ce fichier", {
      attachments: [sampleAttachment],
    });

    const messages = useMoudirChatStore.getState().messages;
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toBe("Analyse ce fichier");
    expect(userMsg?.attachments).toHaveLength(1);
    expect(userMsg?.attachments?.[0].filename).toBe("test-report.csv");

    // Verify appendMessageRemote persisted the attachment in parts
    expect(mockAppendMessageRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        role: "user",
        content: "Analyse ce fichier",
        parts: expect.objectContaining({
          attachments: [sampleAttachment],
        }),
      }),
    );

    // Verify sendChatPrompt received attachment metadata in the prompt
    expect(mockSendChatPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        text: expect.stringContaining("[Fichier: test-report.csv (text/csv)]"),
      }),
    );
  });

  it("preserves attachments when regenerating or editing", async () => {
    const sampleAttachment: AttachmentData = {
      id: "att-img-1",
      type: "file",
      filename: "screenshot.png",
      mediaType: "image/png",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    };

    // Stage a user turn with attachment and assistant response
    const userMsg: ChatMessage = {
      id: "u-1",
      role: "user",
      content: "Regarde l'image",
      parts: [],
      attachments: [sampleAttachment],
      status: "done",
      createdAt: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: "a-1",
      role: "assistant",
      content: "Image reçue",
      parts: [],
      status: "done",
      createdAt: Date.now(),
    };

    useMoudirChatStore.setState({
      messages: [userMsg, assistantMsg],
    });

    // Test regenerateLast carries attachments
    await useMoudirChatStore.getState().regenerateLast();

    const messagesAfterRegen = useMoudirChatStore.getState().messages;
    const reUserMsg = messagesAfterRegen.find((m) => m.role === "user");
    expect(reUserMsg?.attachments).toHaveLength(1);
    expect(reUserMsg?.attachments?.[0].filename).toBe("screenshot.png");
  });

  it("rehydrates attachments from remote database rows", async () => {
    const sampleAttachment: AttachmentData = {
      id: "att-stored",
      type: "file",
      filename: "data.parquet",
      mediaType: "application/octet-stream",
      url: "data:application/octet-stream;base64,UEFSUQ==",
    };

    mockGetMessagesRemote.mockResolvedValueOnce([
      {
        id: 101,
        conversationId: "conv-1",
        role: "user",
        content: "Voici les données",
        parts: {
          parts: [],
          attachments: [sampleAttachment],
        },
        createdAt: 1000,
      },
      {
        id: 102,
        conversationId: "conv-1",
        role: "assistant",
        content: "Données chargées",
        parts: {
          parts: [],
        },
        createdAt: 1001,
      },
    ]);

    await useMoudirChatStore.getState().openConversation("conv-1");

    const messages = useMoudirChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].attachments).toBeDefined();
    expect(messages[0].attachments).toHaveLength(1);
    expect(messages[0].attachments?.[0].filename).toBe("data.parquet");
  });
});
