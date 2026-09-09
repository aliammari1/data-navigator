import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateStorage,
  getStorageInfo,
  isStoragePersisted,
  requestPersistence,
} from "@/platform/storage/storage-info";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeStorageManager(overrides: Partial<StorageManager> = {}): StorageManager {
  return {
    estimate: vi.fn().mockResolvedValue({ usage: 1024 * 1024, quota: 10 * 1024 * 1024 }),
    persisted: vi.fn().mockResolvedValue(false),
    persist: vi.fn().mockResolvedValue(true),
    getDirectory: vi.fn(),
    ...overrides,
  } as unknown as StorageManager;
}

// Reset the module-level `persistRequested` flag between tests by re-importing
// the module freshly (vi.resetModules resets module cache).
async function freshImport() {
  vi.resetModules();
  return import("@/platform/storage/storage-info");
}

// ─── estimateStorage ─────────────────────────────────────────────────────────

describe("estimateStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns supported=true with real values when navigator.storage.estimate() resolves", async () => {
    // Arrange
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({ usage: 2_000_000, quota: 20_000_000 }),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await estimateStorage();

    // Assert
    expect(result.supported).toBe(true);
    expect(result.usage).toBe(2_000_000);
    expect(result.quota).toBe(20_000_000);
  });

  it("falls back to 0/0/false when navigator.storage.estimate() rejects", async () => {
    // Arrange
    const sm = makeStorageManager({
      estimate: vi.fn().mockRejectedValue(new Error("quota denied")),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await estimateStorage();

    // Assert
    expect(result).toEqual({ usage: 0, quota: 0, supported: false });
  });

  it("returns supported=false when navigator is undefined", async () => {
    // Arrange – navigator is absent (SSR-like)
    vi.stubGlobal("navigator", undefined);

    // Act
    const result = await estimateStorage();

    // Assert
    expect(result).toEqual({ usage: 0, quota: 0, supported: false });
  });

  it("returns supported=false when navigator.storage is undefined", async () => {
    // Arrange
    vi.stubGlobal("navigator", {});

    // Act
    const result = await estimateStorage();

    // Assert
    expect(result).toEqual({ usage: 0, quota: 0, supported: false });
  });

  it("returns supported=false when navigator.storage.estimate is not a function", async () => {
    // Arrange
    vi.stubGlobal("navigator", { storage: { estimate: undefined } });

    // Act
    const result = await estimateStorage();

    // Assert
    expect(result).toEqual({ usage: 0, quota: 0, supported: false });
  });

  it("treats undefined usage/quota from estimate() as 0", async () => {
    // Arrange: estimate returns an empty object (usage/quota undefined)
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await estimateStorage();

    // Assert
    expect(result.usage).toBe(0);
    expect(result.quota).toBe(0);
    expect(result.supported).toBe(true);
  });
});

// ─── isStoragePersisted ───────────────────────────────────────────────────────

describe("isStoragePersisted", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns true when persisted() resolves true", async () => {
    // Arrange
    const sm = makeStorageManager({ persisted: vi.fn().mockResolvedValue(true) });
    vi.stubGlobal("navigator", { storage: sm });

    // Act & Assert
    await expect(isStoragePersisted()).resolves.toBe(true);
  });

  it("returns false when persisted() resolves false", async () => {
    // Arrange
    const sm = makeStorageManager({ persisted: vi.fn().mockResolvedValue(false) });
    vi.stubGlobal("navigator", { storage: sm });

    // Act & Assert
    await expect(isStoragePersisted()).resolves.toBe(false);
  });

  it("returns false when persisted() rejects", async () => {
    // Arrange
    const sm = makeStorageManager({
      persisted: vi.fn().mockRejectedValue(new Error("no permission")),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act & Assert
    await expect(isStoragePersisted()).resolves.toBe(false);
  });

  it("returns false when navigator is undefined", async () => {
    // Arrange
    vi.stubGlobal("navigator", undefined);

    // Act & Assert
    await expect(isStoragePersisted()).resolves.toBe(false);
  });

  it("returns false when navigator.storage.persisted is not a function", async () => {
    // Arrange
    vi.stubGlobal("navigator", { storage: { persisted: undefined } });

    // Act & Assert
    await expect(isStoragePersisted()).resolves.toBe(false);
  });
});

// ─── getStorageInfo ───────────────────────────────────────────────────────────

