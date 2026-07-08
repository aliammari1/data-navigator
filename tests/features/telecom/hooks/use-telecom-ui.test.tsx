import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STATUS_MAPPINGS } from "@/features/telecom/lib/status-definitions";
import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

// ─── Boundary mocks ──────────────────────────────────────────────────────────
//
// We mock only true boundaries:
//   • @/features/telecom/store     — the persisted zustand store (settings bridge / IPC)
//   • @/features/telecom/lib/channel — BroadcastChannel wrapper (cross-tab)
//   • @/platform/collab/collab     — Yjs CRDT singleton (dynamic import)
//   • sonner                       — toast UI (dynamic import)
//
// `normalizeColumnMapping` is kept REAL (re-exported from the actual store) so
// every assertion about the normalized shape is genuine, not tautological.

const setColumnMapping = vi.fn();
const setStatusMapping = vi.fn();

vi.mock("@/features/telecom/store", async (importActual) => {
  const actual = await importActual<typeof import("@/features/telecom/store")>();
  return {
    ...actual,
    useTelecomStore: {
      getState: () => ({ setColumnMapping, setStatusMapping }),
    },
  };
});

// Captures the latest broadcast handler so a test can drive a cross-tab message.
let broadcastHandler: ((msg: unknown) => void) | null = null;
const broadcastUnsub = vi.fn();
const onBroadcast = vi.fn((handler: (msg: unknown) => void) => {
  broadcastHandler = handler;
  return broadcastUnsub;
});

vi.mock("@/features/telecom/lib/channel", () => ({
  onBroadcast: (handler: (msg: unknown) => void) => onBroadcast(handler),
}));

// A minimal Y.Map-like double that records observers and lets a test push values.
const yMappingStore = new Map<string, string>();
const observers = new Set<() => void>();
const collabCleanup = vi.fn();
const startCollabSync = vi.fn(() => collabCleanup);

const sharedMapping = {
  get: (key: string) => yMappingStore.get(key),
  set: (key: string, value: string) => {
    yMappingStore.set(key, value);
  },
  observe: vi.fn((fn: () => void) => observers.add(fn)),
  unobserve: vi.fn((fn: () => void) => observers.delete(fn)),
  /** Test helper: fire all registered mapping observers. */
  __emit: () => {
    for (const fn of observers) fn();
  },
};

vi.mock("@/platform/collab/collab", () => ({
  startCollabSync,
  sharedMapping,
}));

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

// Imported after the mocks are registered.
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";

const STORAGE_KEY = "telecom-session-v1";

function makeFileNameRef(value = "current.csv") {
  const ref = createRef<string>() as { current: string };
  ref.current = value;
  return ref as React.RefObject<string>;
}

function renderTelecomUI(
  overrides: Partial<{
    defaultMapping: Types.ColumnMapping;
    fileNameRef: React.RefObject<string>;
  }> = {},
) {
  const defaultMapping = overrides.defaultMapping ?? DEFAULT_MAPPING;
  const fileNameRef = overrides.fileNameRef ?? makeFileNameRef();
  return renderHook(() => useTelecomUI({ defaultMapping, fileNameRef }));
}

