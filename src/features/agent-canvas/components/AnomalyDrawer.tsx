"use client";

/**
 * AnomalyDrawer — vaul bottom sheet showing IQR outlier rows,
 * distribution chart with markers, and filter action.
 */

import { AlertTriangle, Filter } from "lucide-react";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import type { WidgetState } from "@/features/agent-canvas/core/types";
import { getAnalysisProxy } from "@/platform/viz";
import { cn } from "@/shared/utils";

interface AnomalyInfo {
  column: string;
  outliers: Array<{ rowIndex: number; value: number; score: number }>;
  q1: number;
  q3: number;
  iqr: number;
  lower: number;
  upper: number;
  mean: number;
  stdev: number;
}

function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

/** Inline IQR fallback (identical rule to the worker) for no-Worker runtimes. */
function inlineIqr(
  vals: number[],
  lower: number,
  upper: number,
  iqr: number,
): { indices: number[]; scores: number[] } {
  const indices: number[] = [];
  const scores: number[] = [];
  if (Math.abs(iqr) < 1e-12) return { indices, scores };
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v < lower || v > upper) {
      indices.push(i);
      scores.push(Math.round((Math.max(lower - v, v - upper) / iqr) * 1000) / 1000);
    }
  }
  return { indices, scores };
}

/**
 * Detect IQR outliers per numeric column using the SEEDED analysis worker
 * (`getAnalysisProxy().detectAnomalies`, method "iqr") — off the main thread and
 * deterministic, instead of the previous hand-rolled `simple-statistics` pass.
 * The descriptive scalars (q1/q3/mean/stdev) are cheap deterministic summaries
 * derived from the same values purely for labelling the distribution chart.
 */
