import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// ─── Mock dependencies ────────────────────────────────────────────────────────
// These are mocked so the adapter's own logic is the subject under test.

vi.mock("@/platform/ai/provider/structured", () => ({
  parseStructured: vi.fn(),
}));

vi.mock("@/platform/ai/provider/zod-json-schema", () => ({
  zodToInlineJsonSchema: vi.fn(),
}));

vi.mock("@/platform/ai/provider/adapters/base", () => ({
  toMessages: vi.fn(),
  generateStructuredByPrompt: vi.fn(),
}));

// ─── Import the real module AFTER mocking ─────────────────────────────────────
import { openaiProvider } from "@/platform/ai/provider/adapters/openai";
import { parseStructured } from "@/platform/ai/provider/structured";
import { zodToInlineJsonSchema } from "@/platform/ai/provider/zod-json-schema";
import { toMessages, generateStructuredByPrompt } from "@/platform/ai/provider/adapters/base";
import { AIUnavailableError } from "@/platform/ai/provider/types";

// ─── Fetch mock setup ────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  vi.mocked(toMessages).mockReturnValue([{ role: "user", content: "hello" }]);
  vi.mocked(parseStructured).mockReset();
  vi.mocked(zodToInlineJsonSchema).mockReset();
  vi.mocked(generateStructuredByPrompt).mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJsonResponse(
  body: unknown,
  options: { ok?: boolean; status?: number } = {},
): Response {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    body: null,
    json: async () => body,
  } as unknown as Response;
}

// ─── Static properties ────────────────────────────────────────────────────────

describe("openaiProvider static properties", () => {
  it("has id = 'openai'", () => {
    expect(openaiProvider.id).toBe("openai");
  });

  it("has a non-empty label string", () => {
    expect(typeof openaiProvider.label).toBe("string");
    expect(openaiProvider.label.length).toBeGreaterThan(0);
  });

  it("advertises streaming = false", () => {
    expect(openaiProvider.capabilities.streaming).toBe(false);
  });

  it("advertises structuredNative = true", () => {
    expect(openaiProvider.capabilities.structuredNative).toBe(true);
  });

  it("advertises offline = false", () => {
    expect(openaiProvider.capabilities.offline).toBe(false);
  });

  it("advertises requiresWebGPU = false", () => {
    expect(openaiProvider.capabilities.requiresWebGPU).toBe(false);
  });
});

// ─── isAvailable ──────────────────────────────────────────────────────────────

describe("openaiProvider.isAvailable", () => {
  it("returns true when ai.openai.baseUrl is set in localStorage", async () => {
    // Arrange
    localStorage.setItem("ai.openai.baseUrl", "http://localhost:8080");

    // Act
    const result = await openaiProvider.isAvailable();

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when ai.openai.baseUrl is not set in localStorage", async () => {
    // Arrange — localStorage is clear (no baseUrl)

    // Act
    const result = await openaiProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when ai.openai.baseUrl is only whitespace", async () => {
    // Arrange
    localStorage.setItem("ai.openai.baseUrl", "   ");

    // Act
    const result = await openaiProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });
});

// ─── listModels ───────────────────────────────────────────────────────────────

describe("openaiProvider.listModels", () => {
  it("returns default gpt-4o-mini model when ai.openai.models is not set", async () => {
    // Arrange — localStorage is clear

    // Act
    const result = await openaiProvider.listModels();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: "gpt-4o-mini", label: "gpt-4o-mini" });
  });

  it("returns default model when ai.openai.models is blank whitespace", async () => {
    // Arrange
    localStorage.setItem("ai.openai.models", "   ");

    // Act
    const result = await openaiProvider.listModels();

    // Assert
    // blank string (after trim) is falsy, so we fall to the default
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("gpt-4o-mini");
  });

  it("splits ai.openai.models by comma and returns each as an AIModelInfo", async () => {
    // Arrange
    localStorage.setItem("ai.openai.models", "gpt-4o, gpt-3.5-turbo, gpt-4");

    // Act
    const result = await openaiProvider.listModels();

    // Assert
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: "gpt-4o", label: "gpt-4o" });
    expect(result[1]).toEqual({ id: "gpt-3.5-turbo", label: "gpt-3.5-turbo" });
    expect(result[2]).toEqual({ id: "gpt-4", label: "gpt-4" });
  });

  it("trims whitespace from model names when splitting", async () => {
    // Arrange
    localStorage.setItem("ai.openai.models", " gpt-4o , gpt-3.5-turbo ");

    // Act
    const result = await openaiProvider.listModels();

    // Assert
    expect(result[0].id).toBe("gpt-4o");
    expect(result[1].id).toBe("gpt-3.5-turbo");
  });
});

// ─── ensureReady ──────────────────────────────────────────────────────────────