beforeEach(() => {
  localStorage.clear();
  yMappingStore.clear();
  observers.clear();
  broadcastHandler = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Initial state + return shape ────────────────────────────────────────────

describe("useTelecomUI — initial state", () => {
  it("exposes every documented field with correct initial values", () => {
    const { result } = renderTelecomUI();

    // After mount the effect flips mounted to true.
    expect(result.current.mounted).toBe(true);
    expect(result.current.showMapper).toBe(false);
    expect(result.current.commandOpen).toBe(false);
    expect(result.current.installPrompt).toBeNull();

    expect(typeof result.current.setShowMapper).toBe("function");
    expect(typeof result.current.setCommandOpen).toBe("function");
    expect(typeof result.current.setInstallPrompt).toBe("function");
    expect(typeof result.current.setMapping).toBe("function");
    expect(typeof result.current.setStatusMapping).toBe("function");
  });

  it("normalizes the provided defaultMapping into the initial mapping", () => {
    // A partial-ish mapping with a blanked critical field. normalizeColumnMapping
    // must restore the critical default.
    const blanked = { ...DEFAULT_MAPPING, transactionId: "" };
    const { result } = renderTelecomUI({ defaultMapping: blanked });

    expect(result.current.mapping.transactionId).toBe(DEFAULT_MAPPING.transactionId);
  });

  it("seeds statusMapping from DEFAULT_STATUS_MAPPINGS as a fresh copy", () => {
    const { result } = renderTelecomUI();

    expect(result.current.statusMapping).toEqual(DEFAULT_STATUS_MAPPINGS);
    // Copied (spread), not the same array reference.
    expect(result.current.statusMapping).not.toBe(DEFAULT_STATUS_MAPPINGS);
    expect(result.current.statusMapping.length).toBeGreaterThan(0);
  });
});

// ─── Mount + hydration effect ────────────────────────────────────────────────

describe("useTelecomUI — mount hydration", () => {
  it("hydrates mapping from persisted localStorage state over the default", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { columnMapping: { msisdn: "MY_MSISDN" } }, version: 0 }),
    );

    const { result } = renderTelecomUI();

    expect(result.current.mapping.msisdn).toBe("MY_MSISDN");
    // Other fields fall back to defaults via normalizeColumnMapping.
    expect(result.current.mapping.amount).toBe(DEFAULT_MAPPING.amount);
  });

  it("falls back to defaultMapping when no persisted columnMapping exists", () => {
    const custom = { ...DEFAULT_MAPPING, amount: "MY_AMOUNT" };
    const { result } = renderTelecomUI({ defaultMapping: custom });

    expect(result.current.mapping.amount).toBe("MY_AMOUNT");
  });

  it("hydrates statusMapping when the persisted array is non-empty", () => {
    const persisted: Types.StatusMapping[] = [
      {
        rawCode: "ZZZ",
        label: "Custom",
        semantic: "success",
        color: "#000",
        badgeClass: "x",
      },
    ];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { statusMapping: persisted }, version: 0 }),
    );

    const { result } = renderTelecomUI();

    expect(result.current.statusMapping).toEqual(persisted);
  });

  it("keeps the DEFAULT_STATUS_MAPPINGS when the persisted statusMapping is an empty array", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { statusMapping: [] }, version: 0 }),
    );

    const { result } = renderTelecomUI();

    // length-guard (`persisted.statusMapping?.length`) skips the empty array.
    expect(result.current.statusMapping).toEqual(DEFAULT_STATUS_MAPPINGS);
  });

  it("ignores corrupt JSON in localStorage and uses defaults", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");

    const { result } = renderTelecomUI();

    // readPersistedUiState swallows the parse error → {} → falls back to default.
    expect(result.current.mounted).toBe(true);
    expect(result.current.mapping.transactionId).toBe(DEFAULT_MAPPING.transactionId);
    expect(result.current.statusMapping).toEqual(DEFAULT_STATUS_MAPPINGS);
  });

  it("treats a payload with no `state` wrapper as empty persisted state", () => {
    // parsed.state is undefined → readPersistedUiState returns {}.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ columnMapping: { msisdn: "X" } }));

    const { result } = renderTelecomUI();

    // The top-level columnMapping is ignored; default mapping wins.
    expect(result.current.mapping.msisdn).toBe(DEFAULT_MAPPING.msisdn);
  });
});

// ─── Persistence effects (localStorage + store sync) ─────────────────────────

describe("useTelecomUI — persistence + store sync", () => {
  it("writes the normalized mapping to localStorage and the store on mount", () => {
    renderTelecomUI();

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.columnMapping.transactionId).toBe(DEFAULT_MAPPING.transactionId);

    // Store sync effect ran with a normalized mapping.
    expect(setColumnMapping).toHaveBeenCalled();
    const lastMapping = setColumnMapping.mock.calls.at(-1)?.[0];
    expect(lastMapping.transactionId).toBe(DEFAULT_MAPPING.transactionId);
  });

  it("pushes statusMapping to localStorage and the store on mount", () => {
    renderTelecomUI();

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    expect(parsed.state.statusMapping).toEqual(DEFAULT_STATUS_MAPPINGS);
    expect(setStatusMapping).toHaveBeenCalledWith(DEFAULT_STATUS_MAPPINGS);
  });

  it("merges new writes with previously persisted state (does not clobber)", () => {
    // Seed an unrelated key the hook never touches; it must survive a write.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { statusMapping: DEFAULT_STATUS_MAPPINGS }, version: 0 }),
    );

    const { result } = renderTelecomUI();

    act(() => {
      result.current.setMapping((prev) => ({ ...prev, region: "NEW_REGION" }));
    });

    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    // The mapping write preserved the previously-persisted statusMapping.
    expect(parsed.state.statusMapping).toEqual(DEFAULT_STATUS_MAPPINGS);
    expect(parsed.state.columnMapping.region).toBe("NEW_REGION");
  });

  it("re-syncs the store whenever the mapping changes", () => {
    const { result } = renderTelecomUI();
    setColumnMapping.mockClear();

    act(() => {
      result.current.setMapping((prev) => ({ ...prev, operator: "AGENT_X" }));
    });

    expect(setColumnMapping).toHaveBeenCalledTimes(1);
    expect(setColumnMapping.mock.calls[0][0].operator).toBe("AGENT_X");
  });

  it("re-syncs the store whenever statusMapping changes", () => {
    const { result } = renderTelecomUI();
    setStatusMapping.mockClear();

    const next: Types.StatusMapping[] = [
      { rawCode: "NEW", label: "n", semantic: "other", color: "#1", badgeClass: "b" },
    ];
    act(() => {
      result.current.setStatusMapping(next);
    });

    expect(setStatusMapping).toHaveBeenLastCalledWith(next);
    expect(result.current.statusMapping).toEqual(next);
  });
});

