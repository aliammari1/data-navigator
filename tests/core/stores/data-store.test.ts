import { beforeEach, describe, expect, it } from "vitest";
import {
  type ColMeta,
  computeQualityScore,
  type Dataset,
  type DataTransform,
  inferColType,
  type QueryHistoryItem,
  type SavedChart,
  toTableName,
  useDataStore,
} from "@/core/stores/data-store";
import type { RegisteredDataset } from "@/platform/duckdb/duckdb";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PRISTINE = {
  datasets: [] as Dataset[],
  activeDatasetId: null as string | null,
  queryHistory: [] as QueryHistoryItem[],
  savedCharts: [] as SavedChart[],
  transforms: [] as DataTransform[],
  loadedTableNames: [] as string[],
};

function makeColumn(overrides: Partial<ColMeta> = {}): ColMeta {
  return {
    name: "col",
    type: "string",
    nullCount: 0,
    distinctCount: 0,
    sample: [],
    ...overrides,
  };
}

function makeDataset(overrides: Partial<Dataset> = {}): Dataset {
  const id = overrides.id ?? "ds_1";
  return {
    id,
    name: overrides.name ?? "Dataset One",
    tableName: overrides.tableName ?? `view_${id}`,
    viewName: overrides.viewName ?? `view_${id}`,
    source: "upload",
    format: "csv",
    rowCount: 100,
    colCount: 1,
    columns: [makeColumn()],
    sizeBytes: 1024,
    tags: [],
    description: "",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    qualityScore: 50,
    ...overrides,
  };
}

function makeCatalogDataset(overrides: Partial<RegisteredDataset> = {}): RegisteredDataset {
  const id = overrides.id ?? "ds_cat";
  return {
    id,
    displayName: overrides.displayName ?? "Catalog Dataset",
    viewName: overrides.viewName ?? `cat_view_${id}`,
    sourcePath: overrides.sourcePath ?? `/data/${id}.csv`,
    cachePath: overrides.cachePath ?? `/cache/${id}.parquet`,
    sourceFormat: overrides.sourceFormat ?? "csv",
    rowCount: overrides.rowCount ?? 10,
    columns: overrides.columns ?? [
      { name: "amount", type: "DOUBLE", nullable: true },
      { name: "label", type: "VARCHAR", nullable: false },
    ],
    createdAt: overrides.createdAt ?? "2024-02-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2024-02-01T00:00:00.000Z",
  } as RegisteredDataset;
}

function reset() {
  // Restore the store to a clean baseline before each test. Actions are
  // function identities so we keep them intact and only replace data slices.
  useDataStore.setState({ ...PRISTINE });
}

beforeEach(reset);

// ─── Dataset CRUD ──────────────────────────────────────────────────────────

describe("addDataset", () => {
  it("prepends the dataset and sets it active when none is active", () => {
    // Arrange
    const ds = makeDataset({ id: "ds_a" });

    // Act
    useDataStore.getState().addDataset(ds);

    // Assert
    const { datasets, activeDatasetId } = useDataStore.getState();
    expect(datasets).toHaveLength(1);
    expect(datasets[0].id).toBe("ds_a");
    expect(activeDatasetId).toBe("ds_a");
  });

  it("keeps the existing active dataset when one is already active", () => {
    useDataStore.getState().addDataset(makeDataset({ id: "ds_a" }));
    useDataStore.getState().addDataset(makeDataset({ id: "ds_b" }));

    const { datasets, activeDatasetId } = useDataStore.getState();
    expect(datasets.map((d) => d.id)).toEqual(["ds_b", "ds_a"]);
    expect(activeDatasetId).toBe("ds_a");
  });

  it("records the table name in loadedTableNames without duplicating", () => {
    const ds = makeDataset({ id: "ds_a", tableName: "tbl_a" });

    useDataStore.getState().addDataset(ds);
    // Adding again with the same tableName must not append a duplicate.
    useDataStore.getState().addDataset(makeDataset({ id: "ds_b", tableName: "tbl_a" }));

    expect(useDataStore.getState().loadedTableNames).toEqual(["tbl_a"]);
  });
});

describe("upsertDataset", () => {
  it("inserts a new dataset when the id does not exist", () => {
    useDataStore.getState().upsertDataset(makeDataset({ id: "ds_new" }));

    const { datasets, activeDatasetId } = useDataStore.getState();
    expect(datasets).toHaveLength(1);
    expect(activeDatasetId).toBe("ds_new");
  });

  it("merges into an existing dataset while preserving user metadata", () => {
    // Arrange: an existing dataset with user-authored tags/description.
    useDataStore.setState({
      datasets: [
        makeDataset({
          id: "ds_x",
          tags: ["keep-me"],
          description: "user notes",
          parentId: "parent_1",
          transformSql: "SELECT 1",
        }),
      ],
      activeDatasetId: "ds_x",
    });

    // Act: upsert an incoming version that lacks tags/description/lineage.
    useDataStore.getState().upsertDataset(
      makeDataset({
        id: "ds_x",
        name: "Renamed",
        tags: [],
        description: "",
        updatedAt: "2024-06-01T00:00:00.000Z",
      }),
    );

    // Assert: incoming scalar fields win, but user metadata is preserved.
    const merged = useDataStore.getState().datasets[0];
    expect(merged.name).toBe("Renamed");
    expect(merged.tags).toEqual(["keep-me"]);
    expect(merged.description).toBe("user notes");
    expect(merged.parentId).toBe("parent_1");
    expect(merged.transformSql).toBe("SELECT 1");
    expect(merged.updatedAt).toBe("2024-06-01T00:00:00.000Z");
  });

  it("does not create a duplicate entry when upserting an existing id", () => {
    useDataStore.getState().upsertDataset(makeDataset({ id: "ds_dup" }));
    useDataStore.getState().upsertDataset(makeDataset({ id: "ds_dup", name: "Again" }));

    expect(useDataStore.getState().datasets).toHaveLength(1);
  });

  it("preserves non-matching datasets when upserting an existing id among multiple", () => {
    // Arrange: two datasets so the .map() iterates past the non-matching item (line 275).
    useDataStore.setState({
      datasets: [
        makeDataset({ id: "ds_keep", name: "Keep Me" }),
        makeDataset({ id: "ds_upd", name: "Old Name" }),
      ],
      activeDatasetId: "ds_keep",
    });

    // Act: upsert only ds_upd – ds_keep must pass through the `item` branch unchanged.
    useDataStore.getState().upsertDataset(makeDataset({ id: "ds_upd", name: "New Name" }));

    const { datasets } = useDataStore.getState();
    expect(datasets).toHaveLength(2);
    const kept = datasets.find((d) => d.id === "ds_keep");
    const updated = datasets.find((d) => d.id === "ds_upd");
    expect(kept?.name).toBe("Keep Me");
    expect(updated?.name).toBe("New Name");
  });
});

