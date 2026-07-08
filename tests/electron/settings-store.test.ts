import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeSettingsStore,
  configureSettingsStore,
  deleteAnalyticsSnapshotHistoryById,
  deleteSetting,
  domainForNamespace,
  exportSettings,
  getAnalyticsSnapshotHistoryById,
  getSetting,
  listAnalyticsSnapshotHistory,
  migrateLegacyAnalyticsSnapshotKV,
  migrateLegacyAppSettings,
  pruneAnalyticsSnapshotHistory,
  saveAnalyticsSnapshotHistory,
  setSetting,
} from "../../electron/settings-store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dn-settings-store-"));
  configureSettingsStore(dir);
});

afterEach(() => {
  closeSettingsStore();
  rmSync(dir, { recursive: true, force: true });
});

describe("saveAnalyticsSnapshotHistory", () => {
  it("inserts a row and returns metadata with a generated id and savedAt", () => {
    const meta = saveAnalyticsSnapshotHistory({
      tableName: "telecom_2026_07_03",
      label: "daily.csv",
      fileName: "daily.csv",
      payload: { kpi: { totalTransactions: 100 } },
    });

    expect(meta.id).toBeGreaterThan(0);
    expect(meta.tableName).toBe("telecom_2026_07_03");
    expect(meta.label).toBe("daily.csv");
    expect(meta.fileName).toBe("daily.csv");
    expect(typeof meta.savedAt).toBe("number");
    expect(meta.sizeBytes).toBeGreaterThan(0);
  });

  it("stores totalTransactions/successRate as queryable list-metadata fields", () => {
    const meta = saveAnalyticsSnapshotHistory({
      tableName: "t",
      label: "l",
      payload: {},
      totalTransactions: 128_934,
      successRate: 92.4,
    });

    expect(meta.totalTransactions).toBe(128_934);
    expect(meta.successRate).toBe(92.4);

    const [listed] = listAnalyticsSnapshotHistory("t");
    expect(listed.totalTransactions).toBe(128_934);
    expect(listed.successRate).toBe(92.4);
  });

  it("defaults totalTransactions/successRate to 0 when omitted", () => {
    const meta = saveAnalyticsSnapshotHistory({ tableName: "t", label: "l", payload: {} });
    expect(meta.totalTransactions).toBe(0);
    expect(meta.successRate).toBe(0);
  });

  it("round-trips a payload with a value shared across multiple array entries without dropping it", () => {
    const sharedRegion = { code: "TN", label: "Tunisie" };
    const canals = [
      { canal: "GAB", region: sharedRegion },
      { canal: "TPE", region: sharedRegion },
      { canal: "Agence", region: sharedRegion },
    ];

    const meta = saveAnalyticsSnapshotHistory({
      tableName: "t1",
      label: "l",
      payload: { canals },
    });

    const full = getAnalyticsSnapshotHistoryById(meta.id);
    expect(full?.payload).toEqual({ canals });
  });
});

describe("listAnalyticsSnapshotHistory", () => {
  it("returns snapshots for one table, newest first", () => {
    saveAnalyticsSnapshotHistory({ tableName: "a", label: "first", payload: {} });
    saveAnalyticsSnapshotHistory({ tableName: "a", label: "second", payload: {} });
    saveAnalyticsSnapshotHistory({ tableName: "b", label: "other-table", payload: {} });

    const rows = listAnalyticsSnapshotHistory("a");

    expect(rows.map((r) => r.label)).toEqual(["second", "first"]);
  });

  it("returns snapshots across all tables when tableName is omitted", () => {
    saveAnalyticsSnapshotHistory({ tableName: "a", label: "from-a", payload: {} });
    saveAnalyticsSnapshotHistory({ tableName: "b", label: "from-b", payload: {} });

    const rows = listAnalyticsSnapshotHistory();

    expect(rows.map((r) => r.label).sort()).toEqual(["from-a", "from-b"]);
  });

  it("respects limit and offset", () => {
    for (let i = 0; i < 5; i++) {
      saveAnalyticsSnapshotHistory({ tableName: "a", label: `s${i}`, payload: {} });
    }

    const page1 = listAnalyticsSnapshotHistory("a", 2, 0);
    const page2 = listAnalyticsSnapshotHistory("a", 2, 2);

    expect(page1.map((r) => r.label)).toEqual(["s4", "s3"]);
    expect(page2.map((r) => r.label)).toEqual(["s2", "s1"]);
  });

  it("does not include the JSON payload in list results", () => {
    saveAnalyticsSnapshotHistory({ tableName: "a", label: "s", payload: { big: "blob" } });
    const rows = listAnalyticsSnapshotHistory("a");
    expect(rows[0]).not.toHaveProperty("payload");
  });
});