// ─── setMapping wrapper (normalization) ──────────────────────────────────────

describe("useTelecomUI — setMapping normalization", () => {
  it("normalizes a direct (non-function) mapping value, restoring blanked critical fields", () => {
    const { result } = renderTelecomUI();

    act(() => {
      result.current.setMapping({ ...DEFAULT_MAPPING, amount: "" });
    });

    // amount is a critical field → restored to its default rather than left "".
    expect(result.current.mapping.amount).toBe(DEFAULT_MAPPING.amount);
  });

  it("normalizes a function updater's result and passes the previous mapping in", () => {
    const { result } = renderTelecomUI();

    let seenPrev: Types.ColumnMapping | null = null;
    act(() => {
      result.current.setMapping((prev) => {
        seenPrev = prev;
        return { ...prev, status: "" };
      });
    });

    expect(seenPrev).not.toBeNull();
    // status is critical → blank restored to default.
    expect(result.current.mapping.status).toBe(DEFAULT_MAPPING.status);
  });

  it("preserves an optional field left empty (not force-defaulted)", () => {
    const { result } = renderTelecomUI();

    act(() => {
      result.current.setMapping((prev) => ({ ...prev, retryCount: "" }));
    });

    // retryCount is optional → empty string survives normalization.
    expect(result.current.mapping.retryCount).toBe("");
  });

  it("keeps a non-empty custom value for a critical field", () => {
    const { result } = renderTelecomUI();

    act(() => {
      result.current.setMapping((prev) => ({ ...prev, msisdn: "PHONE" }));
    });

    expect(result.current.mapping.msisdn).toBe("PHONE");
  });
});

// ─── Simple setters ──────────────────────────────────────────────────────────

describe("useTelecomUI — simple setters", () => {
  it("toggles showMapper", () => {
    const { result } = renderTelecomUI();

    act(() => result.current.setShowMapper(true));
    expect(result.current.showMapper).toBe(true);

    act(() => result.current.setShowMapper(false));
    expect(result.current.showMapper).toBe(false);
  });

  it("sets commandOpen via its setter", () => {
    const { result } = renderTelecomUI();

    act(() => result.current.setCommandOpen(true));
    expect(result.current.commandOpen).toBe(true);
  });

  it("sets and clears installPrompt", () => {
    const { result } = renderTelecomUI();
    const evt = new Event("beforeinstallprompt");

    act(() => result.current.setInstallPrompt(evt));
    expect(result.current.installPrompt).toBe(evt);

    act(() => result.current.setInstallPrompt(null));
    expect(result.current.installPrompt).toBeNull();
  });
});

// ─── F2 — beforeinstallprompt ────────────────────────────────────────────────

describe("useTelecomUI — beforeinstallprompt (F2)", () => {
  it("captures the event, prevents default, and stores it", () => {
    const { result } = renderTelecomUI();

    const evt = new Event("beforeinstallprompt", { cancelable: true });
    const preventDefault = vi.spyOn(evt, "preventDefault");

    act(() => {
      window.dispatchEvent(evt);
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.installPrompt).toBe(evt);
  });

  it("removes the listener on unmount (no capture after teardown)", () => {
    const { result, unmount } = renderTelecomUI();
    unmount();

    act(() => {
      window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    });

    // Listener removed → state stayed at its last value (null, never set).
    expect(result.current.installPrompt).toBeNull();
  });
});

// ─── F19 — Ctrl/Cmd+K shortcut ───────────────────────────────────────────────

describe("useTelecomUI — command palette shortcut (F19)", () => {
  it("toggles commandOpen on Ctrl+K and prevents default", () => {
    const { result } = renderTelecomUI();

    const evt = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true });
    const preventDefault = vi.spyOn(evt, "preventDefault");

    act(() => document.dispatchEvent(evt));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.commandOpen).toBe(true);
  });

  it("toggles commandOpen on Cmd+K (metaKey)", () => {
    const { result } = renderTelecomUI();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });

    expect(result.current.commandOpen).toBe(true);
  });

  it("flips commandOpen back to false on a second press (toggle)", () => {
    const { result } = renderTelecomUI();

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));

    expect(result.current.commandOpen).toBe(false);
  });

  it("ignores 'k' without a modifier key", () => {
    const { result } = renderTelecomUI();

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k" })));

    expect(result.current.commandOpen).toBe(false);
  });

  it("ignores other keys held with a modifier", () => {
    const { result } = renderTelecomUI();

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true })));

    expect(result.current.commandOpen).toBe(false);
  });

  it("stops toggling after unmount (listener removed)", () => {
    const { result, unmount } = renderTelecomUI();
    unmount();

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true })));

    expect(result.current.commandOpen).toBe(false);
  });
});

