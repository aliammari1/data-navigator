import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock all adapter modules ─────────────────────────────────────────────────
// vi.mock() is hoisted to the top of the file so the factory must not reference
// variables declared in module scope. We use vi.fn() inline instead.

vi.mock("@/platform/ai/provider/adapters/llamacpp", () => ({
  llamacppProvider: {
    id: "llamacpp",
    label: "Mock llamacpp",
    capabilities: { streaming: false, structuredNative: false, offline: true, requiresWebGPU: false },
    isAvailable: vi.fn<[], Promise<boolean>>(),
    listModels: vi.fn(),
    ensureReady: vi.fn(),
    generate: vi.fn(),
    generateStructured: vi.fn(),
  },
}));

vi.mock("@/platform/ai/provider/adapters/transformers", () => ({
  transformersProvider: {
    id: "transformers",
    label: "Mock transformers",
    capabilities: { streaming: false, structuredNative: false, offline: true, requiresWebGPU: false },
    isAvailable: vi.fn<[], Promise<boolean>>(),
    listModels: vi.fn(),
    ensureReady: vi.fn(),
    generate: vi.fn(),
    generateStructured: vi.fn(),
  },
}));

vi.mock("@/platform/ai/provider/adapters/webllm", () => ({
  webllmProvider: {
    id: "webllm",
    label: "Mock webllm",
    capabilities: { streaming: false, structuredNative: false, offline: true, requiresWebGPU: true },
    isAvailable: vi.fn<[], Promise<boolean>>(),
    listModels: vi.fn(),
    ensureReady: vi.fn(),
    generate: vi.fn(),
    generateStructured: vi.fn(),
  },
  isWebLLMOptIn: vi.fn<[], boolean>(),
}));

vi.mock("@/platform/ai/provider/adapters/ollama", () => ({
  ollamaProvider: {
    id: "ollama",
    label: "Mock ollama",
    capabilities: { streaming: false, structuredNative: false, offline: true, requiresWebGPU: false },
    isAvailable: vi.fn<[], Promise<boolean>>(),
    listModels: vi.fn(),
    ensureReady: vi.fn(),
    generate: vi.fn(),
    generateStructured: vi.fn(),
  },
}));

vi.mock("@/platform/ai/provider/adapters/openai", () => ({
  openaiProvider: {
    id: "openai",
    label: "Mock openai",
    capabilities: { streaming: false, structuredNative: false, offline: false, requiresWebGPU: false },
    isAvailable: vi.fn<[], Promise<boolean>>(),
    listModels: vi.fn(),
    ensureReady: vi.fn(),
    generate: vi.fn(),
    generateStructured: vi.fn(),
  },
}));

// ─── Import AFTER mocking ─────────────────────────────────────────────────────
import {
  PROVIDERS,
  getProvider,
  listProviders,
  detectAvailability,
  pickDefaultProvider,
} from "@/platform/ai/provider/registry";

import { isWebLLMOptIn } from "@/platform/ai/provider/adapters/webllm";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(isWebLLMOptIn).mockReturnValue(false);
  for (const p of PROVIDERS) {
    vi.mocked(p.isAvailable).mockReset();
    vi.mocked(p.isAvailable).mockResolvedValue(false);
  }
});

// ─── PROVIDERS constant ───────────────────────────────────────────────────────

describe("PROVIDERS", () => {
  it("is a readonly array of 5 providers", () => {
    expect(PROVIDERS).toHaveLength(5);
  });

  it("has llamacpp as the first provider", () => {
    expect(PROVIDERS[0].id).toBe("llamacpp");
  });

  it("has transformers as the second provider", () => {
    expect(PROVIDERS[1].id).toBe("transformers");
  });

  it("has webllm as the third provider", () => {
    expect(PROVIDERS[2].id).toBe("webllm");
  });

  it("has ollama as the fourth provider", () => {
    expect(PROVIDERS[3].id).toBe("ollama");
  });

  it("has openai as the fifth provider", () => {
    expect(PROVIDERS[4].id).toBe("openai");
  });

  it("contains all five known provider IDs in preference order", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(["llamacpp", "transformers", "webllm", "ollama", "openai"]);
  });
});

// ─── listProviders ────────────────────────────────────────────────────────────

describe("listProviders", () => {
  it("returns the same reference as PROVIDERS", () => {
    expect(listProviders()).toBe(PROVIDERS);
  });

  it("returns an array with 5 elements", () => {
    expect(listProviders()).toHaveLength(5);
  });

  it("returns the full provider list", () => {
    const result = listProviders();
    expect(result).toStrictEqual(PROVIDERS);
  });
});

