"use client";

/**
 * ForecastScreen — thin shell.
 *
 * Each of the six tabs lives in its own file under `../tabs/*` and is
 * lazy-mounted: only the active tab's module, ECharts instances, and compute
 * are loaded/run. This removes the previous monolith's eager 6-chart cost on
 * first paint and keeps the route's initial chunk small (the inactive tab
 * bundles are fetched on demand).
 *
 * All data flows from the real DuckDB pipeline (`useForecastData`); the former
 * synthetic `generateHistoricalData()` / `Math.random()` builders are gone.
 */

import { motion } from "motion/react";
import { lazy, Suspense, useState } from "react";
import { cn } from "@/shared/utils";

const TomorrowForecastTab = lazy(() => import("../tabs/TomorrowForecastTab"));
const IntelligenceTab = lazy(() => import("../tabs/IntelligenceTab"));
const RevenueSimulatorTab = lazy(() => import("../tabs/RevenueSimulatorTab"));
const PatternDetectorTab = lazy(() => import("../tabs/PatternDetectorTab"));
const RiskAssessmentTab = lazy(() => import("../tabs/RiskAssessmentTab"));
const ScenariosTab = lazy(() => import("../tabs/ScenariosTab"));

const TABS = [
  { id: "forecast", label: "Tomorrow's Forecast" },
  { id: "intelligence", label: "Forecast Intelligence" },
  { id: "simulator", label: "Revenue Simulator" },
  { id: "patterns", label: "Pattern Detector" },
  { id: "risk", label: "Risk Assessment" },
  { id: "scenarios", label: "Scenarios" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_COMPONENTS: Record<TabId, React.LazyExoticComponent<React.FC>> = {
  forecast: TomorrowForecastTab,
  intelligence: IntelligenceTab,
  simulator: RevenueSimulatorTab,
  patterns: PatternDetectorTab,
  risk: RiskAssessmentTab,
  scenarios: ScenariosTab,
};

function TabFallback() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl bg-slate-900/60"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-slate-900/60" />
    </div>
  );
}

export function ForecastScreen() {
  const [activeTab, setActiveTab] = useState<TabId>("forecast");
  const ActiveTab = TAB_COMPONENTS[activeTab];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-6 py-5">
        <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
          Predictive Analytics
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          AI-powered forecasting, risk assessment, and scenario planning
        </p>
      </div>

      <div className="border-b border-slate-800/60 bg-slate-900/20 px-6">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative whitespace-nowrap px-4 py-3.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-blue-400"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        <Suspense fallback={<TabFallback />}>
          {/* key={activeTab} ensures only the active tab mounts and computes. */}
          <ActiveTab key={activeTab} />
        </Suspense>
      </div>
    </div>
  );
}
