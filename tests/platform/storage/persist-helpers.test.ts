import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deepMergeDefaults,
  makeDeepMergeMigrate,
  pickKeys,
  durablePersist,
} from "@/platform/storage/persist-helpers";

// ─── isPlainObject (tested indirectly through deepMergeDefaults) ───────────────

describe("deepMergeDefaults", () => {
  it("returns a copy of defaults when persisted is not a plain object (undefined)", () => {
    const defaults = { a: 1, b: "hello" };
    const result = deepMergeDefaults(defaults, undefined);
    expect(result).toEqual({ a: 1, b: "hello" });
    expect(result).not.toBe(defaults); // new copy
  });

  it("returns a copy of defaults when persisted is null", () => {
    const defaults = { x: 42 };
    const result = deepMergeDefaults(defaults, null);
    expect(result).toEqual({ x: 42 });
  });

  it("returns a copy of defaults when persisted is a string", () => {
    const defaults = { a: 1 };
    const result = deepMergeDefaults(defaults, "some string");
    expect(result).toEqual({ a: 1 });
  });

  it("returns a copy of defaults when persisted is a number", () => {
    const defaults = { count: 0 };
    const result = deepMergeDefaults(defaults, 99);
    expect(result).toEqual({ count: 0 });
  });

  it("returns a copy of defaults when persisted is a boolean", () => {
    const defaults = { flag: false };
    const result = deepMergeDefaults(defaults, true);
    expect(result).toEqual({ flag: false });
  });

  it("returns a copy of defaults when persisted is an Array (not plain object)", () => {
    const defaults = { items: [] as string[] };
    const result = deepMergeDefaults(defaults, [1, 2, 3]);
    expect(result).toEqual({ items: [] });
  });

  it("returns a copy of defaults when persisted is a class instance (not plain object)", () => {
    const defaults = { val: 0 };
    class MyClass {
      val = 42;
    }
    const result = deepMergeDefaults(defaults, new MyClass());
    expect(result).toEqual({ val: 0 });
  });

  it("merges scalar persisted values onto defaults", () => {
    const defaults = { a: 1, b: "default", c: true };
    const persisted = { a: 99, b: "overridden", c: false };
    const result = deepMergeDefaults(defaults, persisted);
    expect(result).toEqual({ a: 99, b: "overridden", c: false });
  });

  it("skips keys where persisted value is undefined (continues)", () => {
    const defaults = { a: 1, b: 2 };
    const persisted = { a: 10, b: undefined };
    const result = deepMergeDefaults(defaults, persisted);
    // b is undefined in persisted, so we keep default
    expect(result).toEqual({ a: 10, b: 2 });
  });

  it("drops keys present in persisted but absent from defaults (forward compat)", () => {
    const defaults = { a: 1 };
    const persisted = { a: 99, extraKey: "should be dropped" };
    const result = deepMergeDefaults(defaults, persisted as Record<string, unknown>);
    expect(result).toEqual({ a: 99 });
    expect(result).not.toHaveProperty("extraKey");
  });

  it("recursively merges nested plain objects", () => {
    const defaults = { nested: { x: 1, y: 2 }, top: "hello" };
    const persisted = { nested: { x: 99 }, top: "world" };
    const result = deepMergeDefaults(defaults, persisted);
    // nested.x overridden, nested.y kept from defaults
    expect(result).toEqual({ nested: { x: 99, y: 2 }, top: "world" });
  });

  it("replaces default array value with persisted array (arrays are not plain objects)", () => {
    const defaults = { items: ["a", "b"] };
    const persisted = { items: ["c", "d", "e"] };
    const result = deepMergeDefaults(defaults, persisted);
    expect(result).toEqual({ items: ["c", "d", "e"] });
  });

  it("replaces a default nested object with a persisted non-plain-object value", () => {
    const defaults = { nested: { x: 1 } };
    const persisted = { nested: "not-an-object" };
    // isPlainObject(d) is true (nested default), isPlainObject(p) is false -> deepMerge returns copy of defaults.nested
    // actually: isPlainObject(d) checks the DEFAULT value; if default is plain obj, recurse
    // but persisted value is a string, so deepMergeDefaults(d, "not-an-object") -> returns {...d}
    const result = deepMergeDefaults(defaults, persisted as Record<string, unknown>);
    expect(result).toEqual({ nested: { x: 1 } });
  });

  it("replaces a default scalar with a persisted plain object", () => {
    const defaults = { val: 42 };
    const persisted = { val: { inner: "object" } };
    // isPlainObject(d) is false (42), so p wins
    const result = deepMergeDefaults(defaults, persisted as Record<string, unknown>);
    expect(result).toEqual({ val: { inner: "object" } });
  });

  it("handles deeply nested merges", () => {
    const defaults = { a: { b: { c: 1, d: 2 } } };
    const persisted = { a: { b: { c: 99 } } };
    const result = deepMergeDefaults(defaults, persisted);
    expect(result).toEqual({ a: { b: { c: 99, d: 2 } } });
  });

  it("handles an empty defaults object", () => {
    const defaults = {};
    const persisted = { a: 1, b: 2 };
    const result = deepMergeDefaults(defaults, persisted as Record<string, unknown>);
    expect(result).toEqual({});
  });

  it("handles an empty persisted object", () => {
    const defaults = { a: 1, b: 2 };
    const result = deepMergeDefaults(defaults, {});
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("handles null as a persisted nested value (replaces default nested object with null)", () => {
    const defaults = { nested: { x: 1 } };
    const persisted = { nested: null };
    // null is not undefined so we don't skip; isPlainObject(d)=true -> recurse with null -> returns copy of d
    const result = deepMergeDefaults(defaults, persisted as Record<string, unknown>);
    expect(result).toEqual({ nested: { x: 1 } });
  });
});

// ─── makeDeepMergeMigrate ─────────────────────────────────────────────────────

describe("makeDeepMergeMigrate", () => {
  it("returns a migrate function that merges persisted state onto defaults", () => {
    const getDefaults = () => ({ a: 1, b: 2 });
    const migrate = makeDeepMergeMigrate(getDefaults);
    const result = migrate({ a: 99 }, 0);
    expect(result).toEqual({ a: 99, b: 2 });
  });

  it("returns defaults when persisted is not a plain object (null)", () => {
    const getDefaults = () => ({ a: 1 });
    const migrate = makeDeepMergeMigrate(getDefaults);
    const result = migrate(null, 0);
    expect(result).toEqual({ a: 1 });
  });

  it("returns defaults when persisted is not a plain object (undefined)", () => {
    const getDefaults = () => ({ x: "hello" });
    const migrate = makeDeepMergeMigrate(getDefaults);
    const result = migrate(undefined, 0);
    expect(result).toEqual({ x: "hello" });
  });

  it("returns defaults when persisted is a string", () => {
    const getDefaults = () => ({ val: 0 });
    const migrate = makeDeepMergeMigrate(getDefaults);
    const result = migrate("invalid-json-string", 0);
    expect(result).toEqual({ val: 0 });
  });

  it("returns defaults when persisted is an array", () => {
    const getDefaults = () => ({ items: [] as number[] });
    const migrate = makeDeepMergeMigrate(getDefaults);
    const result = migrate([1, 2, 3], 0);
    expect(result).toEqual({ items: [] });
  });

  it("applies transforms for versions greater than the persisted version, in sorted order", () => {
    const getDefaults = () => ({ a: 0, b: 0, c: 0 });
    const transforms: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
      2: (s) => ({ ...s, b: 10 }),
      3: (s) => ({ ...s, c: 20 }),
    };
    const migrate = makeDeepMergeMigrate(getDefaults, transforms);
    // persisted version is 1, so transforms 2 and 3 both apply (v > version)
    const result = migrate({ a: 5 }, 1);
    expect(result).toEqual({ a: 5, b: 10, c: 20 });
  });

  it("does not apply transforms for versions less than or equal to the persisted version", () => {
    const getDefaults = () => ({ a: 0, b: 0 });
    const transforms: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
      1: (s) => ({ ...s, b: 999 }),
    };
    const migrate = makeDeepMergeMigrate(getDefaults, transforms);
    // persisted version is 2, transform at version 1 does NOT apply (1 is not > 2)
    const result = migrate({ a: 5 }, 2);
    expect(result).toEqual({ a: 5, b: 0 });
  });

  it("applies only the transforms whose version number is greater than persisted version", () => {
    const getDefaults = () => ({ a: 0, b: 0, c: 0 });
    const transforms: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
      1: (s) => ({ ...s, b: 100 }), // v=1, not > version=1 => skip
      2: (s) => ({ ...s, c: 200 }), // v=2 > version=1 => apply
    };
    const migrate = makeDeepMergeMigrate(getDefaults, transforms);
    const result = migrate({ a: 5 }, 1);
    expect(result).toEqual({ a: 5, b: 0, c: 200 });
  });

  it("works with no transforms (undefined transforms)", () => {
    const getDefaults = () => ({ val: 42 });
    const migrate = makeDeepMergeMigrate(getDefaults, undefined);
    const result = migrate({ val: 1 }, 0);
    expect(result).toEqual({ val: 1 });
  });

  it("works with empty transforms object", () => {
    const getDefaults = () => ({ val: 42 });
    const migrate = makeDeepMergeMigrate(getDefaults, {});
    const result = migrate({ val: 7 }, 0);
    expect(result).toEqual({ val: 7 });
  });

  it("applies transforms in ascending numeric order even if keys are unordered", () => {
    const order: number[] = [];
    const getDefaults = () => ({ a: 0 });
    const transforms: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
      5: (s) => { order.push(5); return s; },
      2: (s) => { order.push(2); return s; },
      10: (s) => { order.push(10); return s; },
    };
    const migrate = makeDeepMergeMigrate(getDefaults, transforms);
    migrate({}, 0);
    expect(order).toEqual([2, 5, 10]);
  });

  it("passes an empty state object when persisted is not a plain object (transforms branch)", () => {
    let receivedState: Record<string, unknown> | null = null;
    const getDefaults = () => ({ a: 0 });
    const transforms: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {
      1: (s) => { receivedState = s; return s; },
    };
    const migrate = makeDeepMergeMigrate(getDefaults, transforms);
    // persisted is null => state = {}
    migrate(null, 0);
    expect(receivedState).toEqual({});
  });
});

