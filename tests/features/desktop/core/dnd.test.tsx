import { act, renderHook } from "@testing-library/react";
import type { DragEvent as ReactDragEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DESKTOP_DND_MIME,
  type DesktopDragKind,
  type DesktopDragPayload,
  readDrag,
  serializeDrag,
  useDropTarget,
} from "@/features/desktop/core/dnd";

/**
 * Behavioral tests for the desktop drag-and-drop protocol.
 *
 * The module wraps the browser DataTransfer API. jsdom does not implement a
 * usable DataTransfer for synthetic React events, so we build a minimal,
 * spec-faithful fake that backs `setData`/`getData` with a store, exposes a
 * `types` list, and lets us simulate the read-only / throwing phases the real
 * platform has (setData outside dragstart, read-only effectAllowed/dropEffect).
 */

// ─── Fakes ───────────────────────────────────────────────────────────────────

interface FakeOptions {
  /** Pre-seed the data store (keyed by lowercased MIME). */
  initial?: Record<string, string>;
  /** Make setData throw (simulates "called outside dragstart"). */
  throwOnSetData?: boolean;
  /** Make getData throw (simulates a hostile/locked dataTransfer). */
  throwOnGetData?: boolean;
  /** Make effectAllowed/dropEffect read-only (simulates wrong phase). */
  readOnlyEffects?: boolean;
  /** Override the `types` list independently of the backing store. */
  types?: string[] | null;
}

/** A minimal DataTransfer stand-in faithful enough for this protocol. */
function makeDataTransfer(opts: FakeOptions = {}) {
  const store: Record<string, string> = { ...(opts.initial ?? {}) };
  let effectAllowed = "none";
  let dropEffect = "none";

  const dt: Record<string, unknown> = {
    setData(type: string, value: string) {
      if (opts.throwOnSetData) throw new Error("setData not allowed in this phase");
      store[type.toLowerCase()] = value;
    },
    getData(type: string) {
      if (opts.throwOnGetData) throw new Error("getData blocked");
      return store[type.toLowerCase()] ?? "";
    },
    get types() {
      if (opts.types !== undefined) return opts.types;
      return Object.keys(store);
    },
  };

  Object.defineProperty(dt, "effectAllowed", {
    get: () => effectAllowed,
    set: (v: string) => {
      if (opts.readOnlyEffects) throw new Error("effectAllowed is read-only");
      effectAllowed = v;
    },
  });
  Object.defineProperty(dt, "dropEffect", {
    get: () => dropEffect,
    set: (v: string) => {
      if (opts.readOnlyEffects) throw new Error("dropEffect is read-only");
      dropEffect = v;
    },
  });

  return dt as unknown as DataTransfer & { readStore: () => Record<string, string> };
}

/**
 * Build a synthetic React drag event. `preventDefault` is a spy so we can assert
 * the handler accepted (or ignored) the drag.
 */
