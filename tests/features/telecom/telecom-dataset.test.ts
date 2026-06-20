import { describe, expect, it } from "vitest";
import {
  buildDatasetTags,
  extractReportDateFromName,
  getDatasetReportDate,
  getMissingTelecomColumns,
  getTelecomDatasetProfile,
  hasTelecomRequiredColumns,
  isTelecomDataset,
  normalizeColumnName,
  TELECOM_REQUIRED_COLUMNS,
} from "@/features/telecom/lib/telecom-dataset";

// A column set that satisfies every required telecom column.
const fullColumns = () => TELECOM_REQUIRED_COLUMNS.map((name) => ({ name }));

describe("normalizeColumnName", () => {
  it("trims and upper-cases the name", () => {
    expect(normalizeColumnName("  account_id ")).toBe("ACCOUNT_ID");
  });
});

describe("hasTelecomRequiredColumns", () => {
  it("returns true when all required columns are present", () => {
    expect(hasTelecomRequiredColumns(fullColumns())).toBe(true);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const cols = TELECOM_REQUIRED_COLUMNS.map((name) => ({
      name: ` ${name.toLowerCase()} `,
    }));
    expect(hasTelecomRequiredColumns(cols)).toBe(true);
  });

  it("returns false when a required column is missing", () => {
    const cols = fullColumns().filter((c) => c.name !== "TRANSACTION_ID");
    expect(hasTelecomRequiredColumns(cols)).toBe(false);
  });

  it("returns false for an empty column list", () => {
    expect(hasTelecomRequiredColumns([])).toBe(false);
  });

  it("tolerates extra unrelated columns", () => {
    expect(hasTelecomRequiredColumns([...fullColumns(), { name: "EXTRA" }])).toBe(true);
  });
});

describe("getMissingTelecomColumns", () => {
  it("returns an empty array when nothing is missing", () => {
    expect(getMissingTelecomColumns(fullColumns())).toEqual([]);
  });

  it("lists exactly the columns that are absent", () => {
    const cols = fullColumns().filter((c) => c.name !== "BRAND_D" && c.name !== "CHANNEL");
    const missing = getMissingTelecomColumns(cols);
    expect(missing).toContain("BRAND_D");
    expect(missing).toContain("CHANNEL");
    expect(missing).toHaveLength(2);
  });

  it("returns all required columns when none are present", () => {
    expect(getMissingTelecomColumns([])).toEqual(TELECOM_REQUIRED_COLUMNS);
  });
});

describe("extractReportDateFromName", () => {
  it("parses an 8-digit YYYYMMDD token into an ISO date", () => {
    expect(extractReportDateFromName("DailyTransactions_20260616.csv")).toBe("2026-06-16");
  });

  it("returns an empty string when no 8-digit token is present", () => {
    expect(extractReportDateFromName("report.csv")).toBe("");
  });

  it("uses the first 8-digit run when several numbers exist", () => {
    expect(extractReportDateFromName("v2_20260101_batch_99.csv")).toBe("2026-01-01");
  });

  it("returns an empty string for a name with too few digits", () => {
    expect(extractReportDateFromName("file_2026.csv")).toBe("");
  });
});

describe("buildDatasetTags", () => {
  it("tags a telecom-compatible file with telecom + report-date tags", () => {
    const tags = buildDatasetTags({
      columns: fullColumns(),
      fileName: "DailyTransactions_20260616.csv",
      telecomMode: false,
    });
    expect(tags).toContain("telecom");
    expect(tags).toContain("daily-transactions");
    expect(tags).toContain("report-date:2026-06-16");
  });

  it("returns no tags for an unrelated file when telecom mode is off", () => {
    expect(
      buildDatasetTags({
        columns: [{ name: "FOO" }] as never,
        fileName: "misc.csv",
        telecomMode: false,
      }),
    ).toEqual([]);
  });

  it("emits a report-date tag in telecom mode even when columns do not qualify", () => {
    const tags = buildDatasetTags({
      columns: [{ name: "FOO" }] as never,
      fileName: "x_20260616.csv",
      telecomMode: true,
    });
    expect(tags).toContain("report-date:2026-06-16");
    expect(tags).not.toContain("telecom");
  });

  it("omits the report-date tag when the name has no date", () => {
    const tags = buildDatasetTags({
      columns: fullColumns() as never,
      fileName: "DailyTransactions.csv",
      telecomMode: false,
    });
    expect(tags).toContain("telecom");
    expect(tags.some((t) => t.startsWith("report-date:"))).toBe(false);
  });
});

describe("getTelecomDatasetProfile", () => {
  it("reports compatibility, date, missing columns and a description for a valid set", () => {
    const profile = getTelecomDatasetProfile({
      columns: fullColumns() as never,
      fileName: "DailyTransactions_20260616.csv",
      telecomMode: false,
    });
    expect(profile.compatible).toBe(true);
    expect(profile.reportDate).toBe("2026-06-16");
    expect(profile.missingColumns).toEqual([]);
    expect(profile.description).toBeTruthy();
  });

  it("blanks the description and lists missing columns for an incompatible set", () => {
    const profile = getTelecomDatasetProfile({
      columns: [{ name: "ACCOUNT_ID" }] as never,
      fileName: "x.csv",
      telecomMode: false,
    });
    expect(profile.compatible).toBe(false);
    expect(profile.description).toBe("");
    expect(profile.missingColumns.length).toBeGreaterThan(0);
  });
});

describe("isTelecomDataset", () => {
  it("returns true when the dataset carries the telecom tag", () => {
    const ds = { tags: ["telecom"], columns: [], name: "x" } as never;
    expect(isTelecomDataset(ds)).toBe(true);
  });

  it("returns true when columns satisfy the requirement even without a tag", () => {
    const ds = { tags: [], columns: fullColumns(), name: "x" } as never;
    expect(isTelecomDataset(ds)).toBe(true);
  });

  it("returns false when neither the tag nor the columns qualify", () => {
    const ds = { tags: ["other"], columns: [{ name: "FOO" }], name: "x" } as never;
    expect(isTelecomDataset(ds)).toBe(false);
  });
});

describe("getDatasetReportDate", () => {
  it("returns an empty string for a null/undefined dataset", () => {
    expect(getDatasetReportDate(null)).toBe("");
    expect(getDatasetReportDate(undefined)).toBe("");
  });

  it("prefers an explicit report-date tag over the file name", () => {
    const ds = {
      tags: ["report-date:2025-12-31"],
      columns: [],
      name: "DailyTransactions_20260101.csv",
    } as never;
    expect(getDatasetReportDate(ds)).toBe("2025-12-31");
  });

  it("falls back to parsing the file name when no tag is present", () => {
    const ds = { tags: [], columns: [], name: "DailyTransactions_20260616.csv" } as never;
    expect(getDatasetReportDate(ds)).toBe("2026-06-16");
  });
});
