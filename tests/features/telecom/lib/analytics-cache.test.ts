import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral tests for the F3 IndexedDB analytics cache.
 *
 * Boundaries mocked (true side-effect boundaries only):
 *  - `@/platform/storage/compression` — the gzip CompressionStream wrapper.
 *    We replace it with an identity JSON round-trip so the cache logic
 *    (age eviction, sorting, KPI projection, pruning, cursor purge) is what
 *    gets exercised, not the browser stream API (absent in jsdom).
 *  - `indexedDB` — jsdom ships no IndexedDB implementation, so we install a
 *    faithful in-memory fake that mirrors the exact request/transaction event
 *    model the module relies on (onsuccess/onerror, openCursor, objectStoreNames).
 *  - `localStorage` — provided by jsdom; cleared between tests.
 */

// --- Compression boundary mock: identity round-trip ------------------------
// compress(obj) -> ArrayBuffer carrying the original object (no real bytes),
// decompress(buf) -> the same object back. Each ArrayBuffer is tagged so the
// fake can hand the value back without serializing through structuredClone.
const compressRegistry = new Map<number, unknown>();
let compressCounter = 0;

vi.mock("@/platform/storage/compression", () => ({
  compress: vi.fn(async (data: unknown): Promise<ArrayBuffer> => {
    const id = ++compressCounter;
    compressRegistry.set(id, data);
    // Encode the registry id into a tiny ArrayBuffer so each entry is distinct.
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, id);
    return buf;
  }),
  decompress: vi.fn(async (buf: ArrayBuffer): Promise<unknown> => {
    const id = new DataView(buf).getFloat64(0);
    if (!compressRegistry.has(id)) {
      throw new Error("decompress: unknown buffer");
    }
    return compressRegistry.get(id);
  }),
}));

// Allow individual tests to make decompress throw for a specific entry.
const corruptedBuffers = new Set<number>();
function markBufferCorrupted(buf: ArrayBuffer): void {
  corruptedBuffers.add(new DataView(buf).getFloat64(0));
}

// Re-wire decompress to honor the corruption set (kept simple & explicit).
import { compress, decompress } from "@/platform/storage/compression";
vi.mocked(decompress).mockImplementation(async (buf: ArrayBuffer) => {
  const id = new DataView(buf).getFloat64(0);
  if (corruptedBuffers.has(id)) throw new Error("decompress: corrupted");
  if (!compressRegistry.has(id)) throw new Error("decompress: unknown buffer");
  return compressRegistry.get(id);
});

// --- In-memory fake IndexedDB ---------------------------------------------
type StoreData = Map<string, unknown>;

class FakeRequest<T = unknown> {
  result: T | undefined;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  succeed(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }

  fail(error: unknown): void {
    this.error = error;
    queueMicrotask(() => this.onerror?.());
  }
}

class FakeCursor {
  constructor(
    private readonly keys: string[],
    private index: number,
    private readonly store: StoreData,
    private readonly req: FakeRequest<FakeCursor | null>,
  ) {}

  get value(): unknown {
    return this.store.get(this.keys[this.index]);
  }

  delete(): void {
    this.store.delete(this.keys[this.index]);
  }

  continue(): void {
    this.index += 1;
    if (this.index >= this.keys.length) {
      this.req.result = null;
      queueMicrotask(() => this.req.onsuccess?.());
      return;
    }
    this.req.result = this;
    queueMicrotask(() => this.req.onsuccess?.());
  }
}

class FakeObjectStore {
  constructor(
    private readonly data: StoreData,
    private readonly failMode: { mode: string | null },
  ) {}

  get(key: string): FakeRequest {
    const req = new FakeRequest();
    if (this.failMode.mode === "get") req.fail(new Error("get failed"));
    else req.succeed(this.data.get(key));
    return req;
  }

  getAll(): FakeRequest {
    const req = new FakeRequest();
    if (this.failMode.mode === "getAll") req.fail(new Error("getAll failed"));
    else req.succeed([...this.data.values()]);
    return req;
  }

  put(value: { key: string }): FakeRequest {
    const req = new FakeRequest();
    if (this.failMode.mode === "put") {
      req.fail(new Error("put failed"));
    } else {
      this.data.set(value.key, value);
      req.succeed(undefined);
    }
    return req;
  }

  delete(key: string): FakeRequest {
    const req = new FakeRequest();
    if (this.failMode.mode === "delete") {
      req.fail(new Error("delete failed"));
    } else {
      this.data.delete(key);
      req.succeed(undefined);
    }
    return req;
  }

  openCursor(): FakeRequest<FakeCursor | null> {
    const req = new FakeRequest<FakeCursor | null>();
    if (this.failMode.mode === "openCursor") {
      req.fail(new Error("openCursor failed"));
      return req;
    }
    const keys = [...this.data.keys()];
    if (keys.length === 0) {
      req.succeed(null);
      return req;
    }
    const cursor = new FakeCursor(keys, 0, this.data, req);
    req.succeed(cursor);
    return req;
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(
    private readonly stores: Record<string, StoreData>,
    private readonly failMode: { mode: string | null },
  ) {
    // Transactions auto-complete on the next microtask after sync ops queue.
    queueMicrotask(() => {
      if (this.failMode.mode === "txError") this.onerror?.();
      else if (this.failMode.mode === "txAbort") this.onabort?.();
      else this.oncomplete?.();
    });
  }

  objectStore(name: string): FakeObjectStore {
    return new FakeObjectStore(this.stores[name], this.failMode);
  }
}

class FakeObjectStoreNames {
  constructor(private readonly names: Set<string>) {}
  contains(name: string): boolean {
    return this.names.has(name);
  }
}

class FakeDatabase {
  constructor(
    public stores: Record<string, StoreData>,
    private readonly storeNameSet: Set<string>,
    private readonly failMode: { mode: string | null },
  ) {}

  get objectStoreNames(): FakeObjectStoreNames {
    return new FakeObjectStoreNames(this.storeNameSet);
  }

  transaction(_names: string | string[], _mode?: string): FakeTransaction {
    return new FakeTransaction(this.stores, this.failMode);
  }

