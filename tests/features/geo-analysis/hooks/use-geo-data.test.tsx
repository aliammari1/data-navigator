import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock the single true IO boundary: DuckDB runReadOnlyQuery ──────────────────
//
// `useGeoData` composes the *real* `useDuckDBQuery` (React Query) which calls
// `runReadOnlyQuery(sql)`. We mock only that native bridge and route fixtures by
// inspecting the generated SQL, so the whole hook pipeline (SQL building →
// React Query → memoized derivations → gazetteer geocoding) runs for real.
const runReadOnlyQuery = vi.fn();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
  listRegisteredDatasets: vi.fn(async () => []),
}));

// The telecom store's persist middleware writes through the /api/settings bridge
// (a real network/IPC boundary). In jsdom that fetch fails on a relative URL and
// floods stderr. Stub the bridge to a no-op so persistence stays inert and the
// store reads/writes purely in-memory — none of the behavior under test depends
// on durable settings persistence.
vi.mock("@/platform/settings/settings-client", () => ({
  canUseSettingsApi: () => false,
  getAppSettingRemote: vi.fn(async () => ({ value: null, updatedAt: null })),
  putAppSettingRemote: vi.fn(async () => null),
  deleteAppSettingRemote: vi.fn(async () => undefined),
}));

import type { Dataset } from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import { useGeoData } from "@/features/geo-analysis/hooks/use-geo-data";
import type {
  ChannelFlowRow,
  ChannelRegionRow,
  RegionRollupRow,
} from "@/features/geo-analysis/lib/geo-sql";
import { DEFAULT_MAPPING, useTelecomStore } from "@/features/telecom/store";
import { createTestQueryClient } from "../../../test-utils";

// ─── SQL routing ────────────────────────────────────────────────────────────────
//
// The three geo SQL builders are distinguishable by stable text markers that
// live directly in their template literals (independent of column mapping):
//   - rollup  → "AS revenue"
//   - matrix  → "WITH top_regions"
//   - flow    → "HAVING COUNT(*) > 0"
function kindOf(sql: string): "rollup" | "matrix" | "flow" | "unknown" {
  if (sql.includes("WITH top_regions")) return "matrix";
  if (sql.includes("HAVING COUNT(*) > 0")) return "flow";
  if (sql.includes("AS revenue")) return "rollup";
  return "unknown";
}

interface Fixtures {
  rollup?: Partial<RegionRollupRow>[];
  matrix?: Partial<ChannelRegionRow>[];
  flow?: Partial<ChannelFlowRow>[];
  rollupError?: Error;
  matrixError?: Error;
  flowError?: Error;
}

/** Install the mock so each generated SQL returns the matching fixture. */
function installFixtures(fx: Fixtures) {
  runReadOnlyQuery.mockImplementation(async (sql: string) => {
    switch (kindOf(sql)) {
      case "rollup":
        if (fx.rollupError) throw fx.rollupError;
        return fx.rollup ?? [];
      case "matrix":
        if (fx.matrixError) throw fx.matrixError;
        return fx.matrix ?? [];
      case "flow":
        if (fx.flowError) throw fx.flowError;
        return fx.flow ?? [];
      default:
        return [];
    }
  });
}

// ─── Store helpers ──────────────────────────────────────────────────────────────

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: overrides.id ?? "ds1",
    name: overrides.name ?? "Daily Transactions",
    tableName: overrides.tableName ?? "tbl_ds1",
    viewName: overrides.viewName ?? "view_ds1",
    source: overrides.source ?? "upload",
    format: overrides.format ?? "csv",
    rowCount: overrides.rowCount ?? 100,
    colCount: overrides.colCount ?? 5,
    sizeBytes: overrides.sizeBytes ?? 2048,
    columns: overrides.columns ?? [],
    tags: overrides.tags ?? [],
    description: overrides.description ?? "",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    qualityScore: overrides.qualityScore ?? 0,
    ...overrides,
  };
}

function setStores(opts: {
  datasets?: Dataset[];
  activeDatasetId?: string | null;
}) {
  act(() => {
    useDataStore.setState({
      datasets: opts.datasets ?? [],
      activeDatasetId: opts.activeDatasetId ?? null,
    });
    // Use the default telecom mapping/status so geo-sql builders are valid.
    useTelecomStore.setState({
      columnMapping: DEFAULT_MAPPING,
      statusMapping: [],
    });
  });
}

