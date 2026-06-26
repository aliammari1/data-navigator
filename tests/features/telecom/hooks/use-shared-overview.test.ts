import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
//
// We mock:
//   • @/features/telecom/lib/lan-collab   — readLANSettings (peer identity)
//   • @/platform/collab/collab            — sharedOverview, startCollabSync, ydoc
//
// The target module's own logic (rehydrateCanals, parseSnapshot, useSharedOverview)
// is kept REAL so every line and branch counts toward coverage.

const mockPeer = {
  id: "peer-001",
  name: "Test User",
  role: "editor" as const,
  color: "#3b82f6",
  active: true,
};

vi.mock("@/features/telecom/lib/lan-collab", () => ({
  readLANSettings: () => ({
    url: "ws://localhost:1234",
    room: "telecom-default",
    pairingCode: "",
    peer: mockPeer,
  }),
}));

// A minimal Y.Map-like double that supports get/set + observer lifecycle.
let snapshotValue: string | undefined = undefined;
const overviewObservers = new Set<() => void>();
const collabCleanup = vi.fn();
const startCollabSync = vi.fn(() => collabCleanup);
const ydocTransact = vi.fn((fn: () => void) => fn());

const sharedOverview = {
  get: vi.fn((_key: string) => snapshotValue),
  set: vi.fn((key: string, value: string) => {
    if (key === "snapshot") snapshotValue = value;
  }),
  observe: vi.fn((fn: () => void) => {
    overviewObservers.add(fn);
  }),
  unobserve: vi.fn((fn: () => void) => {
    overviewObservers.delete(fn);
  }),
  /** Test helper — fire all registered observers. */
  __emit: () => {
    for (const fn of overviewObservers) fn();
  },
};

const ydoc = {
  transact: ydocTransact,
};

vi.mock("@/platform/collab/collab", () => ({
  sharedOverview,
  startCollabSync,
  ydoc,
}));

// Import AFTER mocks are registered.
import { useSharedOverview } from "@/features/telecom/hooks/use-shared-overview";
import type * as Types from "@/features/telecom/types";
import type { ForecastPoint } from "@/platform/browser/forecast-onnx";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_KPI: Types.KPISummary = {
  totalTransactions: 500,
  successCount: 400,
  declinedCount: 80,
  refundCount: 10,
  instanceCount: 5,
  submittedCount: 5,
  successRate: 80,
  totalAmount: 1234.5,
  avgAmount: 2.47,
  avgProcessingMs: 150,
  uniqueCustomers: 200,
  peakHour: 10,
  topErrorCode: "ERR01",
};

const SAMPLE_HOURLY: Types.HourlyRow[] = [
  { hour: 9, total: 100, success: 90, declined: 10, amount: 250 },
];

const SAMPLE_STATUS: Types.StatusRow[] = [{ status: "SUCCESS", count: 400, amount: 1234 }];

const SAMPLE_FORECAST: ForecastPoint[] = [
  { hour: 11, predictedTotal: 110, predictedSuccessRate: 91, isForecast: true },
];

const SAMPLE_CANALS: Types.CanalSummary[] = [
  {
    key: "bill_payment",
    label: "Bill Payment",
    icon: () => null,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    total: 200,
    success: 150,
    declined: 30,
    refund: 10,
    instance: 8,
    submitted: 2,
    amount: 999,
    successRate: 75,
    avgAmount: 5,
    share: 20,
  },
];

/** Minimal valid snapshot from a REMOTE peer (different id). */
function makeRemoteSnapshot(overrides: Partial<{
  presenterId: string;
  kpi: Types.KPISummary | null;
}> = {}): string {
  return JSON.stringify({
    version: 1,
    presenterId: overrides.presenterId ?? "remote-peer-999",
    presenterName: "Remote User",
    updatedAt: Date.now(),
    fileName: "remote.csv",
    reportDate: "2024-01-01",
    kpi: overrides.kpi !== undefined ? overrides.kpi : SAMPLE_KPI,
    canals: [
      {
        key: "bill_payment",
        label: "Bill Payment",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        total: 200,
        success: 150,
        declined: 30,
        refund: 10,
        instance: 8,
        submitted: 2,
        amount: 999,
        successRate: 75,
        avgAmount: 5,
        share: 20,
      },
    ],
    hourly: SAMPLE_HOURLY,
    statusData: SAMPLE_STATUS,
    forecast: SAMPLE_FORECAST,
  });
}