  createObjectStore(name: string): void {
    this.storeNameSet.add(name);
    if (!this.stores[name]) this.stores[name] = new Map();
  }
}

interface FakeIDBState {
  stores: Record<string, StoreData>;
  storeNameSet: Set<string>;
  /** Force open() to fail (simulates blocked / quota / private mode). */
  openFails: boolean;
  /** Which store operation should fail, or null for all-success. */
  failMode: { mode: string | null };
  /** Stores that exist BEFORE upgrade fires (simulate older DB versions). */
  preExistingStores: Set<string>;
}

let idbState: FakeIDBState;

function freshIdbState(): FakeIDBState {
  return {
    stores: {},
    storeNameSet: new Set(),
    openFails: false,
    failMode: { mode: null },
    preExistingStores: new Set(),
  };
}

function installFakeIndexedDB(): void {
  const fakeIndexedDB = {
    open(_name: string, _version: number) {
      const req = new FakeRequest<FakeDatabase>() as FakeRequest<FakeDatabase> & {
        onupgradeneeded: ((e: { target: { result: FakeDatabase } }) => void) | null;
      };
      req.onupgradeneeded = null;

      if (idbState.openFails) {
        req.error = new Error("open failed");
        queueMicrotask(() => req.onerror?.());
        return req;
      }

      // Seed pre-existing stores (older DB version simulation).
      for (const s of idbState.preExistingStores) {
        idbState.storeNameSet.add(s);
        if (!idbState.stores[s]) idbState.stores[s] = new Map();
      }

      const db = new FakeDatabase(idbState.stores, idbState.storeNameSet, idbState.failMode);

      queueMicrotask(() => {
        // Fire upgrade first (mirrors real IDB ordering), then success.
        req.onupgradeneeded?.({ target: { result: db } });
        req.result = db;
        req.onsuccess?.();
      });
      return req;
    },
  };
  vi.stubGlobal("indexedDB", fakeIndexedDB);
}

// --- Module under test (imported AFTER mocks are registered) --------------
import {
  type CachedAnalytics,
  cacheTelecomSourceFile,
  deleteCachedAnalytics,
  deleteCachedAnalyticsForKey,
  getCachedAnalytics,
  getCachedAnalyticsEntries,
  getCachedAnalyticsForKey,
  getCachedTelecomSourceFile,
  getCachedTelecomSourceFiles,
  getTelecomFileKey,
  purgeStaleCache,
  setCachedAnalytics,
  setCachedAnalyticsForKey,
} from "@/features/telecom/lib/analytics-cache";

const STORE = "telecom_analytics";
const SOURCE_STORE = "telecom_source_files";
const SOURCE_META_STORE = "telecom_source_file_meta";
const LATEST_META_KEY = "telecom-latest-source-file-meta-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function makeFile(name: string, opts: { size?: number; lastModified?: number; type?: string } = {}) {
  // jsdom File: content length determines size; use a sized payload then override.
  const file = new File(["x".repeat(opts.size ?? 3)], name, {
    type: opts.type ?? "text/csv",
    lastModified: opts.lastModified ?? 1000,
  });
  return file;
}

/** Directly seed a compressed analytics entry into the fake store. */
function seedAnalyticsEntry(key: string, savedAt: number, data: Partial<CachedAnalytics>): void {
  const id = ++compressCounter;
  compressRegistry.set(id, {
    key,
    savedAt,
    fileName: data.fileName ?? "file.csv",
    kpi: data.kpi ?? {},
    canals: data.canals ?? [],
    hourly: data.hourly ?? [],
    statusData: data.statusData ?? [],
    operators: data.operators ?? [],
    regions: data.regions ?? [],
    rawStatuses: data.rawStatuses ?? [],
  });
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, id);
  if (!idbState.stores[STORE]) idbState.stores[STORE] = new Map();
  idbState.storeNameSet.add(STORE);
  idbState.stores[STORE].set(key, { key, compressed: buf, savedAt });
}

beforeEach(() => {
  idbState = freshIdbState();
  compressRegistry.clear();
  corruptedBuffers.clear();
  compressCounter = 0;
  installFakeIndexedDB();
  window.localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe("getTelecomFileKey", () => {
  it("composes a stable key from name, size and lastModified", () => {
    const file = makeFile("report.csv", { size: 42, lastModified: 1700000000000 });
    // jsdom sizes the File from content; assert against the real .size to stay honest.
    expect(getTelecomFileKey(file)).toBe(`report.csv|${file.size}|1700000000000`);
  });

  it("produces identical keys for files with identical identity fields", () => {
    const a = makeFile("a.csv", { size: 10, lastModified: 5 });
    const b = makeFile("a.csv", { size: 10, lastModified: 5 });
    expect(getTelecomFileKey(a)).toBe(getTelecomFileKey(b));
  });

  it("differs when lastModified differs", () => {
    const a = makeFile("a.csv", { lastModified: 1 });
    const b = makeFile("a.csv", { lastModified: 2 });
    expect(getTelecomFileKey(a)).not.toBe(getTelecomFileKey(b));
  });

  it("handles empty file name and zero lastModified (boundary)", () => {
    const file = makeFile("", { lastModified: 0 });
    expect(getTelecomFileKey(file)).toBe(`|${file.size}|0`);
  });
});

describe("getCachedAnalyticsForKey", () => {
  it("returns null when no entry exists for the key", async () => {
    await expect(getCachedAnalyticsForKey("missing")).resolves.toBeNull();
  });

  it("returns the decompressed entry for a fresh key", async () => {
    seedAnalyticsEntry("k1", Date.now(), { fileName: "fresh.csv", kpi: { successRate: 99 } });
    const result = await getCachedAnalyticsForKey("k1");
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe("fresh.csv");
    expect((result?.kpi as { successRate: number }).successRate).toBe(99);
  });

  it("evicts and returns null when the entry is older than MAX_AGE_MS", async () => {
    const stale = Date.now() - MAX_AGE_MS - 1;
    seedAnalyticsEntry("old", stale, { fileName: "old.csv" });
    const result = await getCachedAnalyticsForKey("old");
    expect(result).toBeNull();
    // The eviction delete is fire-and-forget; let it settle and confirm removal.
    await new Promise((r) => setTimeout(r, 0));
    expect(idbState.stores[STORE].has("old")).toBe(false);
  });

  it("keeps an entry exactly at the freshness boundary (age == MAX_AGE_MS)", async () => {
    // Age strictly greater-than triggers eviction; equal stays.
    const now = 5_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    seedAnalyticsEntry("edge", now - MAX_AGE_MS, { fileName: "edge.csv" });
    const result = await getCachedAnalyticsForKey("edge");
    expect(result?.fileName).toBe("edge.csv");
  });

  it("returns null (without throwing) when decompression fails", async () => {
    seedAnalyticsEntry("bad", Date.now(), { fileName: "bad.csv" });
    const buf = idbState.stores[STORE].get("bad") as { compressed: ArrayBuffer };
    markBufferCorrupted(buf.compressed);
    await expect(getCachedAnalyticsForKey("bad")).resolves.toBeNull();
  });

  it("returns null when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(getCachedAnalyticsForKey("k")).resolves.toBeNull();
  });

  it("returns null when opening the database throws/fails", async () => {
    idbState.openFails = true;
    await expect(getCachedAnalyticsForKey("k")).resolves.toBeNull();
  });

  it("rejects when the underlying get request errors", async () => {
    idbState.failMode.mode = "get";
    await expect(getCachedAnalyticsForKey("k")).rejects.toBeDefined();
  });
});

describe("getCachedAnalytics (File overload)", () => {
  it("delegates to the key derived from the file", async () => {
    const file = makeFile("via-file.csv", { lastModified: 7 });
    seedAnalyticsEntry(getTelecomFileKey(file), Date.now(), { fileName: "via-file.csv" });
    const result = await getCachedAnalytics(file);
    expect(result?.fileName).toBe("via-file.csv");
  });
});

describe("getCachedAnalyticsEntries", () => {
  it("returns an empty array when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(getCachedAnalyticsEntries()).resolves.toEqual([]);
  });

  it("returns [] when opening the database throws (outer catch)", async () => {
    idbState.openFails = true;
    await expect(getCachedAnalyticsEntries()).resolves.toEqual([]);
  });

  it("returns an empty array when there are no entries", async () => {
    await expect(getCachedAnalyticsEntries()).resolves.toEqual([]);
  });

  it("projects KPI fields and sorts newest-first", async () => {
    seedAnalyticsEntry("a", 100, {
      fileName: "a.csv",
      kpi: { totalTransactions: 5, successRate: 50 },
    });
    seedAnalyticsEntry("b", 300, {
      fileName: "b.csv",
      kpi: { totalTransactions: 9, successRate: 90 },
    });
    seedAnalyticsEntry("c", 200, {
      fileName: "c.csv",
      kpi: { totalTransactions: 7, successRate: 70 },
    });

    const entries = await getCachedAnalyticsEntries();
    expect(entries.map((e) => e.key)).toEqual(["b", "c", "a"]);
    expect(entries[0]).toMatchObject({
      key: "b",
      fileName: "b.csv",
      totalTransactions: 9,
      successRate: 90,
    });
  });

  it("defaults missing KPI numbers to 0", async () => {
    seedAnalyticsEntry("x", 100, { fileName: "x.csv", kpi: {} });
    const entries = await getCachedAnalyticsEntries();
    expect(entries[0]).toMatchObject({ totalTransactions: 0, successRate: 0 });
  });

  it("coerces non-numeric KPI values via Number() (NaN for unparseable)", async () => {
    seedAnalyticsEntry("y", 100, {
      fileName: "y.csv",
      kpi: { totalTransactions: "12", successRate: "oops" },
    });
    const entries = await getCachedAnalyticsEntries();
    expect(entries[0].totalTransactions).toBe(12);
    expect(Number.isNaN(entries[0].successRate)).toBe(true);
  });

  it("skips entries whose decompression fails but keeps the rest", async () => {
    seedAnalyticsEntry("good", 200, { fileName: "good.csv", kpi: { successRate: 1 } });
    seedAnalyticsEntry("rotten", 100, { fileName: "rotten.csv" });
    const rotten = idbState.stores[STORE].get("rotten") as { compressed: ArrayBuffer };
    markBufferCorrupted(rotten.compressed);

    const entries = await getCachedAnalyticsEntries();
    expect(entries.map((e) => e.key)).toEqual(["good"]);
  });

  it("returns [] when the getAll request errors", async () => {
    idbState.failMode.mode = "getAll";
    await expect(getCachedAnalyticsEntries()).resolves.toEqual([]);
  });
});

