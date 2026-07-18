"use client";

import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  History,
  LayoutDashboard,
  Network,
  Settings,
  Table as TableIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppCommands, useRegisterPages } from "@/features/desktop/core/menu/app-commands";
import type { AppPage } from "@/features/desktop/core/menu/types";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { AnalysisTab } from "@/features/telecom/components/analysis-tab";
import { AnalyticsHistoryTab } from "@/features/telecom/components/analytics-history-tab";
import { CanalTab } from "@/features/telecom/components/canal-tab";
import { ConfigTab } from "@/features/telecom/components/config-tab";
import { DayAnalyticsTab } from "@/features/telecom/components/day-analytics-tab";
import { OverviewTab } from "@/features/telecom/components/overview-tab";
import { PeriodStudioTab } from "@/features/telecom/components/period-studio-tab";
import { RawDataTab } from "@/features/telecom/components/raw-data-tab";
import {
  TelecomLoadingPanel,
  TelecomReportRuntimeProvider,
  useTelecomReportRuntime,
} from "@/features/telecom/components/telecom-report-runtime";

/** Separate component so useEffect is called unconditionally (Rules of Hooks). */
function HistoryTabContent() {
  const report = useTelecomReportRuntime();
  useEffect(() => {
    void report.refreshAnalyticsHistory();
  }, [report.refreshAnalyticsHistory]);
  return (
    <AnalyticsHistoryTab
      entries={report.analyticsHistory}
      onRefresh={report.refreshAnalyticsHistory}
      onLoad={report.loadAnalyticsFromHistory}
      onExportDatabase={report.exportActiveDatabase}
    />
  );
}

/**
 * Renders the correct telecom report tab content.
 * Must be mounted inside TelecomReportRuntimeProvider.
 */
function TelecomTabContent({ activeTab }: { activeTab: string }) {
  const report = useTelecomReportRuntime();

  switch (activeTab) {
    case "overview":
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
          fetchDailyTrend={() => report.fetchDailyTrend(report.mapping)}
        />
      );

    case "canals":
      if (!report.dashboardLoaded)
        return <TelecomLoadingPanel label="Patientez, chargement de la table…" />;
      return (
        <CanalTab
          getTableName={report.getTableName}
          mapping={report.mapping}
          key={report.dashboardTableName}
          canalRule={report.canalRule}
        />
      );

    case "analysis":
      if (!report.kpi) return <TelecomLoadingPanel label="Chargement de l'analyse…" />;
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

    case "grid":
      return (
        <RawDataTab
          m={report.mapping}
          operators={report.operators}
          regions={report.regions}
          statusMapping={report.statusMapping}
          tableName={report.dashboardTableName}
          fetchFiltered={report.fetchFiltered}
          fetchFilteredCount={report.fetchFilteredCount}
          fetchFilteredPage={report.fetchFilteredPage}
          fetchCustomerProfile={report.fetchCustomerProfile}
        />
      );

    case "period":
      return <PeriodStudioTab table={report.dashboardTableName} mapping={report.mapping} />;

    case "day":
      return (
        <DayAnalyticsTab
          table={report.dashboardTableName}
          mapping={report.mapping}
          fileName={report.dashboardFileName}
          loadedFiles={[]}
        />
      );

    case "history":
      return <HistoryTabContent />;

    case "config":
      if (!report.kpi) return <TelecomLoadingPanel label="Chargement de la configuration…" />;
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

    default:
      return null;
  }
}

/** The screen's tabs, surfaced in the desktop Affichage (View) menu. */
const TELECOM_PAGES: AppPage[] = [
  { id: "overview", label: "Vue d'ensemble", icon: LayoutDashboard },
  { id: "canals", label: "Canaux", icon: Network },
  { id: "analysis", label: "Analyse", icon: BarChart3 },
  { id: "grid", label: "Données brutes", icon: TableIcon },
  { id: "period", label: "Studio période", icon: CalendarRange },
  { id: "day", label: "Analyse du jour", icon: CalendarDays },
  { id: "history", label: "Historique", icon: History },
  { id: "config", label: "Configuration", icon: Settings },
];

/**
 * Bridges the desktop menu's "Rapport" commands to the runtime handlers. Mounted
 * inside the runtime provider so it can read `useTelecomReportRuntime`.
 */
function TelecomMenuBridge() {
  const report = useTelecomReportRuntime();
  useAppCommands("telecom", {
    export: () => void report.exportActiveDatabase(),
    "refresh-history": () => void report.refreshAnalyticsHistory(),
  });
  return null;
}

/**
 * Desktop-window version of the Rapport Télécom.
 * Runs as a native Component (not an iframe) so it shares the same React
 * context, Zustand stores, and Electron IPC bridge as the rest of the app.
 * Tab navigation uses local state instead of the Next.js router.
 */
export function TelecomDesktopScreen() {
  const [activeTab, setActiveTab] = useState("overview");
  const windowId = useWindowId();

  useRegisterPages(windowId, TELECOM_PAGES, activeTab);
  useAppCommands("telecom", {
    navigate: (payload) => {
      const pageId = (payload as { pageId?: string } | undefined)?.pageId;
      if (pageId) setActiveTab(pageId);
    },
  });

  return (
    <TelecomReportRuntimeProvider activeTab={activeTab} onTabChange={setActiveTab}>
      <TelecomMenuBridge />
      <TelecomTabContent activeTab={activeTab} />
    </TelecomReportRuntimeProvider>
  );
}
