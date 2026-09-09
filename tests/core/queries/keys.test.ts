/**
 * Unit tests for src/core/queries/keys.ts
 *
 * The module exports a single `queryKeys` constant — a nested object of
 * factory functions that return typed tuple arrays.  There are no IO
 * boundaries to mock; every function is pure.
 *
 * Strategy: call every factory function with every distinct parameter
 * combination (with-arg / without-arg / null arg / undefined arg) so that
 * every line and branch (including the `?? {}` and `?? []` / `?? 100`
 * defaults) is exercised, and assert the exact return values.
 */

import { describe, expect, it } from "vitest";
import { queryKeys } from "@/core/queries/keys";

// ── datasets ──────────────────────────────────────────────────────────────────

describe("queryKeys.datasets", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.datasets.all()).toEqual(["datasets"]);
  });

  it("lists() returns the list prefix", () => {
    expect(queryKeys.datasets.lists()).toEqual(["datasets", "list"]);
  });

  it("list() without filters appends an empty object", () => {
    expect(queryKeys.datasets.list()).toEqual(["datasets", "list", {}]);
  });

  it("list(undefined) appends an empty object (same as no arg)", () => {
    expect(queryKeys.datasets.list(undefined)).toEqual(["datasets", "list", {}]);
  });

  it("list({ source }) appends the filter object", () => {
    expect(queryKeys.datasets.list({ source: "s3" })).toEqual([
      "datasets",
      "list",
      { source: "s3" },
    ]);
  });

  it("list({ format }) appends the filter object", () => {
    expect(queryKeys.datasets.list({ format: "parquet" })).toEqual([
      "datasets",
      "list",
      { format: "parquet" },
    ]);
  });

  it("list({ source, format }) appends both filters", () => {
    expect(queryKeys.datasets.list({ source: "local", format: "csv" })).toEqual([
      "datasets",
      "list",
      { source: "local", format: "csv" },
    ]);
  });

  it("details() returns the detail prefix", () => {
    expect(queryKeys.datasets.details()).toEqual(["datasets", "detail"]);
  });

  it("detail(id) appends the id", () => {
    expect(queryKeys.datasets.detail("abc-123")).toEqual(["datasets", "detail", "abc-123"]);
  });

  it("byTable(tableName) appends byTable and the table name", () => {
    expect(queryKeys.datasets.byTable("sales")).toEqual(["datasets", "byTable", "sales"]);
  });
});

// ── queryHistory ──────────────────────────────────────────────────────────────

describe("queryKeys.queryHistory", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.queryHistory.all()).toEqual(["queryHistory"]);
  });

  it("lists() returns the list prefix", () => {
    expect(queryKeys.queryHistory.lists()).toEqual(["queryHistory", "list"]);
  });

  it("list() without datasetId appends { datasetId: undefined }", () => {
    expect(queryKeys.queryHistory.list()).toEqual([
      "queryHistory",
      "list",
      { datasetId: undefined },
    ]);
  });

  it("list(datasetId) appends the datasetId filter", () => {
    expect(queryKeys.queryHistory.list("ds-1")).toEqual([
      "queryHistory",
      "list",
      { datasetId: "ds-1" },
    ]);
  });

  it("detail(id) appends the id directly under the root", () => {
    expect(queryKeys.queryHistory.detail("hist-42")).toEqual(["queryHistory", "hist-42"]);
  });
});

// ── savedCharts ───────────────────────────────────────────────────────────────

describe("queryKeys.savedCharts", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.savedCharts.all()).toEqual(["savedCharts"]);
  });

  it("lists() returns the list prefix", () => {
    expect(queryKeys.savedCharts.lists()).toEqual(["savedCharts", "list"]);
  });

  it("list() without datasetId appends { datasetId: undefined }", () => {
    expect(queryKeys.savedCharts.list()).toEqual(["savedCharts", "list", { datasetId: undefined }]);
  });

  it("list(datasetId) appends the datasetId filter", () => {
    expect(queryKeys.savedCharts.list("ds-2")).toEqual([
      "savedCharts",
      "list",
      { datasetId: "ds-2" },
    ]);
  });

  it("detail(id) appends the id directly under the root", () => {
    expect(queryKeys.savedCharts.detail("chart-7")).toEqual(["savedCharts", "chart-7"]);
  });
});

// ── transforms ────────────────────────────────────────────────────────────────

describe("queryKeys.transforms", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.transforms.all()).toEqual(["transforms"]);
  });

  it("lists() returns the list prefix", () => {
    expect(queryKeys.transforms.lists()).toEqual(["transforms", "list"]);
  });

  it("list() without datasetId appends { datasetId: undefined }", () => {
    expect(queryKeys.transforms.list()).toEqual(["transforms", "list", { datasetId: undefined }]);
  });

  it("list(datasetId) appends the datasetId filter", () => {
    expect(queryKeys.transforms.list("ds-3")).toEqual([
      "transforms",
      "list",
      { datasetId: "ds-3" },
    ]);
  });

  it("detail(id) appends the id directly under the root", () => {
    expect(queryKeys.transforms.detail("tx-99")).toEqual(["transforms", "tx-99"]);
  });
});

// ── files ─────────────────────────────────────────────────────────────────────

