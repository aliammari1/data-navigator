"use client";

import {
  Database,
  FlaskConical,
  ListFilter,
  Sparkles,
  Tag,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { computeAIInsights } from "@/features/telecom/lib/insights";
import type * as Types from "@/features/telecom/types";
import type { ServiceCodeRow } from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { CanalDetectorPanel } from "./canal-detector-panel";
import { CustomKPIBuilder } from "./custom-kpi-builder";
import { DeepAnalysisPanel } from "./deep-analysis-panel";
import { Section } from "./section";
import { StatusConfigPanel } from "./status-config-panel";
import { StorageInfoPanel } from "./storage-info-panel";

type ConfigSection = "insights" | "status" | "canals" | "kpis" | "storage";

export function ConfigTab({
  kpi,
  canals,
  hourly,
  statusData,
  m,
  rawStatuses,
  statusMapping,
  onStatusMappingChange,
  reportDate,
  tableName,
  fetchServiceCodeRows,
  runCustomKPIExpr,
}: {
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  m: Types.ColumnMapping;
  rawStatuses: Types.RawStatusRow[];
  statusMapping: Types.StatusMapping[];
  onStatusMappingChange: (m: Types.StatusMapping[]) => void;
  reportDate: string;
  tableName: string;
  fetchServiceCodeRows: (m: Types.ColumnMapping) => Promise<ServiceCodeRow[]>;
  runCustomKPIExpr: (sqlExpr: string) => Promise<number | null>;
}) {
  const [section, setSection] = useState<ConfigSection>("insights");

  const criticalCount = useMemo(
    () =>
      computeAIInsights(kpi, canals, hourly, statusData).filter(
        (i) => i.severity === "critical",
      ).length,
    [kpi, canals, hourly, statusData],
  );

  const sections: Array<{
    key: ConfigSection;
    label: string;
    icon: React.ElementType;
    badge?: string;
    activeClass: string;
  }> = [
    {
      key: "insights",
      label: "Assistant métier",
      icon: Sparkles,
      badge: criticalCount > 0 ? String(criticalCount) : undefined,
      activeClass:
        "bg-violet-600 dark:bg-violet-500 text-white shadow-sm shadow-violet-500/30",
    },
    {
      key: "status",
      label: "Config. Statuts",
      icon: Tag,
      badge:
        rawStatuses.filter(
          (r) => !statusMapping.find((m) => m.rawCode === r.rawCode),
        ).length > 0
          ? "!"
          : undefined,
      activeClass:
        "bg-amber-600 dark:bg-amber-500 text-white shadow-sm shadow-amber-500/30",
    },
    {
      key: "canals",
      label: "Détection Canal",
      icon: ListFilter,
      activeClass:
        "bg-emerald-600 dark:bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
    },
    {
      key: "kpis",
      label: "KPIs Personnalisés",
      icon: FlaskConical,
      activeClass:
        "bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm shadow-indigo-500/30",
    },
    {
      key: "storage",
      label: "Stockage",
      icon: Database,
      activeClass:
        "bg-rose-600 dark:bg-rose-500 text-white shadow-sm shadow-rose-500/30",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-xl p-1">
        {sections.map(({ key, label, icon: Icon, badge, activeClass }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center",
              section === key
                ? activeClass
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
            {badge && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/400 font-bold">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {section === "insights" && (
            <DeepAnalysisPanel
              kpi={kpi}
              canals={canals}
              hourly={hourly}
              statusData={statusData}
              reportDate={reportDate}
            />
          )}
          {section === "status" && (
            <Section
              title="Configuration des Codes Statut"
              icon={<Tag className="w-4 h-4" />}
            >
              <StatusConfigPanel
                rawStatuses={rawStatuses}
                mapping={statusMapping}
                onUpdateMapping={onStatusMappingChange}
                tableName={tableName}
              />
            </Section>
          )}
          {section === "canals" && (
            <Section
              title="Détecteur de Classification Canal"
              icon={<ListFilter className="w-4 h-4" />}
            >
              <CanalDetectorPanel
                m={m}
                fetchServiceCodeRows={fetchServiceCodeRows}
              />
            </Section>
          )}
          {section === "kpis" && (
            <Section
              title="Constructeur de KPI Personnalisés"
              icon={<FlaskConical className="w-4 h-4" />}
            >
              <CustomKPIBuilder runCustomKPIExpr={runCustomKPIExpr} />
            </Section>
          )}
          {section === "storage" && <StorageInfoPanel tableName={tableName} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