type HookParams = Parameters<typeof useSharedOverview>[0];

function defaultParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    enabled: true,
    fileName: "local.csv",
    reportDate: "2024-01-01",
    kpi: SAMPLE_KPI,
    canals: SAMPLE_CANALS,
    hourly: SAMPLE_HOURLY,
    statusData: SAMPLE_STATUS,
    forecast: SAMPLE_FORECAST,
    ...overrides,
  };
}

function renderSharedOverview(overrides: Partial<HookParams> = {}) {
  return renderHook(() => useSharedOverview(defaultParams(overrides)));
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  snapshotValue = undefined;
  overviewObservers.clear();
  vi.clearAllMocks();
  // Re-assign the get mock to use the module-level snapshotValue variable.
  sharedOverview.get.mockImplementation((_key: string) => snapshotValue);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe("useSharedOverview — return shape", () => {
  it("returns { remoteOverview: null } when no snapshot is in the shared map", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.remoteOverview).toBeNull();
  });

  it("exposes only the remoteOverview key", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Object.keys(result.current)).toEqual(["remoteOverview"]);
  });
});

// ─── Collab lifecycle ─────────────────────────────────────────────────────────

describe("useSharedOverview — collab lifecycle", () => {
  it("starts collab sync and registers an observer after mount", async () => {
    renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startCollabSync).toHaveBeenCalledTimes(1);
    expect(sharedOverview.observe).toHaveBeenCalledTimes(1);
  });

  it("calls the cleanup and unobserves on unmount", async () => {
    const { unmount } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    unmount();

    expect(collabCleanup).toHaveBeenCalledTimes(1);
    expect(sharedOverview.unobserve).toHaveBeenCalledTimes(1);
  });

  it("reads an existing snapshot immediately on mount (initial observe call)", async () => {
    // Place a remote snapshot in the map BEFORE mount.
    snapshotValue = makeRemoteSnapshot();
    sharedOverview.get.mockReturnValue(snapshotValue);

    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The observer fires once immediately; the remote snapshot is not from our peer.
    expect(result.current.remoteOverview).not.toBeNull();
    expect(result.current.remoteOverview?.fileName).toBe("remote.csv");
  });
});

// ─── Remote snapshot consumption ─────────────────────────────────────────────

describe("useSharedOverview — remote snapshot ingestion", () => {
  it("sets remoteOverview when a valid snapshot from another peer is observed", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = makeRemoteSnapshot();
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview).not.toBeNull();
    expect(result.current.remoteOverview?.presenterId).toBe("remote-peer-999");
  });

  it("ignores a snapshot whose presenterId matches our own peer id", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      // Use LOCAL peer id — should be ignored.
      snapshotValue = makeRemoteSnapshot({ presenterId: mockPeer.id });
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview).toBeNull();
  });

  it("ignores a snapshot with version !== 1", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = JSON.stringify({
        version: 2,
        presenterId: "remote-peer-999",
        kpi: SAMPLE_KPI,
        canals: [],
        hourly: [],
        statusData: [],
        forecast: [],
      });
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview).toBeNull();
  });

  it("ignores a snapshot with missing kpi field", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = JSON.stringify({
        version: 1,
        presenterId: "remote-peer-999",
        // kpi is intentionally omitted
        canals: [],
        hourly: [],
        statusData: [],
        forecast: [],
      });
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview).toBeNull();
  });

  it("ignores invalid JSON in the shared map", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = "{not valid json}";
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview).toBeNull();
  });

  it("ignores an undefined/empty shared map value", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = undefined;
      sharedOverview.get.mockReturnValue(undefined);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview).toBeNull();
  });

  it("updates remoteOverview when the snapshot changes (second emit)", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // First remote update
    act(() => {
      snapshotValue = makeRemoteSnapshot({ presenterId: "remote-a" });
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview?.presenterId).toBe("remote-a");

    // Second remote update from a different peer
    act(() => {
      snapshotValue = makeRemoteSnapshot({ presenterId: "remote-b" });
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    expect(result.current.remoteOverview?.presenterId).toBe("remote-b");
  });
});