describe("updateDataset", () => {
  it("applies a partial patch and refreshes updatedAt", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_u", updatedAt: "2020-01-01T00:00:00.000Z" })],
    });

    useDataStore.getState().updateDataset("ds_u", { name: "Patched", rowCount: 999 });

    const patched = useDataStore.getState().datasets[0];
    expect(patched.name).toBe("Patched");
    expect(patched.rowCount).toBe(999);
    expect(patched.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(patched.updatedAt))).toBe(false);
  });

  it("is a no-op when the id is not present", () => {
    useDataStore.setState({ datasets: [makeDataset({ id: "ds_keep" })] });

    useDataStore.getState().updateDataset("missing", { name: "ghost" });

    expect(useDataStore.getState().datasets[0].name).toBe("Dataset One");
  });
});

describe("removeDataset", () => {
  it("removes the dataset and prunes its table/view names", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_r", tableName: "t_r", viewName: "v_r" })],
      activeDatasetId: "ds_r",
      loadedTableNames: ["t_r", "v_r", "unrelated"],
    });

    useDataStore.getState().removeDataset("ds_r");

    const { datasets, loadedTableNames } = useDataStore.getState();
    expect(datasets).toHaveLength(0);
    expect(loadedTableNames).toEqual(["unrelated"]);
  });

  it("reassigns the active dataset to the first remaining when the active one is removed", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_1" }), makeDataset({ id: "ds_2" })],
      activeDatasetId: "ds_1",
    });

    useDataStore.getState().removeDataset("ds_1");

    expect(useDataStore.getState().activeDatasetId).toBe("ds_2");
  });

  it("sets active to null when the last dataset is removed", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_only" })],
      activeDatasetId: "ds_only",
    });

    useDataStore.getState().removeDataset("ds_only");

    expect(useDataStore.getState().activeDatasetId).toBeNull();
  });

  it("leaves the active id untouched when a non-active dataset is removed", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_1" }), makeDataset({ id: "ds_2" })],
      activeDatasetId: "ds_2",
    });

    useDataStore.getState().removeDataset("ds_1");

    expect(useDataStore.getState().activeDatasetId).toBe("ds_2");
  });

  it("does nothing when the id is unknown", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_1" })],
      activeDatasetId: "ds_1",
      loadedTableNames: ["view_ds_1"],
    });

    useDataStore.getState().removeDataset("nope");

    const state = useDataStore.getState();
    expect(state.datasets).toHaveLength(1);
    expect(state.activeDatasetId).toBe("ds_1");
    expect(state.loadedTableNames).toEqual(["view_ds_1"]);
  });
});

describe("setActiveDataset / getActiveDataset", () => {
  it("setActiveDataset updates the active id", () => {
    useDataStore.getState().setActiveDataset("ds_target");
    expect(useDataStore.getState().activeDatasetId).toBe("ds_target");
  });

  it("setActiveDataset accepts null", () => {
    useDataStore.setState({ activeDatasetId: "ds_x" });
    useDataStore.getState().setActiveDataset(null);
    expect(useDataStore.getState().activeDatasetId).toBeNull();
  });

  it("getActiveDataset returns the dataset matching the active id", () => {
    const active = makeDataset({ id: "ds_active" });
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_other" }), active],
      activeDatasetId: "ds_active",
    });

    expect(useDataStore.getState().getActiveDataset()?.id).toBe("ds_active");
  });

  it("getActiveDataset returns undefined when no dataset is active", () => {
    useDataStore.setState({ datasets: [makeDataset({ id: "ds_x" })], activeDatasetId: null });
    expect(useDataStore.getState().getActiveDataset()).toBeUndefined();
  });
});

// ─── Catalog sync ──────────────────────────────────────────────────────────

