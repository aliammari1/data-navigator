import { describe, expect, it } from "vitest";
import {
  CHAT_CONTEXT_MAX_TOKENS,
  type ChatMessage,
  estimateUsedTokens,
} from "@/features/data-formulator/store/moudir-chat-store";

describe("Moudir context memory management", () => {
  it("exports CHAT_CONTEXT_MAX_TOKENS as 4096", () => {
    expect(CHAT_CONTEXT_MAX_TOKENS).toBe(4096);
  });

  it("calculates estimated tokens with base system prompt", () => {
    const tokens = estimateUsedTokens([]);
    // Base 800 chars / 3.8 = ~211 tokens
    expect(tokens).toBe(Math.ceil(800 / 3.8));
  });

  it("accounts for message content and structured parts in token count", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg1",
        role: "user",
        content: "Donne-moi le chiffre d'affaires par catégorie.",
        parts: [],
        status: "done",
        createdAt: Date.now(),
      },
      {
        id: "msg2",
        role: "assistant",
        content: "Voici les résultats agrégés depuis DuckDB.",
        parts: [
          {
            kind: "tool",
            name: "run_sql",
            params: { sql: "SELECT category, SUM(revenue) FROM sales GROUP BY 1" },
            resultSummary: "Electronics: 142k | Home: 89k | Fashion: 41k",
            durationMs: 45,
          },
        ],
        status: "done",
        createdAt: Date.now(),
      },
    ];

    const tokens = estimateUsedTokens(messages);
    expect(tokens).toBeGreaterThan(250);
    expect(tokens).toBeLessThan(CHAT_CONTEXT_MAX_TOKENS);
  });

  it("detects high context utilization over 75%", () => {
    const longText = "a".repeat(12000); // 12000 / 3.8 = ~3157 tokens + 211 > 3368 tokens (>82%)
    const messages: ChatMessage[] = [
      {
        id: "long1",
        role: "assistant",
        content: longText,
        parts: [],
        status: "done",
        createdAt: Date.now(),
      },
    ];

    const tokens = estimateUsedTokens(messages);
    const utilization = tokens / CHAT_CONTEXT_MAX_TOKENS;
    expect(utilization).toBeGreaterThan(0.75);
  });
});
