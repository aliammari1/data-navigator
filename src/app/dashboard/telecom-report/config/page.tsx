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
        kpi={report.kpi}
        canals={report.canals}
        hourly={report.hourly}
        statusData={report.statusData}
        m={report.mapping}
        rawStatuses={report.rawStatuses}
        statusMapping={report.statusMapping}
        onStatusMappingChange={report.setStatusMapping}
        canalRule={report.canalRule}
        onCanalRuleChange={report.setCanalRule}
        reportDate={report.dashboardReportDate}
        tableName={report.dashboardTableName}
        fetchUnclassifiedCanalCombos={report.fetchUnclassifiedCanalCombos}
        runCustomKPIExpr={report.runCustomKPIExpr}
      />
    </div>
  );
}
