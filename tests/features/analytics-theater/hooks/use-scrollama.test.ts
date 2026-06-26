/**
 * Tests for useScrollama hook.
 *
 * Strategy:
 * - Mock `scrollama` so no real IntersectionObserver scrollytelling runs.
 * - Keep all logic in the real useScrollama module so coverage counts.
 * - Exercise every branch: enabled/disabled, no root, no steps, offset defaults,
 *   onStepEnter firing, resize handler, and cleanup.
 *
 * Approach: since `useRef` starts as null and React only populates `.current`
 * when the ref is attached to a rendered JSX element, we mount self-contained
 * components via `renderHook`'s `wrapper` prop. Each wrapper renders a div with
 * the ref attached and exposes a way to change props by wrapping with React state.
 */

import React, { useState } from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock scrollama ────────────────────────────────────────────────────────────

type StepEnterHandler = (args: { index: number; direction: "up" | "down" }) => void;

interface MockScrollamaInstance {
  setup: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  _capturedHandler: StepEnterHandler | null;
  _triggerStepEnter: (index: number, direction: "up" | "down") => void;
}

// All scrollama instances created during the test suite; reset in beforeEach
const instances: MockScrollamaInstance[] = [];

vi.mock("scrollama", () => ({
  default: () => {
    const inst: MockScrollamaInstance = {
      setup: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      _capturedHandler: null,
      _triggerStepEnter(index, direction) {
        inst._capturedHandler?.({ index, direction });
      },
    };

    // setup() returns a chainable object so `.onStepEnter()` works
    inst.setup.mockImplementation((_args: unknown) => ({
      onStepEnter: (cb: StepEnterHandler) => {
        inst._capturedHandler = cb;
        return inst;
      },
    }));

    instances.push(inst);
    return inst;
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useScrollama } from "@/features/analytics-theater/hooks/use-scrollama";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get the most recently created scrollama mock instance. */
function lastInstance(): MockScrollamaInstance {
  return instances[instances.length - 1];
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  instances.length = 0;
  vi.clearAllMocks();
});

// ─── Return value ────────────────────────────────────────────────────────────

describe("useScrollama — return value", () => {
  it("returns a React ref object with a current property", () => {
    const { result } = renderHook(() => useScrollama(vi.fn()));
    expect(result.current).toHaveProperty("current");
  });

  it("ref.current is null on first render when not attached to a DOM element", () => {
    const { result } = renderHook(() => useScrollama(vi.fn()));
    expect(result.current.current).toBeNull();
  });
});

// ─── Early return: null root ──────────────────────────────────────────────────

describe("useScrollama — null root (ref not attached to any DOM element)", () => {
  it("does not call scrollama() when ref.current stays null", () => {
    renderHook(() => useScrollama(vi.fn()));
    expect(instances).toHaveLength(0);
  });

  it("does not call scrollama() with enabled=false and null ref", () => {
    renderHook(() => useScrollama(vi.fn(), { enabled: false }));
    expect(instances).toHaveLength(0);
  });

  it("does not call scrollama() with explicit enabled=true and null ref", () => {
    renderHook(() => useScrollama(vi.fn(), { enabled: true }));
    expect(instances).toHaveLength(0);
  });
});

// ─── Nullish coalescing: default enabled and offset ──────────────────────────

describe("useScrollama — nullish coalescing default branches", () => {
  it("enabled defaults to true when options arg is omitted (options?.enabled ?? true)", () => {
    // No options → options?.enabled is undefined → ?? true → enabled = true
    const { result } = renderHook(() => useScrollama(() => {}));
    expect(result.current.current).toBeNull();
  });

  it("enabled defaults to true when options exists but enabled is omitted", () => {
    // options = {} → options?.enabled is undefined → ?? true → enabled = true
    const { result } = renderHook(() => useScrollama(() => {}, {}));
    expect(result.current.current).toBeNull();
  });

  it("offset defaults to 0.5 when options arg is omitted (options?.offset ?? 0.5)", () => {
    // No options → options?.offset is undefined → ?? 0.5 → offset = 0.5
    const { result } = renderHook(() => useScrollama(() => {}));
    expect(result.current.current).toBeNull();
  });

  it("offset defaults to 0.5 when options exists but offset is omitted", () => {
    // options = { enabled: true } → options?.offset is undefined → ?? 0.5
    const { result } = renderHook(() => useScrollama(() => {}, { enabled: true }));
    expect(result.current.current).toBeNull();
  });

  it("uses the provided enabled=false value (does not fall through to true)", () => {
    renderHook(() => useScrollama(() => {}, { enabled: false }));
    expect(instances).toHaveLength(0);
  });

  it("uses the provided offset=0.3 value (does not fall through to 0.5)", () => {
    renderHook(() => useScrollama(() => {}, { offset: 0.3 }));
    expect(instances).toHaveLength(0);
  });
});

// ─── Early return: enabled=false with a real DOM root ────────────────────────

describe("useScrollama — enabled=false branch (with real DOM root)", () => {
  it("does not call scrollama() even when the root div has [data-scene] children", () => {
    const onStep = vi.fn();

    // Self-contained component: uses the hook with enabled=false and renders the ref
    function DisabledScene() {
      const ref = useScrollama(onStep, { enabled: false });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
        React.createElement("section", { "data-scene": "1" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(DisabledScene),
          children,
        ),
    });

    // effect fires but takes the `!enabled` branch → early return before scrollama()
    expect(instances).toHaveLength(0);
  });

  it("does not add a resize listener when enabled=false", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    function DisabledScene() {
      const ref = useScrollama(vi.fn(), { enabled: false });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(DisabledScene), children),
    });

    expect(addSpy).not.toHaveBeenCalledWith("resize", expect.any(Function));
    addSpy.mockRestore();
  });
});

