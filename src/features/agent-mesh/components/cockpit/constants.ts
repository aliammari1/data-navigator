import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Database,
  FileText,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  Users,
  Zap,
} from "lucide-react";
import type React from "react";
import type {
  EvidenceFilter,
  EvidenceSeverity,
  EvidenceType,
  PlanMode,
  TaskStatus,
} from "./types";
// ─── Constants ────────────────────────────────────────────────────────────────

export const PLAN_MODES: Array<{
  value: PlanMode;
  label: string;
  icon: React.ElementType;
  description: string;
}> = [
  {
    value: "full_story",
    label: "Full Story",
    icon: Sparkles,
    description: "Complete analysis of the whole dataset",
  },
  {
    value: "success_rate_drop",
    label: "Success Drop",
    icon: TrendingDown,
    description: "Why did success rate fall?",
  },
  {
    value: "failure_root_cause",
    label: "Root Cause",
    icon: AlertTriangle,
    description: "What is causing the most failures?",
  },
  {
    value: "canal_compare",
    label: "Channels",
    icon: Layers,
    description: "Which channels perform best?",
  },
  {
    value: "period_compare",
    label: "Over Time",
    icon: Calendar,
    description: "How does this period compare to the last?",
  },
  {
    value: "anomaly_radar",
    label: "Anomalies",
    icon: Target,
    description: "Are there any unusual patterns?",
  },
  {
    value: "user_concentration",
    label: "Top Users",
    icon: Users,
    description: "Who are the biggest accounts?",
  },
  {
    value: "data_quality_audit",
    label: "Data Quality",
    icon: ShieldCheck,
    description: "Is the data complete and consistent?",
  },
];

export const SEVERITY_CONFIG: Record<
  EvidenceSeverity,
  { dot: string; badge: string; border: string; label: string }
> = {
  critical: {
    dot: "bg-rose-500",
    badge: "bg-rose-500/10  text-rose-400  border-rose-500/20",
    border: "border-l-rose-500/60",
    label: "High Risk",
  },
  warning: {
    dot: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    border: "border-l-amber-400/60",
    label: "Watch Out",
  },
  positive: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    border: "border-l-emerald-500/60",
    label: "Good News",
  },
  info: {
    dot: "bg-zinc-500",
    badge: "bg-white/5 text-zinc-400 border-white/10",
    border: "border-l-zinc-500/40",
    label: "Info",
  },
};

export const STATUS_CONFIG: Record<TaskStatus, { dot: string; label: string }> =
  {
    done: { dot: "bg-zinc-400", label: "Done" },
    running: { dot: "bg-zinc-200 animate-pulse", label: "Analyzing…" },
    queued: { dot: "bg-zinc-600", label: "Waiting" },
    blocked: { dot: "bg-zinc-600", label: "Waiting" },
    error: { dot: "bg-rose-500", label: "Failed" },
    idle: { dot: "bg-zinc-800", label: "Pending" },
  };

export const TYPE_CONFIG: Record<
  EvidenceType,
  { icon: React.ElementType; color: string; label: string }
> = {
  fact: {
    icon: Database,
    color: "text-zinc-300 bg-white/6",
    label: "Key Metric",
  },
  finding: { icon: Zap, color: "text-zinc-300 bg-white/6", label: "Finding" },
  chart: { icon: BarChart3, color: "text-zinc-300 bg-white/6", label: "Chart" },
  table: {
    icon: FileText,
    color: "text-zinc-400 bg-white/5",
    label: "Data Table",
  },
  anomaly: {
    icon: AlertTriangle,
    color: "text-zinc-300 bg-white/6",
    label: "Alert",
  },
  recommendation: {
    icon: ArrowRight,
    color: "text-zinc-300 bg-white/6",
    label: "Next Step",
  },
  lineage: {
    icon: GitBranch,
    color: "text-zinc-400 bg-white/5",
    label: "Data Source",
  },
};

export const PHASE_CONFIG = {
  foundation: { label: "Foundation", color: "text-zinc-500" },
  analysis: { label: "Analysis", color: "text-zinc-500" },
  "deep-dive": { label: "Deep Dive", color: "text-zinc-500" },
  synthesis: { label: "Synthesis", color: "text-zinc-500" },
} as const;
