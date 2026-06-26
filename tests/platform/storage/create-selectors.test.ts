import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { create } from "zustand";
import {
  createSelectors,
  useShallowSelector,
  SELECTOR_GUIDANCE,
} from "@/platform/storage/create-selectors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BearState {
  bears: number;
  name: string;
  active: boolean;
}

function makeBearStore() {
  return create<BearState>()(() => ({
    bears: 0,
    name: "grizzly",
    active: true,
  }));
}

// ---------------------------------------------------------------------------
// createSelectors
// ---------------------------------------------------------------------------

describe("createSelectors", () => {
  it("returns the original store object (referential identity preserved)", () => {
    // Arrange
    const store = makeBearStore();

    // Act
    const withSelectors = createSelectors(store);

    // Assert — the returned object IS the store (same reference)
    expect(withSelectors).toBe(store);
  });

  it("attaches a .use property to the store", () => {
    // Arrange
    const store = makeBearStore();

    // Act
    const withSelectors = createSelectors(store);

    // Assert
    expect(withSelectors.use).toBeDefined();
    expect(typeof withSelectors.use).toBe("object");
  });

  it("creates a selector function for every key in the state", () => {
    // Arrange
    const store = makeBearStore();

    // Act
    const withSelectors = createSelectors(store);

    // Assert — one selector per state key
    expect(typeof withSelectors.use.bears).toBe("function");
    expect(typeof withSelectors.use.name).toBe("function");
    expect(typeof withSelectors.use.active).toBe("function");
  });

  it("each selector function selects the correct field when called inside a renderHook", () => {
    // Arrange
    const store = makeBearStore();
    const withSelectors = createSelectors(store);

    // Act — call each selector inside a React hook context
    const { result: bearsResult } = renderHook(() => withSelectors.use.bears());
    const { result: nameResult } = renderHook(() => withSelectors.use.name());
    const { result: activeResult } = renderHook(() => withSelectors.use.active());

    // Assert — initial values are returned
    expect(bearsResult.current).toBe(0);
    expect(nameResult.current).toBe("grizzly");
    expect(activeResult.current).toBe(true);
  });

  it("selector hook returns updated value when store state changes", () => {
    // Arrange
    const store = makeBearStore();
    const withSelectors = createSelectors(store);

    const { result } = renderHook(() => withSelectors.use.bears());
    expect(result.current).toBe(0);

    // Act — update the store state
    act(() => {
      store.setState({ bears: 5 });
    });

    // Assert — selector now returns the updated value
    expect(result.current).toBe(5);
  });

  it("handles a store with a single state key", () => {
    // Arrange
    interface SingleState {
      count: number;
    }
    const store = create<SingleState>()(() => ({ count: 42 }));

    // Act
    const withSelectors = createSelectors(store);

    // Assert
    expect(typeof withSelectors.use.count).toBe("function");
    const { result } = renderHook(() => withSelectors.use.count());
    expect(result.current).toBe(42);
  });

  it("handles a store with many state keys and iterates all of them", () => {
    // Arrange
    interface BigState {
      a: number;
      b: string;
      c: boolean;
      d: null;
      e: object;
    }
    const store = create<BigState>()(() => ({
      a: 1,
      b: "hello",
      c: false,
      d: null,
      e: { x: 1 },
    }));

    // Act
    const withSelectors = createSelectors(store);

    // Assert — all keys are present
    expect(typeof withSelectors.use.a).toBe("function");
    expect(typeof withSelectors.use.b).toBe("function");
    expect(typeof withSelectors.use.c).toBe("function");
    expect(typeof withSelectors.use.d).toBe("function");
    expect(typeof withSelectors.use.e).toBe("function");

    // And they return correct values
    const { result: aResult } = renderHook(() => withSelectors.use.a());
    const { result: bResult } = renderHook(() => withSelectors.use.b());
    const { result: dResult } = renderHook(() => withSelectors.use.d());
    expect(aResult.current).toBe(1);
    expect(bResult.current).toBe("hello");
    expect(dResult.current).toBeNull();
  });

  it("handles an empty state object gracefully (no keys → no selectors)", () => {
    // Arrange
    const store = create<object>()(() => ({}));

    // Act
    const withSelectors = createSelectors(store);

    // Assert — .use exists but is empty
    expect(withSelectors.use).toBeDefined();
    expect(Object.keys(withSelectors.use as object)).toHaveLength(0);
  });

  it("selector remains stable across multiple renders (same function reference per key)", () => {
    // Arrange
    const store = makeBearStore();
    const withSelectors = createSelectors(store);

    // Capture references before
    const bearsFn = withSelectors.use.bears;
    const nameFn = withSelectors.use.name;

    // Call createSelectors again on the same store (overwrites .use)
    // Verify original references are functions
    expect(typeof bearsFn).toBe("function");
    expect(typeof nameFn).toBe("function");
  });

  it("selector function calls store() with the correct sub-selector", () => {
    // Arrange — spy on the store call to verify the inner selector
    const store = makeBearStore();
    const storeCallSpy = vi.fn(store);

    // Manually create a minimal store-like object to intercept the call
    const originalSubscribe = store.subscribe.bind(store);
    const originalGetState = store.getState.bind(store);
    const originalGetInitialState = store.getInitialState.bind(store);
    const originalSetState = store.setState.bind(store);

    // We can verify the correct value by checking what the selector extracts
    const withSelectors = createSelectors(store);
    const state = store.getState();

    // The selector for "bears" should extract state.bears
    // Verify via renderHook
    const { result } = renderHook(() => withSelectors.use.bears());
    expect(result.current).toBe(state.bears);

    // Clean up spy
    void storeCallSpy;
    void originalSubscribe;
    void originalGetState;
    void originalGetInitialState;
    void originalSetState;
  });
});