// ─── getProvider ──────────────────────────────────────────────────────────────

describe("getProvider", () => {
  it("returns the llamacpp provider when asked for 'llamacpp'", () => {
    const provider = getProvider("llamacpp");
    expect(provider.id).toBe("llamacpp");
  });

  it("returns the transformers provider when asked for 'transformers'", () => {
    const provider = getProvider("transformers");
    expect(provider.id).toBe("transformers");
  });

  it("returns the webllm provider when asked for 'webllm'", () => {
    const provider = getProvider("webllm");
    expect(provider.id).toBe("webllm");
  });

  it("returns the ollama provider when asked for 'ollama'", () => {
    const provider = getProvider("ollama");
    expect(provider.id).toBe("ollama");
  });

  it("returns the openai provider when asked for 'openai'", () => {
    const provider = getProvider("openai");
    expect(provider.id).toBe("openai");
  });

  it("throws when given an unknown id", () => {
    expect(() => getProvider("unknown" as "llamacpp")).toThrow("Unknown AI provider: unknown");
  });

  it("throws an Error instance for unknown id", () => {
    expect(() => getProvider("nonexistent" as "llamacpp")).toThrowError(Error);
  });
});

// ─── detectAvailability ───────────────────────────────────────────────────────

describe("detectAvailability", () => {
  it("returns one entry per registered provider (5 entries)", async () => {
    const results = await detectAvailability();
    expect(results).toHaveLength(5);
  });

  it("includes id, label, and available fields for each entry", async () => {
    const results = await detectAvailability();
    for (const entry of results) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.label).toBe("string");
      expect(typeof entry.available).toBe("boolean");
    }
  });

  it("reports available=true for a provider that resolves to true", async () => {
    vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);

    const results = await detectAvailability();
    expect(results.find((r) => r.id === "llamacpp")?.available).toBe(true);
  });

  it("reports available=false for a provider that resolves to false", async () => {
    const results = await detectAvailability();
    expect(results.find((r) => r.id === "transformers")?.available).toBe(false);
  });

  it("catches isAvailable() rejection and reports available=false", async () => {
    vi.mocked(PROVIDERS[3].isAvailable).mockRejectedValue(new Error("network error"));

    const results = await detectAvailability();
    expect(results.find((r) => r.id === "ollama")?.available).toBe(false);
  });

  it("probes all providers and returns mixed availability correctly", async () => {
    vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true); // llamacpp
    vi.mocked(PROVIDERS[4].isAvailable).mockResolvedValue(true); // openai

    const results = await detectAvailability();
    expect(results.find((r) => r.id === "llamacpp")?.available).toBe(true);
    expect(results.find((r) => r.id === "transformers")?.available).toBe(false);
    expect(results.find((r) => r.id === "openai")?.available).toBe(true);
  });

  it("returns the label from each provider object", async () => {
    const results = await detectAvailability();
    expect(results.find((r) => r.id === "llamacpp")?.label).toBe("Mock llamacpp");
    expect(results.find((r) => r.id === "ollama")?.label).toBe("Mock ollama");
  });

  it("handles mixed availability and errors gracefully", async () => {
    vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);
    vi.mocked(PROVIDERS[1].isAvailable).mockRejectedValue(new Error("WASM crash"));

    const results = await detectAvailability();
    expect(results).toHaveLength(5);
    expect(results.find((r) => r.id === "llamacpp")?.available).toBe(true);
    expect(results.find((r) => r.id === "transformers")?.available).toBe(false);
  });
});

// ─── pickDefaultProvider ──────────────────────────────────────────────────────