describe("getAnalyticsSnapshotHistoryById", () => {
  it("returns the full row including payload", () => {
    const meta = saveAnalyticsSnapshotHistory({
      tableName: "a",
      label: "s",
      payload: { kpi: { totalTransactions: 42 } },
    });

    const full = getAnalyticsSnapshotHistoryById(meta.id);

    expect(full?.payload).toEqual({ kpi: { totalTransactions: 42 } });
  });

  it("returns undefined for a missing id", () => {
    expect(getAnalyticsSnapshotHistoryById(999_999)).toBeUndefined();
  });
});

describe("deleteAnalyticsSnapshotHistoryById", () => {
  it("removes the row so it no longer appears in list or get", () => {
    const meta = saveAnalyticsSnapshotHistory({ tableName: "a", label: "s", payload: {} });

    deleteAnalyticsSnapshotHistoryById(meta.id);

    expect(getAnalyticsSnapshotHistoryById(meta.id)).toBeUndefined();
    expect(listAnalyticsSnapshotHistory("a")).toEqual([]);
  });
});

describe("pruneAnalyticsSnapshotHistory", () => {
  it("keeps only the newest 20 snapshots per table", () => {
    for (let i = 0; i < 25; i++) {
      saveAnalyticsSnapshotHistory({ tableName: "a", label: `s${i}`, payload: {} });
    }

    const rows = listAnalyticsSnapshotHistory("a", 100);

    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.label)).toEqual(Array.from({ length: 20 }, (_, i) => `s${24 - i}`));
  });

  it("drops rows older than 90 days even under the count cap", () => {
    const veryOld = Date.now() - 200 * 24 * 60 * 60 * 1000;
    saveAnalyticsSnapshotHistory({ tableName: "a", label: "old", payload: {}, savedAt: veryOld });
    saveAnalyticsSnapshotHistory({ tableName: "a", label: "fresh", payload: {} });

    const rows = listAnalyticsSnapshotHistory("a", 100);

    expect(rows.map((r) => r.label)).toEqual(["fresh"]);
  });

  it("always keeps the single newest snapshot for a table even if it is older than 90 days", () => {
    const veryOld = Date.now() - 200 * 24 * 60 * 60 * 1000;
    const meta = saveAnalyticsSnapshotHistory({
      tableName: "a",
      label: "only-and-old",
      payload: {},
      savedAt: veryOld,
    });

    pruneAnalyticsSnapshotHistory("a");

    expect(getAnalyticsSnapshotHistoryById(meta.id)).toBeDefined();
  });

  it("does not touch other tables' snapshots", () => {
    for (let i = 0; i < 25; i++) {
      saveAnalyticsSnapshotHistory({ tableName: "a", label: `s${i}`, payload: {} });
    }
    saveAnalyticsSnapshotHistory({ tableName: "b", label: "keep-me", payload: {} });

    expect(listAnalyticsSnapshotHistory("b")).toHaveLength(1);
  });
});