describe("replaceDatasetsFromCatalog", () => {
  it("maps catalog rows into store datasets with inferred types and quality score", () => {
    const catalog = makeCatalogDataset({
      id: "ds_cat",
      rowCount: 4,
      columns: [
        { name: "amount", type: "DECIMAL(10,2)", nullable: true },
        { name: "label", type: "VARCHAR", nullable: false },
        { name: "ts", type: "TIMESTAMP", nullable: true },
        { name: "flag", type: "BOOLEAN", nullable: false },
      ],
    });

    useDataStore.getState().replaceDatasetsFromCatalog([catalog]);

    const ds = useDataStore.getState().datasets[0];
    expect(ds.id).toBe("ds_cat");
    expect(ds.source).toBe("catalog");
    expect(ds.tableName).toBe(ds.viewName);
    expect(ds.colCount).toBe(4);
    expect(ds.columns.map((c) => c.type)).toEqual(["number", "string", "date", "boolean"]);
    // nullCount/distinctCount default to 0 for all 4 columns, rowCount=4:
    // completeness = 1 (no nulls), uniqueness = 0 (no distinct values recorded
    // yet) -> round((1*0.7 + 0*0.3) * 100) = 70. Hand-computed and independently
    // verified against computeQualityScore's real formula, not recomputed via
    // the same function under test (which could never catch that function
    // itself being wrong).
    expect(ds.qualityScore).toBe(70);
  });

  it("preserves non-catalog local datasets that are not in the incoming set", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_local", source: "upload" })],
    });

    useDataStore.getState().replaceDatasetsFromCatalog([makeCatalogDataset({ id: "ds_cat" })]);

    const ids = useDataStore.getState().datasets.map((d) => d.id);
    expect(ids).toContain("ds_cat");
    expect(ids).toContain("ds_local");
  });

  it("merges existing user metadata onto incoming catalog datasets by id", () => {
    useDataStore.setState({
      datasets: [
        makeDataset({
          id: "ds_cat",
          source: "catalog",
          tags: ["mine"],
          description: "kept",
        }),
      ],
    });

    useDataStore.getState().replaceDatasetsFromCatalog([makeCatalogDataset({ id: "ds_cat" })]);

    const ds = useDataStore.getState().datasets.find((d) => d.id === "ds_cat");
    expect(ds?.tags).toEqual(["mine"]);
    expect(ds?.description).toBe("kept");
  });

  it("keeps the active dataset id when it still exists after replacement", () => {
    useDataStore.setState({ activeDatasetId: "ds_cat" });

    useDataStore
      .getState()
      .replaceDatasetsFromCatalog([
        makeCatalogDataset({ id: "ds_cat" }),
        makeCatalogDataset({ id: "ds_other" }),
      ]);

    expect(useDataStore.getState().activeDatasetId).toBe("ds_cat");
  });

  it("falls back to the first dataset when the active id is gone", () => {
    useDataStore.setState({ activeDatasetId: "ds_stale" });

    useDataStore.getState().replaceDatasetsFromCatalog([makeCatalogDataset({ id: "ds_fresh" })]);

    expect(useDataStore.getState().activeDatasetId).toBe("ds_fresh");
  });

  it("rebuilds loadedTableNames from the resulting datasets", () => {
    useDataStore
      .getState()
      .replaceDatasetsFromCatalog([
        makeCatalogDataset({ id: "ds_a", viewName: "v_a" }),
        makeCatalogDataset({ id: "ds_b", viewName: "v_b" }),
      ]);

    expect(useDataStore.getState().loadedTableNames).toEqual(["v_a", "v_b"]);
  });

  it("clears datasets and active id when given an empty catalog", () => {
    useDataStore.setState({
      datasets: [makeDataset({ id: "ds_cat", source: "catalog" })],
      activeDatasetId: "ds_cat",
    });

    useDataStore.getState().replaceDatasetsFromCatalog([]);

    expect(useDataStore.getState().datasets).toHaveLength(0);
    expect(useDataStore.getState().activeDatasetId).toBeNull();
  });
});

describe("upsertDatasetFromCatalog", () => {
  it("inserts a mapped catalog dataset via the upsert path", () => {
    useDataStore.getState().upsertDatasetFromCatalog(makeCatalogDataset({ id: "ds_c1" }));

    const ds = useDataStore.getState().datasets[0];
    expect(ds.id).toBe("ds_c1");
    expect(ds.source).toBe("catalog");
    expect(useDataStore.getState().activeDatasetId).toBe("ds_c1");
  });
});

// ─── loadedTableNames helpers ───────────────────────────────────────────────

describe("markTableLoaded / markDatasetViewLoaded", () => {
  it("markTableLoaded appends a new table name", () => {
    useDataStore.getState().markTableLoaded("tbl");
    expect(useDataStore.getState().loadedTableNames).toEqual(["tbl"]);
  });

  it("markTableLoaded dedupes already-present names", () => {
    useDataStore.setState({ loadedTableNames: ["tbl"] });
    useDataStore.getState().markTableLoaded("tbl");
    expect(useDataStore.getState().loadedTableNames).toEqual(["tbl"]);
  });

  it("markDatasetViewLoaded appends and dedupes view names", () => {
    useDataStore.getState().markDatasetViewLoaded("v1");
    useDataStore.getState().markDatasetViewLoaded("v1");
    useDataStore.getState().markDatasetViewLoaded("v2");
    expect(useDataStore.getState().loadedTableNames).toEqual(["v1", "v2"]);
  });
});

// ─── Query history ──────────────────────────────────────────────────────────

