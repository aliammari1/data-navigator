"use client";

/**
 * Interactive canal explorer for the Canaux tab.
 *
 * A two-ring sunburst (inner = CL1 sections, outer = CL2/CL3 sub-sections)
 * describes the report's channel hierarchy. Clicking a slice animates the LEFT
 * detail panel to that node's status breakdown — Réussie / Instance / Annulation
 * / Échec.
 *
 * Performance: the whole hierarchy is fed by ONE query — a single per-canal
 * status matrix over every channel (one table scan). Slice sizes and each node's
 * status are then aggregated client-side, so clicking a section recomputes
 * instantly with no further query.
 */

import ReactECharts from "echarts-for-react/lib/core";
import { CheckCircle2, Clock, Layers, Loader2, RefreshCw, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ALL_CANAL_CHANNELS,
  CANAL_HIERARCHY,
  CANAL_NODE_BY_ID,
  type CanalNode,
} from "@/features/telecom/lib/canal-hierarchy";
import { fmtN, fmtPct } from "@/features/telecom/lib/format";
import type { SpecChStatusRow } from "@/features/telecom/lib/queries";
import type { ChannelDef } from "@/features/telecom/lib/report-engine";
import { type EChartsOption, echarts } from "@/platform/viz";
import { cn } from "@/shared/utils";

type FetchStatusMatrix = (
  channels: ChannelDef[],
  dateFrom: string,
  dateTo: string,
) => Promise<SpecChStatusRow[]>;

interface StatusAgg {
  réussie: number;
  instance: number;
  annulation: number;
  échec: number;
  total: number;
}

const ZERO_AGG: StatusAgg = { réussie: 0, instance: 0, annulation: 0, échec: 0, total: 0 };

const STATUS_META = [
  { key: "réussie", label: "Réussie", color: "#22c55e", Icon: CheckCircle2 },
  { key: "instance", label: "Instance", color: "#f59e0b", Icon: Clock },
  { key: "annulation", label: "Annulation", color: "#8b5cf6", Icon: RefreshCw },
  { key: "échec", label: "Échec", color: "#ef4444", Icon: XCircle },
] as const;

const ROOT_ID = "__all__";