describe("openaiProvider.ensureReady", () => {
  it("resolves without error (cloud models need no warm-up)", async () => {
    // Act / Assert
    await expect(openaiProvider.ensureReady("gpt-4o-mini")).resolves.toBeUndefined();
  });

  it("resolves even when onProgress is provided", async () => {
    // Arrange
    const onProgress = vi.fn();

    // Act / Assert
    await expect(openaiProvider.ensureReady("gpt-4o-mini", onProgress)).resolves.toBeUndefined();
    // onProgress should not be called since cloud models need no warm-up
    expect(onProgress).not.toHaveBeenCalled();
  });
});

// ─── generate ─────────────────────────────────────────────────────────────────

describe("openaiProvider.generate — success", () => {
  beforeEach(() => {
    localStorage.setItem("ai.openai.baseUrl", "http://localhost:8080");
  });

  it("returns text from choices[0].message.content", async () => {
    // Arrange
    const body = {
      choices: [{ message: { content: "Hello there!" }, finish_reason: "stop" }],
    };
    mockFetch.mockResolvedValue(makeJsonResponse(body));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.text).toBe("Hello there!");
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.provider).toBe("openai");
    expect(result.finishReason).toBe("stop");
  });

  it("returns empty string when choices is missing", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.text).toBe("");
  });

  it("returns empty string when choices[0] is missing", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [] }));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.text).toBe("");
  });

  it("returns empty string when message is missing from choice", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{}] }));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.text).toBe("");
  });

  it("returns empty string when message.content is absent", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: {} }] }));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.text).toBe("");
  });

  it("defaults finishReason to 'stop' when finish_reason is absent", async () => {
    // Arrange
    const body = { choices: [{ message: { content: "hi" } }] };
    mockFetch.mockResolvedValue(makeJsonResponse(body));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.finishReason).toBe("stop");
  });

  it("passes through finish_reason from the response", async () => {
    // Arrange
    const body = { choices: [{ message: { content: "truncated" }, finish_reason: "length" }] };
    mockFetch.mockResolvedValue(makeJsonResponse(body));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(result.finishReason).toBe("length");
  });

  it("includes a non-negative elapsedMs", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    const result = await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe("openaiProvider.generate — HTTP errors", () => {
  beforeEach(() => {
    localStorage.setItem("ai.openai.baseUrl", "http://localhost:8080");
  });

  it("throws AIUnavailableError when response is not ok", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 401 }));

    // Act / Assert
    await expect(
      openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" }),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("includes the HTTP status in the error message", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 403 }));

    // Act
    let err: unknown;
    try {
      await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });
    } catch (e) {
      err = e;
    }

    // Assert
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect((err as AIUnavailableError).message).toContain("HTTP 403");
  });
});

describe("openaiProvider.generate — missing baseUrl", () => {
  it("throws AIUnavailableError when no base URL is configured", async () => {
    // Arrange — localStorage is clear (no baseUrl)

    // Act / Assert
    await expect(
      openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" }),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("error message contains 'no base URL configured'", async () => {
    // Arrange — localStorage is clear

    // Act
    let err: unknown;
    try {
      await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });
    } catch (e) {
      err = e;
    }

    // Assert
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect((err as AIUnavailableError).message).toContain("no base URL configured");
  });
});

describe("openaiProvider.generate — request body construction", () => {
  beforeEach(() => {
    localStorage.setItem("ai.openai.baseUrl", "http://localhost:8080");
  });

  it("sends temperature=0 when temperature is not provided", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0);
  });

  it("sends the provided temperature", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello", temperature: 0.7 });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
  });

  it("includes top_p when topP is specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello", topP: 0.9 });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.top_p).toBe(0.9);
  });

  it("omits top_p when topP is not specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("top_p");
  });

  it("includes max_tokens when maxTokens is specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello", maxTokens: 512 });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(512);
  });

  it("omits max_tokens when maxTokens is not specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("includes Authorization header when apiKey is set", async () => {
    // Arrange
    localStorage.setItem("ai.openai.apiKey", "sk-test-key");
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.authorization).toBe("Bearer sk-test-key");
  });

  it("omits Authorization header when apiKey is not set", async () => {
    // Arrange — no apiKey in localStorage
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty("authorization");
  });

  it("strips trailing slash from baseUrl before appending the path", async () => {
    // Arrange
    localStorage.setItem("ai.openai.baseUrl", "http://localhost:8080/");
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello" });

    // Assert
    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("http://localhost:8080/v1/chat/completions");
  });

  it("passes the signal from the request to fetch", async () => {
    // Arrange
    const controller = new AbortController();
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: { content: "ok" } }] }));

    // Act
    await openaiProvider.generate({ model: "gpt-4o-mini", prompt: "Hello", signal: controller.signal });

    // Assert
    const fetchOptions = mockFetch.mock.calls[0][1];
    expect(fetchOptions.signal).toBe(controller.signal);
  });
});