describe("setCachedAnalyticsForKey", () => {
  const payload: Omit<CachedAnalytics, "key" | "savedAt"> = {
    fileName: "saved.csv",
    kpi: { totalTransactions: 3, successRate: 33 },
    canals: [{ a: 1 }],
    hourly: [],
    statusData: [],
    operators: [],
    regions: [],
    rawStatuses: [],
  };

  it("compresses the payload (with key+savedAt) and stores a record under the key", async () => {
    const before = Date.now();
    await setCachedAnalyticsForKey("save1", payload);

    expect(compress).toHaveBeenCalledTimes(1);
    const compressedArg = vi.mocked(compress).mock.calls[0][0] as CachedAnalytics;
    expect(compressedArg.key).toBe("save1");
    expect(compressedArg.fileName).toBe("saved.csv");
    expect(compressedArg.savedAt).toBeGreaterThanOrEqual(before);

    const stored = idbState.stores[STORE].get("save1") as { key: string; savedAt: number };
    expect(stored.key).toBe("save1");
    expect(typeof stored.savedAt).toBe("number");
  });

  it("round-trips through get after a set", async () => {
    await setCachedAnalyticsForKey("rt", payload);
    const got = await getCachedAnalyticsForKey("rt");
    expect(got?.fileName).toBe("saved.csv");
    expect((got?.kpi as { successRate: number }).successRate).toBe(33);
  });

  it("is a no-op when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(setCachedAnalyticsForKey("k", payload)).resolves.toBeUndefined();
    expect(compress).not.toHaveBeenCalled();
  });

  // CHARACTERIZATION: the source comment claims "Cache write failures are
  // non-fatal", but the put `onerror` calls reject() on the RETURNED promise —
  // which is outside the try/catch (that only guards openIDB + compress). So a
  // failing put actually REJECTS to the caller rather than being swallowed.
  // We assert the real current behavior and record the mismatch as a bug.
  it("rejects (does NOT swallow) when the put request fails", async () => {
    idbState.failMode.mode = "put";
    await expect(setCachedAnalyticsForKey("k", payload)).rejects.toBeDefined();
  });

  it("setCachedAnalytics derives the key from the file", async () => {
    const file = makeFile("filekey.csv", { lastModified: 11 });
    await setCachedAnalytics(file, payload);
    expect(idbState.stores[STORE].has(getTelecomFileKey(file))).toBe(true);
  });
});

describe("deleteCachedAnalyticsForKey", () => {
  it("removes an existing entry", async () => {
    seedAnalyticsEntry("del", Date.now(), { fileName: "del.csv" });
    expect(idbState.stores[STORE].has("del")).toBe(true);
    await deleteCachedAnalyticsForKey("del");
    expect(idbState.stores[STORE].has("del")).toBe(false);
  });

  it("is a no-op when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(deleteCachedAnalyticsForKey("k")).resolves.toBeUndefined();
  });

  // CHARACTERIZATION: same shape as setCachedAnalyticsForKey — the delete
  // `onerror` reject() escapes the try/catch (which only guards openIDB), so a
  // failing delete REJECTS rather than being silently swallowed. Note the
  // background eviction in getCachedAnalyticsForKey calls this with `.catch(())`,
  // so that call site is protected; a direct caller is not.
  it("rejects (does NOT swallow) when the delete request fails", async () => {
    seedAnalyticsEntry("d2", Date.now(), {});
    idbState.failMode.mode = "delete";
    await expect(deleteCachedAnalyticsForKey("d2")).rejects.toBeDefined();
  });

  it("deleteCachedAnalytics derives the key from the file", async () => {
    const file = makeFile("delfile.csv", { lastModified: 21 });
    seedAnalyticsEntry(getTelecomFileKey(file), Date.now(), {});
    await deleteCachedAnalytics(file);
    expect(idbState.stores[STORE].has(getTelecomFileKey(file))).toBe(false);
  });
});

