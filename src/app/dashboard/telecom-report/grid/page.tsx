"use client";

import { RawDataTab } from "@/features/telecom/components/raw-data-tab";
import { useTelecomReportRuntime } from "@/features/telecom/components/telecom-report-runtime";

export default function GridPage() {
  const report = useTelecomReportRuntime();

  return (
    <RawDataTab
      m={report.mapping}
      operators={report.operators}
      regions={report.regions}
      statusMapping={report.statusMapping}
      tableName={report.dashboardTableName}
      fetchFiltered={report.fetchFiltered}
      fetchCustomerProfile={report.fetchCustomerProfile}
    />
  );
}
