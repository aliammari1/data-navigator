"use client";

import { Database, FlaskConical, ListFilter, Tag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo, useState } from "react";
import { computeAIInsights } from "@/features/telecom/lib/insights";
import type * as Types from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { CanalRulesPanel } from "./canal-rules-panel";
import { CustomKPIBuilder } from "./custom-kpi-builder";
import { Section } from "./section";
import { StatusConfigPanel } from "./status-config-panel";
import { StorageInfoPanel } from "./storage-info-panel";

type ConfigSection = "status" | "canals" | "kpis" | "storage";

export const ConfigTab = memo(function ConfigTab({
  kpi,
  canals,
  hourly,
  statusData,
  m,
  rawStatuses,
  statusMapping,
  onStatusMappingChange,
  canalRule,
  onCanalRuleChange,
  reportDate,
  tableName,
  fetchUnclassifiedCanalCombos,
  runCustomKPIExpr,
}: {
  kpi: Types.KPISummary;
  canals: Types.CanalSummary[];
  hourly: Types.HourlyRow[];
  statusData: Types.StatusRow[];
  m: Types.ColumnMapping;

  rawStatuses: Types.RawStatusRow[];
  statusMapping: Types.StatusMapping[];
  onStatusMappingChange: (mappings: Types.StatusMapping[]) => void;

  canalRule: Types.CanalRule[];

  onCanalRuleChange: React.Dispatch<React.SetStateAction<Types.CanalRule[]>>;
  reportDate: string;
  tableName: string;

  fetchUnclassifiedCanalCombos: (
    mapping: Types.ColumnMapping,
    mappings: Types.CanalRule[],
  ) => Promise<Types.UnclassifiedCanalCombo[]>;

  runCustomKPIExpr: (sqlExpr: string) => Promise<number | null>;
}) {
  const [section, setSection] = useState<ConfigSection>("status");

  const criticalCount = useMemo(
    () =>
      computeAIInsights(kpi, canals, hourly, statusData).filter((i) => i.severity === "critical")
        .length,
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
      key: "status",
      label: "Config. Statuts",
      icon: Tag,
      badge:
        rawStatuses.filter((r) => !statusMapping.find((m) => m.rawCode === r.rawCode)).length > 0
          ? "!"
          : undefined,
      activeClass: "bg-amber-600 dark:bg-amber-500 text-white shadow-sm shadow-amber-500/30",
    },
    {
      key: "canals",
      label: "Règles de canaux",
      icon: ListFilter,
      badge: canalRule.length > 0 ? String(canalRule.length) : undefined,
      activeClass: "bg-emerald-600 dark:bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
    },

    {
      key: "kpis",
      label: "KPIs Personnalisés",
      icon: FlaskConical,
      activeClass: "bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm shadow-indigo-500/30",
    },
    {
      key: "storage",
      label: "Stockage",
      icon: Database,
      activeClass: "bg-rose-600 dark:bg-rose-500 text-white shadow-sm shadow-rose-500/30",
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
          {section === "status" && (
            <Section title="Configuration des Codes Statut" icon={<Tag className="w-4 h-4" />}>
              <StatusConfigPanel
                rawStatuses={rawStatuses}
                mapping={statusMapping}
                onUpdateMapping={onStatusMappingChange}
                tableName={tableName}
              />
            </Section>
          )}
          {section === "canals" && (
            <Section title="Règles de canaux" icon={<ListFilter className="w-4 h-4" />}>
              <CanalRulesPanel
                mapping={m}
                rules={canalRule}
                onRulesChange={onCanalRuleChange}
                fetchUnclassifiedCanalCombos={fetchUnclassifiedCanalCombos}
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
});
