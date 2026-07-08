import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DailyLineageEntry,
  type DailyStat,
  getDailyStat,
  listDailyStats,
  removeDailyStat,
  upsertDailyStat,
} from "@/features/telecom/lib/daily-stats-cache";

/**
 * The module is a thin event-driven wrapper around IndexedDB. jsdom does not
 * provide `indexedDB`, so we install a faithful in-memory fake that models the
 * *real* IDB request/transaction event surface the module relies on:
 *  - `open()` -> `onupgradeneeded` (first time) then `onsuccess`
 *  - `transaction().objectStore()` with `get` / `getAll` / `put` / `delete`
 *  - request `onsuccess` / `onerror` fired asynchronously (after the caller has
 *    attached handlers — exactly like the browser), and `tx.oncomplete`.
 *
 * This lets the tests exercise the module's genuine logic (lineage merge +
 * dedupe + sort, computedAt defaulting, list sort order, catch/error paths)
 * rather than asserting on mock call shapes.
 */

// ─── Builders ────────────────────────────────────────────────────────────────

function lineage(overrides: Partial<DailyLineageEntry> = {}): DailyLineageEntry {
  return {
    fileName: overrides.fileName ?? "file.csv",
    fileKey: overrides.fileKey ?? "key-1",
    size: overrides.size ?? 100,
    rows: overrides.rows ?? 10,
    ingestedAt: overrides.ingestedAt ?? 1_000,
    tableName: overrides.tableName ?? "t_1",
  };
}

type StatInput = Omit<DailyStat, "computedAt"> & { computedAt?: number };

function statInput(overrides: Partial<StatInput> = {}): StatInput {
  return {
    day: overrides.day ?? "2026-01-01",
    total: overrides.total ?? 100,
    success: overrides.success ?? 80,
    declined: overrides.declined ?? 15,
    refund: overrides.refund ?? 3,
    instance: overrides.instance ?? 1,
    submitted: overrides.submitted ?? 1,
    amount: overrides.amount ?? 1234.56,
    successRate: overrides.successRate ?? 0.8,
    uniqueCustomers: overrides.uniqueCustomers ?? 42,
    computedAt: overrides.computedAt,
    lineage: overrides.lineage ?? [lineage()],
  };
}

// ─── In-memory IndexedDB fake ────────────────────────────────────────────────

const STORE = "telecom_daily_stats_v1";

/** Schedule an IDB-style callback on a microtask, mirroring real async dispatch. */
function dispatch(fn: () => void): void {
  queueMicrotask(fn);
}

interface FakeRequest<T> {
  result?: T;
  error?: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

/**
 * Build a fake `indexedDB` whose single object store is backed by `data`
 * (keyed by `day`). `failures` lets a test force specific operations to error,
 * driving the module's `onerror` / `catch` branches.
 */
function makeFakeIndexedDB(
  data: Map<string, DailyStat>,
  failures: {
    open?: boolean;
    get?: boolean;
    getAll?: boolean;
    txError?: boolean;
    putThrows?: boolean;
  } = {},
) {
  function makeStore() {
    return {
      get(key: string): FakeRequest<DailyStat | undefined> {
        const req: FakeRequest<DailyStat | undefined> = {
          onsuccess: null,
          onerror: null,
        };
        dispatch(() => {
          if (failures.get) {
            req.error = new Error("get failed");
            req.onerror?.();
            return;
          }
          req.result = data.get(key);
          req.onsuccess?.();
        });
        return req;
      },
      getAll(): FakeRequest<DailyStat[]> {
        const req: FakeRequest<DailyStat[]> = { onsuccess: null, onerror: null };
        dispatch(() => {
          if (failures.getAll) {
            req.error = new Error("getAll failed");
            req.onerror?.();
            return;
          }
          req.result = [...data.values()];
          req.onsuccess?.();
        });
        return req;
      },
      put(value: DailyStat): void {
        if (failures.putThrows) throw new Error("put threw");
        data.set(value.day, value);
      },
      delete(key: string): void {
        data.delete(key);
      },
    };
  }

  function makeTransaction() {
    // The module attaches `tx.oncomplete` / `tx.onerror` only *after* awaiting a
    // prior request (e.g. the `get` in upsert). Real IDB fires completion once
    // the tx task queue drains — i.e. after that work. We model it by firing the
    // relevant handler on a microtask the moment it is assigned, which lands
    // after the awaited request resolves and works under fake timers (which do
    // not fake microtasks).
    let oncompleteFn: (() => void) | null = null;
    let onerrorFn: (() => void) | null = null;
    const settle = () => {
      if (failures.txError) onerrorFn?.();
      else oncompleteFn?.();
    };
    const tx = {
      get oncomplete() {
        return oncompleteFn;
      },
      set oncomplete(fn: (() => void) | null) {
        oncompleteFn = fn;
        if (fn) dispatch(settle);
      },
      get onerror() {
        return onerrorFn;
      },
      set onerror(fn: (() => void) | null) {
        onerrorFn = fn;
      },
      objectStore: () => makeStore(),
    };
    return tx;
  }

  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: vi.fn(),
    transaction: vi.fn(() => makeTransaction()),
    close: vi.fn(),
  };

