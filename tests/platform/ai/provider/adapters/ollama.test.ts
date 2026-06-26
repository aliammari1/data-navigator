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
import { ollamaProvider } from "@/platform/ai/provider/adapters/ollama";
import { parseStructured } from "@/platform/ai/provider/structured";
import { zodToInlineJsonSchema } from "@/platform/ai/provider/zod-json-schema";
import { toMessages, generateStructuredByPrompt } from "@/platform/ai/provider/adapters/base";
import { AIUnavailableError } from "@/platform/ai/provider/types";

// ─── Fetch mock setup ────────────────────────────────────────────────────────
// We stub the global fetch before each test and restore it after.
// Using beforeEach/afterEach keeps the stubs clean across tests
// regardless of vitest's unstubGlobals setting.

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  vi.mocked(toMessages).mockReturnValue([{ role: "user", content: "hello" }]);
  vi.mocked(parseStructured).mockReset();
  vi.mocked(zodToInlineJsonSchema).mockReset();
  vi.mocked(generateStructuredByPrompt).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── AbortSignal.timeout shim ─────────────────────────────────────────────────
// jsdom may not have AbortSignal.timeout; provide a fallback shim.
if (typeof AbortSignal.timeout !== "function") {
  Object.defineProperty(AbortSignal, "timeout", {
    value: (_ms: number) => new AbortController().signal,
    writable: true,
    configurable: true,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Response-like object for fetch mocks. */
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

/**
 * Build a response that streams NDJSON lines through a ReadableStream body.
 * Each entry in `lines` is serialized as JSON and separated by newlines.
 */
function makeStreamResponse(lines: unknown[]): Response {
  const ndjson = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const encoder = new TextEncoder();
  const bytes = encoder.encode(ndjson);
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: readable,
    json: async () => JSON.parse(ndjson),
  } as unknown as Response;
}

// ─── Static properties ────────────────────────────────────────────────────────

describe("ollamaProvider static properties", () => {
  it("has id = 'ollama'", () => {
    expect(ollamaProvider.id).toBe("ollama");
  });

  it("has a non-empty label string", () => {
    expect(typeof ollamaProvider.label).toBe("string");
    expect(ollamaProvider.label.length).toBeGreaterThan(0);
  });

  it("advertises streaming = true", () => {
    expect(ollamaProvider.capabilities.streaming).toBe(true);
  });

  it("advertises structuredNative = true", () => {
    expect(ollamaProvider.capabilities.structuredNative).toBe(true);
  });

  it("advertises offline = true", () => {
    expect(ollamaProvider.capabilities.offline).toBe(true);
  });

  it("advertises requiresWebGPU = false", () => {
    expect(ollamaProvider.capabilities.requiresWebGPU).toBe(false);
  });
});

// ─── isAvailable ──────────────────────────────────────────────────────────────

describe("ollamaProvider.isAvailable", () => {
  it("returns true when /api/tags responds with ok=true", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ models: [] }));

    // Act
    const result = await ollamaProvider.isAvailable();

    // Assert
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tags"),
      expect.any(Object),
    );
  });

  it("returns false when /api/tags responds with ok=false", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 503 }));

    // Act
    const result = await ollamaProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when fetch throws (network error)", async () => {
    // Arrange
    mockFetch.mockRejectedValue(new Error("connection refused"));

    // Act
    const result = await ollamaProvider.isAvailable();

    // Assert
    expect(result).toBe(false);
  });
});

// ─── listModels ───────────────────────────────────────────────────────────────

describe("ollamaProvider.listModels", () => {
  it("maps model entries from the API response", async () => {
    // Arrange
    const apiBody = {
      models: [
        { name: "llama3:8b", details: { family: "llama", parameter_size: "8B" } },
        { name: "mistral:7b", details: { family: "mistral", parameter_size: "7B" } },
      ],
    };
    mockFetch.mockResolvedValue(makeJsonResponse(apiBody));

    // Act
    const result = await ollamaProvider.listModels();

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: "llama3:8b", label: "llama3:8b", family: "llama", sizeLabel: "8B" });
    expect(result[1]).toEqual({ id: "mistral:7b", label: "mistral:7b", family: "mistral", sizeLabel: "7B" });
  });

  it("returns an empty array when models property is missing from the response", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    // Act
    const result = await ollamaProvider.listModels();

    // Assert
    expect(result).toEqual([]);
  });

  it("omits family and sizeLabel when the model's details are missing", async () => {
    // Arrange
    const apiBody = { models: [{ name: "phi:latest" }] };
    mockFetch.mockResolvedValue(makeJsonResponse(apiBody));

    // Act
    const result = await ollamaProvider.listModels();

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("phi:latest");
    expect(result[0].family).toBeUndefined();
    expect(result[0].sizeLabel).toBeUndefined();
  });

  it("returns an empty array when the HTTP response is not ok", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 500 }));

    // Act
    const result = await ollamaProvider.listModels();

    // Assert
    expect(result).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    // Arrange
    mockFetch.mockRejectedValue(new Error("network failure"));

    // Act
    const result = await ollamaProvider.listModels();

    // Assert
    expect(result).toEqual([]);
  });
});