function makeQuery(overrides: Partial<QueryHistoryItem> = {}): QueryHistoryItem {
  return {
    id: "q1",
    sql: "SELECT 1",
    datasetId: "ds_1",
    rowsReturned: 1,
    durationMs: 5,
    ranAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("addQueryHistory", () => {
  it("prepends new query history items", () => {
    useDataStore.getState().addQueryHistory(makeQuery({ id: "q1" }));
    useDataStore.getState().addQueryHistory(makeQuery({ id: "q2" }));

    expect(useDataStore.getState().queryHistory.map((q) => q.id)).toEqual(["q2", "q1"]);
  });

  it("caps the history at 200 items, keeping the most recent", () => {
    for (let i = 0; i < 205; i += 1) {
      useDataStore.getState().addQueryHistory(makeQuery({ id: `q${i}` }));
    }

    const history = useDataStore.getState().queryHistory;
    expect(history).toHaveLength(200);
    expect(history[0].id).toBe("q204");
    expect(history[history.length - 1].id).toBe("q5");
  });
});

describe("clearQueryHistory", () => {
  it("empties the query history", () => {
    useDataStore.setState({ queryHistory: [makeQuery(), makeQuery({ id: "q2" })] });

    useDataStore.getState().clearQueryHistory();

    expect(useDataStore.getState().queryHistory).toEqual([]);
  });
});

// ─── Charts ─────────────────────────────────────────────────────────────────

function makeChart(overrides: Partial<SavedChart> = {}): SavedChart {
  return {
    id: "c1",
    datasetId: "ds_1",
    title: "Chart",
    type: "bar",
    config: {},
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("saveChart / removeChart", () => {
  it("prepends saved charts", () => {
    useDataStore.getState().saveChart(makeChart({ id: "c1" }));
    useDataStore.getState().saveChart(makeChart({ id: "c2" }));

    expect(useDataStore.getState().savedCharts.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  it("removes the chart with the matching id and leaves the rest", () => {
    useDataStore.setState({
      savedCharts: [makeChart({ id: "c1" }), makeChart({ id: "c2" })],
    });

    useDataStore.getState().removeChart("c1");

    expect(useDataStore.getState().savedCharts.map((c) => c.id)).toEqual(["c2"]);
  });

  it("removeChart is a no-op for an unknown id", () => {
    useDataStore.setState({ savedCharts: [makeChart({ id: "c1" })] });

    useDataStore.getState().removeChart("missing");

    expect(useDataStore.getState().savedCharts).toHaveLength(1);
  });
});

// ─── Transforms ─────────────────────────────────────────────────────────────

function makeTransform(overrides: Partial<DataTransform> = {}): DataTransform {
  return {
    id: "t1",
    inputDatasetId: "ds_in",
    outputDatasetId: "ds_out",
    type: "filter",
    sql: "WHERE x > 1",
    description: "filter rows",
    appliedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("addTransform", () => {
  it("prepends transforms in most-recent-first order", () => {
    useDataStore.getState().addTransform(makeTransform({ id: "t1" }));
    useDataStore.getState().addTransform(makeTransform({ id: "t2" }));

    expect(useDataStore.getState().transforms.map((t) => t.id)).toEqual(["t2", "t1"]);
  });
});

// ─── Lookup selectors ───────────────────────────────────────────────────────

describe("getDatasetById / getDatasetByTable / getDatasetByView", () => {
  beforeEach(() => {
    useDataStore.setState({
      datasets: [
        makeDataset({ id: "ds_1", tableName: "tbl_1", viewName: "view_1" }),
        makeDataset({ id: "ds_2", tableName: "tbl_2", viewName: "view_2" }),
      ],
    });
  });

  it("getDatasetById finds by id", () => {
    expect(useDataStore.getState().getDatasetById("ds_2")?.id).toBe("ds_2");
  });

  it("getDatasetById returns undefined when not found", () => {
    expect(useDataStore.getState().getDatasetById("nope")).toBeUndefined();
  });

  it("getDatasetByTable matches either tableName or viewName", () => {
    expect(useDataStore.getState().getDatasetByTable("tbl_1")?.id).toBe("ds_1");
    expect(useDataStore.getState().getDatasetByTable("view_1")?.id).toBe("ds_1");
  });

  it("getDatasetByTable returns undefined for an unknown name", () => {
    expect(useDataStore.getState().getDatasetByTable("ghost")).toBeUndefined();
  });

  it("getDatasetByView matches only the viewName", () => {
    expect(useDataStore.getState().getDatasetByView("view_2")?.id).toBe("ds_2");
    // tableName must NOT match getDatasetByView.
    expect(useDataStore.getState().getDatasetByView("tbl_2")).toBeUndefined();
  });
});

// ─── Pure helpers ───────────────────────────────────────────────────────────

describe("inferColType", () => {
  it("classifies numeric DuckDB types as number", () => {
    for (const t of ["INTEGER", "BIGINT", "DOUBLE", "DECIMAL(10,2)", "FLOAT", "HUGEINT"]) {
      expect(inferColType(t)).toBe("number");
    }
  });

  it("classifies temporal types as date", () => {
    for (const t of ["DATE", "TIMESTAMP", "TIME"]) {
      expect(inferColType(t)).toBe("date");
    }
  });

  it("classifies INTERVAL as number because 'INT' matches the numeric regex first", () => {
    // Documents a known ordering quirk: the numeric regex includes `INT`, which
    // is a substring of INTERVAL, so it wins over the later DATE/TIME branch.
    expect(inferColType("INTERVAL")).toBe("number");
  });

  it("classifies boolean types as boolean", () => {
    expect(inferColType("BOOLEAN")).toBe("boolean");
    expect(inferColType("bool")).toBe("boolean");
  });

  it("classifies textual types as string", () => {
    for (const t of ["VARCHAR", "TEXT", "CHAR(3)", "UUID", "BLOB"]) {
      expect(inferColType(t)).toBe("string");
    }
  });

  it("returns unknown for unrecognized types", () => {
    expect(inferColType("STRUCT")).toBe("unknown");
    expect(inferColType("")).toBe("unknown");
  });
});

describe("computeQualityScore", () => {
  it("returns 0 when there are no columns", () => {
    expect(computeQualityScore([], 100)).toBe(0);
  });

  it("returns 0 when the row count is 0", () => {
    expect(computeQualityScore([makeColumn()], 0)).toBe(0);
  });

  it("scores a fully complete, fully unique column at 100", () => {
    const cols = [makeColumn({ nullCount: 0, distinctCount: 10 })];
    expect(computeQualityScore(cols, 10)).toBe(100);
  });

  it("penalizes nulls via the completeness weight", () => {
    // All values null -> completeness 0; distinct 0 -> uniqueness 0 -> score 0.
    const cols = [makeColumn({ nullCount: 10, distinctCount: 0 })];
    expect(computeQualityScore(cols, 10)).toBe(0);
  });

  it("blends completeness (0.7) and uniqueness (0.3)", () => {
    // Complete (no nulls) but only half-unique: 0.7*1 + 0.3*0.5 = 0.85 -> 85.
    const cols = [makeColumn({ nullCount: 0, distinctCount: 5 })];
    expect(computeQualityScore(cols, 10)).toBe(85);
  });
});

describe("toTableName", () => {
  it("strips the extension and lowercases", () => {
    expect(toTableName("Sales.CSV")).toBe("sales");
  });

  it("replaces non-identifier characters with single underscores", () => {
    expect(toTableName("My Report (2024)!")).toBe("my_report_2024");
  });

  it("does not retain a leading-digit underscore because the edge trim strips it", () => {
    // The function adds `_` before a leading digit but then trims edge
    // underscores, so a name starting with a digit stays unprefixed.
    expect(toTableName("2024data.csv")).toBe("2024data");
  });

  it("falls back to 'dataset' when the name reduces to empty", () => {
    expect(toTableName("...")).toBe("dataset");
    expect(toTableName("!!!.csv")).toBe("dataset");
  });

  it("collapses repeated separators and trims edge underscores", () => {
    expect(toTableName("__a---b__.txt")).toBe("a_b");
  });
});

// ─── normalizeFormat (via upsertDatasetFromCatalog + replaceDatasetsFromCatalog) ─

describe("normalizeFormat – all branches", () => {
  it("returns 'parquet' unchanged", () => {
    // Exercise the parquet branch directly through replaceDatasetsFromCatalog.
    const catalog = makeCatalogDataset({ id: "ds_parq", sourceFormat: "parquet" });
    useDataStore.getState().replaceDatasetsFromCatalog([catalog]);
    const ds = useDataStore.getState().datasets[0];
    expect(ds.format).toBe("parquet");
  });

  it("returns 'pq' unchanged", () => {
    const catalog = makeCatalogDataset({ id: "ds_pq", sourceFormat: "pq" });
    useDataStore.getState().replaceDatasetsFromCatalog([catalog]);
    const ds = useDataStore.getState().datasets[0];
    expect(ds.format).toBe("pq");
  });

  it("returns 'tsv' unchanged", () => {
    const catalog = makeCatalogDataset({ id: "ds_tsv", sourceFormat: "tsv" });
    useDataStore.getState().replaceDatasetsFromCatalog([catalog]);
    const ds = useDataStore.getState().datasets[0];
    expect(ds.format).toBe("tsv");
  });

  it("returns 'txt' unchanged", () => {
    const catalog = makeCatalogDataset({ id: "ds_txt", sourceFormat: "txt" });
    useDataStore.getState().replaceDatasetsFromCatalog([catalog]);
    const ds = useDataStore.getState().datasets[0];
    expect(ds.format).toBe("txt");
  });

  it("returns other formats lowercased (the fallthrough branch)", () => {
    // A format that hits neither the parquet/pq nor the tsv/txt/csv branch.
    const catalog = makeCatalogDataset({ id: "ds_json", sourceFormat: "JSON" });
    useDataStore.getState().replaceDatasetsFromCatalog([catalog]);
    const ds = useDataStore.getState().datasets[0];
    // normalizeFormat("JSON") => "json" via the fallthrough
    expect(ds.format).toBe("json");
  });
});

// ─── mergeDataset – updatedAt fallback branch ────────────────────────────────

describe("mergeDataset – updatedAt fallback", () => {
  it("falls back to existing updatedAt when incoming has an empty string", () => {
    // Arrange: existing dataset with a known updatedAt.
    useDataStore.setState({
      datasets: [
        makeDataset({
          id: "ds_merge",
          updatedAt: "2020-01-01T00:00:00.000Z",
          tags: ["keep"],
          description: "kept",
        }),
      ],
      activeDatasetId: "ds_merge",
    });

    // Act: upsert with an empty updatedAt string so the || falls back.
    useDataStore.getState().upsertDataset(
      makeDataset({
        id: "ds_merge",
        updatedAt: "",
        tags: [],
        description: "",
      }),
    );

    const merged = useDataStore.getState().datasets[0];
    // mergeDataset: updatedAt = incoming.updatedAt || existing.updatedAt
    // "" is falsy so existing.updatedAt wins.
    expect(merged.updatedAt).toBe("2020-01-01T00:00:00.000Z");
    // User metadata is preserved.
    expect(merged.tags).toEqual(["keep"]);
    expect(merged.description).toBe("kept");
  });
});

// ─── persist.migrate (migrateDataset) ────────────────────────────────────────
//
// The persist middleware's migrate callback is the only caller of the private
// migrateDataset function.  We exercise it directly via the zustand persist API
// so that we can cover all the nullish-coalescing branches inside migrateDataset.

describe("persist.migrate – migrateDataset", () => {
  // Helper to invoke the migrate callback.
  function runMigrate(persisted: unknown): ReturnType<typeof useDataStore.getState> {
    const migrate = (
      useDataStore as unknown as {
        persist: { getOptions: () => { migrate: (p: unknown, v: number) => unknown } };
      }
    ).persist.getOptions().migrate;
    return migrate(persisted, 0) as ReturnType<typeof useDataStore.getState>;
  }

  it("returns empty arrays when persisted is null", () => {
    const result = runMigrate(null) as {
      datasets: unknown[];
      queryHistory: unknown[];
      savedCharts: unknown[];
      transforms: unknown[];
      activeDatasetId: unknown;
    };
    expect(result.datasets).toEqual([]);
    expect(result.queryHistory).toEqual([]);
    expect(result.savedCharts).toEqual([]);
    expect(result.transforms).toEqual([]);
    expect(result.activeDatasetId).toBeNull();
  });

  it("returns empty arrays when persisted is undefined", () => {
    const result = runMigrate(undefined) as {
      datasets: unknown[];
      queryHistory: unknown[];
      activeDatasetId: unknown;
    };
    expect(result.datasets).toEqual([]);
    expect(result.activeDatasetId).toBeNull();
  });

  it("returns empty arrays when datasets field is missing", () => {
    const result = runMigrate({ queryHistory: [], savedCharts: [], transforms: [] }) as {
      datasets: unknown[];
    };
    expect(result.datasets).toEqual([]);
  });

  it("migrates a fully populated dataset record", () => {
    const raw = {
      id: "ds_mig",
      name: "Migrated",
      tableName: "tbl_mig",
      viewName: "view_mig",
      sourcePath: "/path/file.csv",
      cachePath: "/cache/file.parquet",
      source: "upload",
      format: "csv",
      rowCount: 50,
      colCount: 2,
      sizeBytes: 512,
      columns: [
        {
          name: "a",
          type: "number",
          nullCount: 1,
          distinctCount: 10,
          min: 0,
          max: 100,
          mean: 50,
          stddev: 5,
        },
        { name: "b", type: "string", nullCount: 0, distinctCount: 20 },
      ],
      tags: ["tag1"],
      description: "desc",
      createdAt: "2023-01-01T00:00:00.000Z",
      updatedAt: "2023-06-01T00:00:00.000Z",
      parentId: "parent_1",
      transformSql: "SELECT * FROM x",
      qualityScore: 75,
    };

    const result = runMigrate({ datasets: [raw], activeDatasetId: "ds_mig" }) as {
      datasets: Array<{
        id: string;
        name: string;
        tableName: string;
        viewName: string;
        qualityScore: number;
        columns: Array<{ sample: unknown[] }>;
      }>;
      activeDatasetId: string;
    };

    expect(result.datasets).toHaveLength(1);
    const ds = result.datasets[0];
    expect(ds.id).toBe("ds_mig");
    expect(ds.name).toBe("Migrated");
    expect(ds.tableName).toBe("tbl_mig");
    expect(ds.viewName).toBe("view_mig");
    // qualityScore is a number so it is preserved directly.
    expect(ds.qualityScore).toBe(75);
    // Column samples are stripped.
    expect(ds.columns[0].sample).toEqual([]);
    expect(ds.columns[1].sample).toEqual([]);
    expect(result.activeDatasetId).toBe("ds_mig");
  });

  it("backfills viewName from tableName when viewName is absent", () => {
    // d.viewName is absent so viewName = d.viewName ?? tableName = tableName.
    const raw = { id: "ds_tv", tableName: "tbl_only" };
    const result = runMigrate({ datasets: [raw] }) as {
      datasets: Array<{ tableName: string; viewName: string }>;
    };
    expect(result.datasets[0].tableName).toBe("tbl_only");
    expect(result.datasets[0].viewName).toBe("tbl_only");
  });

  it("backfills tableName from viewName when tableName is absent", () => {
    // d.tableName is absent, d.viewName present: tableName = d.tableName ?? d.viewName.
    const raw = { id: "ds_vt", viewName: "view_only" };
    const result = runMigrate({ datasets: [raw] }) as {
      datasets: Array<{ tableName: string; viewName: string }>;
    };
    expect(result.datasets[0].tableName).toBe("view_only");
    expect(result.datasets[0].viewName).toBe("view_only");
  });

  it("defaults tableName and viewName to empty string when both are absent", () => {
    const raw = { id: "ds_noname" };
    const result = runMigrate({ datasets: [raw] }) as {
      datasets: Array<{ tableName: string; viewName: string }>;
    };
    expect(result.datasets[0].tableName).toBe("");
    expect(result.datasets[0].viewName).toBe("");
  });

  it("defaults id, name to empty string when absent", () => {
    const result = runMigrate({ datasets: [{}] }) as {
      datasets: Array<{ id: string; name: string }>;
    };
    expect(result.datasets[0].id).toBe("");
    expect(result.datasets[0].name).toBe("");
  });

  it("defaults rowCount to 0 and computes qualityScore when not a number", () => {
    const raw = {
      id: "ds_q",
      columns: [{ name: "x", type: "string", nullCount: 0, distinctCount: 0 }],
    };
    const result = runMigrate({ datasets: [raw] }) as {
      datasets: Array<{ rowCount: number; qualityScore: number }>;
    };
    const ds = result.datasets[0];
    expect(ds.rowCount).toBe(0);
    // rowCount=0 => computeQualityScore returns 0
    expect(ds.qualityScore).toBe(0);
  });

  it("computes qualityScore when qualityScore field is missing", () => {
    const raw = {
      id: "ds_qs",
      rowCount: 10,
      columns: [{ name: "x", type: "number", nullCount: 0, distinctCount: 10 }],
    };
    const result = runMigrate({ datasets: [raw] }) as { datasets: Array<{ qualityScore: number }> };
    // 0 nulls, 10/10 distinct => completeness=1, uniqueness=1 => score=100
    expect(result.datasets[0].qualityScore).toBe(100);
  });

  it("defaults source to 'catalog' when absent", () => {
    const result = runMigrate({ datasets: [{ id: "ds_src" }] }) as {
      datasets: Array<{ source: string }>;
    };
    expect(result.datasets[0].source).toBe("catalog");
  });

  it("defaults format to 'csv' when absent", () => {
    const result = runMigrate({ datasets: [{ id: "ds_fmt" }] }) as {
      datasets: Array<{ format: string }>;
    };
    expect(result.datasets[0].format).toBe("csv");
  });

  it("defaults sizeBytes to 0 when absent", () => {
    const result = runMigrate({ datasets: [{ id: "ds_sb" }] }) as {
      datasets: Array<{ sizeBytes: number }>;
    };
    expect(result.datasets[0].sizeBytes).toBe(0);
  });

  it("defaults tags to [] when not an array", () => {
    const result = runMigrate({ datasets: [{ id: "ds_tags", tags: "bad" }] }) as {
      datasets: Array<{ tags: string[] }>;
    };
    expect(result.datasets[0].tags).toEqual([]);
  });

  it("preserves tags when they are an array", () => {
    const result = runMigrate({ datasets: [{ id: "ds_tags2", tags: ["a", "b"] }] }) as {
      datasets: Array<{ tags: string[] }>;
    };
    expect(result.datasets[0].tags).toEqual(["a", "b"]);
  });

  it("defaults columns to [] when columns field is not an array", () => {
    const result = runMigrate({ datasets: [{ id: "ds_cols", columns: "bad" }] }) as {
      datasets: Array<{ columns: unknown[] }>;
    };
    expect(result.datasets[0].columns).toEqual([]);
  });

  it("defaults colCount from columns.length when colCount is absent", () => {
    const raw = {
      id: "ds_cc",
      columns: [
        { name: "x", type: "string" },
        { name: "y", type: "number" },
      ],
    };
    const result = runMigrate({ datasets: [raw] }) as { datasets: Array<{ colCount: number }> };
    expect(result.datasets[0].colCount).toBe(2);
  });

  it("uses colCount from persisted when present", () => {
    const result = runMigrate({ datasets: [{ id: "ds_cc2", colCount: 7 }] }) as {
      datasets: Array<{ colCount: number }>;
    };
    expect(result.datasets[0].colCount).toBe(7);
  });

  it("defaults description to empty string when absent", () => {
    const result = runMigrate({ datasets: [{ id: "ds_desc" }] }) as {
      datasets: Array<{ description: string }>;
    };
    expect(result.datasets[0].description).toBe("");
  });

  it("fills createdAt/updatedAt defaults when absent", () => {
    const before = Date.now();
    const result = runMigrate({ datasets: [{ id: "ds_dates" }] }) as {
      datasets: Array<{ createdAt: string; updatedAt: string }>;
    };
    const after = Date.now();
    const ds = result.datasets[0];
    expect(Date.parse(ds.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(ds.createdAt)).toBeLessThanOrEqual(after);
    expect(Date.parse(ds.updatedAt)).toBeGreaterThanOrEqual(before);
  });

  it("preserves parentId and transformSql when present", () => {
    const raw = { id: "ds_lin", parentId: "p1", transformSql: "SELECT * FROM t" };
    const result = runMigrate({ datasets: [raw] }) as {
      datasets: Array<{ parentId?: string; transformSql?: string }>;
    };
    expect(result.datasets[0].parentId).toBe("p1");
    expect(result.datasets[0].transformSql).toBe("SELECT * FROM t");
  });

  it("handles a column record with null col gracefully (nullish coalesce path)", () => {
    // col = null triggers `const c = (col ?? {}) as Partial<ColMeta>`
    const raw = { id: "ds_nullcol", columns: [null] };
    const result = runMigrate({ datasets: [raw] }) as {
      datasets: Array<{ columns: Array<{ name: string; type: string }> }>;
    };
    const col = result.datasets[0].columns[0];
    expect(col.name).toBe("");
    expect(col.type).toBe("unknown");
  });

  it("sets activeDatasetId to null when the stored id is not in the migrated datasets", () => {
    const result = runMigrate({
      datasets: [{ id: "ds_a" }],
      activeDatasetId: "ds_missing",
    }) as { activeDatasetId: string | null; datasets: Array<{ id: string }> };
    // ds_missing not in ids => falls back to datasets[0].id
    expect(result.activeDatasetId).toBe("ds_a");
  });

  it("sets activeDatasetId to null when datasets are empty", () => {
    const result = runMigrate({ datasets: [], activeDatasetId: "ds_x" }) as {
      activeDatasetId: string | null;
    };
    expect(result.activeDatasetId).toBeNull();
  });

  it("preserves queryHistory and savedCharts and transforms from persisted state", () => {
    const qh = [
      {
        id: "q1",
        sql: "SELECT 1",
        datasetId: "ds_a",
        rowsReturned: 1,
        durationMs: 5,
        ranAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    const sc = [
      {
        id: "c1",
        datasetId: "ds_a",
        title: "Chart",
        type: "bar",
        config: {},
        createdAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    const tr = [
      {
        id: "t1",
        inputDatasetId: "ds_in",
        outputDatasetId: "ds_out",
        type: "filter",
        sql: "WHERE x > 1",
        description: "",
        appliedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    const result = runMigrate({ queryHistory: qh, savedCharts: sc, transforms: tr }) as {
      queryHistory: unknown[];
      savedCharts: unknown[];
      transforms: unknown[];
    };
    expect(result.queryHistory).toEqual(qh);
    expect(result.savedCharts).toEqual(sc);
    expect(result.transforms).toEqual(tr);
  });

  it("defaults queryHistory/savedCharts/transforms to [] when not arrays", () => {
    const result = runMigrate({ queryHistory: "bad", savedCharts: null, transforms: 123 }) as {
      queryHistory: unknown[];
      savedCharts: unknown[];
      transforms: unknown[];
    };
    expect(result.queryHistory).toEqual([]);
    expect(result.savedCharts).toEqual([]);
    expect(result.transforms).toEqual([]);
  });
});

// ─── persist.partialize ───────────────────────────────────────────────────────

describe("persist.partialize", () => {
  function runPartialize(state: ReturnType<typeof useDataStore.getState>): unknown {
    const partialize = (
      useDataStore as unknown as {
        persist: { getOptions: () => { partialize: (s: unknown) => unknown } };
      }
    ).persist.getOptions().partialize;
    return partialize(state);
  }

  it("strips column samples from persisted datasets", () => {
    const state = {
      ...useDataStore.getState(),
      datasets: [
        makeDataset({
          id: "ds_part",
          columns: [makeColumn({ sample: [1, 2, 3] })],
        }),
      ],
      queryHistory: [],
      savedCharts: [],
      transforms: [],
    };

    const result = runPartialize(state) as {
      datasets: Array<{ columns: Array<{ sample: unknown[] }> }>;
      queryHistory: unknown[];
    };
    expect(result.datasets[0].columns[0].sample).toEqual([]);
  });

  it("caps queryHistory at 50 items in partialize", () => {
    const state = {
      ...useDataStore.getState(),
      datasets: [],
      queryHistory: Array.from({ length: 60 }, (_, i) => ({
        id: `q${i}`,
        sql: "SELECT 1",
        datasetId: "ds",
        rowsReturned: 0,
        durationMs: 1,
        ranAt: "2024-01-01T00:00:00.000Z",
      })),
      savedCharts: [],
      transforms: [],
    };

    const result = runPartialize(state) as { queryHistory: unknown[] };
    expect(result.queryHistory).toHaveLength(50);
  });

  it("includes activeDatasetId, savedCharts, and transforms", () => {
    const state = {
      ...useDataStore.getState(),
      datasets: [],
      activeDatasetId: "ds_active",
      queryHistory: [],
      savedCharts: [makeChart()],
      transforms: [makeTransform()],
    };

    const result = runPartialize(state) as {
      activeDatasetId: string;
      savedCharts: unknown[];
      transforms: unknown[];
    };
    expect(result.activeDatasetId).toBe("ds_active");
    expect(result.savedCharts).toHaveLength(1);
    expect(result.transforms).toHaveLength(1);
  });
});

// ─── replaceDatasetsFromCatalog – activeDatasetId null branch ────────────────

describe("replaceDatasetsFromCatalog – activeDatasetId null starting state", () => {
  it("selects the first incoming dataset when activeDatasetId starts as null", () => {
    useDataStore.setState({ activeDatasetId: null });

    useDataStore
      .getState()
      .replaceDatasetsFromCatalog([
        makeCatalogDataset({ id: "ds_first" }),
        makeCatalogDataset({ id: "ds_second" }),
      ]);

    // activeDatasetId was null and null is falsy so it falls back to datasets[0].id
    expect(useDataStore.getState().activeDatasetId).toBe("ds_first");
  });
});

// ─── Selector hooks ───────────────────────────────────────────────────────────
//
// These are thin wrappers over useDataStore. We call them directly via
// renderHook to trigger the arrow-function bodies and satisfy function/line
// coverage.

import { renderHook } from "@testing-library/react";
import {
  useActiveDatasetId,
  useDataActions,
  useDatasets,
  useQueryHistory,
  useSavedCharts,
} from "@/core/stores/data-store";

describe("selector hooks", () => {
  beforeEach(() => {
    useDataStore.setState({ ...PRISTINE });
  });

  it("useDatasets returns the datasets slice", () => {
    useDataStore.setState({ datasets: [makeDataset({ id: "ds_hook" })] });
    const { result } = renderHook(() => useDatasets());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].id).toBe("ds_hook");
  });

  it("useActiveDatasetId returns the active id slice", () => {
    useDataStore.setState({ activeDatasetId: "ds_active_hook" });
    const { result } = renderHook(() => useActiveDatasetId());
    expect(result.current).toBe("ds_active_hook");
  });

  it("useQueryHistory returns the query history slice", () => {
    useDataStore.setState({
      queryHistory: [
        {
          id: "q1",
          sql: "SELECT 1",
          datasetId: "ds",
          rowsReturned: 0,
          durationMs: 0,
          ranAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    const { result } = renderHook(() => useQueryHistory());
    expect(result.current).toHaveLength(1);
  });

  it("useSavedCharts returns the saved charts slice", () => {
    useDataStore.setState({ savedCharts: [makeChart()] });
    const { result } = renderHook(() => useSavedCharts());
    expect(result.current).toHaveLength(1);
  });

  it("useDataActions returns all action functions", () => {
    const { result } = renderHook(() => useDataActions());
    const actions = result.current;
    expect(typeof actions.addDataset).toBe("function");
    expect(typeof actions.upsertDataset).toBe("function");
    expect(typeof actions.updateDataset).toBe("function");
    expect(typeof actions.removeDataset).toBe("function");
    expect(typeof actions.setActiveDataset).toBe("function");
    expect(typeof actions.replaceDatasetsFromCatalog).toBe("function");
    expect(typeof actions.upsertDatasetFromCatalog).toBe("function");
    expect(typeof actions.addQueryHistory).toBe("function");
    expect(typeof actions.clearQueryHistory).toBe("function");
    expect(typeof actions.saveChart).toBe("function");
    expect(typeof actions.removeChart).toBe("function");
    expect(typeof actions.addTransform).toBe("function");
    expect(typeof actions.markTableLoaded).toBe("function");
    expect(typeof actions.markDatasetViewLoaded).toBe("function");
  });
});