describe("queryKeys.files", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.files.all()).toEqual(["files"]);
  });

  it("lists() returns the list prefix", () => {
    expect(queryKeys.files.lists()).toEqual(["files", "list"]);
  });

  it("list() without folderId appends { folderId: undefined }", () => {
    expect(queryKeys.files.list()).toEqual(["files", "list", { folderId: undefined }]);
  });

  it("list(null) appends { folderId: null }", () => {
    expect(queryKeys.files.list(null)).toEqual(["files", "list", { folderId: null }]);
  });

  it("list(folderId) appends the folderId filter", () => {
    expect(queryKeys.files.list("folder-x")).toEqual(["files", "list", { folderId: "folder-x" }]);
  });

  it("detail(id) appends the id directly under the root", () => {
    expect(queryKeys.files.detail("file-55")).toEqual(["files", "file-55"]);
  });

  it("uploadProgress(fileId) appends the uploadProgress segment and fileId", () => {
    expect(queryKeys.files.uploadProgress("upload-1")).toEqual([
      "files",
      "uploadProgress",
      "upload-1",
    ]);
  });
});

// ── folders ───────────────────────────────────────────────────────────────────

describe("queryKeys.folders", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.folders.all()).toEqual(["folders"]);
  });

  it("lists() returns the list prefix", () => {
    expect(queryKeys.folders.lists()).toEqual(["folders", "list"]);
  });

  it("list() without parentId appends { parentId: undefined }", () => {
    expect(queryKeys.folders.list()).toEqual(["folders", "list", { parentId: undefined }]);
  });

  it("list(null) appends { parentId: null }", () => {
    expect(queryKeys.folders.list(null)).toEqual(["folders", "list", { parentId: null }]);
  });

  it("list(parentId) appends the parentId filter", () => {
    expect(queryKeys.folders.list("parent-1")).toEqual([
      "folders",
      "list",
      { parentId: "parent-1" },
    ]);
  });

  it("detail(id) appends the id directly under the root", () => {
    expect(queryKeys.folders.detail("folder-88")).toEqual(["folders", "folder-88"]);
  });

  it("starred() appends the 'starred' segment", () => {
    expect(queryKeys.folders.starred()).toEqual(["folders", "starred"]);
  });

  it("datasetMap() appends the 'datasetMap' segment", () => {
    expect(queryKeys.folders.datasetMap()).toEqual(["folders", "datasetMap"]);
  });
});

// ── duckdb ────────────────────────────────────────────────────────────────────

describe("queryKeys.duckdb", () => {
  it("tables() returns the tables key", () => {
    expect(queryKeys.duckdb.tables()).toEqual(["duckdb", "tables"]);
  });

  it("query(sql) without params defaults to empty array", () => {
    expect(queryKeys.duckdb.query("SELECT 1")).toEqual(["duckdb", "query", "SELECT 1", []]);
  });

  it("query(sql, params) uses the provided params array", () => {
    expect(queryKeys.duckdb.query("SELECT $1", [42, "hello"])).toEqual([
      "duckdb",
      "query",
      "SELECT $1",
      [42, "hello"],
    ]);
  });

  it("query(sql, undefined) falls back to empty array", () => {
    expect(queryKeys.duckdb.query("SELECT 2", undefined)).toEqual([
      "duckdb",
      "query",
      "SELECT 2",
      [],
    ]);
  });

  it("schema(tableName) returns the schema key", () => {
    expect(queryKeys.duckdb.schema("orders")).toEqual(["duckdb", "schema", "orders"]);
  });

  it("preview(tableName) without limit defaults to 100", () => {
    expect(queryKeys.duckdb.preview("products")).toEqual(["duckdb", "preview", "products", 100]);
  });

  it("preview(tableName, undefined) defaults to 100", () => {
    expect(queryKeys.duckdb.preview("products", undefined)).toEqual([
      "duckdb",
      "preview",
      "products",
      100,
    ]);
  });

  it("preview(tableName, limit) uses the provided limit", () => {
    expect(queryKeys.duckdb.preview("products", 50)).toEqual(["duckdb", "preview", "products", 50]);
  });
});

// ── telecom ───────────────────────────────────────────────────────────────────

describe("queryKeys.telecom", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.telecom.all()).toEqual(["telecom"]);
  });

  it("analytics(tableName, mappingHash) builds the full key", () => {
    expect(queryKeys.telecom.analytics("transactions", "hash-abc")).toEqual([
      "telecom",
      "analytics",
      "transactions",
      "hash-abc",
    ]);
  });

  it("kpi(tableName) builds the kpi key", () => {
    expect(queryKeys.telecom.kpi("transactions")).toEqual(["telecom", "kpi", "transactions"]);
  });

  it("hourly(tableName) builds the hourly key", () => {
    expect(queryKeys.telecom.hourly("transactions")).toEqual(["telecom", "hourly", "transactions"]);
  });

  it("canals(tableName) builds the canals key", () => {
    expect(queryKeys.telecom.canals("transactions")).toEqual(["telecom", "canals", "transactions"]);
  });

  it("operators(tableName) builds the operators key", () => {
    expect(queryKeys.telecom.operators("transactions")).toEqual([
      "telecom",
      "operators",
      "transactions",
    ]);
  });

  it("regions(tableName) builds the regions key", () => {
    expect(queryKeys.telecom.regions("transactions")).toEqual([
      "telecom",
      "regions",
      "transactions",
    ]);
  });

  it("statusBreakdown(tableName) builds the statusBreakdown key", () => {
    expect(queryKeys.telecom.statusBreakdown("transactions")).toEqual([
      "telecom",
      "statusBreakdown",
      "transactions",
    ]);
  });

  it("forecast(tableName, hours) builds the forecast key", () => {
    expect(queryKeys.telecom.forecast("transactions", 24)).toEqual([
      "telecom",
      "forecast",
      "transactions",
      24,
    ]);
  });
});

// ── settings ──────────────────────────────────────────────────────────────────

describe("queryKeys.settings", () => {
  it("all() returns the base tuple", () => {
    expect(queryKeys.settings.all()).toEqual(["settings"]);
  });

  it("current() appends the 'current' segment", () => {
    expect(queryKeys.settings.current()).toEqual(["settings", "current"]);
  });
});
