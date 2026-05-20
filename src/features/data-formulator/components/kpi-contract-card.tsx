"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Clock, Edit3, FileText, Hash, Info, Layers, ShieldAlert, ThumbsUp, Trash2, User } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import type { KpiContract } from "@/features/data-formulator/core/kpi/kpi-contract";
import { approveKpiContract, rejectKpiContract } from "@/features/data-formulator/core/kpi/kpi-contract";
import { useKpiCatalogStore } from "@/features/data-formulator/core/kpi/kpi-catalog-store";

interface KpiContractCardProps {
  kpi: KpiContract;
  onEdit?: (kpi: KpiContract) => void;
  compact?: boolean;
}

export function KpiContractCard({ kpi, onEdit, compact = false }: KpiContractCardProps) {
  const updateKpi = useKpiCatalogStore((s) => s.updateKpi);
  const [showDetails, setShowDetails] = useState(false);

  const statusConfig = {
    draft: { icon: Edit3, color: "text-slate-300", bg: "bg-slate-500/10", border: "border-slate-500/20" },
    pending: { icon: Clock, color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    approved: { icon: CheckCircle2, color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    rejected: { icon: ShieldAlert, color: "text-rose-300", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  };

  const cfg = statusConfig[kpi.reviewStatus];
  const StatusIcon = cfg.icon;

  if (compact) {
    return (
      <div className={cn("rounded-lg border p-3", cfg.border, cfg.bg)}>
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-3.5 w-3.5", cfg.color)} />
          <span className="truncate text-sm font-medium text-foreground">{kpi.name}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{formatKpiFormula(kpi)}</div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border p-4", cfg.border, "bg-background/80 backdrop-blur-xl")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", cfg.border, cfg.bg)}>
            <BarChart3 className={cn("h-4 w-4", cfg.color)} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{kpi.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{kpi.goal}</p>
          </div>
        </div>
        <div className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", cfg.border, cfg.bg, cfg.color)}>
          {kpi.reviewStatus}
        </div>
      </div>

      {/* Formula */}
      <div className="mt-3 rounded-lg border border-white/5 bg-white/5 p-2.5">
        <div className="text-xs font-medium text-muted-foreground">Formula</div>
        <div className="mt-1 text-sm font-mono text-foreground">{formatKpiFormula(kpi)}</div>
      </div>

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <MetricItem icon={Hash} label="Numerator" value={kpi.numerator} />
        <MetricItem icon={Hash} label="Denominator" value={kpi.denominator} />
        <MetricItem icon={Layers} label="Time Grain" value={kpi.timeGrain} />
        <MetricItem icon={User} label="Owner" value={kpi.owner || "—"} />
      </div>

      {/* Sample */}
      {kpi.sampleResult && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-2.5">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-300" />
          <span className="text-xs text-emerald-200">
            Sample: <strong>{kpi.sampleResult.value}</strong> {kpi.sampleResult.label}
          </span>
        </div>
      )}

      {/* Assumptions */}
      {kpi.assumptions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-muted-foreground">Assumptions</div>
          <ul className="mt-1 space-y-1">
            {kpi.assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Edge cases */}
      {kpi.edgeCases.length > 0 && showDetails && (
        <div className="mt-3">
          <div className="text-xs font-medium text-amber-300">Edge Cases</div>
          <ul className="mt-1 space-y-1">
            {kpi.edgeCases.map((e, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-200/80">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fields */}
      {kpi.fieldsUsed.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {kpi.fieldsUsed.map((f) => (
            <span key={f} className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {kpi.reviewStatus === "draft" || kpi.reviewStatus === "pending" ? (
          <>
            <button
              onClick={() => updateKpi(kpi.id, (k) => approveKpiContract(k, "manager"))}
              className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              <ThumbsUp className="h-3 w-3" />
              Approve
            </button>
            <button
              onClick={() => {
                const reason = prompt("Rejection reason?") || "Rejected by user";
                updateKpi(kpi.id, (k) => rejectKpiContract(k, reason));
              }}
              className="flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
            >
              <ShieldAlert className="h-3 w-3" />
              Reject
            </button>
          </>
        ) : null}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          {showDetails ? "Less" : "More"}
        </button>
        {onEdit && (
          <button onClick={() => onEdit(kpi)} className="text-xs text-muted-foreground hover:text-foreground">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function MetricItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 p-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-xs text-foreground">{value || "—"}</div>
    </div>
  );
}

function formatKpiFormula(kpi: KpiContract): string {
  const num = kpi.numerator || "1";
  const den = kpi.denominator;
  if (!den || den === "1" || den.toLowerCase() === "none") return num;
  return `${num} / ${den}`;
}