// ─── Canal rehydration ────────────────────────────────────────────────────────

describe("useSharedOverview — rehydrateCanals (icon injection)", () => {
  it("injects the icon from CANAL_CONFIG for a known canal key", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = makeRemoteSnapshot();
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    const canal = result.current.remoteOverview?.canals[0];
    expect(canal).toBeDefined();
    // The icon must be a React component (function or forwardRef object), not undefined/null.
    expect(canal?.icon).toBeTruthy();
    expect(["function", "object"].includes(typeof canal?.icon)).toBe(true);
  });

  it("falls back to bill_payment icon for an unknown canal key", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = JSON.stringify({
        version: 1,
        presenterId: "remote-peer-999",
        presenterName: "Remote User",
        updatedAt: Date.now(),
        fileName: "remote.csv",
        reportDate: "2024-01-01",
        kpi: SAMPLE_KPI,
        canals: [
          {
            key: "unknown_canal_key", // not in CANAL_CONFIG
            label: "Unknown",
            color: "",
            bgColor: "",
            borderColor: "",
            total: 0,
            success: 0,
            declined: 0,
            refund: 0,
            instance: 0,
            submitted: 0,
            amount: 0,
            successRate: 0,
            avgAmount: 0,
            share: 0,
          },
        ],
        hourly: [],
        statusData: [],
        forecast: [],
      });
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    const canal = result.current.remoteOverview?.canals[0];
    expect(canal).toBeDefined();
    // Falls back to CANAL_CONFIG.bill_payment.icon (function or forwardRef object)
    expect(canal?.icon).toBeTruthy();
    expect(["function", "object"].includes(typeof canal?.icon)).toBe(true);
  });

  it("preserves all other canal fields when rehydrating (spread keeps original data)", async () => {
    const { result } = renderSharedOverview();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      snapshotValue = makeRemoteSnapshot();
      sharedOverview.get.mockReturnValue(snapshotValue);
      sharedOverview.__emit();
    });

    const canal = result.current.remoteOverview?.canals[0];
    // Numeric fields survive the spread + icon injection.
    expect(canal?.total).toBe(200);
    expect(canal?.successRate).toBe(75);
    expect(canal?.key).toBe("bill_payment");
  });
});

// ─── Local snapshot publishing ────────────────────────────────────────────────

