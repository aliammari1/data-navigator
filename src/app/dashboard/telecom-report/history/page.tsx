"use client";

import { useEffect } from "react";
import { AnalyticsHistoryTab } from "@/features/telecom/components/analytics-history-tab";
import { useTelecomReportRuntime } from "@/features/telecom/components/telecom-report-runtime";

export default function HistoryPage() {
  const report = useTelecomReportRuntime();
  const refreshAnalyticsHistory = report.refreshAnalyticsHistory;

  useEffect(() => {
    void refreshAnalyticsHistory();
  }, [refreshAnalyticsHistory]);

  return (
    <AnalyticsHistoryTab
      entries={report.analyticsHistory}
      onRefresh={report.refreshAnalyticsHistory}
      onLoad={report.loadAnalyticsFromHistory}
      onExportDatabase={report.exportActiveDatabase}
    />
  );
}
