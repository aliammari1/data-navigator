"use client";

import { PeriodStudioTab } from "@/features/telecom/components/period-studio-tab";
import { useTelecomReportRuntime } from "@/features/telecom/components/telecom-report-runtime";

export default function PeriodPage() {
  const report = useTelecomReportRuntime();

  return <PeriodStudioTab table={report.dashboardTableName} mapping={report.mapping} />;
}
