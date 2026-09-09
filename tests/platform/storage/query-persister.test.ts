/**
 * Unit tests for src/platform/storage/query-persister.ts
 *
 * Strategy:
 * - Mock Dexie so no real IndexedDB is opened.
 * - Mock the compression module so compress/decompress are controllable.
 * - Mock @tanstack/react-query dehydrate/hydrate/defaultShouldDehydrateQuery.
 * - Keep all module logic real so it contributes to coverage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoist mock state so it is available when vi.mock factories run ─────────
const { mockSnapshots, mockCompress, mockDecompress, mockDehydrate, mockHydrate } = vi.hoisted(
  () => {
    const mockSnapshots = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      toArray: vi.fn(),
    };
    const mockCompress = vi.fn();
    const mockDecompress = vi.fn();
    const mockDehydrate = vi.fn();
    const mockHydrate = vi.fn();
    return { mockSnapshots, mockCompress, mockDecompress, mockDehydrate, mockHydrate };
  },
);

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("dexie", () => {
  const DexieMock = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.snapshots = mockSnapshots;
    this.version = vi.fn().mockReturnValue({ stores: vi.fn() });
  });
  return { default: DexieMock };
});

vi.mock("@/platform/storage/compression", () => ({
  compress: (...args: unknown[]) => mockCompress(...args),
  decompress: (...args: unknown[]) => mockDecompress(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  dehydrate: (...args: unknown[]) => mockDehydrate(...args),
  hydrate: (...args: unknown[]) => mockHydrate(...args),
  defaultShouldDehydrateQuery: vi.fn(() => true),
}));

// ── Import the module under test AFTER mocks are registered ───────────────
import {
  clearQueryCacheSnapshot,
  persistQueryClient,
  type QueryPersistOptions,
  queryCacheSnapshotSize,
  restoreQueryClient,
} from "@/platform/storage/query-persister";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeClient() {
  const subscribers: Array<(e: { type: string }) => void> = [];
  const queryCacheMock = {
    subscribe: vi.fn((cb: (e: { type: string }) => void) => {
      subscribers.push(cb);
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx !== -1) subscribers.splice(idx, 1);
      };
    }),
    _subscribers: subscribers,
  };
  return {
    getQueryCache: vi.fn(() => queryCacheMock),
    _cache: queryCacheMock,
  };
}

function toArrayBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

// ── restoreQueryClient ────────────────────────────────────────────────────

describe("restoreQueryClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no snapshot exists in the DB", async () => {
    // Arrange
    mockSnapshots.get.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(false);
    expect(mockHydrate).not.toHaveBeenCalled();
  });

  it("returns false and does not throw when the DB get() rejects", async () => {
    // Arrange
    mockSnapshots.get.mockRejectedValue(new Error("IDB error"));
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(false);
  });

  it("returns false and deletes snapshot when savedAt is too old (default 24 h)", async () => {
    // Arrange — 25 hours old
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
      bytes: toArrayBuffer("{}"),
      compressed: false,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockSnapshots.delete.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(false);
    expect(mockSnapshots.delete).toHaveBeenCalledWith("default");
    expect(mockHydrate).not.toHaveBeenCalled();
  });

  it("returns false and deletes snapshot when buster does not match", async () => {
    // Arrange
    const blob = {
      key: "default",
      buster: "old-buster",
      savedAt: Date.now(),
      bytes: toArrayBuffer("{}"),
      compressed: false,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockSnapshots.delete.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never, { buster: "new-buster" });

    // Assert
    expect(result).toBe(false);
    expect(mockSnapshots.delete).toHaveBeenCalledWith("default");
  });

  it("hydrates client from an uncompressed snapshot and returns true", async () => {
    // Arrange
    const state = { queries: [], mutations: [] };
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now(),
      bytes: toArrayBuffer(JSON.stringify(state)),
      compressed: false,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(true);
    expect(mockHydrate).toHaveBeenCalledWith(client, state);
  });

  it("hydrates client from a compressed snapshot via decompress() and returns true", async () => {
    // Arrange
    const state = { queries: [{ queryKey: ["test"] }], mutations: [] };
    const fakeCompressed = toArrayBuffer("gzip-bytes");
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now(),
      bytes: fakeCompressed,
      compressed: true,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockDecompress.mockResolvedValue(state);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(true);
    expect(mockDecompress).toHaveBeenCalledWith(fakeCompressed);
    expect(mockHydrate).toHaveBeenCalledWith(client, state);
  });

  it("returns false and deletes snapshot when decompress throws (corrupt gzip)", async () => {
    // Arrange
    const fakeCompressed = toArrayBuffer("corrupt");
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now(),
      bytes: fakeCompressed,
      compressed: true,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockDecompress.mockRejectedValue(new Error("bad gzip"));
    mockSnapshots.delete.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(false);
    expect(mockSnapshots.delete).toHaveBeenCalledWith("default");
    expect(mockHydrate).not.toHaveBeenCalled();
  });

  it("returns false and deletes corrupt snapshot when uncompressed JSON is invalid", async () => {
    // Arrange
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now(),
      bytes: toArrayBuffer("not-json{{{"),
      compressed: false,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockSnapshots.delete.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never);

    // Assert
    expect(result).toBe(false);
    expect(mockSnapshots.delete).toHaveBeenCalledWith("default");
  });

  it("uses a custom key option when looking up the snapshot", async () => {
    // Arrange
    mockSnapshots.get.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    await restoreQueryClient(client as never, { key: "my-bucket" });

    // Assert
    expect(mockSnapshots.get).toHaveBeenCalledWith("my-bucket");
  });

  it("respects a custom maxAgeMs: rejects a 2-hour-old snapshot when maxAgeMs = 1 hour", async () => {
    // Arrange
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now() - 2 * 60 * 60 * 1000,
      bytes: toArrayBuffer("{}"),
      compressed: false,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockSnapshots.delete.mockResolvedValue(undefined);
    const client = makeClient();

    // Act
    const result = await restoreQueryClient(client as never, { maxAgeMs: 60 * 60 * 1000 });

    // Assert
    expect(result).toBe(false);
    expect(mockSnapshots.delete).toHaveBeenCalled();
  });

  it("tolerates delete() rejection on a stale snapshot without throwing", async () => {
    // Arrange
    const staleBlob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
      bytes: toArrayBuffer("{}"),
      compressed: false,
    };
    mockSnapshots.get.mockResolvedValue(staleBlob);
    mockSnapshots.delete.mockRejectedValue(new Error("delete failed"));
    const client = makeClient();

    // Act + Assert — must not throw
    await expect(restoreQueryClient(client as never)).resolves.toBe(false);
  });

  it("tolerates delete() rejection on a corrupt snapshot without throwing", async () => {
    // Arrange
    const blob = {
      key: "default",
      buster: "v1",
      savedAt: Date.now(),
      bytes: toArrayBuffer("corrupt-gzip"),
      compressed: true,
    };
    mockSnapshots.get.mockResolvedValue(blob);
    mockDecompress.mockRejectedValue(new Error("bad gzip"));
    mockSnapshots.delete.mockRejectedValue(new Error("delete also failed"));
    const client = makeClient();

    // Act + Assert
    await expect(restoreQueryClient(client as never)).resolves.toBe(false);
  });
});

// ── persistQueryClient ────────────────────────────────────────────────────

describe("persistQueryClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockDehydrate.mockReturnValue({ queries: [], mutations: [] });
    mockCompress.mockResolvedValue(toArrayBuffer("compressed"));
    mockSnapshots.put.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes to the query cache on start", () => {
    // Arrange
    const client = makeClient();

    // Act
    const stop = persistQueryClient(client as never);
    stop();

    // Assert
    expect(client._cache.subscribe).toHaveBeenCalledTimes(1);
  });

  it("the returned stop() function flushes a final snapshot", async () => {
    // Arrange
    const client = makeClient();

    // Act
    const stop = persistQueryClient(client as never);
    stop();
    await vi.runAllTimersAsync();

    // Assert — teardown calls writeSnapshot
    expect(mockDehydrate).toHaveBeenCalled();
    expect(mockSnapshots.put).toHaveBeenCalled();
  });

  it("schedules a debounced write when an 'updated' event fires", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 500 });

    // Act — emit cache event
    client._cache._subscribers[0]({ type: "updated" });
    expect(mockSnapshots.put).not.toHaveBeenCalled(); // not yet

    await vi.advanceTimersByTimeAsync(500);

    // Assert
    expect(mockSnapshots.put).toHaveBeenCalled();
    stop();
  });

  it("schedules a debounced write when an 'added' event fires", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 200 });

    // Act
    client._cache._subscribers[0]({ type: "added" });
    await vi.advanceTimersByTimeAsync(200);

    // Assert
    expect(mockSnapshots.put).toHaveBeenCalled();
    stop();
  });

  it("schedules a debounced write when a 'removed' event fires", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 200 });

    // Act
    client._cache._subscribers[0]({ type: "removed" });
    await vi.advanceTimersByTimeAsync(200);

    // Assert
    expect(mockSnapshots.put).toHaveBeenCalled();
    stop();
  });

  it("does NOT schedule a write for unrecognised event types", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 200 });

    // Act — emit an observer event that should be ignored
    client._cache._subscribers[0]({ type: "observerResultsUpdated" });
    await vi.advanceTimersByTimeAsync(200);

    // Assert — put not called mid-session (only teardown would call it)
    expect(mockSnapshots.put).not.toHaveBeenCalled();
    stop();
  });

  it("coalesces multiple rapid events into a single write within the throttle window", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 1000 });

    // Act — fire three events quickly
    client._cache._subscribers[0]({ type: "updated" });
    client._cache._subscribers[0]({ type: "added" });
    client._cache._subscribers[0]({ type: "removed" });

    await vi.advanceTimersByTimeAsync(1000);

    // Assert — exactly one debounced write
    expect(mockSnapshots.put).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not schedule a new write after stop() has been called", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 500 });

    // Capture subscribers before stop clears them
    const subscribersBefore = [...client._cache._subscribers];

    stop();
    await vi.runAllTimersAsync(); // flush teardown write
    mockSnapshots.put.mockClear();

    // Act — emit event; the subscription is already removed, so no new write
    subscribersBefore[0]?.({ type: "updated" });
    await vi.advanceTimersByTimeAsync(500);

    // Assert
    expect(mockSnapshots.put).not.toHaveBeenCalled();
  });

  it("cancels the pending timer on stop() when a write is scheduled but not yet fired", async () => {
    // Arrange
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 5000 });

    // Schedule a write
    client._cache._subscribers[0]({ type: "updated" });

    // Act — stop before the timer fires; teardown does its own fire-and-forget
    stop();
    await vi.runAllTimersAsync();

    // The pending timer was cancelled; put is called once by the teardown flush
    expect(mockSnapshots.put).toHaveBeenCalledTimes(1);
  });

  it("writes uncompressed bytes when compress option is false", async () => {
    // Arrange
    const state = { queries: [{ q: 1 }], mutations: [] };
    mockDehydrate.mockReturnValue(state);
    const client = makeClient();

    // Act
    const stop = persistQueryClient(client as never, { compress: false, throttleMs: 100 });
    client._cache._subscribers[0]({ type: "updated" });
    await vi.advanceTimersByTimeAsync(100);

    // Assert
    expect(mockCompress).not.toHaveBeenCalled();
    const putArg = mockSnapshots.put.mock.calls[0][0] as {
      compressed: boolean;
      bytes: ArrayBuffer;
    };
    expect(putArg.compressed).toBe(false);
    expect(putArg.bytes.byteLength).toBeGreaterThan(0);
    stop();
  });

  it("writes compressed bytes when compress option is true (default)", async () => {
    // Arrange
    mockDehydrate.mockReturnValue({ queries: [], mutations: [] });
    mockCompress.mockResolvedValue(toArrayBuffer("gzip-data"));
    const client = makeClient();

    // Act
    const stop = persistQueryClient(client as never, { compress: true, throttleMs: 100 });
    client._cache._subscribers[0]({ type: "updated" });
    await vi.advanceTimersByTimeAsync(100);

    // Assert
    expect(mockCompress).toHaveBeenCalled();
    const putArg = mockSnapshots.put.mock.calls[0][0] as { compressed: boolean };
    expect(putArg.compressed).toBe(true);
    stop();
  });

  it("stores the custom key and buster in the persisted blob", async () => {
    // Arrange
    mockDehydrate.mockReturnValue({ queries: [], mutations: [] });
    const client = makeClient();
    const opts: QueryPersistOptions = { key: "my-cache", buster: "build-42", throttleMs: 100 };

    // Act
    const stop = persistQueryClient(client as never, opts);
    client._cache._subscribers[0]({ type: "updated" });
    await vi.advanceTimersByTimeAsync(100);

    // Assert
    const putArg = mockSnapshots.put.mock.calls[0][0] as {
      key: string;
      buster: string;
    };
    expect(putArg.key).toBe("my-cache");
    expect(putArg.buster).toBe("build-42");
    stop();
  });

  it("passes a custom shouldDehydrateQuery filter to dehydrate()", async () => {
    // Arrange
    const customFilter = vi.fn(() => false);
    mockDehydrate.mockImplementation((_client, dehydrateOpts) => {
      dehydrateOpts?.shouldDehydrateQuery?.({} as never);
      return { queries: [], mutations: [] };
    });
    const client = makeClient();

    // Act
    const stop = persistQueryClient(client as never, {
      shouldDehydrateQuery: customFilter,
      throttleMs: 100,
    });
    client._cache._subscribers[0]({ type: "updated" });
    await vi.advanceTimersByTimeAsync(100);

    // Assert
    expect(customFilter).toHaveBeenCalled();
    stop();
  });

  it("swallows a writeSnapshot error without propagating (best-effort design)", async () => {
    // Arrange
    mockCompress.mockRejectedValue(new Error("compress failed"));
    const client = makeClient();
    const stop = persistQueryClient(client as never, { throttleMs: 100 });

    // Act + Assert — must not throw
    client._cache._subscribers[0]({ type: "updated" });
    await expect(vi.advanceTimersByTimeAsync(100)).resolves.not.toThrow();
    stop();
  });

  it("swallows a teardown writeSnapshot error without propagating", async () => {
    // Arrange
    mockCompress.mockRejectedValue(new Error("compress failed on teardown"));
    const client = makeClient();
    const stop = persistQueryClient(client as never);

    // Act + Assert
    expect(() => stop()).not.toThrow();
    await expect(vi.runAllTimersAsync()).resolves.not.toThrow();
  });
});

// ── clearQueryCacheSnapshot ───────────────────────────────────────────────

describe("clearQueryCacheSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshots.delete.mockResolvedValue(undefined);
    mockSnapshots.clear.mockResolvedValue(undefined);
  });

  it("deletes a specific key when key is provided", async () => {
    // Act
    await clearQueryCacheSnapshot("my-key");

    // Assert
    expect(mockSnapshots.delete).toHaveBeenCalledWith("my-key");
    expect(mockSnapshots.clear).not.toHaveBeenCalled();
  });

  it("clears all snapshots when no key argument is supplied", async () => {
    // Act
    await clearQueryCacheSnapshot();

    // Assert
    expect(mockSnapshots.clear).toHaveBeenCalled();
    expect(mockSnapshots.delete).not.toHaveBeenCalled();
  });

  it("clears all snapshots when key is explicitly undefined", async () => {
    // Act
    await clearQueryCacheSnapshot(undefined);

    // Assert
    expect(mockSnapshots.clear).toHaveBeenCalled();
  });
});

// ── queryCacheSnapshotSize ────────────────────────────────────────────────

describe("queryCacheSnapshotSize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when there are no snapshots", async () => {
    // Arrange
    mockSnapshots.toArray.mockResolvedValue([]);

    // Act
    const size = await queryCacheSnapshotSize();

    // Assert
    expect(size).toBe(0);
  });

  it("sums the byteLength of all snapshot buffers", async () => {
    // Arrange
    const buf1 = toArrayBuffer("hello"); // 5 bytes
    const buf2 = toArrayBuffer("world!!!"); // 8 bytes
    mockSnapshots.toArray.mockResolvedValue([{ bytes: buf1 }, { bytes: buf2 }]);

    // Act
    const size = await queryCacheSnapshotSize();

    // Assert — cross-checked: 5 + 8 = 13
    expect(size).toBe(buf1.byteLength + buf2.byteLength);
  });

  it("handles a single snapshot correctly", async () => {
    // Arrange
    const buf = toArrayBuffer("single");
    mockSnapshots.toArray.mockResolvedValue([{ bytes: buf }]);

    // Act
    const size = await queryCacheSnapshotSize();

    // Assert
    expect(size).toBe(buf.byteLength);
  });
});
