"use client";

import { Database, ListFilter, Settings2, Tag } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useState } from "react";
import { useTelecomStore } from "@/features/telecom/store";
import type * as Types from "@/features/telecom/types";
import type { ServiceCodeRow } from "@/features/telecom/types";
import { cn } from "@/shared/utils";
import { CanalDetectorPanel } from "./canal-detector-panel";
import { CanalRulesPanel } from "./canal-rules-panel";
import { Section } from "./section";
import { StatusConfigPanel } from "./status-config-panel";
import { StorageInfoPanel } from "./storage-info-panel";

type ConfigSection = "status" | "rules" | "canals" | "storage";

export const ConfigTab = memo(function ConfigTab({
  m,
  rawStatuses,
  statusMapping,
  onStatusMappingChange,
  tableName,
  fetchServiceCodeRows,
}: {
  m: Types.ColumnMapping;
  rawStatuses: Types.RawStatusRow[];
  statusMapping: Types.StatusMapping[];
  onStatusMappingChange: (m: Types.StatusMapping[]) => void;
  tableName: string;
  fetchServiceCodeRows: (m: Types.ColumnMapping) => Promise<ServiceCodeRow[]>;
}) {
  const [section, setSection] = useState<ConfigSection>("status");

  const canalRules = useTelecomStore((s) => s.canalRules);
  const setCanalRules = useTelecomStore((s) => s.setCanalRules);

  const fetchUnclassifiedCanalCombos = useCallback(
    async (
      _mapping: Types.ColumnMapping,
      _rules: Types.CanalRule[],
    ): Promise<Types.UnclassifiedCanalCombo[]> => {
      return [];
    },
    [],
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
      key: "rules",
      label: "Règles de canaux",
      icon: Settings2,
      badge: canalRules.length > 0 ? String(canalRules.length) : undefined,
      activeClass: "bg-cyan-600 dark:bg-cyan-500 text-white shadow-sm shadow-cyan-500/30",
    },
    {
      key: "canals",
      label: "Détection Canal",
      icon: ListFilter,
      activeClass: "bg-emerald-600 dark:bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
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
          {section === "rules" && (
            <Section
              title="Règles de classification des canaux"
              icon={<Settings2 className="w-4 h-4" />}
            >
              <CanalRulesPanel
                mapping={m}
                rules={canalRules}
                onRulesChange={setCanalRules}
                fetchUnclassifiedCanalCombos={fetchUnclassifiedCanalCombos}
              />
            </Section>
          )}
          {section === "canals" && (
            <Section
              title="Détecteur de Classification Canal"
              icon={<ListFilter className="w-4 h-4" />}
            >
              <CanalDetectorPanel m={m} fetchServiceCodeRows={fetchServiceCodeRows} />
            </Section>
          )}
          {section === "storage" && <StorageInfoPanel tableName={tableName} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
