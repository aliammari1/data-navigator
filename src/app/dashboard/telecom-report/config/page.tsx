"use client";

import { ConfigTab } from "@/features/telecom/components/config-tab";
import { LanCollabPanel } from "@/features/telecom/components/lan-collab-panel";
import {
  TelecomLoadingPanel,
  useTelecomReportRuntime,
} from "@/features/telecom/components/telecom-report-runtime";
import { UserManagementPanel } from "@/features/telecom/components/user-management-panel";

export default function ConfigPage() {
  const report = useTelecomReportRuntime();

  if (!report.kpi) {
    return <TelecomLoadingPanel label="Chargement de la configuration…" />;
  }

  return (
    <div className="space-y-4">
      <UserManagementPanel
        currentRole={report.telecomRole}
        onRoleChange={(role) => report.access.setRole(role === "admin" ? "owner" : "viewer")}
      />
      <LanCollabPanel />
      <ConfigTab
        kpi={report.kpi}
        canals={report.canals}
        hourly={report.hourly}
        statusData={report.statusData}
        m={report.mapping}
        rawStatuses={report.rawStatuses}
        statusMapping={report.statusMapping}
        onStatusMappingChange={report.setStatusMapping}
        reportDate={report.dashboardReportDate}
        tableName={report.dashboardTableName}
        fetchServiceCodeRows={report.fetchServiceCodeRows}
        runCustomKPIExpr={report.runCustomKPIExpr}
      />
    </div>
  );
}
