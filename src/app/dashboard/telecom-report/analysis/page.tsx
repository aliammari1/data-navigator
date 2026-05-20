"use client";

import { AnalysisTab } from "@/features/telecom/components/analysis-tab";
import {
  TelecomLoadingPanel,
  useTelecomReportRuntime,
} from "@/features/telecom/components/telecom-report-runtime";

export default function AnalysisPage() {
  const report = useTelecomReportRuntime();

  if (!report.kpi) {
    return <TelecomLoadingPanel label="Chargement de l'analyse…" />;
  }

  return (
    <AnalysisTab
      operators={report.operators}
      regions={report.regions}
      hourly={report.hourly}
      kpi={report.kpi}
      m={report.mapping}
      fetchOperators={report.fetchOperators}
      fetchRegions={report.fetchRegions}
      fetchOperatorsForGroup={report.fetchOperatorsForGroup}
      fetchDestinationsForGroup={report.fetchDestinationsForGroup}
      fetchRegionsForGroup={report.fetchRegionsForGroup}
      fetchCanalHourlyMatrix={report.fetchCanalHourlyMatrix}
    />
  );
}