describe("getStorageInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns real MB values when storage API is supported", async () => {
    // Arrange: 1 MB used, 10 MB quota, persistent
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({ usage: 1_048_576, quota: 10_485_760 }),
      persisted: vi.fn().mockResolvedValue(true),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const info = await getStorageInfo();

    // Assert
    expect(info.supported).toBe(true);
    expect(info.isPersistent).toBe(true);
    // bytesToMB: round((bytes / 1_048_576) * 10) / 10
    expect(info.usedMB).toBe(1);
    expect(info.quotaMB).toBe(10);
    expect(info.pct).toBe(10); // 1/10 * 100 = 10
  });

  it("returns pct=0 when quota is 0 to avoid division by zero", async () => {
    // Arrange
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({ usage: 0, quota: 0 }),
      persisted: vi.fn().mockResolvedValue(false),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const info = await getStorageInfo();

    // Assert
    expect(info.pct).toBe(0);
    expect(info.supported).toBe(true);
  });

  it("returns safe defaults when storage API is unsupported", async () => {
    // Arrange: no navigator.storage
    vi.stubGlobal("navigator", {});

    // Act
    const info = await getStorageInfo();

    // Assert
    expect(info).toMatchObject({
      usedMB: 0,
      quotaMB: 0,
      pct: 0,
      supported: false,
    });
  });

  it("carries isPersistent=false from isStoragePersisted when unsupported", async () => {
    // Arrange: no storage at all
    vi.stubGlobal("navigator", undefined);

    // Act
    const info = await getStorageInfo();

    // Assert
    expect(info.isPersistent).toBe(false);
    expect(info.supported).toBe(false);
  });

  it("rounds usedMB and quotaMB to one decimal", async () => {
    // Arrange: 1.5 MB used, 15 MB quota
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({
        usage: Math.round(1.5 * 1024 * 1024),
        quota: Math.round(15 * 1024 * 1024),
      }),
      persisted: vi.fn().mockResolvedValue(false),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const info = await getStorageInfo();

    // Assert — bytesToMB rounds to one decimal
    expect(info.usedMB).toBe(1.5);
    expect(info.quotaMB).toBe(15);
  });
});

// ─── requestPersistence ───────────────────────────────────────────────────────

describe("requestPersistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns true and skips persist() when already persisted", async () => {
    // Arrange
    const persistFn = vi.fn().mockResolvedValue(true);
    const sm = makeStorageManager({
      persisted: vi.fn().mockResolvedValue(true),
      persist: persistFn,
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await requestPersistence();

    // Assert: should short-circuit without calling persist()
    expect(result).toBe(true);
    expect(persistFn).not.toHaveBeenCalled();
  });

  it("calls persist() and returns its result when not yet persisted", async () => {
    // Arrange
    const sm = makeStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await requestPersistence();

    // Assert
    expect(result).toBe(true);
  });

  it("returns false when persist() returns false", async () => {
    // Arrange
    const sm = makeStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await requestPersistence();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when persist() throws", async () => {
    // Arrange
    const sm = makeStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new Error("SecurityError")),
    });
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await requestPersistence();

    // Assert
    expect(result).toBe(false);
  });

  it("returns false when navigator is undefined", async () => {
    // Arrange
    vi.stubGlobal("navigator", undefined);

    // Act & Assert
    await expect(requestPersistence()).resolves.toBe(false);
  });

  it("returns false when navigator.storage.persist is not a function", async () => {
    // Arrange
    vi.stubGlobal("navigator", { storage: { persist: undefined, persisted: undefined } });

    // Act & Assert
    await expect(requestPersistence()).resolves.toBe(false);
  });

  it("calls persist() when persisted() is not a function on storage manager", async () => {
    // Arrange: persist is a function but persisted is not available
    const sm = {
      persist: vi.fn().mockResolvedValue(true),
      // persisted is deliberately absent
    } as unknown as StorageManager;
    vi.stubGlobal("navigator", { storage: sm });

    // Act
    const result = await requestPersistence();

    // Assert: falls through to calling persist() directly
    expect(result).toBe(true);
  });
});

// ─── ensurePersistentStorage ──────────────────────────────────────────────────

describe("ensurePersistentStorage", () => {
  // We need to reset the module-level persistRequested flag for each test
  // by using vi.resetModules() and re-importing the module fresh.

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("requests persistence and returns estimate on first call", async () => {
    // Arrange
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({ usage: 500_000, quota: 5_000_000 }),
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    });
    vi.stubGlobal("navigator", { storage: sm });

    const { ensurePersistentStorage: fn } = await freshImport();

    // Act
    const result = await fn();

    // Assert
    expect(result.persisted).toBe(true);
    expect(result.estimate.usage).toBe(500_000);
    expect(result.estimate.quota).toBe(5_000_000);
  });

  it("on second call (persistRequested=true) uses isStoragePersisted + estimateStorage", async () => {
    // Arrange
    const sm = makeStorageManager({
      estimate: vi.fn().mockResolvedValue({ usage: 1_000_000, quota: 8_000_000 }),
      persisted: vi.fn().mockResolvedValue(true),
      persist: vi.fn().mockResolvedValue(true),
    });
    vi.stubGlobal("navigator", { storage: sm });

    const { ensurePersistentStorage: fn } = await freshImport();

    // Act: first call sets flag
    await fn();
    // Second call should take the early-return branch
    const result = await fn();

    // Assert: still returns a valid result
    expect(result.persisted).toBe(true);
    expect(typeof result.estimate.usage).toBe("number");
    expect(typeof result.estimate.quota).toBe("number");
  });

  it("returns persisted=false when storage API is unavailable on first call", async () => {
    // Arrange: no storage API
    vi.stubGlobal("navigator", undefined);

    const { ensurePersistentStorage: fn } = await freshImport();

    // Act
    const result = await fn();

    // Assert
    expect(result.persisted).toBe(false);
    expect(result.estimate).toEqual({ usage: 0, quota: 0 });
  });

  it("returns persisted=false on second call when storage unavailable", async () => {
    // Arrange: no storage API
    vi.stubGlobal("navigator", undefined);

    const { ensurePersistentStorage: fn } = await freshImport();

    // Act
    await fn(); // first call sets flag
    const result = await fn(); // second call takes early-return branch

    // Assert
    expect(result.persisted).toBe(false);
    expect(result.estimate).toEqual({ usage: 0, quota: 0 });
  });
});
