"use client";

import { DayAnalyticsTab } from "@/features/telecom/components/day-analytics-tab";
import { useTelecomReportRuntime } from "@/features/telecom/components/telecom-report-runtime";

export default function DayPage() {
  const report = useTelecomReportRuntime();

  return (
    <DayAnalyticsTab
      table={report.dashboardTableName}
      mapping={report.mapping}
      fileName={report.dashboardFileName}
      loadedFiles={[]}
    />
  );
}