// ─── F10 — BroadcastChannel cross-tab toast ──────────────────────────────────

describe("useTelecomUI — cross-tab file-loaded toast (F10)", () => {
  it("subscribes to onBroadcast and returns its unsubscribe on unmount", () => {
    const { unmount } = renderTelecomUI();

    expect(onBroadcast).toHaveBeenCalledTimes(1);
    unmount();
    expect(broadcastUnsub).toHaveBeenCalledTimes(1);
  });

  it("toasts when another tab loads a DIFFERENT file", async () => {
    renderTelecomUI({ fileNameRef: makeFileNameRef("mine.csv") });

    await act(async () => {
      broadcastHandler?.({ type: "FILE_LOADED", fileName: "other.csv" });
      // Allow the dynamic import("sonner").then(...) microtask to settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast).toHaveBeenCalledTimes(1);
    const [message, opts] = toast.mock.calls[0];
    expect(message).toContain("other.csv");
    expect(opts).toMatchObject({ description: expect.any(String) });
  });

  it("does NOT toast when the broadcast file matches the current file", async () => {
    renderTelecomUI({ fileNameRef: makeFileNameRef("same.csv") });

    await act(async () => {
      broadcastHandler?.({ type: "FILE_LOADED", fileName: "same.csv" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast).not.toHaveBeenCalled();
  });

  it("ignores broadcast messages of other types", async () => {
    renderTelecomUI({ fileNameRef: makeFileNameRef("mine.csv") });

    await act(async () => {
      broadcastHandler?.({ type: "FILTER_CHANGE", filter: {} });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast).not.toHaveBeenCalled();
  });
});

// ─── F4 — Yjs collab mapping observer ────────────────────────────────────────

describe("useTelecomUI — Yjs collab sync (F4)", () => {
  it("starts collab sync and observes the shared mapping after mount", async () => {
    renderTelecomUI();

    // The collab effect imports the module dynamically; let it resolve.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startCollabSync).toHaveBeenCalledTimes(1);
    expect(sharedMapping.observe).toHaveBeenCalledTimes(1);
  });

  it("applies shared-mapping values into local mapping when an observer fires", async () => {
    const { result } = renderTelecomUI();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      sharedMapping.set("operator", "REMOTE_OP");
      sharedMapping.__emit();
    });

    expect(result.current.mapping.operator).toBe("REMOTE_OP");
  });

  it("only overrides keys present in the shared map (undefined keys keep local value)", async () => {
    const { result } = renderTelecomUI();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const before = result.current.mapping.msisdn;

    act(() => {
      // Only set `region`; msisdn stays undefined in the shared map.
      sharedMapping.set("region", "REMOTE_REGION");
      sharedMapping.__emit();
    });

    expect(result.current.mapping.region).toBe("REMOTE_REGION");
    expect(result.current.mapping.msisdn).toBe(before);
  });

  it("restores a critical field to default when the shared map blanks it (normalize)", async () => {
    const { result } = renderTelecomUI();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      sharedMapping.set("transactionId", "");
      sharedMapping.__emit();
    });

    // Empty string IS applied (v !== undefined) but normalizeColumnMapping then
    // restores the critical default.
    expect(result.current.mapping.transactionId).toBe(DEFAULT_MAPPING.transactionId);
  });

  it("tears down collab (cleanup + unobserve) on unmount", async () => {
    const { unmount } = renderTelecomUI();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();

    expect(collabCleanup).toHaveBeenCalledTimes(1);
    expect(sharedMapping.unobserve).toHaveBeenCalledTimes(1);
  });
});