// ─── ensureReady ──────────────────────────────────────────────────────────────

describe("ollamaProvider.ensureReady", () => {
  it("calls onProgress with loading then ready status", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}));
    const onProgress = vi.fn();

    // Act
    await ollamaProvider.ensureReady("llama3:8b", onProgress);

    // Assert
    expect(onProgress).toHaveBeenCalledTimes(2);
    const [first, second] = onProgress.mock.calls.map((c) => c[0]);
    expect(first.status).toBe("loading");
    expect(first.progress).toBe(10);
    expect(first.message).toContain("llama3:8b");
    expect(second.status).toBe("ready");
    expect(second.progress).toBe(100);
  });

  it("does not throw when onProgress is omitted", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    // Act / Assert
    await expect(ollamaProvider.ensureReady("llama3:8b")).resolves.toBeUndefined();
  });

  it("silently ignores fetch errors during warmup and still fires onProgress", async () => {
    // Arrange
    mockFetch.mockRejectedValue(new Error("connection refused"));
    const onProgress = vi.fn();

    // Act / Assert: ensureReady must not propagate the error
    await expect(ollamaProvider.ensureReady("llama3:8b", onProgress)).resolves.toBeUndefined();
    // Both progress callbacks should still fire
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("sends a POST to /api/generate with an empty prompt for warmup", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    // Act
    await ollamaProvider.ensureReady("mymodel");

    // Assert: the generate call
    const generateCall = mockFetch.mock.calls.find((c) => c[0].includes("/api/generate"));
    expect(generateCall).toBeDefined();
    expect(generateCall![1].method).toBe("POST");
    const body = JSON.parse(generateCall![1].body);
    expect(body.model).toBe("mymodel");
    expect(body.prompt).toBe("");
    expect(body.stream).toBe(false);
  });
});

// ─── generate — non-streaming ─────────────────────────────────────────────────

describe("ollamaProvider.generate — non-streaming", () => {
  it("returns text from the message.content field", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "Hello back!" } }));

    // Act
    const result = await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    expect(result.text).toBe("Hello back!");
    expect(result.model).toBe("llama3:8b");
    expect(result.provider).toBe("ollama");
    expect(result.finishReason).toBe("stop");
  });

  it("returns empty string when message.content is absent", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: {} }));

    // Act
    const result = await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    expect(result.text).toBe("");
  });

  it("returns empty string when message itself is absent", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    // Act
    const result = await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    expect(result.text).toBe("");
  });

  it("throws AIUnavailableError when fetch rejects with an Error", async () => {
    // Arrange
    mockFetch.mockRejectedValue(new Error("connection refused"));

    // Act / Assert
    await expect(
      ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" }),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("throws AIUnavailableError when fetch rejects with a non-Error value", async () => {
    // Arrange
    mockFetch.mockRejectedValue("raw string error");

    // Act / Assert
    await expect(
      ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" }),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("throws AIUnavailableError including HTTP status when response is not ok", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 404 }));

    // Act
    let err: unknown;
    try {
      await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });
    } catch (e) {
      err = e;
    }

    // Assert
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect((err as AIUnavailableError).message).toContain("HTTP 404");
  });

  it("includes a non-negative elapsedMs in the result", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "hi" } }));

    // Act
    const result = await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("sends temperature=0 when temperature is not provided", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.temperature).toBe(0);
  });

  it("sends the provided temperature", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello", temperature: 0.8 });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.temperature).toBe(0.8);
  });

  it("includes top_p in options when topP is specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello", topP: 0.95 });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.top_p).toBe(0.95);
  });

  it("omits top_p when topP is not specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options).not.toHaveProperty("top_p");
  });

  it("includes num_predict in options when maxTokens is specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello", maxTokens: 256 });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.num_predict).toBe(256);
  });

  it("omits num_predict when maxTokens is not specified", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options).not.toHaveProperty("num_predict");
  });

  it("sets stream=false in the request body when onToken is not provided", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "ok" } }));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello" });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(false);
  });

  it("returns finishReason='abort' when signal is already aborted", async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "partial" } }));

    // Act
    const result = await ollamaProvider.generate({
      model: "llama3:8b",
      prompt: "hello",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("abort");
  });

  it("returns finishReason='stop' when signal is not aborted", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "done" } }));
    const controller = new AbortController();

    // Act
    const result = await ollamaProvider.generate({
      model: "llama3:8b",
      prompt: "hello",
      signal: controller.signal,
    });

    // Assert
    expect(result.finishReason).toBe("stop");
  });
});