function makeDragEvent(
  dataTransfer: DataTransfer | null,
  overrides: Partial<ReactDragEvent> = {},
): ReactDragEvent {
  return {
    dataTransfer,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as ReactDragEvent;
}

const payload = (overrides: Partial<DesktopDragPayload> = {}): DesktopDragPayload => ({
  kind: overrides.kind ?? "dataset",
  id: overrides.id ?? "ds-1",
  label: overrides.label,
  tableName: overrides.tableName,
  meta: overrides.meta,
});

/** Read the raw MIME blob a fake holds (via the public getData path). */
function rawMime(dt: DataTransfer): string {
  return dt.getData(DESKTOP_DND_MIME);
}

// ─── serializeDrag ───────────────────────────────────────────────────────────

describe("serializeDrag", () => {
  it("writes the JSON payload under the private MIME type", () => {
    const dt = makeDataTransfer();
    const p = payload({ id: "x", kind: "chart", tableName: "t_x" });

    serializeDrag(makeDragEvent(dt), p);

    expect(JSON.parse(rawMime(dt))).toEqual(p);
  });

  it("sets a text/plain fallback to the label when present", () => {
    const dt = makeDataTransfer();

    serializeDrag(makeDragEvent(dt), payload({ id: "x", label: "Friendly Name" }));

    expect(dt.getData("text/plain")).toBe("Friendly Name");
  });

  it("falls back text/plain to the id when no label is given", () => {
    const dt = makeDataTransfer();

    serializeDrag(makeDragEvent(dt), payload({ id: "only-id", label: undefined }));

    expect(dt.getData("text/plain")).toBe("only-id");
  });

  it("uses the empty-string label as-is for text/plain (?? only catches nullish)", () => {
    const dt = makeDataTransfer();

    // label "" is not nullish, so `label ?? id` yields "" not the id.
    serializeDrag(makeDragEvent(dt), payload({ id: "the-id", label: "" }));

    expect(dt.getData("text/plain")).toBe("");
  });

  it("sets effectAllowed to copy", () => {
    const dt = makeDataTransfer();

    serializeDrag(makeDragEvent(dt), payload());

    expect(dt.effectAllowed).toBe("copy");
  });

  it("is a no-op when the event has no dataTransfer", () => {
    const e = makeDragEvent(null);

    // Should simply return without throwing.
    expect(() => serializeDrag(e, payload())).not.toThrow();
  });

  it("swallows a throwing setData so the drag still proceeds", () => {
    const dt = makeDataTransfer({ throwOnSetData: true });

    expect(() => serializeDrag(makeDragEvent(dt), payload())).not.toThrow();
    // effectAllowed is set in a separate try, so it still lands.
    expect(dt.effectAllowed).toBe("copy");
  });

  it("swallows a read-only effectAllowed assignment", () => {
    const dt = makeDataTransfer({ readOnlyEffects: true });

    expect(() => serializeDrag(makeDragEvent(dt), payload({ label: "L" }))).not.toThrow();
    // setData still succeeded even though effectAllowed threw.
    expect(dt.getData("text/plain")).toBe("L");
  });

  it("round-trips a payload through serialize then readDrag", () => {
    const dt = makeDataTransfer();
    const p = payload({ id: "rt", kind: "kpi", label: "L", tableName: "t", meta: { a: 1 } });

    serializeDrag(makeDragEvent(dt), p);
    const back = readDrag(makeDragEvent(dt));

    expect(back).toEqual(p);
  });
});

// ─── readDrag ────────────────────────────────────────────────────────────────

describe("readDrag", () => {
  it("decodes a well-formed desktop payload", () => {
    const p = payload({ id: "a", kind: "folder" });
    const dt = makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } });

    expect(readDrag(makeDragEvent(dt))).toEqual(p);
  });

  it("returns null when the event has no dataTransfer", () => {
    expect(readDrag(makeDragEvent(null))).toBeNull();
  });

  it("returns null when no MIME data is present (empty string)", () => {
    const dt = makeDataTransfer();

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when getData throws", () => {
    const dt = makeDataTransfer({
      initial: { [DESKTOP_DND_MIME]: JSON.stringify(payload()) },
      throwOnGetData: true,
    });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    const dt = makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: "{not json" } });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when the JSON parses to null", () => {
    const dt = makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: "null" } });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when the JSON parses to a non-object (number)", () => {
    const dt = makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: "42" } });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when id is missing", () => {
    const dt = makeDataTransfer({
      initial: { [DESKTOP_DND_MIME]: JSON.stringify({ kind: "dataset" }) },
    });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when kind is missing", () => {
    const dt = makeDataTransfer({
      initial: { [DESKTOP_DND_MIME]: JSON.stringify({ id: "a" }) },
    });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when id is not a string", () => {
    const dt = makeDataTransfer({
      initial: { [DESKTOP_DND_MIME]: JSON.stringify({ id: 7, kind: "dataset" }) },
    });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("returns null when kind is not a string", () => {
    const dt = makeDataTransfer({
      initial: { [DESKTOP_DND_MIME]: JSON.stringify({ id: "a", kind: 3 }) },
    });

    expect(readDrag(makeDragEvent(dt))).toBeNull();
  });

  it("does not validate kind against the allowed enum (any string passes)", () => {
    // Documents current behavior: kind is only checked to be a string, not a
    // member of DesktopDragKind. An unknown kind is returned verbatim.
    const dt = makeDataTransfer({
      initial: { [DESKTOP_DND_MIME]: JSON.stringify({ id: "a", kind: "not-a-real-kind" }) },
    });

    const result = readDrag(makeDragEvent(dt));
    expect(result?.kind).toBe("not-a-real-kind");
  });

  it("preserves optional fields (label, tableName, meta) when decoding", () => {
    const p = { id: "a", kind: "dataset", label: "L", tableName: "tbl", meta: { x: [1, 2] } };
    const dt = makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } });

    expect(readDrag(makeDragEvent(dt))).toEqual(p);
  });
});

