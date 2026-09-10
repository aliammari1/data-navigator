import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendMessageRemote,
  canPersistConversations,
  createConversationRemote,
  deleteConversationRemote,
  getMessagesRemote,
  listConversationsRemote,
  renameConversationRemote,
  searchMessagesRemote,
  setConversationModelRemote,
  setConversationPinnedRemote,
} from "@/platform/chat/chat-history-client";

/**
 * Unit tests for the Moudir chat-history renderer bridge client.
 *
 * Mirrors the null-safe contract test style of analytics-snapshot-client.test.ts:
 * every function forwards to `window.electronChatHistory` when present and
 * falls back to a safe empty default (never throws) when the bridge is absent
 * (SSR, `next build`, plain browser tab, unit tests without Electron).
 */

type Bridge = {
  create: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  pin: ReturnType<typeof vi.fn>;
  setModel: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  appendMessage: ReturnType<typeof vi.fn>;
  messages: ReturnType<typeof vi.fn>;
  searchMessages: ReturnType<typeof vi.fn>;
};

function installBridge(): Bridge {
  const bridge: Bridge = {
    create: vi.fn(),
    list: vi.fn(),
    rename: vi.fn(),
    pin: vi.fn(),
    setModel: vi.fn(),
    delete: vi.fn(),
    appendMessage: vi.fn(),
    messages: vi.fn(),
    searchMessages: vi.fn(),
  };
  (window as unknown as { electronChatHistory?: Bridge }).electronChatHistory = bridge;
  return bridge;
}

describe("chat-history-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as { electronChatHistory?: Bridge }).electronChatHistory = undefined;
  });

  it("reports conversations can persist when the bridge is present", () => {
    installBridge();
    expect(canPersistConversations()).toBe(true);
  });

  it("reports conversations cannot persist when the bridge is absent", () => {
    expect(canPersistConversations()).toBe(false);
  });

  it("createConversationRemote forwards the input and returns the created meta", async () => {
    const bridge = installBridge();
    const meta = {
      id: "c1",
      title: "Ventes",
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      datasetId: null,
      model: null,
      messageCount: 0,
    };
    bridge.create.mockResolvedValueOnce(meta);

    const result = await createConversationRemote({ id: "c1", title: "Ventes" });

    expect(result).toEqual(meta);
    expect(bridge.create).toHaveBeenCalledWith({ id: "c1", title: "Ventes" });
  });

  it("createConversationRemote returns null when the bridge is unavailable", async () => {
    await expect(createConversationRemote({ id: "c1", title: "Ventes" })).resolves.toBeNull();
  });

  it("listConversationsRemote forwards the query and returns the list", async () => {
    const bridge = installBridge();
    bridge.list.mockResolvedValueOnce([{ id: "c1" }]);

    const result = await listConversationsRemote({ limit: 10, search: "ventes" });

    expect(result).toEqual([{ id: "c1" }]);
    expect(bridge.list).toHaveBeenCalledWith({ limit: 10, search: "ventes" });
  });

  it("listConversationsRemote returns [] when the bridge is unavailable", async () => {
    await expect(listConversationsRemote()).resolves.toEqual([]);
  });

  it("renameConversationRemote forwards the id and title", async () => {
    const bridge = installBridge();
    await renameConversationRemote("c1", "Nouveau titre");
    expect(bridge.rename).toHaveBeenCalledWith("c1", "Nouveau titre");
  });

  it("renameConversationRemote is a no-op when the bridge is unavailable", async () => {
    await expect(renameConversationRemote("c1", "x")).resolves.toBeUndefined();
  });

  it("setConversationPinnedRemote forwards the id and pinned flag", async () => {
    const bridge = installBridge();
    await setConversationPinnedRemote("c1", true);
    expect(bridge.pin).toHaveBeenCalledWith("c1", true);
  });

  it("setConversationPinnedRemote is a no-op when the bridge is unavailable", async () => {
    await expect(setConversationPinnedRemote("c1", true)).resolves.toBeUndefined();
  });

  it("deleteConversationRemote forwards the id", async () => {
    const bridge = installBridge();
    await deleteConversationRemote("c1");
    expect(bridge.delete).toHaveBeenCalledWith("c1");
  });

  it("deleteConversationRemote is a no-op when the bridge is unavailable", async () => {
    await expect(deleteConversationRemote("c1")).resolves.toBeUndefined();
  });

  it("appendMessageRemote forwards the input and returns the created row", async () => {
    const bridge = installBridge();
    const row = {
      id: 1,
      conversationId: "c1",
      role: "user" as const,
      content: "salut",
      parts: null,
      createdAt: 1,
    };
    bridge.appendMessage.mockResolvedValueOnce(row);

    const result = await appendMessageRemote({
      conversationId: "c1",
      role: "user",
      content: "salut",
    });

    expect(result).toEqual(row);
    expect(bridge.appendMessage).toHaveBeenCalledWith({
      conversationId: "c1",
      role: "user",
      content: "salut",
    });
  });

  it("appendMessageRemote returns null when the bridge is unavailable", async () => {
    await expect(
      appendMessageRemote({ conversationId: "c1", role: "user", content: "salut" }),
    ).resolves.toBeNull();
  });

  it("getMessagesRemote forwards the conversationId and limit", async () => {
    const bridge = installBridge();
    bridge.messages.mockResolvedValueOnce([{ id: 1 }]);

    const result = await getMessagesRemote("c1", 50);

    expect(result).toEqual([{ id: 1 }]);
    expect(bridge.messages).toHaveBeenCalledWith("c1", 50);
  });

  it("getMessagesRemote returns [] when the bridge is unavailable", async () => {
    await expect(getMessagesRemote("c1")).resolves.toEqual([]);
  });

  it("setConversationModelRemote forwards the id and model", async () => {
    const bridge = installBridge();
    await setConversationModelRemote("c1", "granite-3b");
    expect(bridge.setModel).toHaveBeenCalledWith("c1", "granite-3b");
  });

  it("setConversationModelRemote is a no-op when the bridge is unavailable", async () => {
    await expect(setConversationModelRemote("c1", "granite-3b")).resolves.toBeUndefined();
  });

  it("searchMessagesRemote forwards the query and returns hits", async () => {
    const bridge = installBridge();
    bridge.searchMessages.mockResolvedValueOnce([{ messageId: 1 }]);

    const result = await searchMessagesRemote({ query: "ventes", limit: 5 });

    expect(result).toEqual([{ messageId: 1 }]);
    expect(bridge.searchMessages).toHaveBeenCalledWith({ query: "ventes", limit: 5 });
  });

  it("searchMessagesRemote returns [] when the bridge is unavailable", async () => {
    await expect(searchMessagesRemote({ query: "ventes" })).resolves.toEqual([]);
  });
});