// ─── pickKeys ─────────────────────────────────────────────────────────────────

describe("pickKeys", () => {
  it("picks only the specified keys from a state object", () => {
    const state = { a: 1, b: 2, c: 3, action: vi.fn() };
    const picker = pickKeys(["a", "c"] as const);
    const result = picker(state);
    expect(result).toEqual({ a: 1, c: 3 });
    expect(result).not.toHaveProperty("b");
    expect(result).not.toHaveProperty("action");
  });

  it("returns an empty object when keys array is empty", () => {
    const state = { a: 1, b: 2 };
    const picker = pickKeys([] as const);
    const result = picker(state);
    expect(result).toEqual({});
  });

  it("returns all keys when all are specified", () => {
    const state = { x: 10, y: 20 };
    const picker = pickKeys(["x", "y"] as const);
    const result = picker(state);
    expect(result).toEqual({ x: 10, y: 20 });
  });

  it("picks keys with various value types", () => {
    const state = { str: "hello", num: 42, arr: [1, 2, 3], obj: { nested: true }, fn: () => {} };
    const picker = pickKeys(["str", "num", "arr", "obj"] as const);
    const result = picker(state);
    expect(result).toEqual({ str: "hello", num: 42, arr: [1, 2, 3], obj: { nested: true } });
  });

  it("picks a single key", () => {
    const state = { a: "only-this", b: "not-this" };
    const picker = pickKeys(["a"] as const);
    const result = picker(state);
    expect(result).toEqual({ a: "only-this" });
  });
});

