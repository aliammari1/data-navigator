"use client";

import { useMemo } from "react";
import {
  Calendar,
  Tag,
  Hash,
  MapPin,
  BarChart3,
  TrendingUp,
  PieChart,
  Activity,
  ScatterChart,
  Lightbulb,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/utils";
import {
  analyzeFields,
  recommendChartsSemantic,
  type SemanticField,
  type ChartTemplate,
} from "@/features/data-formulator/core/semantic-types";
import type { ColumnInfo } from "@/features/data-formulator/core/types";

// ─── Semantic type icons ───────────────────────────────────────────────────────

const SEMANTIC_ICONS: Record<string, { icon: typeof Calendar; color: string; bg: string }> = {
  temporal: { icon: Calendar, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  categorical: { icon: Tag, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  quantitative: { icon: Hash, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  geographic: { icon: MapPin, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  ordinal: { icon: Tag, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  identifier: { icon: Hash, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
  text: { icon: Tag, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
};

const CHART_CATEGORY_ICONS: Record<string, typeof BarChart3> = {
  comparison: BarChart3,
  trend: TrendingUp,
  composition: PieChart,
  distribution: Activity,
  relationship: ScatterChart,
  geographic: MapPin,
  statistical: Hash,
};

// ─── Semantic Recommender ──────────────────────────────────────────────────────

interface SemanticRecommenderProps {
  columns: ColumnInfo[];
  sampleData?: Record<string, unknown>[];
  onCreateChart: (template: ChartTemplate, matchedFields: Record<string, string[]>) => void;
}

export function SemanticRecommender({
  columns,
  sampleData,
  onCreateChart,
}: SemanticRecommenderProps) {
  const fields = useMemo(
    () => analyzeFields(columns, sampleData),
    [columns, sampleData],
  );

  const recommendations = useMemo(
    () => recommendChartsSemantic(fields, 6),
    [fields],
  );

  return (
    <div className="space-y-4">
      {/* Detected fields */}
      <div>
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-2">
          Detected fields
        </p>
        <div className="flex flex-wrap gap-1.5">
          {fields.map((field) => {
            const cfg = SEMANTIC_ICONS[field.semanticType] ?? SEMANTIC_ICONS.categorical;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={field.name}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium",
                  cfg.bg,
                  cfg.color,
                )}
                title={`${field.semanticType} · cardinality: ${field.cardinality ?? "?"}`}
              >
                <Icon className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{field.name}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Smart recommendations */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">
            Smart Recommendations
          </p>
        </div>
        {recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Load data to see chart recommendations.
          </p>
        ) : (
          <div className="space-y-1.5">
            {recommendations.map(({ template, score, matchedFields }, i) => {
              const CategoryIcon = CHART_CATEGORY_ICONS[template.category] ?? BarChart3;
              return (
                <motion.button
                  key={template.type}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  type="button"
                  onClick={() => onCreateChart(template, matchedFields)}
                  className="w-full text-left rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-primary/30 hover:bg-white/8 p-2.5 transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-none">
                      <CategoryIcon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {template.label}
                        </span>
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                          {template.category}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                        {getRecommendationReason(template, matchedFields)}
                      </p>
                    </div>
                    <div className="flex-none">
                      <span className="text-[10px] font-mono text-primary/70">
                        {Math.round(score * 100)}%
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper: generate reason text ──────────────────────────────────────────────

function getRecommendationReason(
  template: ChartTemplate,
  matchedFields: Record<string, string[]>,
): string {
  const parts: string[] = [];
  for (const [channel, fields] of Object.entries(matchedFields)) {
    if (fields.length > 0) {
      parts.push(`${channel}: ${fields.slice(0, 2).join(", ")}`);
    }
  }
  const reasonMap: Record<string, string> = {
    comparison: "Good for comparing categories",
    trend: "Good for showing changes over time",
    composition: "Good for showing parts of a whole",
    distribution: "Good for showing data spread",
    relationship: "Good for showing correlations",
    geographic: "Good for spatial patterns",
    statistical: "Good for statistical analysis",
  };
  const reason = reasonMap[template.category] ?? "Recommended visualization";
  return `${reason}. ${parts.join(" · ")}`;
}