// ─── generate — streaming ─────────────────────────────────────────────────────

describe("ollamaProvider.generate — streaming", () => {
  it("accumulates tokens and calls onToken for each non-empty chunk", async () => {
    // Arrange
    const lines = [{ message: { content: "Hello" } }, { message: { content: " world" } }];
    mockFetch.mockResolvedValue(makeStreamResponse(lines));

    const receivedTokens: string[] = [];

    // Act
    const result = await ollamaProvider.generate({
      model: "llama3:8b",
      prompt: "hello",
      onToken: (t) => receivedTokens.push(t),
    });

    // Assert
    expect(receivedTokens).toEqual(["Hello", " world"]);
    expect(result.text).toBe("Hello world");
  });

  it("sets stream=true in the request body when onToken is provided", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeStreamResponse([{ message: { content: "hi" } }]));

    // Act
    await ollamaProvider.generate({ model: "llama3:8b", prompt: "hello", onToken: vi.fn() });

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
  });

  it("skips blank lines in the NDJSON stream", async () => {
    // Arrange: embed blank lines by crafting the raw NDJSON manually
    const encoder = new TextEncoder();
    const ndjson = `${JSON.stringify({ message: { content: "A" } })}\n\n   \n${JSON.stringify({ message: { content: "B" } })}\n`;
    const bytes = encoder.encode(ndjson);
    const readable = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: readable,
      json: async () => ({}),
    } as unknown as Response);

    const tokens: string[] = [];

    // Act
    const result = await ollamaProvider.generate({
      model: "llama3:8b",
      prompt: "hello",
      onToken: (t) => tokens.push(t),
    });

    // Assert: blank lines skipped, only A and B received
    expect(tokens).toEqual(["A", "B"]);
    expect(result.text).toBe("AB");
  });

  it("skips chunks with empty string content without calling onToken", async () => {
    // Arrange
    const lines = [
      { message: { content: "" } },
      { message: {} },
      { message: { content: "real" } },
    ];
    mockFetch.mockResolvedValue(makeStreamResponse(lines));

    const tokens: string[] = [];

    // Act
    const result = await ollamaProvider.generate({
      model: "llama3:8b",
      prompt: "hello",
      onToken: (t) => tokens.push(t),
    });

    // Assert: only the non-empty token is emitted
    expect(tokens).toEqual(["real"]);
    expect(result.text).toBe("real");
  });

  it("falls back to the JSON path when res.body is null (onToken provided but no body)", async () => {
    // Arrange: body is null even though onToken was requested
    const res = {
      ok: true,
      status: 200,
      body: null,
      json: async () => ({ message: { content: "fallback" } }),
    } as unknown as Response;
    mockFetch.mockResolvedValue(res);

    const onToken = vi.fn();

    // Act
    const result = await ollamaProvider.generate({
      model: "llama3:8b",
      prompt: "hello",
      onToken,
    });

    // Assert: text comes from json(), onToken never fired
    expect(result.text).toBe("fallback");
    expect(onToken).not.toHaveBeenCalled();
  });
});

// ─── generateStructured ───────────────────────────────────────────────────────