describe("pickDefaultProvider", () => {
  describe("explicit preference", () => {
    it("returns the preferred provider when it is available", async () => {
      vi.mocked(PROVIDERS[1].isAvailable).mockResolvedValue(true); // transformers

      const result = await pickDefaultProvider("transformers");
      expect(result.id).toBe("transformers");
    });

    it("returns the preferred ollama provider when it is available", async () => {
      vi.mocked(PROVIDERS[3].isAvailable).mockResolvedValue(true); // ollama

      const result = await pickDefaultProvider("ollama");
      expect(result.id).toBe("ollama");
    });

    it("returns the preferred openai provider when it is available", async () => {
      vi.mocked(PROVIDERS[4].isAvailable).mockResolvedValue(true); // openai

      const result = await pickDefaultProvider("openai");
      expect(result.id).toBe("openai");
    });

    it("falls through to auto-selection when the preferred provider is unavailable", async () => {
      // llamacpp unavailable; transformers available
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(false);
      vi.mocked(PROVIDERS[1].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider("llamacpp");
      expect(result.id).toBe("transformers");
    });

    it("falls through when the preferred provider's isAvailable() throws", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockRejectedValue(new Error("crash"));
      vi.mocked(PROVIDERS[3].isAvailable).mockResolvedValue(true); // ollama

      const result = await pickDefaultProvider("llamacpp");
      expect(result.id).toBe("ollama");
    });

    it("falls through when the preferred id is not in the registry", async () => {
      // 'unknown' doesn't exist in BY_ID → preferred is undefined → skip block
      vi.mocked(isWebLLMOptIn).mockReturnValue(true);
      vi.mocked(PROVIDERS[2].isAvailable).mockResolvedValue(true); // webllm

      const result = await pickDefaultProvider("unknown" as "llamacpp");
      expect(result.id).toBe("webllm");
    });

    it("returns preferred webllm when user explicitly prefers it and it is available", async () => {
      vi.mocked(PROVIDERS[2].isAvailable).mockResolvedValue(true); // webllm

      const result = await pickDefaultProvider("webllm");
      expect(result.id).toBe("webllm");
    });
  });

  describe("auto-selection (no preference)", () => {
    it("returns llamacpp when it is available (highest preference)", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider();
      expect(result.id).toBe("llamacpp");
    });

    it("returns transformers when llamacpp is unavailable and transformers is available", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(false);
      vi.mocked(PROVIDERS[1].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider();
      expect(result.id).toBe("transformers");
    });

    it("skips webllm during auto-selection when isWebLLMOptIn returns false", async () => {
      // Only webllm is 'available', but opt-in is false → it gets skipped
      vi.mocked(PROVIDERS[2].isAvailable).mockResolvedValue(true);
      vi.mocked(isWebLLMOptIn).mockReturnValue(false);

      const result = await pickDefaultProvider();
      // webllm skipped; no other provider available; falls through to PROVIDERS[0]
      expect(result.id).toBe("llamacpp");
    });

    it("returns webllm when it is opted-in and available", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(false);
      vi.mocked(PROVIDERS[1].isAvailable).mockResolvedValue(false);
      vi.mocked(PROVIDERS[2].isAvailable).mockResolvedValue(true);
      vi.mocked(isWebLLMOptIn).mockReturnValue(true);

      const result = await pickDefaultProvider();
      expect(result.id).toBe("webllm");
    });

    it("returns ollama when earlier providers are unavailable", async () => {
      vi.mocked(PROVIDERS[3].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider();
      expect(result.id).toBe("ollama");
    });

    it("returns openai when only openai is available in first loop", async () => {
      vi.mocked(PROVIDERS[4].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider();
      expect(result.id).toBe("openai");
    });

    it("returns PROVIDERS[0] (llamacpp) when no provider is available anywhere", async () => {
      // All providers remain false (set in beforeEach)
      const result = await pickDefaultProvider();
      expect(result).toBe(PROVIDERS[0]);
    });

    it("handles a provider throwing during auto-selection (caught → false)", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockRejectedValue(new Error("IPC error"));
      vi.mocked(PROVIDERS[1].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider();
      expect(result.id).toBe("transformers");
    });

    it("the second loop also catches thrown errors (different call order)", async () => {
      // First loop: all calls return false.
      // Second loop: llamacpp throws (2nd call), transformers returns true (2nd call).
      vi.mocked(PROVIDERS[0].isAvailable)
        .mockResolvedValueOnce(false) // first loop
        .mockRejectedValueOnce(new Error("crash in second loop")); // second loop
      vi.mocked(PROVIDERS[1].isAvailable)
        .mockResolvedValueOnce(false) // first loop
        .mockResolvedValueOnce(true); // second loop

      const result = await pickDefaultProvider();
      expect(result.id).toBe("transformers");
    });

    it("second loop unconditionally skips webllm (even if isWebLLMOptIn is true)", async () => {
      // isWebLLMOptIn=true but webllm is unavailable → first loop checks webllm → false.
      // Second loop: webllm is skipped unconditionally → same providers checked.
      // All fail → falls back to PROVIDERS[0].
      vi.mocked(isWebLLMOptIn).mockReturnValue(true);
      vi.mocked(PROVIDERS[2].isAvailable).mockResolvedValue(false);

      const result = await pickDefaultProvider();
      expect(result).toBe(PROVIDERS[0]);
    });
  });

  describe("with undefined preference", () => {
    it("calls isAvailable on providers (same as no preference)", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);

      const result = await pickDefaultProvider(undefined);
      expect(result.id).toBe("llamacpp");
    });
  });
});