describe("migrateLegacyAnalyticsSnapshotKV", () => {
  it("lifts legacy KV rows into history rows without touching the source rows", () => {
    setSetting("analytics_snapshot", "telecom_2026_07_03", {
      tableName: "telecom_2026_07_03",
      fileName: "daily.csv",
      kpi: { totalTransactions: 10 },
    });
    setSetting("analytics_snapshot", "telecom_2026_07_04", {
      tableName: "telecom_2026_07_04",
      fileName: "daily2.csv",
      kpi: { totalTransactions: 20 },
    });

    const result = migrateLegacyAnalyticsSnapshotKV();

    expect(result.migrated).toBe(2);
    const lifted = listAnalyticsSnapshotHistory("telecom_2026_07_03");
    expect(lifted).toHaveLength(1);
    expect(lifted[0].fileName).toBe("daily.csv");
    // Non-destructive: the auto-save "resume latest" cache still owns this KV row.
    expect(getSetting("analytics_snapshot", "telecom_2026_07_03").value).not.toBeNull();
  });

  it("is idempotent — a second call migrates nothing", () => {
    setSetting("analytics_snapshot", "t", { tableName: "t" });

    migrateLegacyAnalyticsSnapshotKV();
    const second = migrateLegacyAnalyticsSnapshotKV();

    expect(second.migrated).toBe(0);
  });

  it("is a no-op when there are no legacy rows", () => {
    expect(migrateLegacyAnalyticsSnapshotKV()).toEqual({ migrated: 0 });
  });

  it("falls back to the KV row's key as tableName when the value has none", () => {
    setSetting("analytics_snapshot", "fallback_key_name", { kpi: { totalTransactions: 5 } });

    migrateLegacyAnalyticsSnapshotKV();

    const lifted = listAnalyticsSnapshotHistory("fallback_key_name");
    expect(lifted).toHaveLength(1);
  });

  it("carries a numeric successRate from the KV row's kpi through to the history row", () => {
    setSetting("analytics_snapshot", "t", {
      tableName: "t",
      kpi: { totalTransactions: 10, successRate: 87.5 },
    });

    migrateLegacyAnalyticsSnapshotKV();

    const [lifted] = listAnalyticsSnapshotHistory("t");
    expect(lifted.successRate).toBe(87.5);
  });
});

describe("domainForNamespace", () => {
  it("routes the analytics_snapshot namespace to the analytics domain", () => {
    expect(domainForNamespace("analytics_snapshot")).toBe("analytics");
  });

  it("routes every other namespace to the settings domain by default", () => {
    expect(domainForNamespace("ui_prefs")).toBe("settings");
    expect(domainForNamespace("desktop_store")).toBe("settings");
    expect(domainForNamespace("")).toBe("settings");
  });
});

describe("getSetting / setSetting", () => {
  it("returns a null value and null updatedAt for an absent key", () => {
    expect(getSetting("ui_prefs", "missing")).toEqual({ value: null, updatedAt: null });
  });

  it("round-trips a value and reports an ISO updatedAt timestamp", () => {
    const updatedAt = setSetting("ui_prefs", "theme", { mode: "dark" });

    expect(new Date(updatedAt).toISOString()).toBe(updatedAt);
    expect(getSetting("ui_prefs", "theme")).toEqual({ value: { mode: "dark" }, updatedAt });
  });

  it("upserts — writing the same key twice overwrites the value", () => {
    setSetting("ui_prefs", "theme", "light");
    setSetting("ui_prefs", "theme", "dark");

    expect(getSetting("ui_prefs", "theme").value).toBe("dark");
  });
});

describe("deleteSetting", () => {
  it("removes an existing setting so it reads back as absent", () => {
    setSetting("ui_prefs", "theme", "dark");

    deleteSetting("ui_prefs", "theme");

    expect(getSetting("ui_prefs", "theme")).toEqual({ value: null, updatedAt: null });
  });

  it("is a no-op when the key does not exist", () => {
    expect(() => deleteSetting("ui_prefs", "never-set")).not.toThrow();
  });
});

describe("exportSettings", () => {
  it("scopes the export to one namespace, across a single domain, when given", () => {
    setSetting("ui_prefs", "theme", "dark");
    setSetting("ui_prefs", "locale", "fr");
    setSetting("other_ns", "x", 1);

    const exported = exportSettings("ui_prefs");

    expect(exported).toEqual({ ui_prefs: { theme: "dark", locale: "fr" } });
  });

  it("exports both the settings and analytics domains when no namespace is given", () => {
    setSetting("ui_prefs", "theme", "dark");
    setSetting("analytics_snapshot", "t1", { tableName: "t1" });

    const exported = exportSettings();

    expect(exported).toEqual({
      ui_prefs: { theme: "dark" },
      analytics_snapshot: { t1: { tableName: "t1" } },
    });
  });

  it("returns an empty object when nothing has been saved", () => {
    expect(exportSettings()).toEqual({});
  });
});

