import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// ─── Mock dependencies used by the real module ───────────────────────────────
// We mock `structured` so we can control `buildJsonInstruction` and
// `parseStructured` without running the real parsing logic.

vi.mock("@/platform/ai/provider/structured", () => ({
  buildJsonInstruction: vi.fn(() => "RESPOND WITH JSON ONLY."),
  parseStructured: vi.fn(),
}));

// ─── Import the REAL module under test AFTER mocking ─────────────────────────
import {
  generateStructuredByPrompt,
  toMessages,
  toSystemUser,
} from "@/platform/ai/provider/adapters/base";

import { buildJsonInstruction, parseStructured } from "@/platform/ai/provider/structured";

// ─── Reset mocks between tests ────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(buildJsonInstruction).mockReturnValue("RESPOND WITH JSON ONLY.");
  vi.mocked(parseStructured).mockReset();
});

// ─────────────────────────────────────────────────────────────────────────────
// generateStructuredByPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe("generateStructuredByPrompt", () => {
  const schema = z.object({ name: z.string() });

  it("appends json instruction to an existing system prompt and calls provider.generate", async () => {
    // Arrange
    const generated = {
      text: '{"name":"Alice"}',
      model: "m",
      provider: "llamacpp" as const,
      finishReason: "stop" as const,
    };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockReturnValue({ name: "Alice" });

    const req = {
      model: "my-model",
      system: "You are a helpful assistant.",
      prompt: "What is your name?",
    };

    // Act
    const result = await generateStructuredByPrompt(mockProvider, req, schema);

    // Assert
    expect(mockProvider.generate).toHaveBeenCalledOnce();
    const callArg = mockProvider.generate.mock.calls[0][0];
    // System should contain the original system + json instruction joined by double newline
    expect(callArg.system).toContain("You are a helpful assistant.");
    expect(callArg.system).toContain("RESPOND WITH JSON ONLY.");
    expect(callArg.system).toContain("\n\n");
    expect(result).toEqual({ name: "Alice" });
  });

  it("uses json instruction alone when no system prompt is provided", async () => {
    // Arrange
    const generated = { text: '{"name":"Bob"}', model: "m", provider: "llamacpp" as const };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockReturnValue({ name: "Bob" });

    const req = { model: "my-model", prompt: "Name?" };

    // Act
    const result = await generateStructuredByPrompt(mockProvider, req, schema);

    // Assert
    const callArg = mockProvider.generate.mock.calls[0][0];
    // When there is no original system, the system should just be the JSON instruction
    expect(callArg.system).toBe("RESPOND WITH JSON ONLY.");
    expect(result).toEqual({ name: "Bob" });
  });

  it("defaults temperature to 0 when temperature is undefined in req", async () => {
    // Arrange
    const generated = { text: "{}", model: "m", provider: "llamacpp" as const };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockReturnValue({ name: "x" });

    const req = { model: "my-model", prompt: "hi" };

    // Act
    await generateStructuredByPrompt(mockProvider, req, schema);

    // Assert
    const callArg = mockProvider.generate.mock.calls[0][0];
    expect(callArg.temperature).toBe(0);
  });

  it("preserves the caller-supplied temperature when provided", async () => {
    // Arrange
    const generated = { text: "{}", model: "m", provider: "llamacpp" as const };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockReturnValue({ name: "x" });

    const req = { model: "my-model", prompt: "hi", temperature: 0.7 };

    // Act
    await generateStructuredByPrompt(mockProvider, req, schema);

    // Assert
    const callArg = mockProvider.generate.mock.calls[0][0];
    expect(callArg.temperature).toBe(0.7);
  });

  it("passes the generated text to parseStructured with the label 'structured-output'", async () => {
    // Arrange
    const generated = { text: '{"name":"Carol"}', model: "m", provider: "llamacpp" as const };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockReturnValue({ name: "Carol" });

    const req = { model: "my-model", prompt: "p" };

    // Act
    await generateStructuredByPrompt(mockProvider, req, schema);

    // Assert
    expect(parseStructured).toHaveBeenCalledWith('{"name":"Carol"}', schema, {
      label: "structured-output",
    });
  });

  it("propagates errors thrown by provider.generate", async () => {
    // Arrange
    const mockProvider = { generate: vi.fn().mockRejectedValue(new Error("network error")) };

    const req = { model: "my-model", prompt: "p" };

    // Act / Assert
    await expect(generateStructuredByPrompt(mockProvider, req, schema)).rejects.toThrow(
      "network error",
    );
  });

  it("propagates errors thrown by parseStructured", async () => {
    // Arrange
    const generated = { text: "garbage", model: "m", provider: "llamacpp" as const };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockImplementation(() => {
      throw new Error("parse failed");
    });

    const req = { model: "my-model", prompt: "p" };

    // Act / Assert
    await expect(generateStructuredByPrompt(mockProvider, req, schema)).rejects.toThrow(
      "parse failed",
    );
  });

  it("spreads all original request fields into the generate call", async () => {
    // Arrange
    const generated = { text: "{}", model: "m", provider: "llamacpp" as const };
    const mockProvider = { generate: vi.fn().mockResolvedValue(generated) };
    vi.mocked(parseStructured).mockReturnValue({ name: "x" });

    const req = {
      model: "my-model",
      prompt: "ask",
      maxTokens: 100,
      topP: 0.9,
    };

    // Act
    await generateStructuredByPrompt(mockProvider, req, schema);

    // Assert: the original fields are spread through
    const callArg = mockProvider.generate.mock.calls[0][0];
    expect(callArg.model).toBe("my-model");
    expect(callArg.prompt).toBe("ask");
    expect(callArg.maxTokens).toBe(100);
    expect(callArg.topP).toBe(0.9);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toMessages
// ─────────────────────────────────────────────────────────────────────────────

describe("toMessages", () => {
  it("returns an empty array when req has no system, messages, or prompt", () => {
    // Arrange
    const req = { model: "m" };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result).toEqual([]);
  });

  it("adds a system message first when req.system is present", () => {
    // Arrange
    const req = { model: "m", system: "Be helpful." };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result).toEqual([{ role: "system", content: "Be helpful." }]);
  });

  it("adds a user message last when req.prompt is present", () => {
    // Arrange
    const req = { model: "m", prompt: "Hello?" };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result).toEqual([{ role: "user", content: "Hello?" }]);
  });

  it("spreads req.messages into the output array", () => {
    // Arrange
    const messages = [
      { role: "user" as const, content: "msg1" },
      { role: "assistant" as const, content: "resp1" },
    ];
    const req = { model: "m", messages };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result).toEqual(messages);
  });

  it("returns all three sections in order: system, messages, prompt", () => {
    // Arrange
    const messages = [{ role: "user" as const, content: "earlier msg" }];
    const req = {
      model: "m",
      system: "sys",
      messages,
      prompt: "final prompt",
    };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "earlier msg" },
      { role: "user", content: "final prompt" },
    ]);
  });

  it("omits the system entry when req.system is undefined", () => {
    // Arrange
    const req = { model: "m", prompt: "hi" };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result.some((m) => m.role === "system")).toBe(false);
  });

  it("omits the prompt entry when req.prompt is undefined", () => {
    // Arrange
    const req = { model: "m", system: "sys" };

    // Act
    const result = toMessages(req);

    // Assert
    expect(result.some((m) => m.role === "user")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toSystemUser
// ─────────────────────────────────────────────────────────────────────────────

describe("toSystemUser", () => {
  it("extracts system from req.system and user from req.prompt when both are provided", () => {
    // Arrange
    const req = { model: "m", system: "Be concise.", prompt: "What is 2+2?" };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result).toEqual({ system: "Be concise.", user: "What is 2+2?" });
  });

  it("returns empty strings for both when req has nothing", () => {
    // Arrange
    const req = { model: "m" };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result).toEqual({ system: "", user: "" });
  });

  it("falls back to a system-role message when req.system is absent", () => {
    // Arrange
    const req = {
      model: "m",
      messages: [
        { role: "system" as const, content: "System from messages" },
        { role: "user" as const, content: "User message" },
      ],
    };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.system).toBe("System from messages");
  });

  it("returns empty string for system when no system prompt and no system message", () => {
    // Arrange
    const req = {
      model: "m",
      messages: [{ role: "user" as const, content: "Just a user message" }],
    };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.system).toBe("");
  });

  it("joins non-system messages with double newlines when req.prompt is absent", () => {
    // Arrange
    const req = {
      model: "m",
      messages: [
        { role: "user" as const, content: "First" },
        { role: "assistant" as const, content: "Second" },
        { role: "user" as const, content: "Third" },
      ],
    };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.user).toBe("First\n\nSecond\n\nThird");
  });

  it("prefers req.prompt over messages for the user field", () => {
    // Arrange
    const req = {
      model: "m",
      prompt: "Prompt wins.",
      messages: [{ role: "user" as const, content: "This is ignored." }],
    };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.user).toBe("Prompt wins.");
  });

  it("returns empty string for user when messages is empty and no prompt", () => {
    // Arrange
    const req = { model: "m", messages: [] };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.user).toBe("");
  });

  it("returns empty string for user when all messages are system-role and no prompt", () => {
    // Arrange
    const req = {
      model: "m",
      messages: [{ role: "system" as const, content: "I am the system" }],
    };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.user).toBe("");
  });

  it("returns empty string for system when messages is undefined and req.system is absent", () => {
    // Arrange
    const req = { model: "m", prompt: "hello" };

    // Act
    const result = toSystemUser(req);

    // Assert
    expect(result.system).toBe("");
  });
});
