import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { searchMessages } from "../../electron/chat-search";
import {
  appendMessage,
  closeChatStore,
  configureChatStore,
  createConversation,
} from "../../electron/chat-store";

/**
 * Unit tests for the FTS5 + LIKE chat search stack.
 *
 * Same discipline as chat-store.test.ts: a fresh temp `userData/databases`
 * dir per test. Opening the chat store also wires the FTS indexes
 * (ensureChatSearchFts), so inserts flow through the sync triggers and every
 * search path below runs against real FTS5 + LIKE behavior.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dn-chat-search-"));
  configureChatStore(dir);

  createConversation({ id: "c1", title: "Ventes" });
  appendMessage({
    conversationId: "c1",
    role: "user",
    content: "Quel est le chiffre du trimestre",
  });
  appendMessage({ conversationId: "c1", role: "assistant", content: "数据分析报告显示增长" });

  createConversation({ id: "c2", title: "Autre" });
  appendMessage({ conversationId: "c2", role: "user", content: "rien à voir ici" });
});

afterEach(() => {
  closeChatStore();
  rmSync(dir, { recursive: true, force: true });
});

describe("searchMessages", () => {
  it("returns [] for blank queries", () => {
    expect(searchMessages("")).toEqual([]);
    expect(searchMessages("   ")).toEqual([]);
  });

  it("finds latin terms through the unicode61 FTS index", () => {
    const hits = searchMessages("chiffre");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].conversationId).toBe("c1");
    expect(typeof hits[0].rank).toBe("number");
  });

  it("scopes the search to one conversation", () => {
    expect(searchMessages("chiffre", { conversationId: "c1" }).length).toBeGreaterThan(0);
    expect(searchMessages("chiffre", { conversationId: "c2" })).toEqual([]);
  });

  it("finds long CJK terms through the trigram index", () => {
    const hits = searchMessages("数据分析报告");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].conversationId).toBe("c1");
  });

  it("falls back to LIKE for short CJK queries", () => {
    const hits = searchMessages("数据");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("returns [] for symbol-only queries that sanitize to nothing", () => {
    expect(searchMessages("!!!")).toEqual([]);
  });

  it("returns [] when nothing matches anywhere", () => {
    expect(searchMessages("zzzintrouvable")).toEqual([]);
  });

  it("clamps the limit into range", () => {
    const hits = searchMessages("chiffre", { limit: 0 });
    expect(hits.length).toBeGreaterThan(0);
  });
});
