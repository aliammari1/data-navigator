"use client";
import {
  AlertCircle,
  Code2,
  FlaskConical,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";
import { fmtAmount, fmtDuration, fmtN, fmtPct } from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { KPICard } from "./kpi-card";

const KPI_COLOR_PRESETS = [
  { label: "Indigo", value: "border-indigo-500/20 bg-indigo-500/5" },
  { label: "Emerald", value: "border-emerald-500/20 bg-emerald-500/5" },
  { label: "Amber", value: "border-amber-500/20 bg-amber-500/5" },
  { label: "Rose", value: "border-rose-500/20 bg-rose-500/5" },
  { label: "Violet", value: "border-violet-500/20 bg-violet-500/5" },
];

const KPI_EXAMPLES = [
  {
    label: "Tx Haute Valeur",
    expr: `COUNT(*) FILTER (WHERE TRY_CAST("ORIGINAL_AMOUNT" AS DOUBLE) > 1000)`,
    format: "number" as const,
  },
  {
    label: "Débit Net Moyen",
    expr: `ROUND(AVG(TRY_CAST("NET_DEBIT_AMOUNT_SOURCE" AS DOUBLE)),3)`,
    format: "amount" as const,
  },
  {
    label: "MSISDNs Uniques",
    expr: `COUNT(DISTINCT "CUSTOMER_MSISDN")`,
    format: "number" as const,
  },
  {
    label: "Solde Drainé",
    expr: `ROUND(SUM(TRY_CAST("BALANCE_BEFORE" AS DOUBLE) - TRY_CAST("BALANCE_AFTER" AS DOUBLE)),3)`,
    format: "amount" as const,
  },
  {
    label: "Taux d'Échec %",
    expr: `ROUND(100.0 * SUM(CASE WHEN UPPER(TRIM("TRANSACTION_STATUS"))='REJ' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2)`,
    format: "pct" as const,
  },
];

export function CustomKPIBuilder({
  runCustomKPIExpr,
}: {
  runCustomKPIExpr: (expr: string) => Promise<number | null>;
}) {
  const [kpis, setKpis] = useState<Types.CustomKPI[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newExpr, setNewExpr] = useState("");
  const [newFormat, setNewFormat] = useState<Types.CustomKPI["format"]>("number");
  const [newColor, setNewColor] = useState(KPI_COLOR_PRESETS[0].value);
  const [runErr, setRunErr] = useState("");
  const [running, setRunning] = useState(false);

  const runKpi = async (id: string) => {
    const kpi = kpis.find((k) => k.id === id);
    if (!kpi) return;
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, loading: true, error: "" } : k)));
    try {
      const result = await runCustomKPIExpr(kpi.sqlExpr);
      setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, loading: false, result } : k)));
    } catch (e) {
      setKpis((prev) =>
        prev.map((k) =>
          k.id === id ? { ...k, loading: false, result: null, error: String(e) } : k,
        ),
      );
    }
  };

  const addKpi = async () => {
    if (!newLabel.trim() || !newExpr.trim()) return;
    setRunning(true);
    setRunErr("");
    const id = `kpi_${Date.now()}`;
    try {
      const result = await runCustomKPIExpr(newExpr.trim());
      setKpis((prev) => [
        ...prev,
        {
          id,
          label: newLabel.trim(),
          description: newDesc.trim(),
          sqlExpr: newExpr.trim(),
          format: newFormat,
          colorClass: newColor,
          result,
          loading: false,
          error: "",
        },
      ]);
      setNewLabel("");
      setNewDesc("");
      setNewExpr("");
    } catch (e) {
      setRunErr(String(e));
    } finally {
      setRunning(false);
    }
  };

  const removeKpi = (id: string) => setKpis((prev) => prev.filter((k) => k.id !== id));

  const fmtResult = (kpi: Types.CustomKPI): string => {
    if (kpi.result === null) return "Erreur";
    if (kpi.format === "amount") return fmtAmount(kpi.result);
    if (kpi.format === "pct") return fmtPct(kpi.result);
    if (kpi.format === "duration") return fmtDuration(kpi.result);
    return fmtN(kpi.result);
  };

  return (
    <div className="space-y-6">
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {kpis.map((kpi) => (
            <div key={kpi.id} className="relative group">
              <KPICard
                label={kpi.label}
                value={
                  kpi.loading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : kpi.error ? (
                    <span className="text-xs text-red-600 dark:text-red-400 font-mono">Error</span>
                  ) : (
                    <span>{fmtResult(kpi)}</span>
                  )
                }
                sub={
                  kpi.description || kpi.sqlExpr.slice(0, 40) + (kpi.sqlExpr.length > 40 ? "…" : "")
                }
                icon={<FlaskConical className="w-4 h-4 text-primary" />}
                color={kpi.colorClass}
                size="sm"
              />
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => runKpi(kpi.id)}
                  className="w-5 h-5 rounded bg-accent hover:bg-muted/400 flex items-center justify-center"
                >
                  <RefreshCw className="w-2.5 h-2.5 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => removeKpi(kpi.id)}
                  className="w-5 h-5 rounded bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5 text-red-500 dark:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/40 p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <FlaskConical className="w-4 h-4 text-primary" /> New Custom KPI
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="kpi-label"
              className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5"
            >
              KPI Label
            </label>
            <input
              id="kpi-label"
              type="text"
              placeholder="ex. Tx à haute valeur"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full bg-muted border border-border text-xs text-foreground rounded-lg px-2.5 py-2 outline-none focus:border-ring placeholder-muted-foreground"
            />
          </div>
          <div>
            <label
              htmlFor="kpi-desc"
              className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5"
            >
              Description (optional)
            </label>
            <input
              id="kpi-desc"
              type="text"
              placeholder="Brève description"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full bg-muted border border-border text-xs text-foreground rounded-lg px-2.5 py-2 outline-none focus:border-ring placeholder-muted-foreground"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="kpi-expr"
            className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5"
          >
            <Code2 className="w-3 h-3" /> Expression SQL{" "}
            <span className="normal-case text-muted-foreground">
              (évalué comme SELECT (<i>expr</i>) AS val FROM table)
            </span>
          </label>
          <textarea
            id="kpi-expr"
            value={newExpr}
            onChange={(e) => setNewExpr(e.target.value)}
            placeholder={`COUNT(*) FILTER (WHERE TRY_CAST("ORIGINAL_AMOUNT" AS DOUBLE) > 1000)`}
            rows={2}
            className="w-full bg-background border border-border text-xs text-emerald-700 dark:text-emerald-300 font-mono rounded-lg px-3 py-2 outline-none focus:border-ring placeholder-muted-foreground resize-none"
          />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label
              htmlFor="kpi-format"
              className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5"
            >
              Format
            </label>
            <select
              id="kpi-format"
              value={newFormat}
              onChange={(e) => setNewFormat(e.target.value as Types.CustomKPI["format"])}
              className="bg-muted border border-border text-xs text-muted-foreground rounded-lg px-2.5 py-2 outline-none"
            >
              <option value="number">Number</option>
              <option value="amount">Amount (TND)</option>
              <option value="pct">Percent</option>
              <option value="duration">Duration</option>
            </select>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
              Color
            </p>
            <div className="flex gap-1.5">
              {KPI_COLOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setNewColor(p.value)}
                  title={p.label}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-all",
                    newColor === p.value ? "border-foreground scale-125" : "border-border",
                    p.value.split(" ")[1],
                  )}
                />
              ))}
            </div>
          </div>
        </div>
        {runErr && (
          <div className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-none" />
            <span className="font-mono text-[11px] break-all">{runErr}</span>
          </div>
        )}
        <button
          type="button"
          onClick={addKpi}
          disabled={!newLabel.trim() || !newExpr.trim() || running}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground rounded-xl text-xs font-semibold transition-colors"
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          Exécuter & Ajouter KPI
        </button>
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">
          Quick Examples — cliquez pour charger
        </div>
        <div className="flex flex-wrap gap-2">
          {KPI_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setNewLabel(ex.label);
                setNewExpr(ex.expr);
                setNewFormat(ex.format);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/50 hover:bg-accent border border-border rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="w-3 h-3 text-primary" />
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