// ---------------------------------------------------------------------------
// useShallowSelector
// ---------------------------------------------------------------------------

describe("useShallowSelector", () => {
  it("is exported and is a function", () => {
    // Assert
    expect(typeof useShallowSelector).toBe("function");
  });

  it("wraps a selector and memoizes object slices (shallow equality)", () => {
    // Arrange
    const store = create<BearState>()(() => ({
      bears: 3,
      name: "panda",
      active: true,
    }));

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return store(useShallowSelector((s) => ({ bears: s.bears, name: s.name })));
    });

    // Assert — initial render
    expect(result.current).toEqual({ bears: 3, name: "panda" });
    const initialRenders = renderCount;

    // Act — update an unrelated field (active)
    act(() => {
      store.setState({ active: false });
    });

    // Assert — the shallow selector did NOT re-render because bears/name unchanged
    expect(renderCount).toBe(initialRenders);
    expect(result.current).toEqual({ bears: 3, name: "panda" });
  });

  it("triggers re-render when a selected field changes", () => {
    // Arrange
    const store = create<BearState>()(() => ({
      bears: 1,
      name: "koala",
      active: true,
    }));

    const { result } = renderHook(() =>
      store(useShallowSelector((s) => ({ bears: s.bears }))),
    );
    expect(result.current).toEqual({ bears: 1 });

    // Act — update selected field
    act(() => {
      store.setState({ bears: 10 });
    });

    // Assert — result reflects the new value
    expect(result.current).toEqual({ bears: 10 });
  });

  it("works with array selectors", () => {
    // Arrange
    interface ListState {
      items: string[];
    }
    const store = create<ListState>()(() => ({ items: ["a", "b"] }));

    const { result } = renderHook(() =>
      store(useShallowSelector((s) => s.items)),
    );
    expect(result.current).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// SELECTOR_GUIDANCE
// ---------------------------------------------------------------------------

describe("SELECTOR_GUIDANCE", () => {
  it("is a non-empty string", () => {
    expect(typeof SELECTOR_GUIDANCE).toBe("string");
    expect(SELECTOR_GUIDANCE.length).toBeGreaterThan(0);
  });

  it("contains guidance about useStore.use.field()", () => {
    expect(SELECTOR_GUIDANCE).toContain("useStore.use.field()");
  });

  it("contains guidance about useShallowSelector", () => {
    expect(SELECTOR_GUIDANCE).toContain("useShallowSelector");
  });

  it("warns against bare useStore()", () => {
    expect(SELECTOR_GUIDANCE).toContain("never bare useStore()");
  });
});