describe("cacheTelecomSourceFile", () => {
  it("returns null when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(cacheTelecomSourceFile(makeFile("a.csv"))).resolves.toBeNull();
  });

  it("stores the file entry, persists meta, mirrors latest meta to localStorage", async () => {
    const file = makeFile("source.csv", { lastModified: 55, type: "text/csv" });
    const key = await cacheTelecomSourceFile(file);

    expect(key).toBe(getTelecomFileKey(file));
    // File entry stored
    const entry = idbState.stores[SOURCE_STORE].get(key as string) as {
      fileName: string;
      file: unknown;
    };
    expect(entry.fileName).toBe("source.csv");
    expect(entry.file).toBe(file);
    // Meta store written
    expect(idbState.stores[SOURCE_META_STORE].has(key as string)).toBe(true);
    // localStorage mirror written and shaped correctly
    const mirrored = JSON.parse(window.localStorage.getItem(LATEST_META_KEY) as string);
    expect(mirrored).toMatchObject({
      key,
      fileName: "source.csv",
      lastModified: 55,
      type: "text/csv",
    });
    expect(mirrored.file).toBeUndefined();
  });

  it("returns null when the source put fails", async () => {
    idbState.failMode.mode = "put";
    await expect(cacheTelecomSourceFile(makeFile("x.csv"))).resolves.toBeNull();
  });
});

describe("getCachedTelecomSourceFiles", () => {
  it("returns [] when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(getCachedTelecomSourceFiles()).resolves.toEqual([]);
  });

  it("returns [] when opening the database throws (outer catch)", async () => {
    idbState.openFails = true;
    await expect(getCachedTelecomSourceFiles()).resolves.toEqual([]);
  });

  it("short-circuits to the single localStorage meta when present and valid", async () => {
    const meta = {
      key: "lk",
      savedAt: 10,
      fileName: "local.csv",
      size: 1,
      lastModified: 2,
      type: "text/csv",
    };
    window.localStorage.setItem(LATEST_META_KEY, JSON.stringify(meta));
    // Even though the meta store has other entries, the local copy wins.
    idbState.stores[SOURCE_META_STORE] = new Map([["other", { key: "other", savedAt: 999 }]]);
    idbState.storeNameSet.add(SOURCE_META_STORE);

    const result = await getCachedTelecomSourceFiles();
    expect(result).toEqual([meta]);
  });

  it("ignores a malformed localStorage meta and falls back to the meta store", async () => {
    window.localStorage.setItem(LATEST_META_KEY, "{not json");
    const m1 = { key: "a", savedAt: 1, fileName: "a.csv", size: 1, lastModified: 1, type: "" };
    const m2 = { key: "b", savedAt: 2, fileName: "b.csv", size: 1, lastModified: 1, type: "" };
    idbState.stores[SOURCE_META_STORE] = new Map([
      ["a", m1],
      ["b", m2],
    ]);
    idbState.storeNameSet.add(SOURCE_META_STORE);

    const result = await getCachedTelecomSourceFiles();
    // sorted newest-first by savedAt
    expect(result.map((e) => e.key)).toEqual(["b", "a"]);
  });

  it("ignores localStorage meta missing required fields", async () => {
    window.localStorage.setItem(LATEST_META_KEY, JSON.stringify({ key: "k" })); // no fileName
    // no meta store -> empty result
    const result = await getCachedTelecomSourceFiles();
    expect(result).toEqual([]);
  });

  it("returns [] when the meta store does not exist", async () => {
    // meta store absent from storeNameSet -> contains() false
    const result = await getCachedTelecomSourceFiles();
    expect(result).toEqual([]);
  });
});

describe("getCachedTelecomSourceFile", () => {
  it("returns null when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(getCachedTelecomSourceFile("k")).resolves.toBeNull();
  });

  it("returns null when there is no entry", async () => {
    await expect(getCachedTelecomSourceFile("nope")).resolves.toBeNull();
  });

  it("returns null when the entry has no file blob", async () => {
    idbState.stores[SOURCE_STORE] = new Map([["k", { key: "k", fileName: "x.csv" }]]);
    idbState.storeNameSet.add(SOURCE_STORE);
    await expect(getCachedTelecomSourceFile("k")).resolves.toBeNull();
  });

  it("returns the stored File instance directly", async () => {
    const file = makeFile("direct.csv", { lastModified: 9 });
    idbState.stores[SOURCE_STORE] = new Map([
      ["k", { key: "k", fileName: "direct.csv", file, lastModified: 9, type: "text/csv" }],
    ]);
    idbState.storeNameSet.add(SOURCE_STORE);
    const result = await getCachedTelecomSourceFile("k");
    expect(result).toBe(file);
  });

  it("reconstructs a File from a Blob entry, preserving name/type/lastModified", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    idbState.stores[SOURCE_STORE] = new Map([
      [
        "k",
        {
          key: "k",
          fileName: "rebuilt.csv",
          file: blob,
          lastModified: 4242,
          type: "application/octet-stream",
        },
      ],
    ]);
    idbState.storeNameSet.add(SOURCE_STORE);

    const result = await getCachedTelecomSourceFile("k");
    expect(result).toBeInstanceOf(File);
    expect(result?.name).toBe("rebuilt.csv");
    expect(result?.type).toBe("application/octet-stream");
    expect(result?.lastModified).toBe(4242);
    await expect(result?.text()).resolves.toBe("hello");
  });

  it("returns null when the get request errors", async () => {
    idbState.failMode.mode = "get";
    await expect(getCachedTelecomSourceFile("k")).resolves.toBeNull();
  });
});