// ─── durablePersist ───────────────────────────────────────────────────────────

describe("durablePersist", () => {
  it("returns name and version from opts", () => {
    const opts = {
      name: "my-store",
      version: 3,
      getDefaults: () => ({ count: 0 }),
      persistKeys: ["count"] as const,
    };
    const result = durablePersist(opts);
    expect(result.name).toBe("my-store");
    expect(result.version).toBe(3);
  });

  it("returns a migrate function that works correctly", () => {
    const opts = {
      name: "test-store",
      version: 1,
      getDefaults: () => ({ a: 1, b: 2 }),
      persistKeys: ["a", "b"] as const,
    };
    const result = durablePersist(opts);
    const migrated = result.migrate({ a: 99 }, 0);
    expect(migrated).toEqual({ a: 99, b: 2 });
  });

  it("returns a partialize function that picks only persistKeys", () => {
    const opts = {
      name: "test-store",
      version: 1,
      getDefaults: () => ({ a: 1, b: 2, c: 3 }),
      persistKeys: ["a", "b"] as const,
    };
    const result = durablePersist(opts);
    const partial = result.partialize({ a: 10, b: 20, c: 30 });
    expect(partial).toEqual({ a: 10, b: 20 });
    expect(partial).not.toHaveProperty("c");
  });

  it("passes transforms to the migrate function", () => {
    const transform = vi.fn((s: Record<string, unknown>) => ({ ...s, b: 99 }));
    const opts = {
      name: "versioned-store",
      version: 0,
      getDefaults: () => ({ a: 0, b: 0 }),
      persistKeys: ["a", "b"] as const,
      transforms: { 1: transform },
    };
    const result = durablePersist(opts);
    // version=0, transform at v=1 > 0 => runs
    const migrated = result.migrate({ a: 5 }, 0);
    expect(transform).toHaveBeenCalled();
    expect(migrated).toEqual({ a: 5, b: 99 });
  });

  it("works without transforms (optional field absent)", () => {
    const opts = {
      name: "simple-store",
      version: 2,
      getDefaults: () => ({ x: "default" }),
      persistKeys: ["x"] as const,
    };
    const result = durablePersist(opts);
    const migrated = result.migrate({ x: "saved" }, 1);
    expect(migrated).toEqual({ x: "saved" });
  });

  it("migrate returns defaults when persisted is null", () => {
    const opts = {
      name: "null-store",
      version: 1,
      getDefaults: () => ({ val: 42 }),
      persistKeys: ["val"] as const,
    };
    const result = durablePersist(opts);
    const migrated = result.migrate(null, 0);
    expect(migrated).toEqual({ val: 42 });
  });

  it("partialize returns empty object when persistKeys is empty", () => {
    const opts = {
      name: "empty-keys-store",
      version: 1,
      getDefaults: () => ({ a: 1, b: 2 }),
      persistKeys: [] as const,
    };
    const result = durablePersist(opts);
    const partial = result.partialize({ a: 1, b: 2 });
    expect(partial).toEqual({});
  });
});