async function detectOutliers(
  data: Record<string, unknown>[],
  numericCols: string[],
): Promise<AnomalyInfo[]> {
  const analysis = getAnalysisProxy();
  const infos: AnomalyInfo[] = [];

  for (const col of numericCols.slice(0, 3)) {
    const values = data
      .map((r, i) => ({ v: Number(r[col]), i }))
      .filter((x) => !Number.isNaN(x.v));

    if (values.length < 4) continue;

    const vals = values.map((x) => x.v);
    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const stdev = Math.sqrt(
      vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length - 1),
    );

    // Worker-backed IQR anomaly detection (seeded, off main thread). When no
    // module-worker exists (SSR/exotic runtime), the SAME IQR rule runs inline.
    const { indices, scores } = analysis
      ? await analysis.detectAnomalies(vals, { method: "iqr", threshold: 1.5 })
      : inlineIqr(vals, lower, upper, iqr);

    const outliers = indices
      .map((localIdx, k) => ({
        rowIndex: values[localIdx]?.i ?? localIdx,
        value: vals[localIdx],
        score: scores[k] ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (outliers.length > 0) {
      infos.push({ column: col, outliers, q1, q3, iqr, lower, upper, mean, stdev });
    }
  }

  return infos;
}

// ─── Mini distribution bar chart ─────────────────────────────────────────────

function DistributionBar({
  values,
  lower,
  upper,
  mean,
}: {
  values: number[];
  lower: number;
  upper: number;
  mean: number;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const BINS = 20;

  const bins = Array(BINS).fill(0);
  for (const v of values) {
    const idx = Math.min(BINS - 1, Math.floor(((v - min) / range) * BINS));
    bins[idx]++;
  }
  const maxBin = Math.max(...bins, 1);

  const lowerPct = Math.max(0, ((lower - min) / range) * 100);
  const upperPct = Math.min(100, ((upper - min) / range) * 100);
  const meanPct = ((mean - min) / range) * 100;

  return (
    <div className="relative h-12 flex items-end gap-px">
      {/* Normal range highlight */}
      <div
        className="absolute top-0 bottom-0 bg-emerald-900/20 border-x border-emerald-700/30 pointer-events-none"
        style={{ left: `${lowerPct}%`, right: `${100 - upperPct}%` }}
      />
      {/* Mean line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-blue-400/60 pointer-events-none"
        style={{ left: `${meanPct}%` }}
      />
      {/* Bars */}
      {bins.map((count, i) => {
        const _pct = (i / BINS) * 100;
        const center = min + (i / BINS) * range;
        const isOut = center < lower || center > upper;
        return (
          <div
            key={i}
            className={cn("flex-1", isOut ? "bg-red-500/70" : "bg-slate-600")}
            style={{ height: `${(count / maxBin) * 100}%` }}
            title={`${center.toFixed(2)}: ${count}`}
          />
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  widget: WidgetState;
  onFilter: (col: string, lower: number, upper: number) => void;
}

export function AnomalyDrawer({ widget, onFilter }: Props) {
  const [open, setOpen] = useState(false);
  const [infos, setInfos] = useState<AnomalyInfo[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const rawData = widget.rawData;
    if (!rawData?.length) return;
    let cancelled = false;
    const firstRow = rawData[0] ?? {};
    const numericCols = Object.keys(firstRow).filter((k) => {
      const v = firstRow[k];
      return typeof v === "number" || (!Number.isNaN(Number(v)) && v !== "");
    });
    void detectOutliers(rawData, numericCols).then((detected) => {
      if (!cancelled) setInfos(detected);
    });
    return () => {
      cancelled = true;
    };
  }, [widget.rawData]);

  if (infos.length === 0) return null;

  const totalOutliers = infos.reduce((s, i) => s + i.outliers.length, 0);
  const info = infos[selected];

  const allValues = (widget.rawData ?? [])
    .map((r) => Number(r[info?.column ?? ""] ?? NaN))
    .filter((v) => !Number.isNaN(v));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
        title="View anomalies"
      >
        <AlertTriangle className="w-2.5 h-2.5" />⚠ {totalOutliers}
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 rounded-t-2xl max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex-none p-4 border-b border-slate-800">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-white">
                  Anomaly Inspector
                </span>
                <span className="text-xs text-amber-400 bg-amber-900/30 border border-amber-700/30 px-2 py-0.5 rounded">
                  {totalOutliers} outliers
                </span>
              </div>
              <p className="text-xs text-slate-400">{widget.spec.title}</p>

              {/* Column selector */}
              <div className="flex gap-2 mt-3">
                {infos.map((info, i) => (
                  <button
                    key={info.column}
                    type="button"
                    onClick={() => setSelected(i)}
                    className={cn(
                      "px-2 py-1 rounded text-[10px] border transition-colors",
                      selected === i
                        ? "border-amber-600 bg-amber-900/30 text-amber-300"
                        : "border-slate-700 text-slate-400 hover:border-slate-600",
                    )}
                  >
                    {info.column} ({info.outliers.length})
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            {info && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Q1", value: info.q1.toFixed(2) },
                    { label: "Q3", value: info.q3.toFixed(2) },
                    { label: "IQR", value: info.iqr.toFixed(2) },
                    { label: "σ", value: info.stdev.toFixed(2) },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="bg-slate-800 rounded-lg p-2 text-center"
                    >
                      <p className="text-[10px] text-slate-500">{s.label}</p>
                      <p className="text-sm font-bold text-white">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Distribution chart */}
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">
                    Distribution (red = outlier zone)
                  </p>
                  <DistributionBar
                    values={allValues}
                    lower={info.lower}
                    upper={info.upper}
                    mean={info.mean}
                  />
                  <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                    <span>fence: {info.lower.toFixed(1)}</span>
                    <span>mean: {info.mean.toFixed(1)}</span>
                    <span>fence: {info.upper.toFixed(1)}</span>
                  </div>
                </div>

                {/* Outlier rows */}
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">
                    Extreme rows
                  </p>
                  <div className="rounded-lg border border-slate-800 overflow-hidden">
                    <table className="min-w-full text-[11px]">
                      <thead className="bg-slate-800">
                        <tr>
                          <th className="text-left px-3 py-1.5 text-slate-400">
                            Row
                          </th>
                          <th className="text-left px-3 py-1.5 text-slate-400">
                            {info.column}
                          </th>
                          <th className="text-left px-3 py-1.5 text-slate-400">
                            Score
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {info.outliers.map((o) => (
                          <tr
                            key={o.rowIndex}
                            className="border-t border-slate-800"
                          >
                            <td className="px-3 py-1 text-slate-500">
                              {o.rowIndex + 1}
                            </td>
                            <td className="px-3 py-1 text-red-300 font-mono font-bold">
                              {o.value.toLocaleString()}
                            </td>
                            <td className="px-3 py-1 text-amber-400">
                              {o.score.toFixed(2)}x
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Filter action */}
                <button
                  type="button"
                  onClick={() => {
                    onFilter(info.column, info.lower, info.upper);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600/20 border border-violet-700/50 text-violet-300 text-sm hover:bg-violet-600/30 transition-colors"
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter outliers (WHERE {info.column} BETWEEN{" "}
                  {info.lower.toFixed(2)} AND {info.upper.toFixed(2)})
                </button>
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