function readThemeClass(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function CanalSunburstExplorer({
  dateFrom,
  dateTo,
  fetchSpecCanalStatusMatrix,
}: {
  dateFrom: string;
  dateTo: string;
  fetchSpecCanalStatusMatrix: FetchStatusMatrix;
}) {
  const [statusRows, setStatusRows] = useState<SpecChStatusRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(ROOT_ID);
  const [themeClass, setThemeClass] = useState<"light" | "dark">(readThemeClass);
  const chartRef = useRef<ReactECharts | null>(null);

  // Re-tint labels/borders on a light/dark flip (the slice hues are theme-safe).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      const next = readThemeClass();
      setThemeClass((cur) => (cur === next ? cur : next));
    });
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // ── ONE query feeds the whole explorer: per-canal status over all channels ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSpecCanalStatusMatrix(ALL_CANAL_CHANNELS, dateFrom, dateTo)
      .then((rows) => {
        if (!cancelled) setStatusRows(rows);
      })
      .catch(() => {
        if (!cancelled) setStatusRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, fetchSpecCanalStatusMatrix]);

  // canal name → its status row, for client-side aggregation by node.
  const statusByCanal = useMemo(() => {
    const map = new Map<string, SpecChStatusRow>();
    for (const r of statusRows ?? []) map.set(r.canal, r);
    return map;
  }, [statusRows]);

  const aggregate = useCallback(
    (channels: ChannelDef[]): StatusAgg =>
      channels.reduce<StatusAgg>((a, ch) => {
        const r = statusByCanal.get(ch.name);
        if (!r) return a;
        return {
          réussie: a.réussie + r.réussie,
          instance: a.instance + r.instance,
          annulation: a.annulation + r.annulation,
          échec: a.échec + r.échec,
          total: a.total + r.total,
        };
      }, ZERO_AGG),
    [statusByCanal],
  );

  // Per-leaf transaction volume (total), driving the sunburst ring sizes.
  const leafValues = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const section of CANAL_HIERARCHY) {
      for (const leaf of section.children ?? [section]) {
        acc[leaf.id] = aggregate(leaf.channels).total;
      }
    }
    return acc;
  }, [aggregate]);

  const selectedNode: CanalNode | null =
    selectedId === ROOT_ID ? null : (CANAL_NODE_BY_ID.get(selectedId) ?? null);
  const selectedChannels = selectedNode?.channels ?? ALL_CANAL_CHANNELS;
  const selectedLabel = selectedNode?.label ?? "Tous les canaux";

  const status = useMemo(
    () => (statusRows ? aggregate(selectedChannels) : null),
    [statusRows, selectedChannels, aggregate],
  );

  // ── Sunburst option ─────────────────────────────────────────────────────────
  const sunburstData = useMemo(() => {
    return CANAL_HIERARCHY.map((section) => {
      const children = (section.children ?? [])
        .map((child) => ({
          name: child.label,
          value: leafValues[child.id] ?? 0,
          nodeId: child.id,
          itemStyle: { color: child.color },
        }))
        .filter((c) => c.value > 0);
      const sectionValue = children.reduce((a, c) => a + c.value, 0);
      return {
        name: section.label,
        value: sectionValue,
        nodeId: section.id,
        itemStyle: { color: section.color },
        children: children.length ? children : undefined,
      };
    }).filter((s) => (s.value ?? 0) > 0);
  }, [leafValues]);

  const option = useMemo(() => {
    const isDark = themeClass === "dark";
    const seam = isDark ? "#0b0f17" : "#ffffff";
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: isDark ? "#1e1e2e" : "#ffffff",
        borderColor: isDark ? "#ffffff20" : "#00000014",
        textStyle: { color: isDark ? "#cdd6f4" : "#1e293b", fontSize: 11 },
        formatter: (p: { name: string; value: number; treePathInfo?: { name: string }[] }) => {
          const path = (p.treePathInfo ?? [])
            .slice(1)
            .map((t) => t.name)
            .join(" › ");
          return `<b>${path || p.name}</b><br/>${fmtN(p.value)} transactions`;
        },
      },
      series: [
        {
          type: "sunburst",
          radius: ["16%", "94%"],
          center: ["50%", "50%"],
          sort: undefined,
          data: sunburstData,
          itemStyle: { borderColor: seam, borderWidth: 2, borderRadius: 4 },
          emphasis: { focus: "ancestor" },
          animationDurationUpdate: 700,
          levels: [
            {},
            {
              r0: "16%",
              r: "58%",
              label: {
                rotate: "tangential",
                color: "#ffffff",
                fontSize: 11,
                fontWeight: "bold",
                minAngle: 8,
              },
            },
            {
              r0: "58%",
              r: "94%",
              label: { color: "#0f172a", fontSize: 10, minAngle: 6 },
            },
          ],
        },
      ],
    };
  }, [sunburstData, themeClass]);

  // Click a slice → drive the left detail panel.
  const onEvents = useMemo(
    () => ({
      click: (params: { data?: { nodeId?: string } }) => {
        const id = params?.data?.nodeId;
        if (id) setSelectedId(id);
      },
    }),
    [],
  );

  // Highlight the selected slice so the chart reflects the detail panel.
  const highlightSelected = useCallback(() => {
    const inst = chartRef.current?.getEchartsInstance?.();
    if (!inst) return;
    inst.dispatchAction({ type: "downplay", seriesIndex: 0 });
    if (selectedNode) {
      inst.dispatchAction({ type: "highlight", seriesIndex: 0, name: selectedNode.label });
    }
  }, [selectedNode]);

  useEffect(() => {
    highlightSelected();
  }, [highlightSelected]);

  const successRate = status && status.total > 0 ? (status.réussie / status.total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
        <Layers className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Explorateur de canaux</span>
        <span className="text-[10px] text-muted-foreground">
          — cliquez une section pour voir ses statuts
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
        {/* ── LEFT: status detail (transforms on click) ── */}
        <div className="p-4 min-h-[320px]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Statuts
              </div>
              <div className="text-sm font-bold text-foreground truncate">{selectedLabel}</div>
            </div>
            {selectedId !== ROOT_ID && (
              <button
                type="button"
                onClick={() => setSelectedId(ROOT_ID)}
                className="flex-none rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Tous les canaux
              </button>
            )}
          </div>

          {loading && !status ? (
            <div className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcul des statuts…
            </div>
          ) : !status || status.total === 0 ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground/60">
              Aucune transaction pour cette sélection.
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
                className="space-y-3"
              >
                {/* Success rate hero */}
                <div className="flex items-end justify-between rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Taux de réussite</div>
                    <div
                      className={cn(
                        "text-2xl font-black tabular-nums",
                        successRate >= 95
                          ? "text-emerald-600 dark:text-emerald-400"
                          : successRate >= 80
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {fmtPct(successRate)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-muted-foreground">Total</div>
                    <div className="text-sm font-bold tabular-nums text-foreground">
                      {fmtN(status.total)} tx
                    </div>
                  </div>
                </div>

                {/* Stacked proportion bar */}
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  {STATUS_META.map((s) => {
                    const v = status[s.key];
                    const pct = status.total > 0 ? (v / status.total) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                      <motion.div
                        key={s.key}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        style={{ background: s.color }}
                        title={`${s.label}: ${fmtPct(pct)}`}
                      />
                    );
                  })}
                </div>

                {/* Status cards */}
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_META.map((s, i) => {
                    const v = status[s.key];
                    const pct = status.total > 0 ? (v / status.total) * 100 : 0;
                    const Icon = s.Icon;
                    return (
                      <motion.div
                        key={s.key}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05, duration: 0.2 }}
                        className="rounded-xl border border-border bg-background/60 p-2.5"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                          <span className="text-[11px] font-semibold text-foreground">
                            {s.label}
                          </span>
                        </div>
                        <div className="text-lg font-black tabular-nums" style={{ color: s.color }}>
                          {fmtN(v)}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {fmtPct(pct)}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* ── RIGHT: the sunburst (master) ── */}
        <div className="relative p-2">
          {loading && !statusRows ? (
            <div className="flex items-center justify-center h-[340px] text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Construction de l'arbre des canaux…
            </div>
          ) : sunburstData.length === 0 ? (
            <div className="flex items-center justify-center h-[340px] text-xs text-muted-foreground/60">
              Aucune donnée sur cette période.
            </div>
          ) : (
            <ReactECharts
              ref={chartRef}
              echarts={echarts}
              option={option as EChartsOption}
              onEvents={onEvents}
              style={{ height: 360 }}
              opts={{ renderer: "canvas" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