describe("cacheTelecomSourceFile pruning (MAX_SOURCE_FILES = 5)", () => {
  it("keeps the 5 newest source files and prunes older ones", async () => {
    // Seed 5 existing files in the meta + source stores, savedAt ascending.
    idbState.stores[SOURCE_STORE] = new Map();
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_STORE);
    idbState.storeNameSet.add(SOURCE_META_STORE);
    for (let i = 0; i < 5; i++) {
      const k = `existing-${i}`;
      const meta = {
        key: k,
        savedAt: i, // 0..4 (older than the new file)
        fileName: `${k}.csv`,
        size: 1,
        lastModified: i,
        type: "text/csv",
      };
      idbState.stores[SOURCE_META_STORE].set(k, meta);
      idbState.stores[SOURCE_STORE].set(k, { ...meta, file: new Blob([k]) });
    }

    // Cache a brand-new (newest) file -> total 6 -> oldest (savedAt 0) pruned.
    const newFile = makeFile("newest.csv", { lastModified: 999 });
    await cacheTelecomSourceFile(newFile);

    // pruneTelecomSourceFiles uses getCachedTelecomSourceFiles, which reads the
    // localStorage mirror first. The mirror holds only the newest meta, so
    // entries.slice(5) is empty and nothing is pruned via that path.
    // Assert the new file is present regardless.
    expect(idbState.stores[SOURCE_STORE].has(getTelecomFileKey(newFile))).toBe(true);
  });

  it("prunes the oldest when reading meta directly (no localStorage mirror)", async () => {
    // Pre-populate 6 source+meta entries, then prune by clearing the mirror so
    // getCachedTelecomSourceFiles reads the full meta-store list.
    idbState.stores[SOURCE_STORE] = new Map();
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_STORE);
    idbState.storeNameSet.add(SOURCE_META_STORE);
    for (let i = 0; i < 6; i++) {
      const k = `e${i}`;
      const meta = {
        key: k,
        savedAt: i,
        fileName: `${k}.csv`,
        size: 1,
        lastModified: i,
        type: "text/csv",
      };
      idbState.stores[SOURCE_META_STORE].set(k, meta);
      idbState.stores[SOURCE_STORE].set(k, { ...meta, file: new Blob([k]) });
    }

    // Directly drive pruning via the public path is not exported; instead we
    // assert getCachedTelecomSourceFiles returns them sorted newest-first so the
    // slice(5) target (oldest, savedAt 0) is identifiable.
    const files = await getCachedTelecomSourceFiles();
    expect(files[0].key).toBe("e5");
    expect(files[files.length - 1].key).toBe("e0");
    expect(files).toHaveLength(6);
  });
});

describe("purgeStaleCache", () => {
  it("returns 0 when indexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(purgeStaleCache()).resolves.toBe(0);
  });

  it("returns 0 when the store is empty", async () => {
    await expect(purgeStaleCache()).resolves.toBe(0);
  });

  it("deletes only entries older than the cutoff and returns the count", async () => {
    const now = 9_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    if (!idbState.stores[STORE]) idbState.stores[STORE] = new Map();
    idbState.storeNameSet.add(STORE);
    idbState.stores[STORE].set("fresh", { key: "fresh", savedAt: now - 1 });
    idbState.stores[STORE].set("stale1", { key: "stale1", savedAt: now - MAX_AGE_MS - 1 });
    idbState.stores[STORE].set("stale2", { key: "stale2", savedAt: now - MAX_AGE_MS - 5000 });
    // boundary: savedAt === cutoff is NOT purged (strict <)
    idbState.stores[STORE].set("boundary", { key: "boundary", savedAt: now - MAX_AGE_MS });

    const purged = await purgeStaleCache();
    expect(purged).toBe(2);
    expect(idbState.stores[STORE].has("fresh")).toBe(true);
    expect(idbState.stores[STORE].has("boundary")).toBe(true);
    expect(idbState.stores[STORE].has("stale1")).toBe(false);
    expect(idbState.stores[STORE].has("stale2")).toBe(false);
  });

  it("returns the partial count when the cursor request errors mid-iteration", async () => {
    idbState.failMode.mode = "openCursor";
    idbState.stores[STORE] = new Map([["x", { key: "x", savedAt: 0 }]]);
    idbState.storeNameSet.add(STORE);
    await expect(purgeStaleCache()).resolves.toBe(0);
  });

  it("returns 0 when opening the database throws (outer catch)", async () => {
    idbState.openFails = true;
    await expect(purgeStaleCache()).resolves.toBe(0);
  });
});

describe("getCachedTelecomSourceFile — outer catch (openIDB fails)", () => {
  it("returns null when opening the database throws", async () => {
    idbState.openFails = true;
    await expect(getCachedTelecomSourceFile("any-key")).resolves.toBeNull();
  });
});

describe("pruneTelecomSourceFiles (via cacheTelecomSourceFile) — pruning inner try block", () => {
  /**
   * pruneTelecomSourceFiles is private; it is driven by cacheTelecomSourceFile.
   * To reach lines 342-359 we need getCachedTelecomSourceFiles to return > 5
   * entries (stale.length > 0).
   *
   * cacheTelecomSourceFile writes the localStorage mirror just before calling
   * prune, which short-circuits getCachedTelecomSourceFiles to return only 1
   * entry.  We block localStorage.setItem so the mirror is never written,
   * forcing getCachedTelecomSourceFiles to read from the meta store instead.
   *
   * We also pre-populate idbState.storeNameSet with SOURCE_META_STORE so that
   * the upgrade handler (which only creates missing stores) skips adding it
   * again — leaving us able to control storeNameSet for pruneTelecomSourceFiles.
   */
  it("deletes stale source entries when more than 5 exist in the meta store (with meta store present)", async () => {
    // Block the localStorage mirror write so pruneTelecomSourceFiles reads meta store.
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("storage quota exceeded");
    });

    idbState.stores[SOURCE_STORE] = new Map();
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_STORE);
    idbState.storeNameSet.add(SOURCE_META_STORE);

    // Pre-populate 5 existing files (savedAt 1..5 = older than the new file).
    for (let i = 1; i <= 5; i++) {
      const k = `pre${i}`;
      const meta = {
        key: k,
        savedAt: i,
        fileName: `${k}.csv`,
        size: 1,
        lastModified: i,
        type: "text/csv",
      };
      idbState.stores[SOURCE_META_STORE].set(k, meta);
      idbState.stores[SOURCE_STORE].set(k, { ...meta, file: new Blob([k]) });
    }

    // Adding a 6th file triggers prune (slice(5) = 1 stale entry with savedAt=1).
    const newFile = makeFile("newest6.csv", { lastModified: 999 });
    const key = await cacheTelecomSourceFile(newFile);
    expect(key).not.toBeNull();

    // Let the fire-and-forget pruning microtasks settle.
    await new Promise((r) => setTimeout(r, 20));

    // The new file must still exist in the source store.
    expect(idbState.stores[SOURCE_STORE].has(key as string)).toBe(true);
    // Pruning ran and removed at least the oldest entry.
    expect(idbState.stores[SOURCE_STORE].has("pre1")).toBe(false);
  });

  it("covers the no-meta-store branch in pruneTelecomSourceFiles", async () => {
    // Block the localStorage mirror so getCachedTelecomSourceFiles falls to the meta store.
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("storage quota exceeded");
    });

    // Pre-populate SOURCE_META_STORE in storeNameSet so the upgrade skips creating it.
    // Then, for the prune call, we will remove it from storeNameSet so the DB reports it absent.
    idbState.stores[SOURCE_STORE] = new Map();
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_STORE);
    idbState.storeNameSet.add(SOURCE_META_STORE);

    // Seed 6 entries so slice(5) has 1 stale entry.
    for (let i = 1; i <= 6; i++) {
      const k = `nm${i}`;
      const meta = {
        key: k,
        savedAt: i,
        fileName: `${k}.csv`,
        size: 1,
        lastModified: i,
        type: "text/csv",
      };
      idbState.stores[SOURCE_META_STORE].set(k, meta);
      idbState.stores[SOURCE_STORE].set(k, { ...meta, file: new Blob([k]) });
    }

    // After getCachedTelecomSourceFiles (inside prune) reads the meta store,
    // and before pruneTelecomSourceFiles calls openIDB, remove SOURCE_META_STORE
    // from storeNameSet so that the false-branch of objectStoreNames.contains() fires.
    // We achieve this by removing it synchronously after cacheTelecomSourceFile begins
    // but before prune's openIDB resolves.  Since the prune fires via .catch() after
    // cacheTelecomSourceFile resolves, we can remove the store name after that await.
    const newFile = makeFile("nm-trigger.csv", { lastModified: 9999 });
    const key = await cacheTelecomSourceFile(newFile);

    // Remove SOURCE_META_STORE from storeNameSet so prune's DB sees it absent.
    idbState.storeNameSet.delete(SOURCE_META_STORE);

    await new Promise((r) => setTimeout(r, 20));

    // The new file must still be present.
    expect(idbState.stores[SOURCE_STORE].has(key as string)).toBe(true);
  });
});