  return {
    open: vi.fn((_name: string, _version: number) => {
      const req = {
        result: db as unknown as IDBDatabase,
        error: new Error("open failed") as unknown,
        onupgradeneeded: null as ((e: unknown) => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      dispatch(() => {
        if (failures.open) {
          req.onerror?.();
          return;
        }
        // Fire upgrade first (store does not yet exist) then success.
        req.onupgradeneeded?.({ target: { result: db } });
        req.onsuccess?.();
      });
      return req;
    }),
    _db: db,
  };
}

// ─── Harness ─────────────────────────────────────────────────────────────────

let store: Map<string, DailyStat>;

function install(
  failures?: Parameters<typeof makeFakeIndexedDB>[1],
): ReturnType<typeof makeFakeIndexedDB> {
  const fake = makeFakeIndexedDB(store, failures);
  vi.stubGlobal("indexedDB", fake);
  return fake;
}

beforeEach(() => {
  store = new Map<string, DailyStat>();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ─── upsertDailyStat ─────────────────────────────────────────────────────────

describe("upsertDailyStat", () => {
  it("inserts a brand-new daily stat under its day key", async () => {
    install();

    await upsertDailyStat(statInput({ day: "2026-03-01", total: 7 }));

    const saved = store.get("2026-03-01");
    expect(saved).toBeDefined();
    expect(saved?.total).toBe(7);
    expect(saved?.lineage).toHaveLength(1);
  });

  it("defaults computedAt to Date.now() when it is omitted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
    install();

    await upsertDailyStat(statInput({ day: "d1", computedAt: undefined }));

    expect(store.get("d1")?.computedAt).toBe(Date.parse("2026-06-25T12:00:00.000Z"));
  });

  it("preserves an explicitly supplied computedAt", async () => {
    install();

    await upsertDailyStat(statInput({ day: "d2", computedAt: 999 }));

    expect(store.get("d2")?.computedAt).toBe(999);
  });

  it("treats a computedAt of 0 as explicit (does not fall back to now)", async () => {
    // 0 is falsy but `?? Date.now()` only replaces null/undefined, so 0 stays.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000Z"));
    install();

    await upsertDailyStat(statInput({ day: "d0", computedAt: 0 }));

    expect(store.get("d0")?.computedAt).toBe(0);
  });

  it("keeps the new lineage as-is when there is no existing record", async () => {
    install();
    const incoming = [lineage({ fileKey: "k1", ingestedAt: 5 })];

    await upsertDailyStat(statInput({ day: "fresh", lineage: incoming }));

    expect(store.get("fresh")?.lineage).toEqual(incoming);
  });

  it("merges lineage with an existing record, deduping by fileKey (newer wins)", async () => {
    store.set(
      "merge-day",
      statInput({
        day: "merge-day",
        lineage: [lineage({ fileKey: "dup", rows: 1, ingestedAt: 100 })],
      }) as DailyStat,
    );
    install();

    await upsertDailyStat(
      statInput({
        day: "merge-day",
        lineage: [lineage({ fileKey: "dup", rows: 999, ingestedAt: 200 })],
      }),
    );

    const merged = store.get("merge-day")?.lineage ?? [];
    // One entry survives for the duplicate key; the *next* value overwrites prev.
    expect(merged).toHaveLength(1);
    expect(merged[0]?.rows).toBe(999);
  });

  it("unions distinct lineage entries and sorts them by ingestedAt ascending", async () => {
    store.set(
      "u-day",
      statInput({
        day: "u-day",
        lineage: [lineage({ fileKey: "old", ingestedAt: 300 })],
      }) as DailyStat,
    );
    install();

    await upsertDailyStat(
      statInput({
        day: "u-day",
        lineage: [
          lineage({ fileKey: "newest", ingestedAt: 500 }),
          lineage({ fileKey: "earliest", ingestedAt: 100 }),
        ],
      }),
    );

    const keys = (store.get("u-day")?.lineage ?? []).map((e) => e.fileKey);
    expect(keys).toEqual(["earliest", "old", "newest"]);
  });

  it("does not merge when the existing record has an empty (falsy-by-truthiness) lineage absent", async () => {
    // existing record present but WITHOUT a lineage property -> existing?.lineage
    // is undefined (falsy) so the new lineage is used verbatim, no merge.
    store.set("no-lin", { day: "no-lin", total: 1 } as unknown as DailyStat);
    install();
    const incoming = [lineage({ fileKey: "only", ingestedAt: 9 })];

    await upsertDailyStat(statInput({ day: "no-lin", lineage: incoming }));

    expect(store.get("no-lin")?.lineage).toEqual(incoming);
  });

  it("swallows errors silently when opening the DB fails (no throw)", async () => {
    install({ open: true });

    await expect(upsertDailyStat(statInput({ day: "x" }))).resolves.toBeUndefined();
    expect(store.has("x")).toBe(false);
  });

  it("resolves without throwing when the get lookup errors", async () => {
    // get -> onerror resolves the inner promise with undefined, so the write
    // proceeds as a fresh insert (no existing lineage to merge).
    install({ get: true });

    await expect(upsertDailyStat(statInput({ day: "ge" }))).resolves.toBeUndefined();
    expect(store.get("ge")?.day).toBe("ge");
  });

  it("still resolves when the transaction errors instead of completing", async () => {
    // tx.onerror also resolves the completion promise (res()), so no hang/throw.
    install({ txError: true });

    await expect(upsertDailyStat(statInput({ day: "te" }))).resolves.toBeUndefined();
    // put() ran before the tx error handler, so the value is written.
    expect(store.get("te")?.day).toBe("te");
  });

  it("swallows a synchronous throw from store.put", async () => {
    install({ putThrows: true });

    await expect(upsertDailyStat(statInput({ day: "pt" }))).resolves.toBeUndefined();
    expect(store.has("pt")).toBe(false);
  });
});

// ─── getDailyStat ────────────────────────────────────────────────────────────

describe("getDailyStat", () => {
  it("returns the stored stat for an existing day", async () => {
    store.set("2026-01-01", statInput({ day: "2026-01-01", total: 55 }) as DailyStat);
    install();

    const result = await getDailyStat("2026-01-01");

    expect(result?.total).toBe(55);
  });

  it("returns null when the day is not present", async () => {
    install();

    expect(await getDailyStat("missing")).toBeNull();
  });

  it("returns null (not undefined) for a missing day — explicit ?? null", async () => {
    install();

    const result = await getDailyStat("absent");

    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  it("returns null when opening the DB throws/errors", async () => {
    install({ open: true });

    expect(await getDailyStat("any")).toBeNull();
  });

  it("returns null for the day when the get request errors", async () => {
    // get -> onerror resolves the inner promise with undefined -> null.
    store.set("err-day", statInput({ day: "err-day" }) as DailyStat);
    install({ get: true });

    expect(await getDailyStat("err-day")).toBeNull();
  });
});

// ─── listDailyStats ──────────────────────────────────────────────────────────

describe("listDailyStats", () => {
  it("returns an empty array when the store is empty", async () => {
    install();

    expect(await listDailyStats()).toEqual([]);
  });

  it("returns all stored stats", async () => {
    store.set("2026-01-01", statInput({ day: "2026-01-01" }) as DailyStat);
    store.set("2026-01-02", statInput({ day: "2026-01-02" }) as DailyStat);
    install();

    const rows = await listDailyStats();

    expect(rows).toHaveLength(2);
  });

  it("sorts results by day descending (most recent first)", async () => {
    store.set("2026-01-01", statInput({ day: "2026-01-01" }) as DailyStat);
    store.set("2026-03-15", statInput({ day: "2026-03-15" }) as DailyStat);
    store.set("2026-02-10", statInput({ day: "2026-02-10" }) as DailyStat);
    install();

    const days = (await listDailyStats()).map((r) => r.day);

    expect(days).toEqual(["2026-03-15", "2026-02-10", "2026-01-01"]);
  });

  it("returns an empty array when opening the DB errors", async () => {
    store.set("d", statInput({ day: "d" }) as DailyStat);
    install({ open: true });

    expect(await listDailyStats()).toEqual([]);
  });

  it("returns an empty array when getAll errors", async () => {
    store.set("d", statInput({ day: "d" }) as DailyStat);
    install({ getAll: true });

    expect(await listDailyStats()).toEqual([]);
  });
});

// ─── removeDailyStat ─────────────────────────────────────────────────────────

describe("removeDailyStat", () => {
  it("deletes the stat for the given day", async () => {
    store.set("gone", statInput({ day: "gone" }) as DailyStat);
    store.set("stay", statInput({ day: "stay" }) as DailyStat);
    install();

    await removeDailyStat("gone");

    expect(store.has("gone")).toBe(false);
    expect(store.has("stay")).toBe(true);
  });

  it("is a no-op (no throw) when the day does not exist", async () => {
    store.set("stay", statInput({ day: "stay" }) as DailyStat);
    install();

    await expect(removeDailyStat("never")).resolves.toBeUndefined();
    expect(store.has("stay")).toBe(true);
  });

  it("swallows errors silently when opening the DB fails", async () => {
    store.set("keep", statInput({ day: "keep" }) as DailyStat);
    install({ open: true });

    await expect(removeDailyStat("keep")).resolves.toBeUndefined();
    // open failed before delete ran, so the value is untouched.
    expect(store.has("keep")).toBe(true);
  });

  it("resolves even when the transaction errors instead of completing", async () => {
    store.set("td", statInput({ day: "td" }) as DailyStat);
    install({ txError: true });

    await expect(removeDailyStat("td")).resolves.toBeUndefined();
    // delete() executes synchronously before the tx error handler fires.
    expect(store.has("td")).toBe(false);
  });
});
