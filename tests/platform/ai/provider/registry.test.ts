import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock() is hoisted to the top of the file so the factory must not reference
// variables declared in module scope.
vi.mock("@/platform/ai/provider/adapters/llamacpp", () => ({
  llamacppProvider: {
    id: "llamacpp",
    label: "Mock llamacpp",
    capabilities: {
      streaming: false,
      structuredNative: false,
      offline: true,
      requiresWebGPU: false,
    },
    isAvailable: vi.fn<[], Promise<boolean>>(),
    listModels: vi.fn(),
    ensureReady: vi.fn(),
    generate: vi.fn(),
    generateStructured: vi.fn(),
  },
}));

// ─── Import AFTER mocking ─────────────────────────────────────────────────────
import {
  detectAvailability,
  getProvider,
  listProviders,
  PROVIDERS,
  pickDefaultProvider,
} from "@/platform/ai/provider/registry";

beforeEach(() => {
  vi.mocked(PROVIDERS[0].isAvailable).mockReset();
  vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(false);
});

describe("PROVIDERS", () => {
  it("is a readonly array containing only llamacpp", () => {
    expect(PROVIDERS).toHaveLength(1);
    expect(PROVIDERS[0].id).toBe("llamacpp");
  });
});

describe("listProviders", () => {
  it("returns the same reference as PROVIDERS", () => {
    expect(listProviders()).toBe(PROVIDERS);
  });
});

describe("getProvider", () => {
  it("returns the llamacpp provider when asked for 'llamacpp'", () => {
    const provider = getProvider("llamacpp");
    expect(provider.id).toBe("llamacpp");
  });

  it("throws when given an unknown id", () => {
    expect(() => getProvider("unknown" as "llamacpp")).toThrow("Unknown AI provider: unknown");
  });

  it("throws an Error instance for unknown id", () => {
    expect(() => getProvider("nonexistent" as "llamacpp")).toThrowError(Error);
  });
});

describe("detectAvailability", () => {
  it("returns one entry for the single registered provider", async () => {
    const results = await detectAvailability();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "llamacpp", label: "Mock llamacpp" });
  });

  it("reports available=true when isAvailable resolves true", async () => {
    vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);
    const results = await detectAvailability();
    expect(results[0].available).toBe(true);
  });

  it("reports available=false when isAvailable resolves false", async () => {
    const results = await detectAvailability();
    expect(results[0].available).toBe(false);
  });

  it("catches isAvailable() rejection and reports available=false", async () => {
    vi.mocked(PROVIDERS[0].isAvailable).mockRejectedValue(new Error("network error"));
    const results = await detectAvailability();
    expect(results[0].available).toBe(false);
  });
});

describe("pickDefaultProvider", () => {
  describe("explicit preference", () => {
    it("returns the preferred provider when it is available", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);
      const result = await pickDefaultProvider("llamacpp");
      expect(result.id).toBe("llamacpp");
    });

    it("falls through to auto-selection when the preferred provider is unavailable", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
      const result = await pickDefaultProvider("llamacpp");
      // No other provider exists; last-resort fallback returns PROVIDERS[0] regardless.
      expect(result).toBe(PROVIDERS[0]);
    });

    it("falls through when the preferred provider's isAvailable() throws", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockRejectedValueOnce(new Error("crash"));
      const result = await pickDefaultProvider("llamacpp");
      expect(result).toBe(PROVIDERS[0]);
    });

    it("falls through when the preferred id is not in the registry", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);
      const result = await pickDefaultProvider("unknown" as "llamacpp");
      expect(result.id).toBe("llamacpp");
    });
  });

  describe("auto-selection (no preference)", () => {
    it("returns llamacpp when it is available", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);
      const result = await pickDefaultProvider();
      expect(result.id).toBe("llamacpp");
    });

    it("returns PROVIDERS[0] as a last resort when nothing is available", async () => {
      const result = await pickDefaultProvider();
      expect(result).toBe(PROVIDERS[0]);
    });

    it("catches a thrown error during auto-selection and falls back to PROVIDERS[0]", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockRejectedValue(new Error("IPC error"));
      const result = await pickDefaultProvider();
      expect(result).toBe(PROVIDERS[0]);
    });
  });

  describe("with undefined preference", () => {
    it("behaves the same as no preference", async () => {
      vi.mocked(PROVIDERS[0].isAvailable).mockResolvedValue(true);
      const result = await pickDefaultProvider(undefined);
      expect(result.id).toBe("llamacpp");
    });
  });
});