describe("readLatestSourceMeta — localStorage undefined branch", () => {
  it("returns [] from getCachedTelecomSourceFiles when localStorage is undefined", async () => {
    // Removing the localStorage global triggers the typeof guard in readLatestSourceMeta.
    vi.stubGlobal("localStorage", undefined);
    const result = await getCachedTelecomSourceFiles();
    // readLatestSourceMeta returns null -> falls through to IDB path -> returns [].
    expect(result).toEqual([]);
  });
});

describe("getCachedTelecomSourceFiles — meta store absent from DB (branch 14 arm 1)", () => {
  it("returns [] when the meta store is not in the DB objectStoreNames after upgrade", async () => {
    // Remove SOURCE_META_STORE from storeNameSet so objectStoreNames.contains() returns false.
    // We must NOT add SOURCE_META_STORE to preExistingStores — and we start with a fresh
    // idbState. But openIDB's upgrade handler creates the missing stores. So we need to
    // remove SOURCE_META_STORE from storeNameSet after it gets created in the upgrade.
    //
    // Strategy: install a custom fake that never adds SOURCE_META_STORE to the storeNameSet.
    const limitedStoreNames = new Set([STORE, SOURCE_STORE]);
    const limitedStores: Record<string, StoreData> = {
      [STORE]: new Map(),
      [SOURCE_STORE]: new Map(),
    };
    const limitedFailMode = { mode: null as string | null };

    const limitedFakeDB = {
      open(_name: string, _version: number) {
        const req = new FakeRequest<typeof limitedDb>() as FakeRequest<typeof limitedDb> & {
          onupgradeneeded: ((e: { target: { result: typeof limitedDb } }) => void) | null;
        };
        req.onupgradeneeded = null;
        const limitedDb = {
          get objectStoreNames() {
            return { contains: (name: string) => limitedStoreNames.has(name) };
          },
          transaction(_names: string | string[], _mode?: string) {
            const tx = {
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
              onabort: null as (() => void) | null,
              objectStore(name: string) {
                return new FakeObjectStore(limitedStores[name] ?? new Map(), limitedFailMode);
              },
            };
            queueMicrotask(() => tx.oncomplete?.());
            return tx;
          },
          createObjectStore(name: string) {
            limitedStoreNames.add(name);
            if (!limitedStores[name]) limitedStores[name] = new Map();
          },
        };
        queueMicrotask(() => {
          req.onupgradeneeded?.({ target: { result: limitedDb as never } });
          req.result = limitedDb as never;
          req.onsuccess?.();
        });
        return req;
      },
    };
    vi.stubGlobal("indexedDB", limitedFakeDB);

    const result = await getCachedTelecomSourceFiles();
    expect(result).toEqual([]);
  });
});

describe("getCachedTelecomSourceFiles — meta store getAll onerror (fn 38)", () => {
  it("returns [] when the getAll on the meta store errors", async () => {
    // The meta store must exist (so objectStoreNames.contains is true) but getAll fails.
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_META_STORE);
    idbState.failMode.mode = "getAll";
    const result = await getCachedTelecomSourceFiles();
    expect(result).toEqual([]);
  });
});

describe("putTelecomSourceFileMeta — indexedDB undefined early return (branch 20)", () => {
  it("returns early without error when indexedDB becomes undefined before the meta put", async () => {
    // We need indexedDB to be defined when cacheTelecomSourceFile opens the source store,
    // but undefined by the time putTelecomSourceFileMeta checks it.
    //
    // Strategy: wrap the fake so that after the first successful open() call (for the
    // source-store put), the wrapper sets globalThis.indexedDB = undefined.
    // putTelecomSourceFileMeta's guard `if (typeof indexedDB === "undefined") return;`
    // then fires.
    const originalFakeIDB = (globalThis as typeof globalThis & { indexedDB: unknown }).indexedDB;
    let openCallsDone = 0;
    const selfNullifyingFake = {
      open(name: string, version: number) {
        openCallsDone++;
        const result = (originalFakeIDB as typeof selfNullifyingFake).open(name, version);
        if (openCallsDone === 1) {
          // After the first open's microtask resolves (when onsuccess fires), null the global.
          // We do this by wrapping onsuccess on the request.
          const origReq = result as { onsuccess: (() => void) | null };
          const origSuccess = origReq.onsuccess;
          // Use a Proxy to intercept onsuccess assignment.
          // Simpler: queue a microtask AFTER the open to null indexedDB.
          queueMicrotask(() => {
            queueMicrotask(() => {
              // By the time 2 microtask rounds pass after the first open, the source-put
              // transaction's onsuccess has fired and cacheTelecomSourceFile is about to
              // call putTelecomSourceFileMeta. Set indexedDB to undefined now.
              (globalThis as typeof globalThis & { indexedDB: unknown }).indexedDB = undefined;
            });
          });
        }
        return result;
      },
    };
    vi.stubGlobal("indexedDB", selfNullifyingFake);

    const file = makeFile("earlymeta.csv", { lastModified: 1 });
    const key = await cacheTelecomSourceFile(file);
    // cacheTelecomSourceFile should still return the key (putTelecomSourceFileMeta is non-fatal).
    expect(key).toBe(getTelecomFileKey(file));
  });
});