function makeWrapper() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/** Render the hook and wait until all three queries have settled. */
async function renderGeo() {
  const { wrapper } = makeWrapper();
  const view = renderHook(() => useGeoData(), { wrapper });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  runReadOnlyQuery.mockReset();
  installFixtures({});
});

afterEach(() => {
  act(() => {
    useDataStore.setState({ datasets: [], activeDatasetId: null });
    useTelecomStore.setState({ columnMapping: DEFAULT_MAPPING, statusMapping: [] });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// No active dataset / disabled
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — no usable dataset", () => {
  it("is not ready and not loading when there is no dataset at all", async () => {
    setStores({ datasets: [], activeDatasetId: null });

    const { result } = renderHook(() => useGeoData(), { wrapper: makeWrapper().wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.datasetName).toBeNull();
    expect(result.current.regions).toEqual([]);
    expect(result.current.mappedRegions).toEqual([]);
    expect(result.current.flows).toEqual([]);
  });

  it("never calls DuckDB when no view can be resolved (queries disabled)", async () => {
    setStores({ datasets: [], activeDatasetId: null });

    renderHook(() => useGeoData(), { wrapper: makeWrapper().wrapper });
    // Give any (incorrectly) enabled query a chance to fire.
    await act(async () => {
      await Promise.resolve();
    });

    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns the EMPTY_MATRIX and zeroed totals while disabled", () => {
    setStores({ datasets: [], activeDatasetId: null });

    const { result } = renderHook(() => useGeoData(), { wrapper: makeWrapper().wrapper });

    expect(result.current.matrix).toEqual({ regions: [], channels: [], shares: [], counts: [] });
    expect(result.current.totalTransactions).toBe(0);
    expect(result.current.totalRevenue).toBe(0);
    expect(result.current.avgSuccessRate).toBe(0);
    expect(result.current.dominantChannels).toEqual([]);
    expect(result.current.channelSpread).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// Active-view resolution
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — active view + name resolution", () => {
  it("exposes the active dataset's display name even before data resolves", () => {
    setStores({
      datasets: [makeDataset({ id: "a", name: "My Telecom Report" })],
      activeDatasetId: "a",
    });

    const { result } = renderHook(() => useGeoData(), { wrapper: makeWrapper().wrapper });

    expect(result.current.datasetName).toBe("My Telecom Report");
  });

  it("falls back to the first dataset when activeDatasetId does not match", async () => {
    installFixtures({ rollup: [{ region: "Tunis", transactions: 5, revenue: 10, success: 5 }] });
    setStores({
      datasets: [makeDataset({ id: "first", name: "First" }), makeDataset({ id: "second" })],
      activeDatasetId: "ghost",
    });

    const { result } = await renderGeo();

    // useActiveView() resolves to datasets[0] when the id is unknown.
    expect(result.current.datasetName).toBe("First");
    expect(result.current.regions).toHaveLength(1);
  });

  it("uses viewName for the query when present (tableName is the fallback)", async () => {
    installFixtures({ rollup: [{ region: "Tunis", transactions: 1, revenue: 1, success: 1 }] });
    setStores({
      datasets: [makeDataset({ id: "a", viewName: "the_view", tableName: "the_table" })],
      activeDatasetId: "a",
    });

    await renderGeo();

    const rollupCalls = runReadOnlyQuery.mock.calls.filter(([sql]) => kindOf(sql) === "rollup");
    expect(rollupCalls.length).toBeGreaterThan(0);
    expect(rollupCalls[0][0]).toContain('"the_view"');
    expect(rollupCalls[0][0]).not.toContain('"the_table"');
  });

  it("falls back to tableName when viewName is empty", async () => {
    installFixtures({ rollup: [{ region: "Tunis", transactions: 1, revenue: 1, success: 1 }] });
    setStores({
      datasets: [makeDataset({ id: "a", viewName: "", tableName: "only_table" })],
      activeDatasetId: "a",
    });

    await renderGeo();

    const rollupCalls = runReadOnlyQuery.mock.calls.filter(([sql]) => kindOf(sql) === "rollup");
    expect(rollupCalls[0][0]).toContain('"only_table"');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// regions derivation + geocoding
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — regions", () => {
  it("maps rollup rows to ranked GeoRegion records and geocodes known regions", async () => {
    installFixtures({
      rollup: [
        { region: "Tunis", transactions: 100, revenue: 500, success: 80 },
        { region: "Sfax", transactions: 40, revenue: 200, success: 30 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.ready).toBe(true);
    const [tunis, sfax] = result.current.regions;

    expect(tunis.name).toBe("Tunis");
    expect(tunis.transactions).toBe(100);
    expect(tunis.revenue).toBe(500);
    // successRate = success / transactions * 100
    expect(tunis.successRate).toBeCloseTo(80, 5);
    expect(tunis.rank).toBe(1);
    // Tunis is in the gazetteer → centroid present.
    expect(tunis.lat).toBeCloseTo(36.8065, 3);
    expect(tunis.lon).toBeCloseTo(10.1815, 3);

    expect(sfax.rank).toBe(2);
    expect(sfax.successRate).toBeCloseTo(75, 5);
  });

  it("computes successRate = 0 when a region has zero transactions (no div-by-zero)", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 0, revenue: 0, success: 0 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.regions[0].successRate).toBe(0);
  });

  it("defaults the name to 'Inconnu' when region is null/undefined", async () => {
    installFixtures({
      rollup: [{ region: null as unknown as string, transactions: 3, revenue: 1, success: 1 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.regions[0].name).toBe("Inconnu");
    // "Inconnu" does not geocode.
    expect(result.current.regions[0].lat).toBeNull();
    expect(result.current.regions[0].lon).toBeNull();
  });

  it("leaves lat/lon null for an unknown (non-Tunisian) region label", async () => {
    installFixtures({
      rollup: [{ region: "Atlantis", transactions: 7, revenue: 3, success: 2 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.regions[0].lat).toBeNull();
    expect(result.current.regions[0].lon).toBeNull();
  });

  it("coerces non-finite/garbage numeric fields to 0 via safeNum", async () => {
    installFixtures({
      rollup: [
        {
          region: "Sousse",
          transactions: Number.NaN as unknown as number,
          revenue: "not-a-number" as unknown as number,
          success: 5,
        },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    const r = result.current.regions[0];
    expect(r.transactions).toBe(0);
    expect(r.revenue).toBe(0);
    // transactions coerced to 0 → successRate guarded to 0.
    expect(r.successRate).toBe(0);
  });

  it("returns an empty regions list when the rollup query yields no rows", async () => {
    installFixtures({ rollup: [] });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.regions).toEqual([]);
    // No regions → not ready even though there is no error and not loading.
    expect(result.current.ready).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// mappedRegions
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — mappedRegions", () => {
  it("includes only regions that geocoded to a centroid", async () => {
    installFixtures({
      rollup: [
        { region: "Tunis", transactions: 10, revenue: 1, success: 1 },
        { region: "Atlantis", transactions: 8, revenue: 1, success: 1 },
        { region: "Sfax", transactions: 6, revenue: 1, success: 1 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.regions).toHaveLength(3);
    expect(result.current.mappedRegions.map((r) => r.name)).toEqual(["Tunis", "Sfax"]);
  });

  it("is empty when no region geocodes", async () => {
    installFixtures({
      rollup: [{ region: "Atlantis", transactions: 3, revenue: 1, success: 1 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.mappedRegions).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// totals
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — totals", () => {
  it("sums transactions/revenue and computes the volume-weighted avg success rate", async () => {
    installFixtures({
      rollup: [
        // 100 tx @ 80% success, 100 tx @ 40% success → weighted avg = 60%
        { region: "Tunis", transactions: 100, revenue: 500, success: 80 },
        { region: "Sfax", transactions: 100, revenue: 300, success: 40 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.totalTransactions).toBe(200);
    expect(result.current.totalRevenue).toBe(800);
    expect(result.current.avgSuccessRate).toBeCloseTo(60, 5);
  });

  it("weights success by volume, not a flat mean", async () => {
    installFixtures({
      rollup: [
        // big region dominates: 900 tx @ 100%, 100 tx @ 0% → 90%, not 50%.
        { region: "Tunis", transactions: 900, revenue: 0, success: 900 },
        { region: "Sfax", transactions: 100, revenue: 0, success: 0 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.avgSuccessRate).toBeCloseTo(90, 5);
  });

  it("avgSuccessRate is 0 when total transactions are 0 (no div-by-zero)", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 0, revenue: 50, success: 0 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.totalTransactions).toBe(0);
    expect(result.current.totalRevenue).toBe(50);
    expect(result.current.avgSuccessRate).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// matrix (pivot)
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — channel/region matrix", () => {
  it("pivots tidy rows into a region×channel matrix ordered by volume", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        { region: "Tunis", channel: "USSD", transactions: 70 },
        { region: "Tunis", channel: "APP", transactions: 30 },
        { region: "Sfax", channel: "APP", transactions: 50 },
        { region: "Sfax", channel: "USSD", transactions: 10 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const m = result.current.matrix;

    // Region order by total volume: Tunis (100) before Sfax (60).
    expect(m.regions).toEqual(["Tunis", "Sfax"]);
    // Channel order by GLOBAL volume: USSD (80) before APP (80)? Tie → USSD listed
    // first because it appears first / stable sort keeps insertion order on ties.
    expect(m.channels).toEqual(["USSD", "APP"]);

    // counts indexed [regionIndex][channelIndex].
    expect(m.counts).toEqual([
      [70, 30], // Tunis: USSD, APP
      [10, 50], // Sfax: USSD, APP
    ]);
    // shares are row-normalized percentages.
    expect(m.shares[0][0]).toBeCloseTo(70, 5);
    expect(m.shares[0][1]).toBeCloseTo(30, 5);
    expect(m.shares[1][0]).toBeCloseTo((10 / 60) * 100, 5);
    expect(m.shares[1][1]).toBeCloseTo((50 / 60) * 100, 5);
  });

  it("fills missing (region,channel) cells with 0", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        { region: "Tunis", channel: "USSD", transactions: 40 },
        { region: "Sfax", channel: "APP", transactions: 20 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const m = result.current.matrix;

    expect(m.regions).toEqual(["Tunis", "Sfax"]);
    expect(m.channels).toEqual(["USSD", "APP"]);
    // Tunis has no APP, Sfax has no USSD → zero-filled.
    expect(m.counts).toEqual([
      [40, 0],
      [0, 20],
    ]);
  });

  it("emits all-zero shares for a region row whose total is 0", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        { region: "Tunis", channel: "USSD", transactions: 0 },
        { region: "Tunis", channel: "APP", transactions: 0 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const m = result.current.matrix;

    expect(m.shares).toEqual([[0, 0]]);
  });

  it("defaults null region/channel labels to 'Inconnu'/'Other' and safeNum's counts", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        {
          region: null as unknown as string,
          channel: null as unknown as string,
          transactions: "5" as unknown as number,
        },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const m = result.current.matrix;

    expect(m.regions).toEqual(["Inconnu"]);
    expect(m.channels).toEqual(["Other"]);
    expect(m.counts).toEqual([[5]]);
  });

  it("returns EMPTY_MATRIX when the matrix query yields no rows", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.matrix).toEqual({ regions: [], channels: [], shares: [], counts: [] });
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// dominantChannels
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — dominantChannels", () => {
  it("picks the highest-share channel per region with its index and pct", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        { region: "Tunis", channel: "USSD", transactions: 70 },
        { region: "Tunis", channel: "APP", transactions: 30 },
        { region: "Sfax", channel: "APP", transactions: 80 },
        { region: "Sfax", channel: "USSD", transactions: 20 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const dom = result.current.dominantChannels;

    // Channels are ordered by GLOBAL volume: APP (30+80=110) before USSD (70+20=90),
    // so the column index for APP is 0 and USSD is 1.
    expect(result.current.matrix.channels).toEqual(["APP", "USSD"]);

    expect(dom).toHaveLength(2);
    // Tunis is USSD-dominant → channel "USSD" at column index 1.
    expect(dom[0]).toMatchObject({ region: "Tunis", channel: "USSD", channelIndex: 1 });
    expect(dom[0].pct).toBeCloseTo(70, 5);
    // Sfax is APP-dominant → channel "APP" at column index 0.
    expect(dom[1]).toMatchObject({ region: "Sfax", channel: "APP", channelIndex: 0 });
    expect(dom[1].pct).toBeCloseTo(80, 5);
  });

  it("uses the first channel (index 0) when a region row is all zeros", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        { region: "Tunis", channel: "USSD", transactions: 0 },
        { region: "Tunis", channel: "APP", transactions: 0 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const dom = result.current.dominantChannels;

    // All shares 0: maxVal starts at -1, 0 > -1 at index 0, then ties keep index 0.
    expect(dom[0]).toMatchObject({ region: "Tunis", channel: "USSD", channelIndex: 0 });
    expect(dom[0].pct).toBe(0);
  });

  it("is empty when the matrix is empty", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.dominantChannels).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// channelSpread
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — channelSpread", () => {
  it("counts, per channel, regions where its share exceeds 15%, sorted desc", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        // Tunis: USSD 50%, APP 50% (both > 15)
        { region: "Tunis", channel: "USSD", transactions: 50 },
        { region: "Tunis", channel: "APP", transactions: 50 },
        // Sfax: USSD 90% (>15), APP 10% (<=15)
        { region: "Sfax", channel: "USSD", transactions: 90 },
        { region: "Sfax", channel: "APP", transactions: 10 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const spread = result.current.channelSpread;

    // USSD present >15% in both regions (2); APP only in Tunis (1).
    expect(spread).toEqual([
      { channel: "USSD", regionCount: 2 },
      { channel: "APP", regionCount: 1 },
    ]);
  });

  it("treats exactly 15% as NOT exceeding the threshold (strict > 15)", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [
        // Tunis: A=15%, B=85% → A excluded (15 is not > 15), B included.
        { region: "Tunis", channel: "A", transactions: 15 },
        { region: "Tunis", channel: "B", transactions: 85 },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const spread = result.current.channelSpread;

    const a = spread.find((s) => s.channel === "A");
    const b = spread.find((s) => s.channel === "B");
    expect(a?.regionCount).toBe(0);
    expect(b?.regionCount).toBe(1);
  });

  it("is empty when the matrix is empty", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrix: [],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.channelSpread).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// flows
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — flows", () => {
  it("maps flow rows to GeoFlow with success rate and [lon,lat] centroid for known regions", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      flow: [{ channel: "USSD", region: "Tunis", transactions: 200, success: 150 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const [flow] = result.current.flows;

    expect(flow.channel).toBe("USSD");
    expect(flow.region).toBe("Tunis");
    expect(flow.transactions).toBe(200);
    expect(flow.successRate).toBeCloseTo(75, 5);
    // `to` is [lon, lat] (note the order) for a geocoded region.
    expect(flow.to).not.toBeNull();
    expect(flow.to?.[0]).toBeCloseTo(10.1815, 3); // lon
    expect(flow.to?.[1]).toBeCloseTo(36.8065, 3); // lat
  });

  it("sets `to` to null for a region that cannot be geocoded", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      flow: [{ channel: "APP", region: "Atlantis", transactions: 10, success: 5 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.flows[0].to).toBeNull();
  });

  it("defaults channel→'Other', region→'Inconnu' and guards successRate at 0 tx", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      flow: [
        {
          channel: null as unknown as string,
          region: null as unknown as string,
          transactions: 0,
          success: 0,
        },
      ],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();
    const [flow] = result.current.flows;

    expect(flow.channel).toBe("Other");
    expect(flow.region).toBe("Inconnu");
    expect(flow.successRate).toBe(0);
    expect(flow.to).toBeNull();
  });

  it("returns an empty flows list when the flow query yields no rows", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      flow: [],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.flows).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// error + ready/loading state machine
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — error handling and ready state", () => {
  it("surfaces the rollup query error message and is not ready", async () => {
    installFixtures({ rollupError: new Error("rollup boom") });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.error).toBe("rollup boom");
    expect(result.current.ready).toBe(false);
  });

  it("surfaces the matrix error when only the matrix query fails", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      matrixError: new Error("matrix boom"),
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.error).toBe("matrix boom");
    expect(result.current.ready).toBe(false);
  });

  it("surfaces the flow error when only the flow query fails", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
      flowError: new Error("flow boom"),
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.error).toBe("flow boom");
    expect(result.current.ready).toBe(false);
  });

  it("prefers the rollup error message when multiple queries fail", async () => {
    installFixtures({
      rollupError: new Error("rollup first"),
      matrixError: new Error("matrix second"),
      flowError: new Error("flow third"),
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.error).toBe("rollup first");
  });

  it("becomes ready=true once data is present with no error and not loading", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 10, revenue: 5, success: 8 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it("error is null on the happy path", async () => {
    installFixtures({
      rollup: [{ region: "Sousse", transactions: 4, revenue: 2, success: 4 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    const { result } = await renderGeo();

    expect(result.current.error).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SQL composition wiring
// ════════════════════════════════════════════════════════════════════════════════

describe("useGeoData — SQL wiring", () => {
  it("runs exactly the three geo queries (rollup, matrix, flow) for an active view", async () => {
    installFixtures({
      rollup: [{ region: "Tunis", transactions: 1, revenue: 0, success: 0 }],
    });
    setStores({ datasets: [makeDataset({ id: "a" })], activeDatasetId: "a" });

    await renderGeo();

    const kinds = new Set(runReadOnlyQuery.mock.calls.map(([sql]) => kindOf(sql)));
    expect(kinds.has("rollup")).toBe(true);
    expect(kinds.has("matrix")).toBe(true);
    expect(kinds.has("flow")).toBe(true);
    expect(kinds.has("unknown")).toBe(false);
  });
});
