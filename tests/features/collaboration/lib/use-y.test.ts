import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { shallowArrayEqual, useYArray } from "@/features/collaboration/lib/use-y";

// ─── shallowArrayEqual ────────────────────────────────────────────────────────

describe("shallowArrayEqual", () => {
  it("returns true when both arrays are the same reference", () => {
    // Arrange
    const arr = [1, 2, 3];
    // Act / Assert
    expect(shallowArrayEqual(arr, arr)).toBe(true);
  });

  it("returns true for two empty arrays", () => {
    expect(shallowArrayEqual([], [])).toBe(true);
  });

  it("returns false when lengths differ", () => {
    expect(shallowArrayEqual([1, 2], [1])).toBe(false);
  });

  it("returns false when lengths differ (b longer)", () => {
    expect(shallowArrayEqual([1], [1, 2])).toBe(false);
  });

  it("returns true for equal primitive elements", () => {
    expect(shallowArrayEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("returns false when one element differs", () => {
    expect(shallowArrayEqual([1, 2, 3], [1, 99, 3])).toBe(false);
  });

  it("uses reference equality for objects (same refs → true)", () => {
    const obj = { x: 1 };
    expect(shallowArrayEqual([obj], [obj])).toBe(true);
  });

  it("uses reference equality for objects (different refs with same shape → false)", () => {
    expect(shallowArrayEqual([{ x: 1 }], [{ x: 1 }])).toBe(false);
  });

  it("returns true for single-element arrays with equal primitives", () => {
    expect(shallowArrayEqual(["hello"], ["hello"])).toBe(true);
  });

  it("returns false for single-element arrays with different primitives", () => {
    expect(shallowArrayEqual(["hello"], ["world"])).toBe(false);
  });

  it("handles arrays of strings correctly", () => {
    expect(shallowArrayEqual(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("handles arrays with undefined elements", () => {
    expect(shallowArrayEqual([undefined, undefined], [undefined, undefined])).toBe(true);
  });
});

// ─── useYArray ────────────────────────────────────────────────────────────────

/**
 * Helper: create a Y.Doc + Y.Array pair. Using real Yjs — no mocks needed —
 * mirrors the room-actions test pattern.
 */
function makeYArr<T>(): { doc: Y.Doc; yarr: Y.Array<T> } {
  const doc = new Y.Doc();
  const yarr = doc.getArray<T>("items");
  return { doc, yarr };
}

describe("useYArray — basic projection", () => {
  it("returns the initial projection of an empty array", () => {
    // Arrange
    const { yarr } = makeYArr<number>();
    // Act
    const { result } = renderHook(() => useYArray(yarr, (items) => items.length));
    // Assert
    expect(result.current).toBe(0);
  });

  it("returns the correct projection when the array already has items", () => {
    // Arrange
    const { doc, yarr } = makeYArr<string>();
    doc.transact(() => yarr.push(["a", "b", "c"]));
    // Act
    const { result } = renderHook(() => useYArray(yarr, (items) => items.join(",")));
    // Assert
    expect(result.current).toBe("a,b,c");
  });

  it("re-renders when items are pushed and the projection changes", async () => {
    // Arrange
    const { doc, yarr } = makeYArr<number>();
    const { result } = renderHook(() =>
      useYArray(yarr, (items) => items.reduce((s, n) => s + n, 0)),
    );
    expect(result.current).toBe(0);

    // Act
    act(() => {
      doc.transact(() => yarr.push([1, 2, 3]));
    });

    // Assert
    expect(result.current).toBe(6);
  });

  it("does not re-render when the projection value is unchanged (default Object.is equality)", () => {
    // Arrange: project to a constant string — always "constant"
    const { doc, yarr } = makeYArr<string>();
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useYArray(yarr, () => "constant");
    });
    const countAfterMount = renderCount;

    // Act: mutate the Yjs array, which will fire the observer
    act(() => {
      doc.transact(() => yarr.push(["x"]));
    });

    // Assert: because "constant" === "constant", the store did not notify
    expect(result.current).toBe("constant");
    expect(renderCount).toBe(countAfterMount);
  });
});

describe("useYArray — custom isEqual", () => {
  it("uses the custom isEqual to suppress re-renders", () => {
    // Arrange: always-equal custom comparator
    const { doc, yarr } = makeYArr<number>();
    const alwaysEqual = vi.fn(() => true);
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount++;
      return useYArray(yarr, (items) => [...items], alwaysEqual);
    });
    const countAfterMount = renderCount;

    // Act
    act(() => {
      doc.transact(() => yarr.push([1, 2, 3]));
    });

    // Assert: alwaysEqual returned true → no extra render
    expect(alwaysEqual).toHaveBeenCalled();
    expect(renderCount).toBe(countAfterMount);
    // But the snapshot cached value was NOT updated (alwaysEqual said "same")
    // so the hook still returns the original empty snapshot
    expect(result.current).toEqual([]);
  });

  it("uses the custom isEqual to allow re-renders when it returns false", () => {
    // Arrange: never-equal custom comparator
    const { doc, yarr } = makeYArr<number>();
    const neverEqual = vi.fn(() => false);

    const { result } = renderHook(() => useYArray(yarr, (items) => items.length, neverEqual));
    expect(result.current).toBe(0);

    // Act
    act(() => {
      doc.transact(() => yarr.push([42]));
    });

    // Assert: neverEqual forced cache invalidation → re-render with new value
    expect(neverEqual).toHaveBeenCalled();
    expect(result.current).toBe(1);
  });
});

describe("useYArray — deep observation", () => {
  it("observes deeply when deep=true and fires on nested Y.Map changes", () => {
    // Arrange: array of Y.Maps; project to the first map's 'n' field
    const doc = new Y.Doc();
    const yarr = doc.getArray<Y.Map<unknown>>("nested");
    const inner = new Y.Map<unknown>();
    doc.transact(() => {
      inner.set("n", 0);
      yarr.push([inner]);
    });

    const { result } = renderHook(() =>
      useYArray(
        yarr,
        (items) => (items[0] as Y.Map<unknown>)?.get("n") ?? null,
        Object.is,
        true, // deep=true
      ),
    );
    expect(result.current).toBe(0);

    // Act: mutate the nested map — only observeDeep catches this
    act(() => {
      doc.transact(() => inner.set("n", 99));
    });

    // Assert
    expect(result.current).toBe(99);
  });

  it("subscribes with observe (not observeDeep) when deep=false (default)", () => {
    // Arrange
    const { yarr } = makeYArr<number>();
    const observeSpy = vi.spyOn(yarr, "observe");
    const observeDeepSpy = vi.spyOn(yarr, "observeDeep");

    // Act
    const { unmount } = renderHook(() => useYArray(yarr, (items) => items.length));

    // Assert: shallow observe used
    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(observeDeepSpy).not.toHaveBeenCalled();

    unmount();
  });

  it("subscribes with observeDeep when deep=true", () => {
    // Arrange
    const { yarr } = makeYArr<number>();
    const observeSpy = vi.spyOn(yarr, "observe");
    const observeDeepSpy = vi.spyOn(yarr, "observeDeep");

    // Act
    const { unmount } = renderHook(() => useYArray(yarr, (items) => items.length, Object.is, true));

    // Assert
    expect(observeDeepSpy).toHaveBeenCalledTimes(1);
    expect(observeSpy).not.toHaveBeenCalled();

    unmount();
  });
});

describe("useYArray — unsubscribe on unmount", () => {
  it("calls unobserve when the hook unmounts (shallow)", () => {
    // Arrange
    const { yarr } = makeYArr<number>();
    const unobserveSpy = vi.spyOn(yarr, "unobserve");

    // Act
    const { unmount } = renderHook(() => useYArray(yarr, (items) => items.length));
    unmount();

    // Assert: cleanup fn from subscribe was called
    expect(unobserveSpy).toHaveBeenCalledTimes(1);
  });

  it("calls unobserveDeep when the hook unmounts (deep)", () => {
    // Arrange
    const { yarr } = makeYArr<number>();
    const unobserveDeepSpy = vi.spyOn(yarr, "unobserveDeep");

    // Act
    const { unmount } = renderHook(() => useYArray(yarr, (items) => items.length, Object.is, true));
    unmount();

    // Assert
    expect(unobserveDeepSpy).toHaveBeenCalledTimes(1);
  });
});

describe("useYArray — multiple mutations", () => {
  it("tracks multiple sequential pushes correctly", () => {
    // Arrange
    const { doc, yarr } = makeYArr<string>();
    const { result } = renderHook(() => useYArray(yarr, (items) => items.slice()));

    // Act: push items one at a time
    act(() => {
      doc.transact(() => yarr.push(["first"]));
    });
    expect(result.current).toEqual(["first"]);

    act(() => {
      doc.transact(() => yarr.push(["second"]));
    });
    expect(result.current).toEqual(["first", "second"]);
  });

  it("reflects deletions from the array", () => {
    // Arrange
    const { doc, yarr } = makeYArr<string>();
    doc.transact(() => yarr.push(["a", "b", "c"]));

    const { result } = renderHook(() => useYArray(yarr, (items) => items.slice()));
    expect(result.current).toEqual(["a", "b", "c"]);

    // Act
    act(() => {
      doc.transact(() => yarr.delete(0, 1)); // remove "a"
    });

    // Assert
    expect(result.current).toEqual(["b", "c"]);
  });
});

describe("useYArray — select function identity updates", () => {
  it("uses the latest select function ref without re-subscribing", () => {
    // Arrange: the select function changes on every render (closes over a
    // counter) but the hook should use a stable subscription. We verify the
    // latest select function is always used when an event fires.
    const { doc, yarr } = makeYArr<number>();
    doc.transact(() => yarr.push([10, 20, 30]));

    let multiplier = 1;
    const { result, rerender } = renderHook(() =>
      // Each render captures the current `multiplier` value.
      useYArray(yarr, (items) => items.reduce((s, n) => s + n, 0) * multiplier),
    );
    expect(result.current).toBe(60);

    // Change the closed-over multiplier and re-render the hook (simulates a
    // parent re-render providing a new select function).
    multiplier = 2;
    rerender();
    // Now trigger a Yjs mutation to exercise the latest selectRef.current
    act(() => {
      doc.transact(() => yarr.push([10]));
    });
    // sum = 70, multiplier = 2 → 140
    expect(result.current).toBe(140);
  });
});
