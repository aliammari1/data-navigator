import { describe, it, expect } from "vitest";
import {
  TELECOM_TABLE_BASE,
  TELECOM_ANALYTICS_DB,
  TELECOM_ANALYTICS_STORE,
  TELECOM_SOURCE_STORE,
  TELECOM_SOURCE_META_STORE,
  TELECOM_ANALYTICS_DB_VERSION,
  TELECOM_META_VFS,
  telecomTableName,
} from "@/features/telecom/lib/names";

describe("telecom/lib/names — constants", () => {
  it("exports TELECOM_TABLE_BASE as the base table name", () => {
    expect(TELECOM_TABLE_BASE).toBe("telecom_transactions");
  });

  it("exports TELECOM_ANALYTICS_DB", () => {
    expect(TELECOM_ANALYTICS_DB).toBe("data-navigator-telecom-cache");
  });

  it("exports TELECOM_ANALYTICS_STORE", () => {
    expect(TELECOM_ANALYTICS_STORE).toBe("telecom_analytics");
  });

  it("exports TELECOM_SOURCE_STORE", () => {
    expect(TELECOM_SOURCE_STORE).toBe("telecom_source_files");
  });

  it("exports TELECOM_SOURCE_META_STORE", () => {
    expect(TELECOM_SOURCE_META_STORE).toBe("telecom_source_file_meta");
  });

  it("exports TELECOM_ANALYTICS_DB_VERSION as a number", () => {
    expect(TELECOM_ANALYTICS_DB_VERSION).toBe(4);
  });

  it("exports TELECOM_META_VFS", () => {
    expect(TELECOM_META_VFS).toBe("data-navigator-telecom-meta-idb");
  });
});

describe("telecomTableName", () => {
  it("returns the base table name when called with index 0 (explicit)", () => {
    // Branch: index === 0 → true
    expect(telecomTableName(0)).toBe("telecom_transactions");
  });

  it("returns the base table name when called with no argument (default parameter = 0)", () => {
    // Branch: default param path → index === 0 → true
    expect(telecomTableName()).toBe("telecom_transactions");
  });

  it("returns a suffixed name when called with a positive index", () => {
    // Branch: index === 0 → false → template literal
    expect(telecomTableName(1)).toBe("telecom_transactions_1");
  });

  it("returns a suffixed name for index 2", () => {
    expect(telecomTableName(2)).toBe("telecom_transactions_2");
  });

  it("returns a suffixed name for a large index", () => {
    expect(telecomTableName(99)).toBe("telecom_transactions_99");
  });
});
