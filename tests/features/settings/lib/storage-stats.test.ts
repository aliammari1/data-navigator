/**
 * Unit tests for @/features/settings/lib/storage-stats
 *
 * Mocks:
 *  - @/platform/storage  (deleteDir, dirSize, getStorageInfo, isOpfsAvailable, OPFS_NS)
 *
 * The target module's own logic (branching, looping, mapping) is kept real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------- mocks (must be declared before any import of the target) ----------

vi.mock("@/platform/storage", () => ({
  getStorageInfo: vi.fn(),
  isOpfsAvailable: vi.fn(),
  dirSize: vi.fn(),
  deleteDir: vi.fn(),
  OPFS_NS: {
    parquetCache: "parquet-cache",
    modelWeights: "models",
    pmtiles: "pmtiles",
    pyodide: "pyodide",
  },
}));

// ---- import the module under test and mock handles ----

import {
  readStorageStats,
  clearCacheNamespace,
  type StorageStats,
  type CacheNamespaceStat,
} from "@/features/settings/lib/storage-stats";

import {
  getStorageInfo,
  isOpfsAvailable,
  dirSize,
  deleteDir,
  OPFS_NS,
} from "@/platform/storage";

const mockGetStorageInfo = getStorageInfo as ReturnType<typeof vi.fn>;
const mockIsOpfsAvailable = isOpfsAvailable as ReturnType<typeof vi.fn>;
const mockDirSize = dirSize as ReturnType<typeof vi.fn>;
const mockDeleteDir = deleteDir as ReturnType<typeof vi.fn>;

const FAKE_STORAGE_INFO = {
  usedMB: 120,
  quotaMB: 5000,
  pct: 2,
  isPersistent: true,
  supported: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetStorageInfo.mockResolvedValue(FAKE_STORAGE_INFO);
  mockIsOpfsAvailable.mockReturnValue(true);
  mockDirSize.mockResolvedValue(0);
  mockDeleteDir.mockResolvedValue(undefined);
});

// =============================================================================
// readStorageStats — OPFS NOT available
// =============================================================================

describe("readStorageStats – OPFS not available", () => {
  it("returns overall from getStorageInfo", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const stats: StorageStats = await readStorageStats();

    expect(stats.overall).toEqual(FAKE_STORAGE_INFO);
  });

  it("returns opfsAvailable: false", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const stats = await readStorageStats();

    expect(stats.opfsAvailable).toBe(false);
  });

  it("returns exactly 4 cache namespace entries", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const stats = await readStorageStats();

    expect(stats.caches).toHaveLength(4);
  });

  it("sets bytes to 0 for every cache namespace when OPFS is unavailable", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const stats = await readStorageStats();

    for (const cache of stats.caches) {
      expect(cache.bytes).toBe(0);
    }
  });

  it("maps each namespace id and dir correctly when OPFS is unavailable", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const stats = await readStorageStats();

    const ids = stats.caches.map((c) => c.id);
    expect(ids).toContain("modelWeights");
    expect(ids).toContain("parquetCache");
    expect(ids).toContain("pmtiles");
    expect(ids).toContain("pyodide");

    for (const cache of stats.caches) {
      expect(cache.dir).toBe(OPFS_NS[cache.id]);
    }
  });

  it("includes label and description for all namespaces", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const stats = await readStorageStats();

    for (const cache of stats.caches) {
      expect(typeof cache.label).toBe("string");
      expect(cache.label.length).toBeGreaterThan(0);
      expect(typeof cache.description).toBe("string");
      expect(cache.description.length).toBeGreaterThan(0);
    }
  });

  it("does not call dirSize when OPFS is unavailable", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    await readStorageStats();

    expect(mockDirSize).not.toHaveBeenCalled();
  });
});

// =============================================================================
// readStorageStats — OPFS available, happy path
// =============================================================================

describe("readStorageStats – OPFS available (happy path)", () => {
  it("returns opfsAvailable: true", async () => {
    mockIsOpfsAvailable.mockReturnValue(true);

    const stats = await readStorageStats();

    expect(stats.opfsAvailable).toBe(true);
  });

  it("returns overall from getStorageInfo", async () => {
    const stats = await readStorageStats();

    expect(stats.overall).toEqual(FAKE_STORAGE_INFO);
  });

  it("returns exactly 4 cache entries", async () => {
    const stats = await readStorageStats();

    expect(stats.caches).toHaveLength(4);
  });

  it("calls dirSize for each namespace dir", async () => {
    await readStorageStats();

    expect(mockDirSize).toHaveBeenCalledTimes(4);
    expect(mockDirSize).toHaveBeenCalledWith("parquet-cache");
    expect(mockDirSize).toHaveBeenCalledWith("models");
    expect(mockDirSize).toHaveBeenCalledWith("pmtiles");
    expect(mockDirSize).toHaveBeenCalledWith("pyodide");
  });

  it("populates bytes from dirSize for each namespace", async () => {
    mockDirSize.mockImplementation((dir: string) => {
      const sizes: Record<string, number> = {
        "parquet-cache": 1024,
        models: 512,
        pmtiles: 2048,
        pyodide: 4096,
      };
      return Promise.resolve(sizes[dir] ?? 0);
    });

    const stats = await readStorageStats();

    const byId = Object.fromEntries(stats.caches.map((c) => [c.id, c]));
    expect(byId["parquetCache"].bytes).toBe(1024);
    expect(byId["modelWeights"].bytes).toBe(512);
    expect(byId["pmtiles"].bytes).toBe(2048);
    expect(byId["pyodide"].bytes).toBe(4096);
  });

  it("sets the dir field from OPFS_NS for each cache", async () => {
    const stats = await readStorageStats();

    for (const cache of stats.caches) {
      expect(cache.dir).toBe(OPFS_NS[cache.id]);
    }
  });

  it("includes label and description for each namespace", async () => {
    const stats = await readStorageStats();

    for (const cache of stats.caches) {
      expect(typeof cache.label).toBe("string");
      expect(cache.label.length).toBeGreaterThan(0);
      expect(typeof cache.description).toBe("string");
      expect(cache.description.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// readStorageStats — OPFS available, dirSize throws (catch branch)
// =============================================================================

describe("readStorageStats – dirSize throws (catch branch)", () => {
  it("sets bytes to 0 when dirSize throws for a namespace", async () => {
    mockDirSize.mockRejectedValue(new Error("OPFS error"));

    const stats = await readStorageStats();

    for (const cache of stats.caches) {
      expect(cache.bytes).toBe(0);
    }
  });

  it("still returns all 4 cache entries even when dirSize always throws", async () => {
    mockDirSize.mockRejectedValue(new Error("permission denied"));

    const stats = await readStorageStats();

    expect(stats.caches).toHaveLength(4);
  });

  it("falls back to 0 bytes for the erroring namespace but returns real bytes for others", async () => {
    let callCount = 0;
    mockDirSize.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        return Promise.reject(new Error("second namespace error"));
      }
      return Promise.resolve(9999);
    });

    const stats = await readStorageStats();

    // 3 succeeded (9999 each), 1 failed (0)
    const bytesValues = stats.caches.map((c) => c.bytes);
    expect(bytesValues.filter((b) => b === 9999)).toHaveLength(3);
    expect(bytesValues.filter((b) => b === 0)).toHaveLength(1);
  });
});

// =============================================================================
// clearCacheNamespace
// =============================================================================

describe("clearCacheNamespace – OPFS not available", () => {
  it("returns undefined without calling deleteDir", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    const result = await clearCacheNamespace("modelWeights");

    expect(result).toBeUndefined();
    expect(mockDeleteDir).not.toHaveBeenCalled();
  });

  it("does nothing for parquetCache when OPFS is unavailable", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    await clearCacheNamespace("parquetCache");

    expect(mockDeleteDir).not.toHaveBeenCalled();
  });

  it("does nothing for pmtiles when OPFS is unavailable", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    await clearCacheNamespace("pmtiles");

    expect(mockDeleteDir).not.toHaveBeenCalled();
  });

  it("does nothing for pyodide when OPFS is unavailable", async () => {
    mockIsOpfsAvailable.mockReturnValue(false);

    await clearCacheNamespace("pyodide");

    expect(mockDeleteDir).not.toHaveBeenCalled();
  });
});

describe("clearCacheNamespace – OPFS available", () => {
  it("calls deleteDir with the correct OPFS path for modelWeights", async () => {
    await clearCacheNamespace("modelWeights");

    expect(mockDeleteDir).toHaveBeenCalledWith(OPFS_NS.modelWeights);
    expect(mockDeleteDir).toHaveBeenCalledWith("models");
  });

  it("calls deleteDir with the correct OPFS path for parquetCache", async () => {
    await clearCacheNamespace("parquetCache");

    expect(mockDeleteDir).toHaveBeenCalledWith(OPFS_NS.parquetCache);
    expect(mockDeleteDir).toHaveBeenCalledWith("parquet-cache");
  });

  it("calls deleteDir with the correct OPFS path for pmtiles", async () => {
    await clearCacheNamespace("pmtiles");

    expect(mockDeleteDir).toHaveBeenCalledWith(OPFS_NS.pmtiles);
    expect(mockDeleteDir).toHaveBeenCalledWith("pmtiles");
  });

  it("calls deleteDir with the correct OPFS path for pyodide", async () => {
    await clearCacheNamespace("pyodide");

    expect(mockDeleteDir).toHaveBeenCalledWith(OPFS_NS.pyodide);
    expect(mockDeleteDir).toHaveBeenCalledWith("pyodide");
  });

  it("awaits deleteDir and resolves to undefined", async () => {
    mockDeleteDir.mockResolvedValue(undefined);

    const result = await clearCacheNamespace("modelWeights");

    expect(result).toBeUndefined();
  });

  it("propagates errors thrown by deleteDir", async () => {
    mockDeleteDir.mockRejectedValue(new Error("delete failed"));

    await expect(clearCacheNamespace("modelWeights")).rejects.toThrow("delete failed");
  });
});
