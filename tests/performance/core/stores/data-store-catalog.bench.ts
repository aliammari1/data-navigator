import { bench, describe } from "vitest";
import { useDataStore } from "@/core/stores/data-store";
import type { RegisteredDataset, RegisteredDatasetColumn } from "@/platform/duckdb/duckdb";

/**
 * Performance benchmark for catalog -> store sync.
 *
 * `replaceDatasetsFromCatalog` maps the entire DuckDB `app_datasets` catalog
 * into the UI store on every restore/refresh: per dataset it rebuilds column
 * metadata (`inferColType` per column), recomputes the quality score, merges
 * against any existing dataset, and rebuilds the `loadedTableNames` list. With a
 * large catalog (many datasets x wide schemas) this is an O(n*m) mapping pass
 * that runs synchronously on the renderer, so it is a real hot path.
 *
 * We drive the real action through `useDataStore.getState()` (no React, no
 * persistence assertions). The synthetic catalog is built ONCE at module scope
 * with a deterministic, counter-based generator (no Math.random / Date.now).
 */

// ─── Deterministic catalog generator (counter-based, index-varied) ──────────

const DUCK_TYPES = [
  "BIGINT",
  "VARCHAR",
  "DOUBLE",
  "DATE",
  "BOOLEAN",
  "DECIMAL(18,2)",
  "TIMESTAMP",
] as const;

const FIXED_CREATED_AT = "2026-01-01T00:00:00.000Z";
const FIXED_UPDATED_AT = "2026-01-02T00:00:00.000Z";

function buildColumns(count: number, datasetIdx: number): RegisteredDatasetColumn[] {
  const cols: RegisteredDatasetColumn[] = new Array(count);
  for (let c = 0; c < count; c++) {
    cols[c] = {
      name: `col_${datasetIdx}_${c}`,
      // Vary type by index so inferColType exercises every branch.
      type: DUCK_TYPES[(datasetIdx + c) % DUCK_TYPES.length],
      nullable: c % 3 === 0,
    };
  }
  return cols;
}

function buildCatalog(datasetCount: number, colsPerDataset: number): RegisteredDataset[] {
  const out: RegisteredDataset[] = new Array(datasetCount);
  for (let i = 0; i < datasetCount; i++) {
    out[i] = {
      id: `ds_${i.toString(36).padStart(6, "0")}`,
      displayName: `Dataset ${i}`,
      viewName: `view_dataset_${i}`,
      sourcePath: `C:/data/source_${i}.csv`,
      cachePath: `C:/cache/dataset_${i}.parquet`,
      // sourceFormat is normalized via normalizeFormat; vary csv/parquet/tsv.
      sourceFormat: (i % 3 === 0
        ? "csv"
        : i % 3 === 1
          ? "parquet"
          : "tsv") as RegisteredDataset["sourceFormat"],
      rowCount: 1_000 + (i % 500) * 137,
      columns: buildColumns(colsPerDataset, i),
      createdAt: FIXED_CREATED_AT,
      updatedAt: FIXED_UPDATED_AT,
    };
  }
  return out;
}

// Large catalog: 2k datasets x 24 columns => ~48k column mappings per call.
const CATALOG_2K = buildCatalog(2_000, 24);
// Wide-schema variant: fewer datasets, very wide schemas (~50k columns total).
const CATALOG_WIDE = buildCatalog(500, 100);

const replaceDatasetsFromCatalog = () => useDataStore.getState().replaceDatasetsFromCatalog;

// ─── Benchmarks ─────────────────────────────────────────────────────────────

describe("catalog -> store sync (replaceDatasetsFromCatalog)", () => {
  bench("replaceDatasetsFromCatalog: 2k datasets x 24 cols", () => {
    // Each call replaces the whole store from scratch; the previous call's
    // datasets are catalog-sourced with the same ids, exercising the merge path.
    replaceDatasetsFromCatalog()(CATALOG_2K);
  });

  bench("replaceDatasetsFromCatalog: 500 datasets x 100 cols (wide)", () => {
    replaceDatasetsFromCatalog()(CATALOG_WIDE);
  });
});
