"use client";

import { CanalTab } from "@/features/telecom/components/canal-tab";
import {
  TelecomLoadingPanel,
  useTelecomReportRuntime,
} from "@/features/telecom/components/telecom-report-runtime";

export default function CanalsPage() {
  const report = useTelecomReportRuntime();

  if (!report.dashboardLoaded) {
    return <TelecomLoadingPanel label="Patientez, chargement de la table…" />;
  }

  return (
    <CanalTab
      getTableName={report.getTableName}
      mapping={report.mapping}
      key={report.dashboardTableName}
    />
  );
}