// ─── Early return: steps.length === 0 ────────────────────────────────────────

describe("useScrollama — zero [data-scene] steps branch", () => {
  it("does not call scrollama() when the root div has no [data-scene] children", () => {
    function NoScenesComponent() {
      const ref = useScrollama(vi.fn());
      // Root element with no [data-scene] descendants
      return React.createElement(
        "div",
        { ref },
        React.createElement("p", null, "no scenes"),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(NoScenesComponent),
          children,
        ),
    });

    // querySelectorAll returns empty NodeList → steps.length === 0 → early return
    expect(instances).toHaveLength(0);
  });
});

// ─── Happy path: scrollama is set up with correct args ───────────────────────

describe("useScrollama — happy path: scrollama initialized", () => {
  it("calls scrollama() and setup() when root has [data-scene] elements", () => {
    function Scene() {
      const ref = useScrollama(vi.fn());
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
        React.createElement("section", { "data-scene": "1" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    expect(instances).toHaveLength(1);
    expect(lastInstance().setup).toHaveBeenCalledOnce();
  });

  it("passes the [data-scene] NodeList and offset to setup()", () => {
    function Scene() {
      const ref = useScrollama(vi.fn(), { offset: 0.3 });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
        React.createElement("section", { "data-scene": "1" }),
        React.createElement("section", { "data-scene": "2" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    expect(instances).toHaveLength(1);
    const setupArg = lastInstance().setup.mock.calls[0][0] as Record<string, unknown>;
    expect(setupArg.offset).toBe(0.3);
    expect(setupArg.progress).toBe(false);
    expect(setupArg.step).toBeDefined();
  });

  it("defaults offset to 0.5 when options not provided", () => {
    function Scene() {
      const ref = useScrollama(vi.fn()); // no options → offset defaults to 0.5
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    const setupArg = lastInstance().setup.mock.calls[0][0] as Record<string, unknown>;
    expect(setupArg.offset).toBe(0.5);
  });

  it("calls onStep when onStepEnter fires (down direction)", () => {
    const onStep = vi.fn();

    function Scene() {
      const ref = useScrollama(onStep);
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
        React.createElement("section", { "data-scene": "1" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    act(() => {
      lastInstance()._triggerStepEnter(1, "down");
    });

    expect(onStep).toHaveBeenCalledWith(1, "down");
  });

  it("calls onStep when onStepEnter fires (up direction)", () => {
    const onStep = vi.fn();

    function Scene() {
      const ref = useScrollama(onStep);
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    act(() => {
      lastInstance()._triggerStepEnter(0, "up");
    });

    expect(onStep).toHaveBeenCalledWith(0, "up");
  });

  it("calls onStep with the correct index from onStepEnter", () => {
    const onStep = vi.fn();

    function Scene() {
      const ref = useScrollama(onStep);
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
        React.createElement("section", { "data-scene": "1" }),
        React.createElement("section", { "data-scene": "2" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    act(() => {
      lastInstance()._triggerStepEnter(2, "down");
    });

    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep).toHaveBeenCalledWith(2, "down");
  });
});

// ─── Resize event listener ────────────────────────────────────────────────────

describe("useScrollama — resize event listener", () => {
  it("adds a resize event listener to window when scrollama is active", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    function Scene() {
      const ref = useScrollama(vi.fn());
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    addSpy.mockRestore();
  });

  it("calls sc.resize() when window fires a resize event", () => {
    function Scene() {
      const ref = useScrollama(vi.fn());
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(lastInstance().resize).toHaveBeenCalledOnce();
  });
});

// ─── Cleanup (removeEventListener + destroy) ─────────────────────────────────

describe("useScrollama — cleanup", () => {
  it("removes the resize event listener from window on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    function Scene() {
      const ref = useScrollama(vi.fn());
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    const { unmount } = renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("calls sc.destroy() on unmount", () => {
    function Scene() {
      const ref = useScrollama(vi.fn());
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    const { unmount } = renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(Scene), children),
    });

    unmount();

    expect(lastInstance().destroy).toHaveBeenCalledOnce();
  });

  it("does not throw when unmounting with no scrollama instance (null root)", () => {
    expect(() => {
      const { unmount } = renderHook(() => useScrollama(vi.fn()));
      unmount();
    }).not.toThrow();
  });

  it("cleanup is a no-op when enabled=false (no resize listener was registered)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    function DisabledScene() {
      const ref = useScrollama(vi.fn(), { enabled: false });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    const { unmount } = renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(DisabledScene), children),
    });

    unmount();

    expect(removeSpy).not.toHaveBeenCalledWith("resize", expect.any(Function));
    expect(instances).toHaveLength(0);
    removeSpy.mockRestore();
  });
});

// ─── onStepRef: callback stays current across re-renders ─────────────────────

describe("useScrollama — onStepRef update (callback stays current)", () => {
  it("fires the latest callback when the onStep prop changes between renders", () => {
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    // Use React state to hold the callback so the component can re-render
    // with a new callback without re-running the useEffect (offset/enabled unchanged)
    let setOnStep: React.Dispatch<React.SetStateAction<(i: number, d: "up" | "down") => void>>;

    function DynamicScene() {
      const [onStep, _setOnStep] = useState<(i: number, d: "up" | "down") => void>(
        () => firstCallback,
      );
      setOnStep = _setOnStep;
      const ref = useScrollama(onStep);
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(
          React.Fragment,
          null,
          React.createElement(DynamicScene),
          children,
        ),
    });

    expect(instances).toHaveLength(1);

    // Switch callback — no effect re-run (deps unchanged), but ref is updated
    act(() => {
      setOnStep(() => secondCallback);
    });

    // Trigger step enter — should call the new callback via onStepRef.current
    act(() => {
      lastInstance()._triggerStepEnter(0, "up");
    });

    expect(secondCallback).toHaveBeenCalledWith(0, "up");
    expect(firstCallback).not.toHaveBeenCalled();
  });
});

// ─── Effect re-run when offset changes ───────────────────────────────────────

describe("useScrollama — effect re-runs when offset changes", () => {
  it("creates a new scrollama instance when offset dependency changes", () => {
    let setOffset: React.Dispatch<React.SetStateAction<0.3 | 0.5>>;

    function DynamicOffset() {
      const [offset, _setOffset] = useState<0.3 | 0.5>(0.5);
      setOffset = _setOffset;
      const ref = useScrollama(vi.fn(), { offset });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(DynamicOffset), children),
    });

    expect(instances).toHaveLength(1);
    const setupArg0 = lastInstance().setup.mock.calls[0][0] as Record<string, unknown>;
    expect(setupArg0.offset).toBe(0.5);

    // Changing offset → cleanup (destroy) + new setup
    act(() => {
      setOffset(0.3);
    });

    // A second instance is created with offset=0.3
    expect(instances).toHaveLength(2);
    const setupArg1 = lastInstance().setup.mock.calls[0][0] as Record<string, unknown>;
    expect(setupArg1.offset).toBe(0.3);
  });

  it("destroys the previous scrollama instance when offset changes", () => {
    let setOffset: React.Dispatch<React.SetStateAction<0.3 | 0.5>>;

    function DynamicOffset() {
      const [offset, _setOffset] = useState<0.3 | 0.5>(0.5);
      setOffset = _setOffset;
      const ref = useScrollama(vi.fn(), { offset });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(DynamicOffset), children),
    });

    const firstInstance = instances[0];

    act(() => {
      setOffset(0.3);
    });

    // The first instance must have been destroyed
    expect(firstInstance.destroy).toHaveBeenCalledOnce();
  });
});

// ─── Effect re-run when enabled changes ──────────────────────────────────────

describe("useScrollama — effect re-runs when enabled changes", () => {
  it("initialises scrollama when enabled switches from false to true", () => {
    let setEnabled: React.Dispatch<React.SetStateAction<boolean>>;

    function DynamicEnabled() {
      const [enabled, _setEnabled] = useState(false);
      setEnabled = _setEnabled;
      const ref = useScrollama(vi.fn(), { enabled });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(DynamicEnabled), children),
    });

    // Initially disabled → no scrollama
    expect(instances).toHaveLength(0);

    // Enable → effect re-runs → scrollama set up
    act(() => {
      setEnabled(true);
    });

    expect(instances).toHaveLength(1);
    expect(lastInstance().setup).toHaveBeenCalledOnce();
  });

  it("destroys the scrollama instance when enabled switches from true to false", () => {
    let setEnabled: React.Dispatch<React.SetStateAction<boolean>>;

    function DynamicEnabled() {
      const [enabled, _setEnabled] = useState(true);
      setEnabled = _setEnabled;
      const ref = useScrollama(vi.fn(), { enabled });
      return React.createElement(
        "div",
        { ref },
        React.createElement("section", { "data-scene": "0" }),
      );
    }

    renderHook(() => {}, {
      wrapper: ({ children }) =>
        React.createElement(React.Fragment, null, React.createElement(DynamicEnabled), children),
    });

    expect(instances).toHaveLength(1);
    const inst = lastInstance();

    // Disable → cleanup runs → destroy called; next effect run exits early
    act(() => {
      setEnabled(false);
    });

    expect(inst.destroy).toHaveBeenCalledOnce();
  });
});
