import { useState, type ElementType } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers,
  LineChart,
  TrendingUp,
} from "lucide-react";
import type { Anomaly, Insight } from "@/features/ai-analysis/model/types";
// ─── Sub-components ───────────────────────────────────────────────────────────

export function SeverityBadge({
  severity,
}: {
  severity: Anomaly["severity"] | Insight["severity"];
}) {
  const map = {
    critical: "bg-red-500/20 text-red-300 border border-red-500/30",
    warning: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
    info: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    success: "bg-green-500/20 text-green-300 border border-green-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[severity]}`}
    >
      {severity}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ElementType;
  color: string;
  trend?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {trend !== undefined && (
        <div
          className={`flex items-center gap-1 text-xs ${trend >= 0 ? "text-green-400" : "text-red-400"}`}
        >
          {trend >= 0 ? (
            <ArrowUpRight className="w-3 h-3" />
          ) : (
            <ArrowDownRight className="w-3 h-3" />
          )}
          {Math.abs(trend).toFixed(1)}% from baseline
        </div>
      )}
    </motion.div>
  );
}

export function InsightCard({
  insight,
  onAcknowledge,
}: {
  insight: Insight;
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const icons = {
    anomaly: AlertTriangle,
    trend: TrendingUp,
    correlation: GitBranch,
    quality: CheckCircle2,
    pattern: Layers,
    forecast: LineChart,
  };
  const Icon = icons[insight.category];
  const catColor = {
    anomaly: "text-red-400 bg-red-400/10",
    trend: "text-blue-400 bg-blue-400/10",
    correlation: "text-purple-400 bg-purple-400/10",
    quality: "text-green-400 bg-green-400/10",
    pattern: "text-yellow-400 bg-yellow-400/10",
    forecast: "text-cyan-400 bg-cyan-400/10",
  }[insight.category];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: insight.acknowledged ? 0.5 : 1, x: 0 }}
      className={`bg-card border rounded-xl overflow-hidden ${
        insight.severity === "critical"
          ? "border-red-500/30"
          : insight.severity === "warning"
            ? "border-yellow-500/30"
            : insight.severity === "success"
              ? "border-green-500/30"
              : "border-border"
      }`}
    >
      <button
        type="button"
        className="w-full text-left p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-lg ${catColor}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {insight.title}
              </span>
              <SeverityBadge severity={insight.severity} />
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  insight.impact === "high"
                    ? "bg-red-500/20 text-red-300"
                    : insight.impact === "medium"
                      ? "bg-yellow-500/20 text-yellow-300"
                      : "bg-muted text-foreground"
                }`}
              >
                {insight.impact} impact
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {insight.description}
            </p>
          </div>
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Confidence
                </div>
                <ConfidenceBar value={insight.confidence} />
              </div>
              {insight.metric && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Metric:</span>
                  <span className="text-foreground font-mono bg-muted px-2 py-0.5 rounded">
                    {insight.metric}
                  </span>
                  {insight.value && (
                    <span className="text-foreground">{insight.value}</span>
                  )}
                </div>
              )}
              {!insight.acknowledged && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcknowledge(insight.id);
                  }}
                  className="text-xs px-3 py-1.5 bg-accent hover:bg-accent/80 rounded-lg text-foreground transition-colors"
                >
                  Mark as reviewed
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
