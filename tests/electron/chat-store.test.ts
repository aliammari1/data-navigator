import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendMessage,
  closeChatStore,
  configureChatStore,
  createConversation,
  deleteConversation,
  getMessages,
  listConversations,
  renameConversation,
  setConversationPinned,
} from "../../electron/chat-store";

/**
 * Unit tests for the Moudir chat-history SQLite store (chat.db).
 *
 * Same discipline as settings-store.test.ts: a fresh temp `userData/databases`
 * dir per test via configureChatStore, closeChatStore() to drop the singleton
 * handle in afterEach, and real better-sqlite3 (no mocking — this module is
 * the persistence boundary itself).
 *
 * `createConversation`/`appendMessage`/`renameConversation` stamp `new Date()`
 * from JS (not a SQL-side default), so ordering/pruning tests use
 * vi.useFakeTimers() + vi.setSystemTime() to get deterministic, collision-free
 * timestamps instead of relying on real wall-clock gaps between statements.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dn-chat-store-"));
  configureChatStore(dir);
});

afterEach(() => {
  closeChatStore();
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("createConversation", () => {
  it("inserts a conversation and returns metadata with defaults", () => {
    // Act
    const meta = createConversation({ id: "c1", title: "Ventes Télécom" });

    // Assert
    expect(meta.id).toBe("c1");
    expect(meta.title).toBe("Ventes Télécom");
    expect(meta.pinned).toBe(false);
    expect(meta.datasetId).toBeNull();
    expect(meta.model).toBeNull();
    expect(meta.messageCount).toBe(0);
    expect(typeof meta.createdAt).toBe("number");
    expect(typeof meta.updatedAt).toBe("number");
  });

  it("stores optional datasetId and model when provided", () => {
    // Act
    const meta = createConversation({
      id: "c1",
      title: "Titre",
      datasetId: "ds-42",
      model: "gemma-4-e4b-it-q4_k_m.gguf",
    });

    // Assert
    expect(meta.datasetId).toBe("ds-42");
    expect(meta.model).toBe("gemma-4-e4b-it-q4_k_m.gguf");
  });
});

describe("listConversations", () => {
  it("returns an empty array when there are no conversations", () => {
    expect(listConversations()).toEqual([]);
  });

  it("orders pinned conversations before unpinned ones, then by most recently updated", () => {
    // Arrange: three unpinned conversations, oldest to newest.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
    createConversation({ id: "a", title: "A" });
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 1));
    createConversation({ id: "b", title: "B" });
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 2));
    createConversation({ id: "c", title: "C" });
    // "a" is the oldest by updatedAt but gets pinned — it should still sort first.
    setConversationPinned("a", true);

    // Act
    const rows = listConversations();

    // Assert
    expect(rows.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("reflects the number of messages appended to each conversation", () => {
    // Arrange
    createConversation({ id: "a", title: "A" });
    createConversation({ id: "b", title: "B" });
    appendMessage({ conversationId: "a", role: "user", content: "salut" });
    appendMessage({ conversationId: "a", role: "assistant", content: "bonjour" });

    // Act
    const rows = listConversations();

    // Assert
    expect(rows.find((r) => r.id === "a")?.messageCount).toBe(2);
    expect(rows.find((r) => r.id === "b")?.messageCount).toBe(0);
  });

  it("filters by a search term matching the conversation title, case-insensitively", () => {
    createConversation({ id: "a", title: "Ventes par canal" });
    createConversation({ id: "b", title: "Clients actifs" });

    const rows = listConversations(100, "ventes");

    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by a search term matching message content when the title does not match", () => {
    createConversation({ id: "a", title: "Conversation 1" });
    createConversation({ id: "b", title: "Conversation 2" });
    appendMessage({ conversationId: "a", role: "user", content: "combien de transactions SMS" });
    appendMessage({ conversationId: "b", role: "user", content: "répartition par région" });

    const rows = listConversations(100, "SMS");

    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("returns an empty array when the search term matches neither titles nor messages", () => {
    createConversation({ id: "a", title: "Ventes" });
    appendMessage({ conversationId: "a", role: "user", content: "bonjour" });

    expect(listConversations(100, "zzznomatch")).toEqual([]);
  });

  it("clamps a non-positive limit up to 1", () => {
    createConversation({ id: "a", title: "A" });
    createConversation({ id: "b", title: "B" });
    createConversation({ id: "c", title: "C" });

    expect(listConversations(0)).toHaveLength(1);
    expect(listConversations(-5)).toHaveLength(1);
  });
});

describe("renameConversation", () => {
  it("updates the title and bumps updatedAt", () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
    const created = createConversation({ id: "a", title: "Original" });
    vi.setSystemTime(new Date(2026, 0, 1, 10, 5, 0));

    // Act
    renameConversation("a", "Renamed");

    // Assert
    const [row] = listConversations();
    expect(row.title).toBe("Renamed");
    expect(row.updatedAt).toBeGreaterThan(created.updatedAt);
  });
});

describe("setConversationPinned", () => {
  it("pins a conversation so it sorts to the top", () => {
    createConversation({ id: "a", title: "A" });
    setConversationPinned("a", true);
    expect(listConversations()[0].pinned).toBe(true);
  });

  it("unpins a previously pinned conversation", () => {
    createConversation({ id: "a", title: "A" });
    setConversationPinned("a", true);
    setConversationPinned("a", false);
    expect(listConversations()[0].pinned).toBe(false);
  });
});

describe("deleteConversation", () => {
  it("removes the conversation and its messages", () => {
    // Arrange
    createConversation({ id: "a", title: "A" });
    appendMessage({ conversationId: "a", role: "user", content: "hello" });

    // Act
    deleteConversation("a");

    // Assert
    expect(listConversations()).toEqual([]);
    expect(getMessages("a")).toEqual([]);
  });
});

describe("appendMessage", () => {
  it("inserts a message with a generated id and no parts by default", () => {
    createConversation({ id: "a", title: "A" });

    const row = appendMessage({ conversationId: "a", role: "user", content: "salut" });

    expect(row.id).toBeGreaterThan(0);
    expect(row.conversationId).toBe("a");
    expect(row.role).toBe("user");
    expect(row.content).toBe("salut");
    expect(row.parts).toBeNull();
    expect(typeof row.createdAt).toBe("number");
  });

  it("round-trips a structured parts payload (tool calls / chart specs)", () => {
    createConversation({ id: "a", title: "A" });
    const parts = {
      toolCalls: [{ name: "run_sql", params: { sql: "SELECT 1" }, result: "1 ligne" }],
    };

    const row = appendMessage({ conversationId: "a", role: "tool", content: "12 lignes", parts });

    expect(row.parts).toEqual(parts);
    const [stored] = getMessages("a");
    expect(stored.parts).toEqual(parts);
  });

  it("bumps the parent conversation's updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
    const created = createConversation({ id: "a", title: "A" });
    vi.setSystemTime(new Date(2026, 0, 1, 10, 5, 0));

    appendMessage({ conversationId: "a", role: "user", content: "salut" });

    const [row] = listConversations();
    expect(row.updatedAt).toBeGreaterThan(created.updatedAt);
  });
});

describe("getMessages", () => {
  it("returns messages ordered oldest-first", () => {
    createConversation({ id: "a", title: "A" });
    appendMessage({ conversationId: "a", role: "user", content: "un" });
    appendMessage({ conversationId: "a", role: "assistant", content: "deux" });
    appendMessage({ conversationId: "a", role: "user", content: "trois" });

    const rows = getMessages("a");

    expect(rows.map((r) => r.content)).toEqual(["un", "deux", "trois"]);
  });

  it("respects a limit smaller than the number of stored messages", () => {
    createConversation({ id: "a", title: "A" });
    appendMessage({ conversationId: "a", role: "user", content: "un" });
    appendMessage({ conversationId: "a", role: "assistant", content: "deux" });
    appendMessage({ conversationId: "a", role: "user", content: "trois" });

    const rows = getMessages("a", 2);

    expect(rows.map((r) => r.content)).toEqual(["un", "deux"]);
  });

  it("returns an empty array for a conversation with no messages", () => {
    createConversation({ id: "a", title: "A" });
    expect(getMessages("a")).toEqual([]);
  });

  it("returns an empty array for an unknown conversation id", () => {
    expect(getMessages("does-not-exist")).toEqual([]);
  });
});

describe("pruning unpinned conversations beyond the cap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0));
  });

  it("keeps only the newest 200 unpinned conversations, evicting the oldest", () => {
    // Arrange: 201 unpinned conversations, one second apart so the newest-200
    // cut is unambiguous.
    for (let i = 0; i < 201; i++) {
      createConversation({ id: `c${i}`, title: `Conversation ${i}` });
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i + 1));
    }

    // Act
    const rows = listConversations(300);

    // Assert: the cap holds and the very oldest conversation was evicted.
    expect(rows).toHaveLength(200);
    expect(rows.some((r) => r.id === "c0")).toBe(false);
    expect(rows.some((r) => r.id === "c200")).toBe(true);
  });

  it("never prunes a pinned conversation, even once the unpinned cap is exceeded", () => {
    // Arrange
    createConversation({ id: "pinned-1", title: "Keep me" });
    setConversationPinned("pinned-1", true);
    vi.setSystemTime(new Date(2026, 0, 1, 0, 1, 0));
    for (let i = 0; i < 201; i++) {
      createConversation({ id: `u${i}`, title: `Unpinned ${i}` });
      vi.setSystemTime(new Date(2026, 0, 1, 0, 1 + i + 1, 0));
    }

    // Act
    const rows = listConversations(300);

    // Assert
    expect(rows.some((r) => r.id === "pinned-1")).toBe(true);
    expect(rows.filter((r) => !r.pinned)).toHaveLength(200);
  });

  it("deletes messages that belonged to a conversation pruned past the cap", () => {
    // Arrange
    createConversation({ id: "c0", title: "Will be pruned" });
    appendMessage({ conversationId: "c0", role: "user", content: "orphaned" });
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 1));
    for (let i = 1; i <= 200; i++) {
      createConversation({ id: `c${i}`, title: `Conversation ${i}` });
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i + 1));
    }

    // Act + Assert
    expect(listConversations(300).some((r) => r.id === "c0")).toBe(false);
    expect(getMessages("c0")).toEqual([]);
  });
});

describe("closeChatStore", () => {
  it("allows the store to be reopened and used again after closing", () => {
    createConversation({ id: "a", title: "A" });

    closeChatStore();

    // The underlying connection re-opens lazily on next use against the same dir.
    const meta = createConversation({ id: "b", title: "B" });
    expect(meta.id).toBe("b");
    expect(
      listConversations()
        .map((r) => r.id)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});