// ─── useDropTarget: dragOver / dragEnter / dragLeave (hasDesktopType) ─────────

/** Helper: render the hook and return result + a captured onDrop spy. */
function renderDropTarget(options?: { accept?: DesktopDragKind[] }) {
  const onDrop = vi.fn();
  const { result } = renderHook(() => useDropTarget({ accept: options?.accept, onDrop }));
  return { result, onDrop };
}

/** A dataTransfer whose `types` includes the desktop MIME. */
function desktopTypesDt(initial?: Record<string, string>) {
  return makeDataTransfer({
    initial: initial ?? { [DESKTOP_DND_MIME]: JSON.stringify(payload()) },
  });
}

describe("useDropTarget — onDragOver", () => {
  it("preventDefault + sets dropEffect copy for a desktop drag", () => {
    const { result } = renderDropTarget();
    const dt = desktopTypesDt();
    const e = makeDragEvent(dt);

    act(() => result.current.dropProps.onDragOver(e));

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(dt.dropEffect).toBe("copy");
  });

  it("ignores a dragover with no desktop type (no preventDefault)", () => {
    const { result } = renderDropTarget();
    const dt = makeDataTransfer({ initial: { "text/plain": "hi" } });
    const e = makeDragEvent(dt);

    act(() => result.current.dropProps.onDragOver(e));

    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores a dragover when dataTransfer is null", () => {
    const { result } = renderDropTarget();
    const e = makeDragEvent(null);

    act(() => result.current.dropProps.onDragOver(e));

    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores a dragover when types is null", () => {
    const { result } = renderDropTarget();
    const dt = makeDataTransfer({ types: null });
    const e = makeDragEvent(dt);

    act(() => result.current.dropProps.onDragOver(e));

    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("still preventDefaults when dropEffect assignment is read-only", () => {
    const { result } = renderDropTarget();
    // types must include MIME; provide it explicitly while making effects throw.
    const dt = makeDataTransfer({ readOnlyEffects: true, types: [DESKTOP_DND_MIME] });
    const e = makeDragEvent(dt);

    expect(() => act(() => result.current.dropProps.onDragOver(e))).not.toThrow();
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("useDropTarget — isOver via enter/leave counter", () => {
  it("starts not over", () => {
    const { result } = renderDropTarget();
    expect(result.current.isOver).toBe(false);
  });

  it("becomes over on dragEnter of a desktop drag", () => {
    const { result } = renderDropTarget();
    const e = makeDragEvent(desktopTypesDt());

    act(() => result.current.dropProps.onDragEnter(e));

    expect(result.current.isOver).toBe(true);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("does not become over on dragEnter of a non-desktop drag", () => {
    const { result } = renderDropTarget();
    const e = makeDragEvent(makeDataTransfer({ initial: { "text/plain": "x" } }));

    act(() => result.current.dropProps.onDragEnter(e));

    expect(result.current.isOver).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("stays over until the matching leave (nested-child counter)", () => {
    const { result } = renderDropTarget();

    // Enter parent then nested child → depth 2.
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);

    // Leaving the child (depth 1) keeps it over.
    act(() => result.current.dropProps.onDragLeave(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);

    // Leaving the parent (depth 0) clears it.
    act(() => result.current.dropProps.onDragLeave(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(false);
  });

  it("clamps the depth counter at zero on an unbalanced leave", () => {
    const { result } = renderDropTarget();

    // A leave with no prior enter must not drive depth negative or flip isOver.
    act(() => result.current.dropProps.onDragLeave(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(false);

    // A single enter should still register as over (proves counter was clamped,
    // not stuck at -1 which would need two enters to reach > 0).
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);
  });

  it("ignores dragLeave for a non-desktop drag (does not touch the counter)", () => {
    const { result } = renderDropTarget();

    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);

    // Non-desktop leave is ignored, so it stays over.
    act(() =>
      result.current.dropProps.onDragLeave(
        makeDragEvent(makeDataTransfer({ initial: { "text/plain": "x" } })),
      ),
    );
    expect(result.current.isOver).toBe(true);
  });
});

// ─── useDropTarget — onDrop ──────────────────────────────────────────────────

describe("useDropTarget — onDrop", () => {
  it("decodes and forwards an accepted payload, and clears isOver", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDropTarget({ onDrop }));
    const p = payload({ id: "dropped", kind: "dataset" });
    const dt = makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } });
    const e = makeDragEvent(dt);

    // Get it into the over state first.
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);

    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(p, e);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.isOver).toBe(false);
  });

  it("resets isOver to false even when nothing is dropped", () => {
    const { result, onDrop } = renderDropTarget();

    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);

    // Drop carrying no readable payload.
    const e = makeDragEvent(makeDataTransfer());
    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.isOver).toBe(false);
    // Without a payload, preventDefault is never reached.
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("does not fire onDrop when readDrag returns null (no payload)", () => {
    const { result, onDrop } = renderDropTarget();
    const e = makeDragEvent(makeDataTransfer({ initial: { "text/plain": "x" } }));

    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("accepts any desktop kind when accept is omitted", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDropTarget({ onDrop }));
    const p = payload({ id: "k", kind: "kpi" });
    const e = makeDragEvent(
      makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } }),
    );

    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).toHaveBeenCalledWith(p, e);
  });

  it("accepts any desktop kind when accept is an empty array", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDropTarget({ accept: [], onDrop }));
    const p = payload({ id: "k", kind: "column" });
    const e = makeDragEvent(
      makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } }),
    );

    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).toHaveBeenCalledWith(p, e);
  });

  it("forwards a payload whose kind is in the accept set", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDropTarget({ accept: ["dataset", "folder"], onDrop }));
    const p = payload({ id: "ok", kind: "folder" });
    const e = makeDragEvent(
      makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } }),
    );

    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).toHaveBeenCalledWith(p, e);
  });

  it("rejects a payload whose kind is not in the accept set", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDropTarget({ accept: ["dataset"], onDrop }));
    const p = payload({ id: "no", kind: "chart" });
    const e = makeDragEvent(
      makeDataTransfer({ initial: { [DESKTOP_DND_MIME]: JSON.stringify(p) } }),
    );

    act(() => result.current.dropProps.onDrop(e));

    expect(onDrop).not.toHaveBeenCalled();
    // Rejected before preventDefault, so the browser default is left alone.
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("clears a counter that was deep before the drop (depth reset to 0)", () => {
    const { result } = renderDropTarget();

    // Build up depth without a balanced leave.
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);

    // Drop must hard-reset isOver regardless of accumulated depth.
    act(() => result.current.dropProps.onDrop(makeDragEvent(makeDataTransfer())));
    expect(result.current.isOver).toBe(false);

    // And after the reset a single leave should keep it at zero (not go to -1
    // and require two enters): one enter flips it back to over.
    act(() => result.current.dropProps.onDragEnter(makeDragEvent(desktopTypesDt())));
    expect(result.current.isOver).toBe(true);
  });
});

// ─── Exported constants / types surface ──────────────────────────────────────

describe("module surface", () => {
  it("exposes the private MIME type constant", () => {
    expect(DESKTOP_DND_MIME).toBe("application/x-data-navigator");
  });
});