describe("useSharedOverview — local snapshot publishing", () => {
  it("publishes a snapshot to the shared map when enabled=true and kpi is set", async () => {
    renderSharedOverview({ enabled: true, kpi: SAMPLE_KPI });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // ydoc.transact must have been called to write our snapshot.
    expect(ydocTransact).toHaveBeenCalled();
    expect(sharedOverview.set).toHaveBeenCalledWith("snapshot", expect.any(String));

    const raw = sharedOverview.set.mock.calls.find((c) => c[0] === "snapshot")?.[1];
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(1);
    expect(parsed.presenterId).toBe(mockPeer.id);
    expect(parsed.presenterName).toBe(mockPeer.name);
    expect(parsed.fileName).toBe("local.csv");
    expect(parsed.kpi).toEqual(SAMPLE_KPI);
  });

  it("strips icon from canals before publishing (icon is not serializable)", async () => {
    renderSharedOverview({ enabled: true, kpi: SAMPLE_KPI, canals: SAMPLE_CANALS });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const raw = sharedOverview.set.mock.calls.find((c) => c[0] === "snapshot")?.[1];
    const parsed = JSON.parse(raw as string);
    // icon must not appear in the serialized snapshot
    expect(parsed.canals[0].icon).toBeUndefined();
    expect(parsed.canals[0].key).toBe("bill_payment");
  });

  it("does NOT publish a snapshot when enabled=false", async () => {
    renderSharedOverview({ enabled: false, kpi: SAMPLE_KPI });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // transact may be called 0 times (enabled guard)
    const setCallsForSnapshot = sharedOverview.set.mock.calls.filter((c) => c[0] === "snapshot");
    expect(setCallsForSnapshot).toHaveLength(0);
  });

  it("does NOT publish a snapshot when kpi is null", async () => {
    renderSharedOverview({ enabled: true, kpi: null });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const setCallsForSnapshot = sharedOverview.set.mock.calls.filter((c) => c[0] === "snapshot");
    expect(setCallsForSnapshot).toHaveLength(0);
  });

  it("includes updatedAt as a number in the snapshot", async () => {
    const before = Date.now();
    renderSharedOverview({ enabled: true, kpi: SAMPLE_KPI });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const raw = sharedOverview.set.mock.calls.find((c) => c[0] === "snapshot")?.[1];
    const parsed = JSON.parse(raw as string);
    expect(typeof parsed.updatedAt).toBe("number");
    expect(parsed.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("includes forecast, hourly, and statusData in the published snapshot", async () => {
    renderSharedOverview({
      enabled: true,
      kpi: SAMPLE_KPI,
      hourly: SAMPLE_HOURLY,
      statusData: SAMPLE_STATUS,
      forecast: SAMPLE_FORECAST,
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const raw = sharedOverview.set.mock.calls.find((c) => c[0] === "snapshot")?.[1];
    const parsed = JSON.parse(raw as string);
    expect(parsed.hourly).toEqual(SAMPLE_HOURLY);
    expect(parsed.statusData).toEqual(SAMPLE_STATUS);
    expect(parsed.forecast).toEqual(SAMPLE_FORECAST);
  });
});

// ─── Effect re-runs on dependency change ──────────────────────────────────────

describe("useSharedOverview — effect dependency tracking", () => {
  it("re-publishes when fileName changes", async () => {
    const { rerender } = renderHook(
      (props: Partial<HookParams>) => useSharedOverview(defaultParams(props)),
      { initialProps: { fileName: "first.csv" } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const callsBefore = sharedOverview.set.mock.calls.filter((c) => c[0] === "snapshot").length;

    rerender({ fileName: "second.csv" });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const callsAfter = sharedOverview.set.mock.calls.filter((c) => c[0] === "snapshot").length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it("re-runs sync setup when enabled changes from false to true", async () => {
    const { rerender } = renderHook(
      (props: Partial<HookParams>) => useSharedOverview(defaultParams(props)),
      { initialProps: { enabled: false } },
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Initial call when enabled=false → no snapshot write.
    const callsBefore = sharedOverview.set.mock.calls.filter((c) => c[0] === "snapshot").length;
    expect(callsBefore).toBe(0);

    rerender({ enabled: true });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now enabled=true → snapshot written.
    const callsAfter = sharedOverview.set.mock.calls.filter((c) => c[0] === "snapshot").length;
    expect(callsAfter).toBeGreaterThan(0);
  });
});

// ─── Import failure path ──────────────────────────────────────────────────────

describe("useSharedOverview — import failure graceful degradation", () => {
  it("does not throw when the collab module import fails", async () => {
    // Temporarily override the mock to reject the import.
    vi.doMock("@/platform/collab/collab", () => {
      throw new Error("Module load failed");
    });

    // The hook catches the import failure silently.
    let threw = false;
    try {
      const { result } = renderSharedOverview();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.remoteOverview).toBeNull();
    } catch {
      threw = true;
    }

    // Restore original mock
    vi.doMock("@/platform/collab/collab", () => ({
      sharedOverview,
      startCollabSync,
      ydoc,
    }));

    // Even if the underlying module mocking is complex in vitest's module cache,
    // the hook itself must not throw.
    expect(threw).toBe(false);
  });
});