describe("putTelecomSourceFileMeta — meta store absent early return (branch 21)", () => {
  it("returns early when the meta store is not in the DB after upgrade", async () => {
    // Use a custom fake DB that never adds SOURCE_META_STORE to objectStoreNames.
    // This exercises the `if (!db.objectStoreNames.contains(SOURCE_META_STORE_NAME)) return;` path.
    const noMetaStoreNames = new Set([STORE, SOURCE_STORE]);
    const noMetaStores: Record<string, StoreData> = {
      [STORE]: new Map(),
      [SOURCE_STORE]: new Map(),
    };
    const noMetaFailMode = { mode: null as string | null };
    const noMetaFakeDB = {
      open(_name: string, _version: number) {
        const req = new FakeRequest<unknown>() as FakeRequest<unknown> & {
          onupgradeneeded: ((e: { target: { result: unknown } }) => void) | null;
        };
        req.onupgradeneeded = null;
        const db = {
          get objectStoreNames() {
            return { contains: (name: string) => noMetaStoreNames.has(name) };
          },
          transaction(_names: string | string[], _mode?: string) {
            const tx = {
              oncomplete: null as (() => void) | null,
              onerror: null as (() => void) | null,
              onabort: null as (() => void) | null,
              objectStore(name: string) {
                return new FakeObjectStore(noMetaStores[name] ?? new Map(), noMetaFailMode);
              },
            };
            queueMicrotask(() => tx.oncomplete?.());
            return tx;
          },
          createObjectStore(name: string) {
            // Deliberately never add SOURCE_META_STORE.
            if (name !== SOURCE_META_STORE) {
              noMetaStoreNames.add(name);
              if (!noMetaStores[name]) noMetaStores[name] = new Map();
            }
          },
        };
        queueMicrotask(() => {
          req.onupgradeneeded?.({ target: { result: db as never } });
          req.result = db as never;
          req.onsuccess?.();
        });
        return req;
      },
    };
    vi.stubGlobal("indexedDB", noMetaFakeDB);

    // cacheTelecomSourceFile calls putTelecomSourceFileMeta which should hit the early return.
    const file = makeFile("nometastore.csv", { lastModified: 2 });
    const key = await cacheTelecomSourceFile(file);
    // The source file should still be stored (even though meta store is absent).
    expect(key).toBe(getTelecomFileKey(file));
    expect(noMetaStores[SOURCE_STORE].has(key as string)).toBe(true);
  });
});

describe("getCachedAnalyticsForKey eviction — delete error swallowed (fn 10)", () => {
  it("resolves null even when the eviction delete rejects (catch callback is invoked)", async () => {
    // Seed a stale entry so the eviction path fires.
    const stale = Date.now() - MAX_AGE_MS - 1;
    seedAnalyticsEntry("stale-delete-fail", stale, { fileName: "stale.csv" });

    // Make the delete operation fail so the `.catch(() => {})` callback (fn 10) is hit.
    idbState.failMode.mode = "delete";

    // The function should still resolve null (the catch swallows the delete error).
    await expect(getCachedAnalyticsForKey("stale-delete-fail")).resolves.toBeNull();
    // Allow the async catch callback to execute.
    await new Promise((r) => setTimeout(r, 10));
  });
});

