import { describe, expect, it } from "vitest";
import { parseThinking } from "@/features/data-formulator/components/moudir-chat/parse-thinking";

describe("parseThinking", () => {
  it("returns clean content unchanged when no thinking tags exist", () => {
    const res = parseThinking("Hello, here is your answer.");
    expect(res.thinking).toBe("");
    expect(res.isThinking).toBe(false);
    expect(res.cleanContent).toBe("Hello, here is your answer.");
  });

  it("extracts closed <think>...</think> tags", () => {
    const raw = "<think>Let me calculate the sum:\n1 + 1 = 2</think>The answer is 2.";
    const res = parseThinking(raw);
    expect(res.thinking).toBe("Let me calculate the sum:\n1 + 1 = 2");
    expect(res.isThinking).toBe(false);
    expect(res.cleanContent).toBe("The answer is 2.");
  });

  it("handles in-flight streaming thinking with unclosed <think>", () => {
    const raw = "<think>Currently analyzing column transactions...";
    const res = parseThinking(raw);
    expect(res.thinking).toBe("Currently analyzing column transactions...");
    expect(res.isThinking).toBe(true);
    expect(res.cleanContent).toBe("");
  });

  it("handles case-insensitive <THINK> tags", () => {
    const raw = "<THINK>Thinking step</THINK>Final answer";
    const res = parseThinking(raw);
    expect(res.thinking).toBe("Thinking step");
    expect(res.isThinking).toBe(false);
    expect(res.cleanContent).toBe("Final answer");
  });

  it("handles <thought> tags", () => {
    const raw = "<thought>Deep thought here</thought>Result";
    const res = parseThinking(raw);
    expect(res.thinking).toBe("Deep thought here");
    expect(res.isThinking).toBe(false);
    expect(res.cleanContent).toBe("Result");
  });
});