// ─── generateStructured ───────────────────────────────────────────────────────

describe("openaiProvider.generateStructured", () => {
  const schema = z.object({ name: z.string() });

  beforeEach(() => {
    localStorage.setItem("ai.openai.baseUrl", "http://localhost:8080");
  });

  it("falls back to generateStructuredByPrompt when zodToInlineJsonSchema returns null", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(null);
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ name: "Alice" });

    // Act
    const result = await openaiProvider.generateStructured(
      { model: "gpt-4o-mini", prompt: "get name" },
      schema,
    );

    // Assert
    expect(result).toEqual({ name: "Alice" });
    expect(generateStructuredByPrompt).toHaveBeenCalledWith(
      openaiProvider,
      { model: "gpt-4o-mini", prompt: "get name" },
      schema,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses native JSON-schema path when zodToInlineJsonSchema returns a schema", async () => {
    // Arrange
    const fakeSchema = { type: "object", properties: { name: { type: "string" } } };
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(fakeSchema);
    vi.mocked(parseStructured).mockReturnValue({ name: "Bob" });
    mockFetch.mockResolvedValue(
      makeJsonResponse({ choices: [{ message: { content: '{"name":"Bob"}' } }] }),
    );

    // Act
    const result = await openaiProvider.generateStructured(
      { model: "gpt-4o-mini", prompt: "get name" },
      schema,
    );

    // Assert
    expect(result).toEqual({ name: "Bob" });
    expect(parseStructured).toHaveBeenCalledWith('{"name":"Bob"}', schema, {
      label: "openai-structured",
    });
    expect(generateStructuredByPrompt).not.toHaveBeenCalled();
  });

  it("sends response_format with json_schema in the request body", async () => {
    // Arrange
    const fakeSchema = { type: "object" };
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(fakeSchema);
    vi.mocked(parseStructured).mockReturnValue({ name: "Alice" });
    mockFetch.mockResolvedValue(
      makeJsonResponse({ choices: [{ message: { content: "{}" } }] }),
    );

    // Act
    await openaiProvider.generateStructured({ model: "gpt-4o-mini", prompt: "hello" }, schema);

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "structured_output", schema: fakeSchema, strict: true },
    });
  });

  it("throws AIUnavailableError when structured HTTP response is not ok", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 422 }));

    // Act / Assert
    await expect(
      openaiProvider.generateStructured({ model: "gpt-4o-mini", prompt: "hello" }, schema),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("includes HTTP status in the error message for structured failure", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 429 }));

    // Act
    let err: unknown;
    try {
      await openaiProvider.generateStructured({ model: "gpt-4o-mini", prompt: "hello" }, schema);
    } catch (e) {
      err = e;
    }

    // Assert
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect((err as AIUnavailableError).message).toContain("HTTP 429");
  });

  it("calls parseStructured with empty string when choices[0].message.content is absent", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(parseStructured).mockReturnValue({ name: "" });
    mockFetch.mockResolvedValue(makeJsonResponse({ choices: [{ message: {} }] }));

    // Act
    await openaiProvider.generateStructured({ model: "gpt-4o-mini", prompt: "hello" }, schema);

    // Assert
    expect(parseStructured).toHaveBeenCalledWith("", schema, { label: "openai-structured" });
  });

  it("calls parseStructured with empty string when choices is absent", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(parseStructured).mockReturnValue({ name: "" });
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    // Act
    await openaiProvider.generateStructured({ model: "gpt-4o-mini", prompt: "hello" }, schema);

    // Assert
    expect(parseStructured).toHaveBeenCalledWith("", schema, { label: "openai-structured" });
  });

  it("throws AIUnavailableError from generateStructured when no baseUrl is configured", async () => {
    // Arrange
    localStorage.clear(); // remove baseUrl
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });

    // Act / Assert
    await expect(
      openaiProvider.generateStructured({ model: "gpt-4o-mini", prompt: "hello" }, schema),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });
});

// ─── cfg() — localStorage edge cases ─────────────────────────────────────────

describe("cfg() — localStorage key reading", () => {
  it("returns empty string when localStorage key is not present", async () => {
    // isAvailable() exercises cfg("baseUrl") — verify it returns false (empty string)
    const result = await openaiProvider.isAvailable();
    expect(result).toBe(false);
  });

  it("trims whitespace from the stored value", async () => {
    // Arrange — padded value should be treated as baseUrl present
    localStorage.setItem("ai.openai.baseUrl", "  http://localhost:8080  ");

    // Act
    const result = await openaiProvider.isAvailable();

    // Assert
    expect(result).toBe(true);
  });

  it("uses empty-string fallback when localStorage.getItem returns null (key absent)", async () => {
    // Arrange — nothing stored
    // Act
    const models = await openaiProvider.listModels();

    // Assert — falls to default because models key is null
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("gpt-4o-mini");
  });
});
