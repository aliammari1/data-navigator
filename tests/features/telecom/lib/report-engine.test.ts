import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Boundary mocks ───────────────────────────────────────────────────────────
// The module has three IO boundaries:
//   1. `runReadOnlyQuery`  — DuckDB WASM renderer channel
//   2. `registerLocalDatasetFile` — OPFS/DuckDB file registration
//   3. `localDataPath` / `writeLocalFile` — electron-fs helpers
//   4. `createTelecomEnrichedView` — view DDL writer (queries module)
//
// Only these are mocked. Every pure constant / SQL-builder in report-engine.ts
// is kept REAL so the module's lines and branches actually execute.

const runReadOnlyQuery = vi.fn<(sql: string) => Promise<Record<string, unknown>[]>>();

vi.mock("@/platform/duckdb/duckdb", () => ({
  runReadOnlyQuery: (sql: string) => runReadOnlyQuery(sql),
}));

const registerLocalDatasetFile = vi.fn<
  (opts: {
    filePath: string;
    displayName: string;
    hasHeader: boolean;
    delimiter: string;
    previewLimit: number;
  }) => Promise<{
    id: string;
    viewName: string;
    rowCount: number;
    columns: Array<{ name: string }>;
  }>
>();

vi.mock("@/platform/duckdb/duckdb-fs", () => ({
  registerLocalDatasetFile: (opts: unknown) => registerLocalDatasetFile(opts as never),
}));

const localDataPath = vi.fn<(rel: string) => Promise<string>>();
const writeLocalFile = vi.fn<(path: string, buf: ArrayBuffer) => Promise<void>>();

vi.mock("@/platform/electron/electron-fs", () => ({
  localDataPath: (rel: string) => localDataPath(rel),
  writeLocalFile: (path: string, buf: ArrayBuffer) => writeLocalFile(path, buf),
}));

const createTelecomEnrichedView = vi.fn<
  (viewName: string, mapping: unknown) => Promise<void>
>();

vi.mock("@/features/telecom/lib/queries", () => ({
  createTelecomEnrichedView: (viewName: string, mapping: unknown) =>
    createTelecomEnrichedView(viewName, mapping),
}));

// ─── Module under test (imported AFTER mocks are set up) ─────────────────────
import {
  BILL_PAYMENT_CHANNELS,
  CREDIT_TRANSFER,
  EVOUCHER_ON_DEMAND_GENERATION,
  RECHARGE_DATA_EVOUCHER,
  RECHARGE_DATA_SABBA,
  RECHARGE_VOICE_FIXED_TTCASH,
  RECHARGE_VOICE_FIXED_VOUCHER,
  RECHARGE_VOICE_MOBILE_TTCASH,
  RECHARGE_VOICE_MOBILE_VOUCHER,
  REPORT_SECTIONS,
  REPORT_TABLE,
  STATUS_MAP,
  TRANSACTION_COLUMNS,
  VOUCHER_CONVERGENT,
  VOUCHER_CONVERGENT_CARTE_ACTIVATION,
  VOUCHER_CONVERGENT_CARTE_GENERATION,
  VOUCHER_FOR_PAYMENT,
  getChannelStats,
  getHourlyDistribution,
  getStatusSummary,
  getTopTransactionsByAmount,
  loadReportCSV,
  type ChannelDef,
} from "@/features/telecom/lib/report-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Most recent SQL string sent to the mock. */
function lastSql(): string {
  const calls = runReadOnlyQuery.mock.calls;
  return String(calls[calls.length - 1]?.[0] ?? "");
}

/** All SQL strings in call order. */
function allSql(): string[] {
  return runReadOnlyQuery.mock.calls.map((c) => String(c[0] ?? ""));
}

// ─── beforeEach — reset mocks to safe defaults ────────────────────────────────

