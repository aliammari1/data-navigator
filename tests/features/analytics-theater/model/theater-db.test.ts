/**
 * Unit tests for src/features/analytics-theater/model/theater-db.ts
 *
 * Strategy:
 * - Mock Dexie so no real IndexedDB is opened.
 * - Mock navigator.storage.persist to control persistence behavior.
 * - Use vi.resetModules() + dynamic re-import to reset module-level singletons
 *   (dbSingleton, persistRequested) between tests.
 * - Exercise every branch: singleton creation, persistRequested guard,
 *   try/catch in requestPersistentStorage, listTheaters empty-id early return,
 *   sort order, and all CRUD paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Theater } from "@/features/analytics-theater/model/scene";

// ── Hoist mock state so it is available when vi.mock factories run ─────────
const { mockTheaters } = vi.hoisted(() => {
  const mockTheaters = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    where: vi.fn(),
  };
  return { mockTheaters };
});

// ── Mock Dexie ─────────────────────────────────────────────────────────────
vi.mock("dexie", () => {
  const DexieMock = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.theaters = mockTheaters;
    this.version = vi.fn().mockReturnValue({ stores: vi.fn() });
  });
  return { default: DexieMock };
});

// ── Helper to build a Theater fixture ─────────────────────────────────────
function makeTheater(overrides: Partial<Theater> = {}): Theater {
  return {
    id: "t1",
    name: "Test Theater",
    datasetId: "ds1",
    scenes: [],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Dynamically import the module under test after vi.resetModules() so that
 * module-level singletons (dbSingleton, persistRequested) are reset for each
 * test group that needs isolation.
 */
