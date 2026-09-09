import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLazyQuery } from "@/hooks/use-lazy-query";

// ─── helpers ────────────────────────────────────────────────────────────────

/** The setup.ts installs IntersectionObserver via Object.defineProperty with
 *  writable:true / configurable:false.  vi.stubGlobal uses defineProperty and
 *  therefore fails.  Direct assignment works fine with writable:true. */
function setIO(value: unknown) {
  (window as unknown as Record<string, unknown>).IntersectionObserver = value;
}

const originalIO = window.IntersectionObserver;

/** Build a controllable IntersectionObserver that captures the callback so
 *  tests can fire intersections imperatively. */
function makeMockIO() {
  let capturedCb: IntersectionObserverCallback | null = null;

  const observe = vi.fn();
  const disconnect = vi.fn();
  const unobserve = vi.fn();

  class FakeIO {
    constructor(cb: IntersectionObserverCallback) {
      capturedCb = cb;
    }
    observe = observe;
    disconnect = disconnect;
    unobserve = unobserve;
  }

  function fireIntersection(isIntersecting: boolean) {
    capturedCb?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  }

  return { FakeIO, observe, disconnect, fireIntersection };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("useLazyQuery", () => {
  afterEach(() => {
    // Restore the setup.ts MockIntersectionObserver after tests that swap it.
    setIO(originalIO);
  });

  // ── basic initial state ──────────────────────────────────────────────────

  it("starts with data=null, loading=false, error=null", () => {
    const query = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useLazyQuery(query));

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.trigger).toBe("function");
  });

  // ── trigger() happy path ──────────────────────────────────────────────────

  it("trigger() runs the query and exposes the resolved data", async () => {
    const rows = [{ id: 1 }];
    const query = vi.fn().mockResolvedValue(rows);
    const { result } = renderHook(() => useLazyQuery(query));

    await act(async () => {
      result.current.trigger();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(rows);
    expect(result.current.error).toBeNull();
  });

  // ── trigger() sets loading=true while in-flight ──────────────────────────

  it("sets loading=true while the query is in flight", async () => {
    let resolve!: (v: string[]) => void;
    const query = vi.fn(
      () =>
        new Promise<string[]>((res) => {
          resolve = res;
        }),
    );
    const { result } = renderHook(() => useLazyQuery(query));

    act(() => {
      result.current.trigger();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve(["a", "b"]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(["a", "b"]);
  });

  // ── trigger() catch branch ───────────────────────────────────────────────

  it("captures the error string when the query rejects", async () => {
    const query = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useLazyQuery(query));

    await act(async () => {
      result.current.trigger();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Error: boom");
    expect(result.current.data).toBeNull();
  });

  // ── trigger() with non-Error rejection ───────────────────────────────────

  it("converts a non-Error rejection to a string via String()", async () => {
    const query = vi.fn().mockRejectedValue("raw string error");
    const { result } = renderHook(() => useLazyQuery(query));

    await act(async () => {
      result.current.trigger();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("raw string error");
  });

  // ── de-duplication: concurrent trigger() calls are no-ops ────────────────

  it("ignores a second trigger() call while the first is still loading", async () => {
    let resolve!: (v: number) => void;
    const query = vi.fn(
      () =>
        new Promise<number>((res) => {
          resolve = res;
        }),
    );
    const { result } = renderHook(() => useLazyQuery(query));

    act(() => {
      result.current.trigger();
    });
    // Second call while loading – should be a no-op
    act(() => {
      result.current.trigger();
    });

    await act(async () => {
      resolve(42);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // query should have been called only once
    expect(query).toHaveBeenCalledTimes(1);
  });

  // ── no-ref path: effect returns early when ref.current is null ─────────────

  it("does not create an observer when ref.current is null (no element attached)", () => {
    const { FakeIO } = makeMockIO();
    const ctorSpy = vi.fn((...args: ConstructorParameters<typeof FakeIO>) => new FakeIO(...args));
    setIO(ctorSpy);

    const query = vi.fn().mockResolvedValue("x");
    // Do NOT attach any element to the ref — ref.current stays null
    renderHook(() => useLazyQuery(query));

    // No observer should have been constructed (ref is null → early return)
    expect(ctorSpy).not.toHaveBeenCalled();
  });

  // ── IntersectionObserver path ─────────────────────────────────────────────

  it("runs the query when the observed element enters the viewport", async () => {
    const { FakeIO, fireIntersection } = makeMockIO();
    setIO(FakeIO);

    const query = vi.fn().mockResolvedValue("viewport-data");
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result } = renderHook(() => {
      const r = useLazyQuery<string>(query);
      // Inject element so the IO-setup effect sees it
      // @ts-expect-error – writing to .current in test only
      r.ref.current = el;
      return r;
    });

    await act(async () => {
      fireIntersection(true);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("viewport-data");

    el.remove();
  });

  it("does not run the query when the observed element is NOT intersecting", async () => {
    const { FakeIO, fireIntersection } = makeMockIO();
    setIO(FakeIO);

    const query = vi.fn().mockResolvedValue("should-not-appear");
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result } = renderHook(() => {
      const r = useLazyQuery<string>(query);
      // @ts-expect-error
      r.ref.current = el;
      return r;
    });

    await act(async () => {
      fireIntersection(false);
    });

    expect(result.current.data).toBeNull();
    expect(query).not.toHaveBeenCalled();

    el.remove();
  });

  it("does not re-run the query on a second intersection if already ran", async () => {
    const { FakeIO, fireIntersection } = makeMockIO();
    setIO(FakeIO);

    const query = vi.fn().mockResolvedValue("once");
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result } = renderHook(() => {
      const r = useLazyQuery<string>(query);
      // @ts-expect-error
      r.ref.current = el;
      return r;
    });

    // First intersection fires the query
    await act(async () => {
      fireIntersection(true);
    });
    await waitFor(() => expect(result.current.data).toBe("once"));

    // Second intersection: ran=true → guard should prevent another run
    await act(async () => {
      fireIntersection(true);
    });

    expect(query).toHaveBeenCalledTimes(1);

    el.remove();
  });

  it("disconnects the IntersectionObserver on unmount", async () => {
    const { FakeIO, disconnect, fireIntersection } = makeMockIO();
    setIO(FakeIO);

    const query = vi.fn().mockResolvedValue(null);
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { unmount } = renderHook(() => {
      const r = useLazyQuery(query);
      // @ts-expect-error
      r.ref.current = el;
      return r;
    });

    await act(async () => {
      fireIntersection(true);
    });

    unmount();
    expect(disconnect).toHaveBeenCalled();

    el.remove();
  });

  // ── fallback: no IntersectionObserver ────────────────────────────────────

  it("falls back to an immediate run when IntersectionObserver is undefined", async () => {
    setIO(undefined);

    const query = vi.fn().mockResolvedValue("fallback");
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result } = renderHook(() => {
      const r = useLazyQuery<string>(query);
      // @ts-expect-error
      r.ref.current = el;
      return r;
    });

    await waitFor(() => expect(result.current.data).toBe("fallback"));

    el.remove();
  });

  it("fallback: does not run again when already ran before IO-undefined effect fires", async () => {
    setIO(undefined);

    let callCount = 0;
    const query = vi.fn(async () => {
      callCount++;
      return callCount;
    });
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result } = renderHook(() => {
      const r = useLazyQuery<number>(query);
      // @ts-expect-error
      r.ref.current = el;
      return r;
    });

    await waitFor(() => expect(result.current.data).toBe(1));
    expect(query).toHaveBeenCalledTimes(1);

    el.remove();
  });

  // ── dep-change resets ran flag ────────────────────────────────────────────

  it("re-runs the query when deps change while already visible", async () => {
    const { FakeIO, fireIntersection } = makeMockIO();
    setIO(FakeIO);

    let depValue = 1;
    const query = vi.fn().mockImplementation(async () => depValue);
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result, rerender } = renderHook(
      ({ dep }: { dep: number }) => {
        const r = useLazyQuery<number>(query, [dep]);
        // @ts-expect-error
        r.ref.current = el;
        return r;
      },
      { initialProps: { dep: 1 } },
    );

    // Make the element visible — fires first run
    await act(async () => {
      fireIntersection(true);
    });
    await waitFor(() => expect(result.current.data).toBe(1));
    expect(query).toHaveBeenCalledTimes(1);

    // Change dep → dep-effect runs, visible=true → re-runs immediately
    depValue = 2;
    await act(async () => {
      rerender({ dep: 2 });
    });

    await waitFor(() => expect(result.current.data).toBe(2));
    expect(query).toHaveBeenCalledTimes(2);

    el.remove();
  });

  it("resets ran flag on dep change but does not re-run if not yet visible", async () => {
    const { FakeIO } = makeMockIO();
    setIO(FakeIO);

    let depValue = "a";
    const query = vi.fn().mockImplementation(async () => depValue);
    const el = document.createElement("div");
    document.body.appendChild(el);

    const { result, rerender } = renderHook(
      ({ dep }: { dep: string }) => {
        const r = useLazyQuery<string>(query, [dep]);
        // @ts-expect-error
        r.ref.current = el;
        return r;
      },
      { initialProps: { dep: "a" } },
    );

    // No intersection fired — element is not visible

    depValue = "b";
    await act(async () => {
      rerender({ dep: "b" });
    });

    // Not visible, so no query should have run
    expect(query).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();

    el.remove();
  });

  // ── default deps = [] ────────────────────────────────────────────────────

  it("accepts no deps argument (defaults to empty array)", async () => {
    const query = vi.fn().mockResolvedValue("default-deps");
    const { result } = renderHook(() => useLazyQuery(query));

    await act(async () => {
      result.current.trigger();
    });

    await waitFor(() => expect(result.current.data).toBe("default-deps"));
  });

  // ── error is cleared on next successful run ───────────────────────────────

  it("clears a previous error when the query succeeds on a subsequent trigger", async () => {
    let shouldFail = true;
    const query = vi.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error("first fail");
      return "success";
    });
    const { result } = renderHook(() => useLazyQuery(query));

    await act(async () => {
      result.current.trigger();
    });
    await waitFor(() => expect(result.current.error).toBe("Error: first fail"));

    shouldFail = false;
    await act(async () => {
      result.current.trigger();
    });
    await waitFor(() => expect(result.current.data).toBe("success"));
    expect(result.current.error).toBeNull();
  });
});