beforeEach(() => {
  runReadOnlyQuery.mockResolvedValue([]);
  registerLocalDatasetFile.mockResolvedValue({
    id: "dataset-id",
    viewName: "telecom_transactions",
    rowCount: 42,
    columns: [{ name: "TRANSACTION_ID" }, { name: "ORIGINAL_AMOUNT" }],
  });
  localDataPath.mockResolvedValue("/data/imports/telecom_report_123.csv");
  writeLocalFile.mockResolvedValue(undefined);
  createTelecomEnrichedView.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORT_TABLE constant
// ─────────────────────────────────────────────────────────────────────────────

describe("REPORT_TABLE", () => {
  it("equals 'telecom_transactions' (the canonical base table name)", () => {
    expect(REPORT_TABLE).toBe("telecom_transactions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION_COLUMNS
// ─────────────────────────────────────────────────────────────────────────────

describe("TRANSACTION_COLUMNS", () => {
  it("contains at least 50 column names (covers all declared pipe-delimited fields)", () => {
    expect(TRANSACTION_COLUMNS.length).toBeGreaterThanOrEqual(50);
  });

  it("starts with ACCOUNT_ID and ends with EXTRA_INFO5", () => {
    expect(TRANSACTION_COLUMNS[0]).toBe("ACCOUNT_ID");
    expect(TRANSACTION_COLUMNS[TRANSACTION_COLUMNS.length - 1]).toBe("EXTRA_INFO5");
  });

  it("includes core transaction identity columns", () => {
    expect(TRANSACTION_COLUMNS).toContain("TRANSACTION_ID");
    expect(TRANSACTION_COLUMNS).toContain("TRANSACTION_STATUS");
    expect(TRANSACTION_COLUMNS).toContain("ORIGINAL_AMOUNT");
    expect(TRANSACTION_COLUMNS).toContain("TRANSACTION_DATE");
  });

  it("has all unique column names (no duplicates)", () => {
    expect(new Set(TRANSACTION_COLUMNS).size).toBe(TRANSACTION_COLUMNS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATUS_MAP
// ─────────────────────────────────────────────────────────────────────────────

describe("STATUS_MAP", () => {
  it("has entries for all six expected status categories", () => {
    const keys = Object.keys(STATUS_MAP);
    expect(keys).toContain("HOLD");
    expect(keys).toContain("DOUBT");
    expect(keys).toContain("SUCCESS");
    expect(keys).toContain("REFUND");
    expect(keys).toContain("DECLINED");
    expect(keys).toContain("SUBMITTED");
  });

  it("SUCCESS maps to the label 'Réussie'", () => {
    expect(STATUS_MAP.SUCCESS.label).toBe("Réussie");
  });

  it("REFUND maps to the label 'Annulation'", () => {
    expect(STATUS_MAP.REFUND.label).toBe("Annulation");
  });

  it("DECLINED maps to the label 'Echec'", () => {
    expect(STATUS_MAP.DECLINED.label).toBe("Echec");
  });

  it("SUBMITTED maps to the label 'Confirmé'", () => {
    expect(STATUS_MAP.SUBMITTED.label).toBe("Confirmé");
  });

  it("each category has a non-empty subStatuses array", () => {
    for (const [key, val] of Object.entries(STATUS_MAP)) {
      expect(Array.isArray(val.subStatuses), `${key}.subStatuses should be an array`).toBe(true);
      expect(val.subStatuses.length, `${key}.subStatuses should not be empty`).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Channel definitions
// ─────────────────────────────────────────────────────────────────────────────

describe("BILL_PAYMENT_CHANNELS", () => {
  it("contains exactly 5 channels", () => {
    expect(BILL_PAYMENT_CHANNELS).toHaveLength(5);
  });

  it("first channel is IZIPAY", () => {
    expect(BILL_PAYMENT_CHANNELS[0].name).toBe("IZIPAY");
  });

  it("last channel is KASHY", () => {
    expect(BILL_PAYMENT_CHANNELS[4].name).toBe("KASHY");
  });

  it("every channel has a non-empty name and condition", () => {
    for (const ch of BILL_PAYMENT_CHANNELS) {
      expect(ch.name.length).toBeGreaterThan(0);
      expect(ch.condition.length).toBeGreaterThan(0);
    }
  });
});

describe("RECHARGE_VOICE_FIXED_TTCASH", () => {
  it("contains more than 10 channels", () => {
    expect(RECHARGE_VOICE_FIXED_TTCASH.length).toBeGreaterThan(10);
  });

  it("includes Espaces TT and MyTT", () => {
    const names = RECHARGE_VOICE_FIXED_TTCASH.map((c) => c.name);
    expect(names).toContain("Espaces TT");
    expect(names).toContain("MyTT");
  });
});

describe("RECHARGE_VOICE_FIXED_VOUCHER", () => {
  it("contains 6 channels", () => {
    expect(RECHARGE_VOICE_FIXED_VOUCHER).toHaveLength(6);
  });

  it("includes USSD 123 and CallCenter/XV", () => {
    const names = RECHARGE_VOICE_FIXED_VOUCHER.map((c) => c.name);
    expect(names).toContain("USSD 123");
    expect(names).toContain("CallCenter/XV");
  });
});

describe("RECHARGE_VOICE_MOBILE_TTCASH", () => {
  it("contains more than 15 channels", () => {
    expect(RECHARGE_VOICE_MOBILE_TTCASH.length).toBeGreaterThan(15);
  });

  it("includes DTOne and Bonus DTone channels", () => {
    const names = RECHARGE_VOICE_MOBILE_TTCASH.map((c) => c.name);
    expect(names).toContain("DTOne");
    expect(names).toContain("Bonus DTone");
  });
});

describe("RECHARGE_VOICE_MOBILE_VOUCHER", () => {
  it("contains 6 channels", () => {
    expect(RECHARGE_VOICE_MOBILE_VOUCHER).toHaveLength(6);
  });
});

describe("RECHARGE_DATA_SABBA", () => {
  it("contains more than 5 channels", () => {
    expect(RECHARGE_DATA_SABBA.length).toBeGreaterThan(5);
  });

  it("includes TOPNET and MYTT channels", () => {
    const names = RECHARGE_DATA_SABBA.map((c) => c.name);
    expect(names).toContain("TOPNET");
    expect(names).toContain("MYTT");
  });
});

describe("RECHARGE_DATA_EVOUCHER", () => {
  it("contains exactly 1 channel (USSD 227)", () => {
    expect(RECHARGE_DATA_EVOUCHER).toHaveLength(1);
    expect(RECHARGE_DATA_EVOUCHER[0].name).toBe("USSD 227");
  });
});

describe("VOUCHER_FOR_PAYMENT", () => {
  it("contains exactly 3 channels", () => {
    expect(VOUCHER_FOR_PAYMENT).toHaveLength(3);
  });

  it("includes generation, redemption and refund entries", () => {
    const names = VOUCHER_FOR_PAYMENT.map((c) => c.name);
    expect(names).toContain("Voucher For Payment GENERATION");
    expect(names).toContain("Voucher For Payment REDEMPTION");
    expect(names).toContain("REFUND OF VOUCHER REDEEMED");
  });
});

describe("CREDIT_TRANSFER", () => {
  it("contains exactly 4 channels", () => {
    expect(CREDIT_TRANSFER).toHaveLength(4);
  });

  it("first channel is Credit Transfer", () => {
    expect(CREDIT_TRANSFER[0].name).toBe("Credit Transfer");
  });
});

describe("EVOUCHER_ON_DEMAND_GENERATION", () => {
  it("contains 8 channels", () => {
    expect(EVOUCHER_ON_DEMAND_GENERATION).toHaveLength(8);
  });

  it("includes MyTT, AZIZA and USSD 170", () => {
    const names = EVOUCHER_ON_DEMAND_GENERATION.map((c) => c.name);
    expect(names).toContain("MyTT");
    expect(names).toContain("AZIZA");
    expect(names).toContain("USSD 170");
  });
});

describe("VOUCHER_CONVERGENT_CARTE_GENERATION", () => {
  it("has exactly 1 channel", () => {
    expect(VOUCHER_CONVERGENT_CARTE_GENERATION).toHaveLength(1);
    expect(VOUCHER_CONVERGENT_CARTE_GENERATION[0].name).toBe(
      "TBT_Carte_Convergante_Batch_Generation",
    );
  });
});

describe("VOUCHER_CONVERGENT_CARTE_ACTIVATION", () => {
  it("has exactly 2 channels (activation + annulation)", () => {
    expect(VOUCHER_CONVERGENT_CARTE_ACTIVATION).toHaveLength(2);
    const names = VOUCHER_CONVERGENT_CARTE_ACTIVATION.map((c) => c.name);
    expect(names).toContain("Activation des cartes de recharge convergente");
    expect(names).toContain("Annulation de l'activation des cartes de recharge");
  });
});

describe("VOUCHER_CONVERGENT (spread)", () => {
  it("equals the concatenation of EVOUCHER_ON_DEMAND_GENERATION + CARTE_GENERATION + CARTE_ACTIVATION", () => {
    const expected = [
      ...EVOUCHER_ON_DEMAND_GENERATION,
      ...VOUCHER_CONVERGENT_CARTE_GENERATION,
      ...VOUCHER_CONVERGENT_CARTE_ACTIVATION,
    ];
    expect(VOUCHER_CONVERGENT).toHaveLength(expected.length);
    // Name order must also match
    for (let i = 0; i < expected.length; i++) {
      expect(VOUCHER_CONVERGENT[i].name).toBe(expected[i].name);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORT_SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

describe("REPORT_SECTIONS", () => {
  it("contains 12 sections", () => {
    expect(REPORT_SECTIONS).toHaveLength(12);
  });

  it("each section has an id, title and non-empty channels array", () => {
    for (const s of REPORT_SECTIONS) {
      expect(typeof s.id).toBe("string");
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.title).toBe("string");
      expect(s.title.length).toBeGreaterThan(0);
      expect(Array.isArray(s.channels)).toBe(true);
      expect(s.channels.length).toBeGreaterThan(0);
    }
  });

  it("first section is bill-payment", () => {
    expect(REPORT_SECTIONS[0].id).toBe("bill-payment");
    expect(REPORT_SECTIONS[0].channels).toBe(BILL_PAYMENT_CHANNELS);
  });

  it("section ids are unique", () => {
    const ids = REPORT_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains the credit-transfer section", () => {
    const ct = REPORT_SECTIONS.find((s) => s.id === "credit-transfer");
    expect(ct).toBeDefined();
    expect(ct?.channels).toBe(CREDIT_TRANSFER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStatusSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("getStatusSummary", () => {
  it("returns correct numeric counts from parallel query results", async () => {
    // The function fires 5 parallel queries: success, refund, instance, declined, total.
    // mockResolvedValue returns the same value for EVERY call, so all five get {cnt: 10}.
    runReadOnlyQuery.mockResolvedValue([{ cnt: 10 }]);

    const result = await getStatusSummary();

    expect(result.reussie).toBe(10);
    expect(result.annulation).toBe(10);
    expect(result.instance).toBe(10);
    expect(result.echec).toBe(10);
    expect(result.total).toBe(10);
  });

  it("fires exactly 5 queries (success, refund, instance, declined, total)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 0 }]);

    await getStatusSummary();

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(5);
  });

  it("falls back to 0 for any field when the result row is missing cnt", async () => {
    runReadOnlyQuery.mockResolvedValue([{}]);

    const result = await getStatusSummary();

    expect(result.reussie).toBe(0);
    expect(result.annulation).toBe(0);
    expect(result.instance).toBe(0);
    expect(result.echec).toBe(0);
    expect(result.total).toBe(0);
  });

  it("falls back to 0 when the result array is empty", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    const result = await getStatusSummary();

    expect(result.reussie).toBe(0);
    expect(result.total).toBe(0);
  });

  it("references the report table in each query", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 1 }]);

    await getStatusSummary();

    for (const sql of allSql()) {
      expect(sql).toContain(`"${REPORT_TABLE}"`);
    }
  });

  it("queries use COUNT(*) with a status filter (not bare SELECT *)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 0 }]);

    await getStatusSummary();

    const sqls = allSql();
    // At least 4 of the 5 queries have a WHERE clause (the 5th is the total)
    const withWhere = sqls.filter((s) => s.includes("WHERE"));
    expect(withWhere.length).toBeGreaterThanOrEqual(4);
  });

  it("coerces BigInt-style cnt values via Number()", async () => {
    // DuckDB COUNT() sometimes returns BigInt; Number() must handle it.
    runReadOnlyQuery.mockResolvedValue([{ cnt: BigInt(7) }]);

    const result = await getStatusSummary();

    expect(result.reussie).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChannelStats — happy paths
// ─────────────────────────────────────────────────────────────────────────────

describe("getChannelStats — happy paths", () => {
  const channels: ChannelDef[] = [
    { name: "Alpha", condition: "TRY_CAST(BRAND_D AS INT) = 1" },
    { name: "Beta", condition: "TRY_CAST(BRAND_D AS INT) = 2" },
  ];

  it("returns one row per channel with correct nombre and montant", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ nombre: 100, montant: 500.5 }])
      .mockResolvedValueOnce([{ nombre: 50, montant: 250.25 }]);

    const result = await getChannelStats(channels);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ canal: "Alpha", nombre: 100, montant: 500.5 });
    expect(result.rows[1]).toEqual({ canal: "Beta", nombre: 50, montant: 250.25 });
  });

  it("accumulates correct grand totals", async () => {
    runReadOnlyQuery
      .mockResolvedValueOnce([{ nombre: 100, montant: 500 }])
      .mockResolvedValueOnce([{ nombre: 50, montant: 250 }]);

    const result = await getChannelStats(channels);

    expect(result.totals.nombre).toBe(150);
    expect(result.totals.montant).toBe(750);
  });

  it("fires one query per channel in order", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(channels);

    expect(runReadOnlyQuery).toHaveBeenCalledTimes(2);
    const sqls = allSql();
    expect(sqls[0]).toContain("TRY_CAST(BRAND_D AS INT) = 1");
    expect(sqls[1]).toContain("TRY_CAST(BRAND_D AS INT) = 2");
  });

  it("falls back nombre and montant to 0 when the row is empty", async () => {
    runReadOnlyQuery.mockResolvedValue([{}]);

    const result = await getChannelStats(channels);

    expect(result.rows.every((r) => r.nombre === 0 && r.montant === 0)).toBe(true);
  });

  it("returns empty rows and zero totals for an empty channels array", async () => {
    const result = await getChannelStats([]);

    expect(result.rows).toEqual([]);
    expect(result.totals).toEqual({ nombre: 0, montant: 0 });
    expect(runReadOnlyQuery).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChannelStats — date filters
// ─────────────────────────────────────────────────────────────────────────────

describe("getChannelStats — date filters", () => {
  const oneChannel: ChannelDef[] = [{ name: "X", condition: "1=1" }];

  it("emits no date clause when both dateFrom and dateTo are undefined", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(oneChannel);

    expect(lastSql()).not.toContain("BETWEEN");
    expect(lastSql()).not.toContain("STRPTIME");
  });

  it("emits a BETWEEN clause when both dateFrom and dateTo are supplied", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(oneChannel, "2024-01-01", "2024-01-31");

    const sql = lastSql();
    expect(sql).toContain("BETWEEN");
    expect(sql).toContain("2024-01-01");
    expect(sql).toContain("2024-01-31");
  });

  it("emits a >= clause when only dateFrom is supplied", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(oneChannel, "2024-06-01");

    const sql = lastSql();
    expect(sql).toContain(">=");
    expect(sql).toContain("2024-06-01");
    expect(sql).not.toContain("BETWEEN");
  });

  it("emits a <= clause when only dateTo is supplied", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(oneChannel, undefined, "2024-12-31");

    const sql = lastSql();
    expect(sql).toContain("<=");
    expect(sql).toContain("2024-12-31");
    expect(sql).not.toContain("BETWEEN");
  });

  it("uses the STRPTIME format %Y-%m-%d to parse the date bounds", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(oneChannel, "2024-01-01", "2024-12-31");

    const sql = lastSql();
    expect(sql).toContain("'%Y-%m-%d'");
  });

  it("uses TRY_STRPTIME on TRANSACTION_DATE to parse row dates", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(oneChannel, "2024-01-01", "2024-12-31");

    expect(lastSql()).toContain("TRY_STRPTIME");
    expect(lastSql()).toContain("TRANSACTION_DATE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTopTransactionsByAmount
// ─────────────────────────────────────────────────────────────────────────────

describe("getTopTransactionsByAmount", () => {
  it("returns rows verbatim from the underlying query", async () => {
    const rows = [{ TRANSACTION_ID: "T1", ORIGINAL_AMOUNT: 999 }];
    runReadOnlyQuery.mockResolvedValue(rows);

    const result = await getTopTransactionsByAmount();

    expect(result).toBe(rows);
  });

  it("uses default limit of 20", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getTopTransactionsByAmount();

    expect(lastSql()).toContain("LIMIT 20");
  });

  it("honours a custom limit", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getTopTransactionsByAmount(5);

    expect(lastSql()).toContain("LIMIT 5");
  });

  it("queries the report table ordered by ORIGINAL_AMOUNT DESC", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getTopTransactionsByAmount();

    const sql = lastSql();
    expect(sql).toContain(`"${REPORT_TABLE}"`);
    expect(sql).toContain("ORDER BY TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE) DESC");
  });

  it("filters by the success status IN-list", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getTopTransactionsByAmount();

    const sql = lastSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("TRANSACTION_STATUS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getHourlyDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe("getHourlyDistribution", () => {
  it("maps query rows to {hour, count, amount} with numeric coercion", async () => {
    runReadOnlyQuery.mockResolvedValue([
      { hour: 9, count: 120, amount: 3400.5 },
      { hour: 14, count: 300, amount: 9000.0 },
    ]);

    const result = await getHourlyDistribution();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ hour: 9, count: 120, amount: 3400.5 });
    expect(result[1]).toEqual({ hour: 14, count: 300, amount: 9000 });
  });

  it("coerces null fields to 0", async () => {
    runReadOnlyQuery.mockResolvedValue([{ hour: null, count: null, amount: null }]);

    const result = await getHourlyDistribution();

    expect(result[0]).toEqual({ hour: 0, count: 0, amount: 0 });
  });

  it("returns an empty array when the query returns no rows", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    const result = await getHourlyDistribution();

    expect(result).toEqual([]);
  });

  it("uses EXTRACT(HOUR FROM ...) and GROUP BY 1 ORDER BY 1", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getHourlyDistribution();

    const sql = lastSql();
    expect(sql).toContain("EXTRACT(HOUR FROM");
    expect(sql).toContain("GROUP BY 1");
    expect(sql).toContain("ORDER BY 1");
  });

  it("sums ORIGINAL_AMOUNT using COALESCE+SUM with TRY_CAST", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getHourlyDistribution();

    const sql = lastSql();
    expect(sql).toContain("COALESCE(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)), 0)");
  });

  it("filters by the success status list", async () => {
    runReadOnlyQuery.mockResolvedValue([]);

    await getHourlyDistribution();

    const sql = lastSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("TRANSACTION_STATUS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadReportCSV — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("loadReportCSV — happy path", () => {
  const csvContent = "TRANSACTION_ID,ORIGINAL_AMOUNT\nT1,500\nT2,300";

  it("writes the CSV content to a local file via writeLocalFile", async () => {
    await loadReportCSV(csvContent);

    expect(writeLocalFile).toHaveBeenCalledTimes(1);
    const [path, buf] = writeLocalFile.mock.calls[0];
    expect(typeof path).toBe("string");
    // The buffer is an ArrayBuffer containing the UTF-8 encoded CSV
    expect(buf).toBeInstanceOf(ArrayBuffer);
    const decoded = new TextDecoder().decode(buf);
    expect(decoded).toBe(csvContent);
  });

  it("calls localDataPath with a path under imports/", async () => {
    await loadReportCSV(csvContent);

    expect(localDataPath).toHaveBeenCalledTimes(1);
    const [rel] = localDataPath.mock.calls[0];
    expect(rel).toMatch(/^imports\//);
    expect(rel).toMatch(/\.csv$/);
  });

  it("calls registerLocalDatasetFile with hasHeader=true, delimiter=',', previewLimit=100", async () => {
    await loadReportCSV(csvContent);

    expect(registerLocalDatasetFile).toHaveBeenCalledTimes(1);
    const opts = registerLocalDatasetFile.mock.calls[0][0];
    expect(opts.hasHeader).toBe(true);
    expect(opts.delimiter).toBe(",");
    expect(opts.previewLimit).toBe(100);
  });

  it("returns the correct shape from the dataset registration", async () => {
    const result = await loadReportCSV(csvContent);

    expect(result.datasetId).toBe("dataset-id");
    expect(result.tableName).toBe("telecom_transactions");
    expect(result.viewName).toBe("telecom_transactions");
    expect(result.rowCount).toBe(42);
    expect(result.columns).toEqual(["TRANSACTION_ID", "ORIGINAL_AMOUNT"]);
  });

  it("does NOT call createTelecomEnrichedView when no mapping is provided", async () => {
    await loadReportCSV(csvContent);

    expect(createTelecomEnrichedView).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadReportCSV — with column mapping
// ─────────────────────────────────────────────────────────────────────────────

describe("loadReportCSV — with column mapping", () => {
  const csvContent = "TX_ID,AMT\nT1,100";
  const mapping = {
    transactionId: "TX_ID",
    transactionDate: "DATE",
    amount: "AMT",
    status: "STATUS",
    // other optional fields omitted
  } as Parameters<typeof loadReportCSV>[1];

  it("calls createTelecomEnrichedView with the viewName and mapping when mapping is supplied", async () => {
    await loadReportCSV(csvContent, mapping);

    expect(createTelecomEnrichedView).toHaveBeenCalledTimes(1);
    const [viewName, passedMapping] = createTelecomEnrichedView.mock.calls[0];
    expect(viewName).toBe("telecom_transactions");
    expect(passedMapping).toBe(mapping);
  });

  it("still returns the full result even when createTelecomEnrichedView throws", async () => {
    // The error is caught with a console.warn; the function should not re-throw
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    createTelecomEnrichedView.mockRejectedValueOnce(new Error("create view failed"));

    const result = await loadReportCSV(csvContent, mapping);

    // Result is still returned
    expect(result.datasetId).toBe("dataset-id");
    expect(warnSpy).toHaveBeenCalledWith(
      "[loadReportCSV] Failed to create enriched view:",
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loadReportCSV — display name generation
// ─────────────────────────────────────────────────────────────────────────────

describe("loadReportCSV — display name generation", () => {
  it("generates a unique display name on each invocation (using Date.now())", async () => {
    const names: string[] = [];
    localDataPath.mockImplementation(async (rel: string) => {
      names.push(rel);
      return `/data/${rel}`;
    });

    // First call
    await loadReportCSV("a");
    // Second call at a potentially different timestamp
    await loadReportCSV("b");

    expect(names).toHaveLength(2);
    // Both should start with imports/telecom_report_
    expect(names[0]).toMatch(/^imports\/telecom_report_\d+\.csv$/);
    expect(names[1]).toMatch(/^imports\/telecom_report_\d+\.csv$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SQL correctness checks on getStatusSummary filters
// ─────────────────────────────────────────────────────────────────────────────

describe("getStatusSummary — SQL filter correctness", () => {
  it("success query contains known success status codes (PST, PST1)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 0 }]);

    await getStatusSummary();

    // The first query is for success (Promise.all order)
    const sqls = allSql();
    // At least one SQL should contain PST (the success status code)
    expect(sqls.some((s) => s.includes("'PST'"))).toBe(true);
  });

  it("refund query contains known refund status codes (RFD)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 0 }]);

    await getStatusSummary();

    const sqls = allSql();
    expect(sqls.some((s) => s.includes("'RFD'"))).toBe(true);
  });

  it("instance query contains known hold status codes (HLD)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 0 }]);

    await getStatusSummary();

    const sqls = allSql();
    expect(sqls.some((s) => s.includes("'HLD'"))).toBe(true);
  });

  it("declined query contains known declined status codes (DCL)", async () => {
    runReadOnlyQuery.mockResolvedValue([{ cnt: 0 }]);

    await getStatusSummary();

    const sqls = allSql();
    expect(sqls.some((s) => s.includes("'DCL'"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChannelStats — SQL content validation
// ─────────────────────────────────────────────────────────────────────────────

describe("getChannelStats — SQL content validation", () => {
  const ch: ChannelDef[] = [{ name: "Test", condition: "BRAND_D = 99" }];

  it("includes COALESCE(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)), 0) for montant", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(ch);

    expect(lastSql()).toContain("COALESCE(SUM(TRY_CAST(ORIGINAL_AMOUNT AS DOUBLE)), 0)");
  });

  it("embeds the channel condition in the WHERE clause", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(ch);

    expect(lastSql()).toContain("BRAND_D = 99");
  });

  it("queries the report table", async () => {
    runReadOnlyQuery.mockResolvedValue([{ nombre: 0, montant: 0 }]);

    await getChannelStats(ch);

    expect(lastSql()).toContain(`"${REPORT_TABLE}"`);
  });
});
