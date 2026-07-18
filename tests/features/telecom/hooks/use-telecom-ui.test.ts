/**
 * Supplemental unit tests for src/features/telecom/hooks/use-telecom-ui.ts
 *
 * The companion .tsx file covers the main logic. This file adds coverage for the
 * two `typeof localStorage === "undefined"` early-return guards inside
 * readPersistedUiState() and writePersistedUiState() by temporarily stubbing
 * localStorage away.
 *
 * Environment: jsdom (vitest), React hooks via @testing-library/react.
 */

import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MAPPING } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";

// ─── Boundary mocks ───────────────────────────────────────────────────────────

const setColumnMapping = vi.fn();
const setStatusMapping = vi.fn();
const setCanalRule = vi.fn();

vi.mock("@/features/telecom/store", async (importActual) => {
  const actual = await importActual<typeof import("@/features/telecom/store")>();
  return {
    ...actual,
    useTelecomStore: {
      getState: () => ({ setColumnMapping, setStatusMapping, setCanalRule }),
    },
  };
});

const broadcastUnsub = vi.fn();
const onBroadcast = vi.fn((_handler: (msg: unknown) => void) => broadcastUnsub);

vi.mock("@/features/telecom/lib/channel", () => ({
  onBroadcast: (handler: (msg: unknown) => void) => onBroadcast(handler),
}));

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

// Import AFTER mocks are registered.
import { useTelecomUI } from "@/features/telecom/hooks/use-telecom-ui";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFileNameRef(value = "current.csv"): React.RefObject<string> {
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

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Restore localStorage in case a previous test stubbed it away.
  vi.unstubAllGlobals();
});

// ─── localStorage === undefined guard: readPersistedUiState (line 18) ────────

describe("useTelecomUI — readPersistedUiState localStorage undefined guard", () => {
  it("returns empty persisted state and still mounts when localStorage is undefined", () => {
    // Stub localStorage away to simulate an SSR / non-browser environment.
    vi.stubGlobal("localStorage", undefined);

    const { result } = renderTelecomUI();

    // The hook must still mount and return sane defaults despite no storage.
    expect(result.current.mounted).toBe(true);
    // Falls back to defaultMapping when persisted state cannot be read.
    expect(result.current.mapping.transactionId).toBe(DEFAULT_MAPPING.transactionId);

    vi.unstubAllGlobals();
  });

  it("setMapping does not throw when localStorage is undefined during writePersistedUiState", () => {
    // First render normally so the hook is alive with defaults.
    const { result } = renderTelecomUI();

    // Now stub localStorage away; subsequent writes must be silent no-ops.
    vi.stubGlobal("localStorage", undefined);

    let threw = false;
    try {
      act(() => {
        result.current.setMapping((prev) => ({ ...prev, region: "TEST_REGION" }));
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // The local state still updates even when the write is a no-op.
    expect(result.current.mapping.region).toBe("TEST_REGION");

    vi.unstubAllGlobals();
  });
});

// ─── writePersistedUiState localStorage undefined guard (line 32) ─────────────

describe("useTelecomUI — writePersistedUiState localStorage undefined guard", () => {
  it("statusMapping change does not throw when localStorage is undefined", () => {
    const { result } = renderTelecomUI();

    // Stub after first mount; subsequent statusMapping writes must silently bail.
    vi.stubGlobal("localStorage", undefined);

    const next: Types.StatusMapping[] = [
      { rawCode: "X", label: "x", semantic: "other", color: "#aaa", badgeClass: "cls" },
    ];

    let threw = false;
    try {
      act(() => {
        result.current.setStatusMapping(next);
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // State update still propagated to the React layer.
    expect(result.current.statusMapping).toEqual(next);

    vi.unstubAllGlobals();
  });
});

// ─── writePersistedUiState: localStorage.setItem throws (catch branch) ────────

describe("useTelecomUI — writePersistedUiState setItem throw catch branch", () => {
  it("silently swallows a localStorage.setItem error during mapping sync", () => {
    const { result } = renderTelecomUI();

    // Replace setItem with one that throws (e.g. storage quota exceeded).
    const brokenStorage = {
      ...localStorage,
      getItem: (key: string) => localStorage.getItem(key),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
      removeItem: (key: string) => localStorage.removeItem(key),
      clear: () => localStorage.clear(),
      key: (index: number) => localStorage.key(index),
      length: localStorage.length,
    };
    vi.stubGlobal("localStorage", brokenStorage);

    let threw = false;
    try {
      act(() => {
        result.current.setMapping((prev) => ({ ...prev, operator: "ERR_OP" }));
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    // The React state still updated; only the persistence was skipped.
    expect(result.current.mapping.operator).toBe("ERR_OP");

    vi.unstubAllGlobals();
  });

  it("silently swallows a localStorage.setItem error during statusMapping sync", () => {
    const { result } = renderTelecomUI();

    const brokenStorage = {
      ...localStorage,
      getItem: (key: string) => localStorage.getItem(key),
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
      removeItem: (key: string) => localStorage.removeItem(key),
      clear: () => localStorage.clear(),
      key: (index: number) => localStorage.key(index),
      length: localStorage.length,
    };
    vi.stubGlobal("localStorage", brokenStorage);

    const next: Types.StatusMapping[] = [
      { rawCode: "Y", label: "y", semantic: "success", color: "#0f0", badgeClass: "cls2" },
    ];

    let threw = false;
    try {
      act(() => {
        result.current.setStatusMapping(next);
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result.current.statusMapping).toEqual(next);

    vi.unstubAllGlobals();
  });
});
