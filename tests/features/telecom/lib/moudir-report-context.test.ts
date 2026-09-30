import { describe, expect, it, vi } from "vitest";
import { useDataStore } from "@/core/stores/data-store";
import type { SQLiteAnalyticsSnapshot } from "@/features/telecom/lib/analytics-sqlite-snapshot";

const { mockLoadSnapshot } = vi.hoisted(() => ({ mockLoadSnapshot: vi.fn() }));
vi.mock("@/features/telecom/lib/analytics-sqlite-snapshot", () => ({
  loadAnalyticsSnapshotFromSQLite: (...args: unknown[]) => mockLoadSnapshot(...args),
}));

import {
  formatTelecomReportContext,
  loadTelecomReportContextForMoudir,
  publishTelecomReportContext,
} from "@/features/telecom/lib/moudir-report-context";

function snapshot(tableName: string, totalTransactions: number): SQLiteAnalyticsSnapshot {
  return {
    tableName,
    fileName: `${tableName}.csv`,
    computedAt: 1_780_000_000_000,
    kpi: {
      totalTransactions,
      successCount: 75,
      declinedCount: 25,
      refundCount: 0,
      instanceCount: 0,
      submittedCount: 0,
      successRate: 75,
      totalAmount: 5000,
      avgAmount: 50,
      avgProcessingMs: 10,
      uniqueCustomers: 40,
      peakHour: 12,
      topErrorCode: "ERR",
    },
    canals: [
      {
        key: "bill_payment",
        label: "Bill payment",
        color: "blue",
        bgColor: "blue",
        borderColor: "blue",
        total: 60,
        success: 45,
        declined: 15,
        refund: 0,
        instance: 0,
        submitted: 0,
        amount: 3000,
        avgAmount: 50,
        successRate: 75,
        share: 60,
      },
    ],
    statusData: [{ status: "SUCCESS", count: 75, amount: 3750 }],
    hourly: [{ hour: 12, total: 50, success: 40, declined: 10, amount: 2500 }],
    operators: [],
    regions: [],
    rawStatuses: [{ rawCode: "00", count: 75, amount: 3750 }],
  };
}

describe("Moudir telecom report context", () => {
  it("uses report percentages directly and derives status share from the same total", () => {
    const text = formatTelecomReportContext(snapshot("telecom_a", 100));
    const report = JSON.parse(
      text.split("<telecom_report_context>\n")[1].split("\n</telecom_report_context>")[0],
    );
    expect(report.kpi.successRate).toBe(75);
    expect(report.statuses[0]).toMatchObject({ status: "SUCCESS", sharePercent: 75 });
    expect(report.canals[0]).toMatchObject({ successRatePercent: 75, sharePercent: 60 });
    expect(report.rawStatuses[0]).toMatchObject({ rawCode: "00", count: 75 });
    expect(text).not.toContain('"icon"');
  });

  it("selects the report belonging to the active dataset, even with two report windows", async () => {
    useDataStore.setState({
      datasets: [
        { id: "ds-a", viewName: "telecom_a", tableName: "telecom_a", columns: [] },
        { id: "ds-b", viewName: "telecom_b", tableName: "telecom_b", columns: [] },
      ] as ReturnType<typeof useDataStore.getState>["datasets"],
    });
    publishTelecomReportContext(snapshot("telecom_a", 100));
    publishTelecomReportContext(snapshot("telecom_b", 200));

    expect(await loadTelecomReportContextForMoudir("ds-a")).toContain('"totalTransactions":100');
    expect(await loadTelecomReportContextForMoudir("ds-b")).toContain('"totalTransactions":200');
    expect(await loadTelecomReportContextForMoudir(null)).toBeNull();
  });

  it("loads a previously saved report when no report window is open", async () => {
    useDataStore.setState({
      datasets: [
        { id: "ds-saved", viewName: "telecom_saved", tableName: "telecom_saved", columns: [] },
      ] as ReturnType<typeof useDataStore.getState>["datasets"],
    });
    mockLoadSnapshot.mockResolvedValueOnce(snapshot("telecom_saved", 300));

    expect(await loadTelecomReportContextForMoudir("ds-saved")).toContain(
      '"totalTransactions":300',
    );
    expect(mockLoadSnapshot).toHaveBeenCalledWith("telecom_saved");
  });
});
