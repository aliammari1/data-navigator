"use client";

import { ConfigTab } from "@/features/telecom/components/config-tab";
import {
  TelecomLoadingPanel,
  useTelecomReportRuntime,
} from "@/features/telecom/components/telecom-report-runtime";

export default function ConfigPage() {
  const report = useTelecomReportRuntime();

  if (!report.kpi) {
    return <TelecomLoadingPanel label="Chargement de la configuration…" />;
  }

  return (
    <div className="space-y-4">
      <ConfigTab
        m={report.mapping}
        rawStatuses={report.rawStatuses}
        statusMapping={report.statusMapping}
        onStatusMappingChange={report.setStatusMapping}
        tableName={report.dashboardTableName}
        fetchServiceCodeRows={report.fetchServiceCodeRows}
      />
    </div>
  );
}
