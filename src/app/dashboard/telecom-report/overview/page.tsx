"use client";

import { OverviewTab } from "@/features/telecom/components/overview-tab";
import { useTelecomReportRuntime } from "@/features/telecom/components/telecom-report-runtime";

export default function OverviewPage() {
  const report = useTelecomReportRuntime();

  return (
    <OverviewTab
      kpi={report.overviewKpi}
      canals={report.overviewCanals}
      hourly={report.overviewHourly}
      statusData={report.overviewStatusData}
      m={report.mapping}
      selectedKpis={report.selectedKpis}
      toggleKpi={report.toggleKpi}
      selectedOverviewSections={report.selectedOverviewSections}
      toggleOverviewSection={report.toggleOverviewSection}
      fetchDailyTrend={
        report.sharedOverviewMode ? async () => [] : () => report.fetchDailyTrend(report.mapping)
      }
    />
  );
}