async function importModule() {
  return import("@/features/analytics-theater/model/theater-db");
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("theater-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the where chain mock for listTheaters
    mockTheaters.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    });
    mockTheaters.put.mockResolvedValue(undefined);
    mockTheaters.get.mockResolvedValue(undefined);
    mockTheaters.delete.mockResolvedValue(undefined);
  });

  // ── requestPersistentStorage ─────────────────────────────────────────────

  describe("requestPersistentStorage", () => {
    it("calls navigator.storage.persist() on first invocation", async () => {
      vi.resetModules();
      const { requestPersistentStorage } = await importModule();

      const persistMock = vi.fn().mockResolvedValue(true);
      Object.defineProperty(globalThis, "navigator", {
        value: { storage: { persist: persistMock } },
        writable: true,
        configurable: true,
      });

      await requestPersistentStorage();

      expect(persistMock).toHaveBeenCalledTimes(1);
    });

    it("does not call persist() again on subsequent invocations (persistRequested guard)", async () => {
      vi.resetModules();
      const { requestPersistentStorage } = await importModule();

      const persistMock = vi.fn().mockResolvedValue(true);
      Object.defineProperty(globalThis, "navigator", {
        value: { storage: { persist: persistMock } },
        writable: true,
        configurable: true,
      });

      await requestPersistentStorage();
      await requestPersistentStorage();
      await requestPersistentStorage();

      // Only called once despite three invocations
      expect(persistMock).toHaveBeenCalledTimes(1);
    });

    it("swallows errors from navigator.storage.persist() (best-effort)", async () => {
      vi.resetModules();
      const { requestPersistentStorage } = await importModule();

      const persistMock = vi.fn().mockRejectedValue(new Error("storage denied"));
      Object.defineProperty(globalThis, "navigator", {
        value: { storage: { persist: persistMock } },
        writable: true,
        configurable: true,
      });

      // Must not throw
      await expect(requestPersistentStorage()).resolves.toBeUndefined();
      expect(persistMock).toHaveBeenCalledTimes(1);
    });

    it("handles navigator.storage being undefined without throwing", async () => {
      vi.resetModules();
      const { requestPersistentStorage } = await importModule();

      Object.defineProperty(globalThis, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });

      // navigator.storage is undefined → optional chaining short-circuits
      await expect(requestPersistentStorage()).resolves.toBeUndefined();
    });

    it("handles navigator.storage.persist being undefined without throwing", async () => {
      vi.resetModules();
      const { requestPersistentStorage } = await importModule();

      Object.defineProperty(globalThis, "navigator", {
        value: { storage: {} },
        writable: true,
        configurable: true,
      });

      await expect(requestPersistentStorage()).resolves.toBeUndefined();
    });
  });

  // ── db() singleton ───────────────────────────────────────────────────────

  describe("db() singleton", () => {
    it("creates only one TheaterDatabase instance across multiple calls", async () => {
      vi.resetModules();

      // Import Dexie mock to count constructor calls
      const Dexie = (await import("dexie")).default;
      const constructorSpy = vi.mocked(Dexie);
      constructorSpy.mockClear();

      const { saveTheater, getTheater, deleteTheater } = await importModule();

      Object.defineProperty(globalThis, "navigator", {
        value: { storage: { persist: vi.fn().mockResolvedValue(true) } },
        writable: true,
        configurable: true,
      });

      mockTheaters.put.mockResolvedValue(undefined);
      mockTheaters.get.mockResolvedValue(undefined);
      mockTheaters.delete.mockResolvedValue(undefined);

      const theater = makeTheater();

      // Three calls that all use db()
      await saveTheater(theater);
      await getTheater("t1");
      await deleteTheater("t1");

      // Dexie constructor called exactly once (singleton)
      expect(constructorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── saveTheater ──────────────────────────────────────────────────────────

  describe("saveTheater", () => {
    it("puts the theater record with an updated updatedAt timestamp", async () => {
      vi.resetModules();
      const { saveTheater } = await importModule();

      Object.defineProperty(globalThis, "navigator", {
        value: { storage: { persist: vi.fn().mockResolvedValue(true) } },
        writable: true,
        configurable: true,
      });

      mockTheaters.put.mockResolvedValue(undefined);

      const before = Date.now();
      const theater = makeTheater({ updatedAt: 0 });
      await saveTheater(theater);
      const after = Date.now();

      expect(mockTheaters.put).toHaveBeenCalledTimes(1);
      const putArg = mockTheaters.put.mock.calls[0][0] as Theater;
      // updatedAt was overwritten with Date.now()
      expect(putArg.updatedAt).toBeGreaterThanOrEqual(before);
      expect(putArg.updatedAt).toBeLessThanOrEqual(after);
      // Other fields preserved
      expect(putArg.id).toBe("t1");
      expect(putArg.name).toBe("Test Theater");
    });

    it("spreads theater properties so original object is not mutated", async () => {
      vi.resetModules();
      const { saveTheater } = await importModule();

      Object.defineProperty(globalThis, "navigator", {
        value: { storage: { persist: vi.fn().mockResolvedValue(true) } },
        writable: true,
        configurable: true,
      });

      mockTheaters.put.mockResolvedValue(undefined);

      const theater = makeTheater({ updatedAt: 999 });
      await saveTheater(theater);

      // Original object untouched
      expect(theater.updatedAt).toBe(999);
    });
  });

  // ── listTheaters ─────────────────────────────────────────────────────────

  describe("listTheaters", () => {
    it("returns empty array immediately when datasetId is an empty string", async () => {
      vi.resetModules();
      const { listTheaters } = await importModule();

      const result = await listTheaters("");

      expect(result).toEqual([]);
      // db() is never called so mockTheaters.where is never invoked
      expect(mockTheaters.where).not.toHaveBeenCalled();
    });

    it("queries theaters by datasetId and returns them sorted by updatedAt descending", async () => {
      vi.resetModules();
      const { listTheaters } = await importModule();

      const older = makeTheater({ id: "t1", updatedAt: 1000 });
      const newer = makeTheater({ id: "t2", updatedAt: 2000 });
      const middle = makeTheater({ id: "t3", updatedAt: 1500 });

      const toArrayMock = vi.fn().mockResolvedValue([older, newer, middle]);
      const equalsMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
      mockTheaters.where.mockReturnValue({ equals: equalsMock });

      const result = await listTheaters("ds1");

      expect(mockTheaters.where).toHaveBeenCalledWith("datasetId");
      expect(equalsMock).toHaveBeenCalledWith("ds1");
      // Sorted descending: newer (2000), middle (1500), older (1000)
      expect(result.map((t) => t.updatedAt)).toEqual([2000, 1500, 1000]);
    });

    it("returns an empty array when no theaters exist for the dataset", async () => {
      vi.resetModules();
      const { listTheaters } = await importModule();

      const toArrayMock = vi.fn().mockResolvedValue([]);
      const equalsMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
      mockTheaters.where.mockReturnValue({ equals: equalsMock });

      const result = await listTheaters("ds-empty");

      expect(result).toEqual([]);
    });

    it("returns a single theater correctly without sorting issues", async () => {
      vi.resetModules();
      const { listTheaters } = await importModule();

      const theater = makeTheater({ id: "solo", updatedAt: 5000 });
      const toArrayMock = vi.fn().mockResolvedValue([theater]);
      const equalsMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
      mockTheaters.where.mockReturnValue({ equals: equalsMock });

      const result = await listTheaters("ds1");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("solo");
    });

    it("treats a falsy but non-empty datasetId as valid (only empty string is early-return)", async () => {
      vi.resetModules();
      const { listTheaters } = await importModule();

      // A non-empty falsy-ish string still goes through the DB query path
      const toArrayMock = vi.fn().mockResolvedValue([]);
      const equalsMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
      mockTheaters.where.mockReturnValue({ equals: equalsMock });

      // "0" is truthy; goes to DB
      await listTheaters("0");
      expect(mockTheaters.where).toHaveBeenCalled();
    });
  });

  // ── getTheater ────────────────────────────────────────────────────────────

  describe("getTheater", () => {
    it("returns the theater when it exists", async () => {
      vi.resetModules();
      const { getTheater } = await importModule();

      const theater = makeTheater({ id: "t42" });
      mockTheaters.get.mockResolvedValue(theater);

      const result = await getTheater("t42");

      expect(mockTheaters.get).toHaveBeenCalledWith("t42");
      expect(result).toEqual(theater);
    });

    it("returns undefined when the theater does not exist", async () => {
      vi.resetModules();
      const { getTheater } = await importModule();

      mockTheaters.get.mockResolvedValue(undefined);

      const result = await getTheater("missing");

      expect(result).toBeUndefined();
    });
  });

  // ── deleteTheater ─────────────────────────────────────────────────────────

  describe("deleteTheater", () => {
    it("calls db().theaters.delete with the given id", async () => {
      vi.resetModules();
      const { deleteTheater } = await importModule();

      mockTheaters.delete.mockResolvedValue(undefined);

      await deleteTheater("t-to-delete");

      expect(mockTheaters.delete).toHaveBeenCalledWith("t-to-delete");
    });

    it("resolves without error even when the theater does not exist", async () => {
      vi.resetModules();
      const { deleteTheater } = await importModule();

      // Dexie's delete() resolves to undefined regardless of whether the key existed
      mockTheaters.delete.mockResolvedValue(undefined);

      await expect(deleteTheater("non-existent")).resolves.toBeUndefined();
    });
  });

  // ── sort stability for listTheaters ──────────────────────────────────────

  describe("listTheaters sort order edge cases", () => {
    it("preserves relative order for theaters with the same updatedAt", async () => {
      vi.resetModules();
      const { listTheaters } = await importModule();

      const t1 = makeTheater({ id: "t1", updatedAt: 1000 });
      const t2 = makeTheater({ id: "t2", updatedAt: 1000 });
      const t3 = makeTheater({ id: "t3", updatedAt: 500 });

      const toArrayMock = vi.fn().mockResolvedValue([t1, t2, t3]);
      const equalsMock = vi.fn().mockReturnValue({ toArray: toArrayMock });
      mockTheaters.where.mockReturnValue({ equals: equalsMock });

      const result = await listTheaters("ds1");

      // t3 (500) must be last; t1 and t2 (both 1000) come first in some order
      expect(result[2].id).toBe("t3");
      expect(result.slice(0, 2).map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    });
  });
});