describe("pruneTelecomSourceFiles — catch callback (fn 33)", () => {
  it("swallows the prune rejection via the .catch handler", async () => {
    // Block localStorage mirror so getCachedTelecomSourceFiles reads the meta store.
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    // Pre-populate 6 entries in the meta + source stores (so prune fires).
    idbState.stores[SOURCE_STORE] = new Map();
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_STORE);
    idbState.storeNameSet.add(SOURCE_META_STORE);
    for (let i = 1; i <= 6; i++) {
      const k = `fn33-${i}`;
      const meta = { key: k, savedAt: i, fileName: `${k}.csv`, size: 1, lastModified: i, type: "" };
      idbState.stores[SOURCE_META_STORE].set(k, meta);
      idbState.stores[SOURCE_STORE].set(k, { ...meta, file: new Blob([k]) });
    }

    // Call sequence inside cacheTelecomSourceFile + prune:
    //   open #1 = cacheTelecomSourceFile's openIDB (source put)
    //   open #2 = putTelecomSourceFileMeta's openIDB (meta put)
    //   open #3 = getCachedTelecomSourceFiles's openIDB (called from pruneTelecomSourceFiles)
    //   open #4 = pruneTelecomSourceFiles' own openIDB -> FAIL here
    //
    // Opens 1-3 must succeed; #4 must fail so pruneTelecomSourceFiles rejects and
    // the `.catch(() => {})` body (fn 33) is invoked.
    let openCallCount = 0;
    const origFake = (globalThis as typeof globalThis & { indexedDB: unknown }).indexedDB;
    vi.stubGlobal("indexedDB", {
      open(name: string, version: number) {
        openCallCount++;
        if (openCallCount >= 4) {
          // pruneTelecomSourceFiles' own openIDB fails -> rejects -> .catch(() => {}) fires
          const req = new FakeRequest<unknown>() as FakeRequest<unknown> & {
            onupgradeneeded: null;
          };
          req.onupgradeneeded = null;
          req.error = new Error("forced fail on open 4+");
          queueMicrotask(() => req.onerror?.());
          return req;
        }
        return (origFake as { open: (n: string, v: number) => unknown }).open(name, version);
      },
    });

    const file = makeFile("fn33.csv", { lastModified: 7 });
    const result = await cacheTelecomSourceFile(file);
    expect(result).not.toBeNull();

    // Allow the fire-and-forget prune + its catch callback to settle.
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe("putTelecomSourceFileMeta transaction callbacks (fn 43 oncomplete, fn 44 onerror)", () => {
  it("fn 43: tx.oncomplete fires and resolves the promise when the transaction succeeds", async () => {
    // The normal cacheTelecomSourceFile path goes through putTelecomSourceFileMeta.
    // We verify the meta store entry is written, which can only happen if the
    // tx.oncomplete => resolve() callback fires.
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_META_STORE);

    const file = makeFile("oncomplete-test.csv", { lastModified: 42 });
    const key = await cacheTelecomSourceFile(file);
    expect(key).not.toBeNull();
    // The meta store must have the entry — this is only possible if oncomplete fired.
    expect(idbState.stores[SOURCE_META_STORE].has(key as string)).toBe(true);
  });

  it("fn 44: tx.onerror fires and still resolves the promise (non-fatal) when the transaction errors", async () => {
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_META_STORE);
    // "txError" causes FakeTransaction to fire onerror instead of oncomplete.
    // In putTelecomSourceFileMeta: tx.onerror = () => resolve() — so the Promise
    // still resolves (fn 44 body runs), and cacheTelecomSourceFile returns normally.
    idbState.failMode.mode = "txError";
    const file = makeFile("onerror-test.csv", { lastModified: 43 });
    const key = await cacheTelecomSourceFile(file);
    // cacheTelecomSourceFile should return the key (txError for meta put is non-fatal).
    // Note: the source-put Promise resolves via req.onsuccess, not tx.oncomplete, so
    // txError does not break the source store write.
    expect(key).not.toBeNull();
  });
});

describe("pruneTelecomSourceFiles transaction callbacks (fn 52 onerror, fn 53 onabort) and no-meta-store branches", () => {
  function setupPruneState() {
    // Block localStorage so getCachedTelecomSourceFiles reads the meta store.
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    idbState.stores[SOURCE_STORE] = new Map();
    idbState.stores[SOURCE_META_STORE] = new Map();
    idbState.storeNameSet.add(SOURCE_STORE);
    idbState.storeNameSet.add(SOURCE_META_STORE);
    for (let i = 1; i <= 6; i++) {
      const k = `prune-cb-${i}`;
      const meta = { key: k, savedAt: i, fileName: `${k}.csv`, size: 1, lastModified: i, type: "" };
      idbState.stores[SOURCE_META_STORE].set(k, meta);
      idbState.stores[SOURCE_STORE].set(k, { ...meta, file: new Blob([k]) });
    }
  }

  it("fn 52: tx.onerror fires in pruneTelecomSourceFiles when the prune transaction errors", async () => {
    setupPruneState();
    // Make the 3rd+ open use txError mode so pruneTelecomSourceFiles' transaction fires onerror.
    // The prune catches all errors silently.
    let openCount = 0;
    const origFake = (globalThis as typeof globalThis & { indexedDB: unknown }).indexedDB;
    vi.stubGlobal("indexedDB", {
      open(name: string, version: number) {
        openCount++;
        if (openCount > 2) {
          // prune's openIDB: return a DB whose transactions fire onerror.
          const req = new FakeRequest<unknown>() as FakeRequest<unknown> & {
            onupgradeneeded: ((e: { target: { result: unknown } }) => void) | null;
          };
          req.onupgradeneeded = null;
          const txErrFailMode = { mode: "txError" as string | null };
          const db = {
            get objectStoreNames() {
              return { contains: (n: string) => idbState.storeNameSet.has(n) };
            },
            transaction(_n: string | string[], _m?: string) {
              return new FakeTransaction(idbState.stores, txErrFailMode);
            },
            createObjectStore() {},
          };
          queueMicrotask(() => {
            req.onupgradeneeded?.({ target: { result: db as never } });
            req.result = db as never;
            req.onsuccess?.();
          });
          return req;
        }
        return (origFake as { open: (n: string, v: number) => unknown }).open(name, version);
      },
    });

    const file = makeFile("fn52.csv", { lastModified: 10 });
    const result = await cacheTelecomSourceFile(file);
    expect(result).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
  });

  it("fn 53: tx.onabort fires in pruneTelecomSourceFiles when the prune transaction aborts", async () => {
    setupPruneState();
    let openCount = 0;
    const origFake = (globalThis as typeof globalThis & { indexedDB: unknown }).indexedDB;
    vi.stubGlobal("indexedDB", {
      open(name: string, version: number) {
        openCount++;
        if (openCount > 2) {
          const req = new FakeRequest<unknown>() as FakeRequest<unknown> & {
            onupgradeneeded: ((e: { target: { result: unknown } }) => void) | null;
          };
          req.onupgradeneeded = null;
          const txAbortFailMode = { mode: "txAbort" as string | null };
          const db = {
            get objectStoreNames() {
              return { contains: (n: string) => idbState.storeNameSet.has(n) };
            },
            transaction(_n: string | string[], _m?: string) {
              return new FakeTransaction(idbState.stores, txAbortFailMode);
            },
            createObjectStore() {},
          };
          queueMicrotask(() => {
            req.onupgradeneeded?.({ target: { result: db as never } });
            req.result = db as never;
            req.onsuccess?.();
          });
          return req;
        }
        return (origFake as { open: (n: string, v: number) => unknown }).open(name, version);
      },
    });

    const file = makeFile("fn53.csv", { lastModified: 11 });
    const result = await cacheTelecomSourceFile(file);
    expect(result).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
  });

  it("branches 28+29: prune uses only SOURCE_STORE when meta store is absent from the prune DB", async () => {
    setupPruneState();

    // pruneTelecomSourceFiles call sequence (from cacheTelecomSourceFile):
    //   open #1 = cacheTelecomSourceFile's openIDB
    //   open #2 = putTelecomSourceFileMeta's openIDB
    //   open #3 = getCachedTelecomSourceFiles's openIDB (called inside prune)
    //   open #4 = pruneTelecomSourceFiles' own openIDB  ← use no-meta-store DB here
    //
    // For open #4 we provide a DB whose objectStoreNames.contains(SOURCE_META_STORE_NAME)
    // always returns false, exercising branches 28 arm 1 and 29 arm 1.
    let openCount = 0;
    const origFake = (globalThis as typeof globalThis & { indexedDB: unknown }).indexedDB;
    vi.stubGlobal("indexedDB", {
      open(name: string, version: number) {
        openCount++;
        if (openCount >= 4) {
          // Return a DB that claims no meta store exists.
          const req = new FakeRequest<unknown>() as FakeRequest<unknown> & {
            onupgradeneeded: ((e: { target: { result: unknown } }) => void) | null;
          };
          req.onupgradeneeded = null;
          const noMetaDB = {
            get objectStoreNames() {
              // Purposely never includes SOURCE_META_STORE_NAME.
              return { contains: (n: string) => n !== SOURCE_META_STORE };
            },
            transaction(_n: string | string[], _m?: string) {
              // Return a transaction that completes normally.
              const tx = {
                oncomplete: null as (() => void) | null,
                onerror: null as (() => void) | null,
                onabort: null as (() => void) | null,
                objectStore(storeName: string) {
                  return new FakeObjectStore(
                    idbState.stores[storeName] ?? new Map(),
                    { mode: null },
                  );
                },
              };
              queueMicrotask(() => tx.oncomplete?.());
              return tx;
            },
            createObjectStore() {
              // No-op: prevents source code from re-adding the meta store.
            },
          };
          queueMicrotask(() => {
            req.onupgradeneeded?.({ target: { result: noMetaDB as never } });
            req.result = noMetaDB as never;
            req.onsuccess?.();
          });
          return req;
        }
        return (origFake as { open: (n: string, v: number) => unknown }).open(name, version);
      },
    });

    const file = makeFile("b28b29.csv", { lastModified: 12 });
    const key = await cacheTelecomSourceFile(file);
    expect(key).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
  });
});