describe("ollamaProvider.generateStructured", () => {
  const schema = z.object({ name: z.string() });

  it("uses the native JSON-schema path when zodToInlineJsonSchema returns a schema", async () => {
    // Arrange
    const fakeSchema = { type: "object", properties: { name: { type: "string" } } };
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(fakeSchema);
    vi.mocked(parseStructured).mockReturnValue({ name: "Alice" });
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: '{"name":"Alice"}' } }));

    // Act
    const result = await ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "get name" }, schema);

    // Assert
    expect(result).toEqual({ name: "Alice" });
    expect(parseStructured).toHaveBeenCalledWith('{"name":"Alice"}', schema, { label: "ollama-structured" });
    expect(generateStructuredByPrompt).not.toHaveBeenCalled();
  });

  it("falls back to generateStructuredByPrompt when zodToInlineJsonSchema returns null", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(null);
    vi.mocked(generateStructuredByPrompt).mockResolvedValue({ name: "Bob" });

    // Act
    const result = await ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "get name" }, schema);

    // Assert
    expect(result).toEqual({ name: "Bob" });
    expect(generateStructuredByPrompt).toHaveBeenCalled();
    // No HTTP call should be made in the fallback path
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends the JSON schema as the format field in the request body", async () => {
    // Arrange
    const fakeSchema = { type: "object" };
    vi.mocked(zodToInlineJsonSchema).mockReturnValue(fakeSchema);
    vi.mocked(parseStructured).mockReturnValue({ name: "Alice" });
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "{}" } }));

    // Act
    await ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "hello" }, schema);

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.format).toEqual(fakeSchema);
    expect(body.stream).toBe(false);
  });

  it("throws AIUnavailableError when fetch rejects with an Error in the structured path", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    mockFetch.mockRejectedValue(new Error("network error"));

    // Act / Assert
    await expect(
      ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "hello" }, schema),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("throws AIUnavailableError when fetch rejects with a non-Error string", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    mockFetch.mockRejectedValue("timeout");

    // Act / Assert
    await expect(
      ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "hello" }, schema),
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });

  it("throws AIUnavailableError including HTTP status when structured response is not ok", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    mockFetch.mockResolvedValue(makeJsonResponse({}, { ok: false, status: 422 }));

    // Act
    let err: unknown;
    try {
      await ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "hello" }, schema);
    } catch (e) {
      err = e;
    }

    // Assert
    expect(err).toBeInstanceOf(AIUnavailableError);
    expect((err as AIUnavailableError).message).toContain("HTTP 422");
  });

  it("sends temperature=0 by default in the structured request", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(parseStructured).mockReturnValue({ name: "Alice" });
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "{}" } }));

    // Act
    await ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "hello" }, schema);

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.temperature).toBe(0);
  });

  it("forwards a custom temperature in the structured request", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(parseStructured).mockReturnValue({ name: "Alice" });
    mockFetch.mockResolvedValue(makeJsonResponse({ message: { content: "{}" } }));

    // Act
    await ollamaProvider.generateStructured(
      { model: "llama3:8b", prompt: "hello", temperature: 0.5 },
      schema,
    );

    // Assert
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.temperature).toBe(0.5);
  });

  it("calls parseStructured with empty string when message content is absent", async () => {
    // Arrange
    vi.mocked(zodToInlineJsonSchema).mockReturnValue({ type: "object" });
    vi.mocked(parseStructured).mockReturnValue({ name: "" });
    mockFetch.mockResolvedValue(makeJsonResponse({ message: {} }));

    // Act
    await ollamaProvider.generateStructured({ model: "llama3:8b", prompt: "hello" }, schema);

    // Assert
    expect(parseStructured).toHaveBeenCalledWith("", schema, { label: "ollama-structured" });
  });
});

// ─── host() localStorage override ─────────────────────────────────────────────

describe("host() — localStorage override", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("uses DEFAULT_HOST (127.0.0.1:11434) when localStorage is empty", async () => {
    // Arrange
    mockFetch.mockResolvedValue(makeJsonResponse({ models: [] }));

    // Act
    await ollamaProvider.isAvailable();

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.any(Object),
    );
  });

  it("uses the stored host when ai.ollama.host is set in localStorage", async () => {
    // Arrange
    localStorage.setItem("ai.ollama.host", "http://192.168.1.10:11434");
    mockFetch.mockResolvedValue(makeJsonResponse({ models: [] }));

    // Act
    await ollamaProvider.isAvailable();

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      "http://192.168.1.10:11434/api/tags",
      expect.any(Object),
    );
  });

  it("falls back to DEFAULT_HOST when the stored value is blank whitespace", async () => {
    // Arrange
    localStorage.setItem("ai.ollama.host", "   ");
    mockFetch.mockResolvedValue(makeJsonResponse({ models: [] }));

    // Act
    await ollamaProvider.isAvailable();

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/tags",
      expect.any(Object),
    );
  });
});