describe("migrateLegacyAppSettings", () => {
  function makeLegacyAuthDb(
    rows: Array<{ namespace: string; key: string; value: string }>,
  ): string {
    const dbPath = path.join(dir, "legacy-auth.db");
    const db = new Database(dbPath);
    db.exec(
      "CREATE TABLE app_setting (namespace text NOT NULL, key text NOT NULL, value text NOT NULL)",
    );
    const insert = db.prepare("INSERT INTO app_setting (namespace, key, value) VALUES (?, ?, ?)");
    for (const row of rows) insert.run(row.namespace, row.key, row.value);
    db.close();
    return dbPath;
  }

  it("is a no-op (returns migrated:0) when the auth DB file does not exist", () => {
    const result = migrateLegacyAppSettings(path.join(dir, "does-not-exist.db"));

    expect(result).toEqual({ migrated: 0 });
  });

  it("copies rows from the legacy app_setting table, parsing JSON values", () => {
    const authDbPath = makeLegacyAuthDb([
      { namespace: "ui_prefs", key: "theme", value: JSON.stringify("dark") },
      { namespace: "ui_prefs", key: "count", value: JSON.stringify(42) },
    ]);

    const result = migrateLegacyAppSettings(authDbPath);

    expect(result).toEqual({ migrated: 2 });
    expect(getSetting("ui_prefs", "theme").value).toBe("dark");
    expect(getSetting("ui_prefs", "count").value).toBe(42);
  });

  it("falls back to the raw string when a legacy value is not valid JSON", () => {
    const authDbPath = makeLegacyAuthDb([
      { namespace: "ui_prefs", key: "raw", value: "not-json{" },
    ]);

    migrateLegacyAppSettings(authDbPath);

    expect(getSetting("ui_prefs", "raw").value).toBe("not-json{");
  });

  it("skips rows already under the migration marker namespace", () => {
    const authDbPath = makeLegacyAuthDb([
      { namespace: "__migration", key: "some_other_marker", value: JSON.stringify(true) },
      { namespace: "ui_prefs", key: "theme", value: JSON.stringify("dark") },
    ]);

    const result = migrateLegacyAppSettings(authDbPath);

    // Only the non-marker row counts; the marker-namespace row is skipped.
    expect(result).toEqual({ migrated: 1 });
  });

  it("never clobbers a key that already exists in the new store", () => {
    setSetting("ui_prefs", "theme", "already-here");
    const authDbPath = makeLegacyAuthDb([
      { namespace: "ui_prefs", key: "theme", value: JSON.stringify("legacy-value") },
    ]);

    const result = migrateLegacyAppSettings(authDbPath);

    expect(result).toEqual({ migrated: 0 });
    expect(getSetting("ui_prefs", "theme").value).toBe("already-here");
  });

  it("is idempotent — a second call migrates nothing and does not re-read the auth DB", () => {
    const authDbPath = makeLegacyAuthDb([
      { namespace: "ui_prefs", key: "theme", value: JSON.stringify("dark") },
    ]);

    migrateLegacyAppSettings(authDbPath);
    const second = migrateLegacyAppSettings(authDbPath);

    expect(second).toEqual({ migrated: 0 });
  });

  it("skips the lift and does not throw when the auth DB has no app_setting table", () => {
    const dbPath = path.join(dir, "malformed-auth.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE something_else (id integer)");
    db.close();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = migrateLegacyAppSettings(dbPath);

    expect(result).toEqual({ migrated: 0 });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("legacy app_setting lift skipped"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });
});

describe("openDomain — not configured guard", () => {
  it("throws when a store function is called before configureSettingsStore()", async () => {
    // Isolated from the shared `dir`/configureSettingsStore() in beforeEach: a
    // fresh module instance never had configureSettingsStore() called on it.
    vi.resetModules();
    const fresh = await import("../../electron/settings-store");

    expect(() => fresh.getSetting("ui_prefs", "x")).toThrow(
      "settings-store: configureSettingsStore() was not called",
    );
  });
});
