"use client";

import {
  Activity,
  AlertCircle,
  BarChart2,
  Brain,
  Clock,
  Loader2,
  Signal,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  clamp,
  fmtAmount,
  fmtDuration,
  fmtN,
  fmtPct,
} from "@/features/telecom/lib/format";
import type * as Types from "@/features/telecom/types";
import { useLazyQuery } from "@/hooks/use-lazy-query";
import { cn } from "@/shared/utils";
import { AnimCounter } from "./anim-counter";
import { CanalHeatmap } from "./canal-heatmap";
import { HourlyChart } from "./hourly-chart";
import { KPICard } from "./kpi-card";
import { Section } from "./section";

// ─── Revenue groups ────────────────────────────────────────────────────────────

const REVENUE_GROUPS: Record<
  string,
  { keys: Types.CanalKey[]; color: string }
> = {
  "Bill Payment": {
    keys: ["bill_payment"],
    color: "#89b4fa",
  },
  Recharge: {
    keys: [
      "voice_fixed_ttcash",
      "voice_fixed_voucher",
      "voice_mobile_ttcash",
      "voice_mobile_voucher",
      "data_sabba",
      "data_evoucher",
    ],
    color: "#a6e3a1",
  },
  "Voucher For Payment": {
    keys: ["voucher_for_payment"],
    color: "#94e2d5",
  },
  "Credit Transfer": {
    keys: ["credit_transfer"],
    color: "#fab387",
  },
  "Voucher Convergent": {
    keys: ["voucher_convergent"],
    color: "#cba6f7",
  },
};

// ─── AnalysisTab ──────────────────────────────────────────────────────────────

export function AnalysisTab({
  operators: operatorsProp,
  regions: regionsProp,
  hourly,
  kpi,
  m,
  fetchOperators,
  fetchRegions,
  fetchOperatorsForGroup,
  fetchDestinationsForGroup,
  fetchRegionsForGroup,
  fetchCanalHourlyMatrix,
}: {
  operators: Types.OperatorRow[];
  regions: Types.RegionRow[];
  hourly: Types.HourlyRow[];
  kpi: Types.KPISummary;
  m: Types.ColumnMapping;
  fetchOperators: (m: Types.ColumnMapping) => Promise<Types.OperatorRow[]>;
  fetchRegions: (m: Types.ColumnMapping) => Promise<Types.RegionRow[]>;
  fetchOperatorsForGroup: (
    m: Types.ColumnMapping,
    groupKeys: Types.CanalKey[],
  ) => Promise<Types.OperatorRow[]>;
  fetchDestinationsForGroup: (
    m: Types.ColumnMapping,
    groupKeys: Types.CanalKey[],
  ) => Promise<Types.OperatorRow[]>;
  fetchRegionsForGroup: (
    m: Types.ColumnMapping,
    groupKeys: Types.CanalKey[],
  ) => Promise<Types.RegionRow[]>;
  fetchCanalHourlyMatrix: (
    m: Types.ColumnMapping,
  ) => Promise<Types.CanalHourCell[]>;
}) {
  // F11 — Lazy-load operators/regions if background task hasn't finished yet
  const {
    data: lazyOperators,
    loading: opsLoading,
    ref: opsRef,
  } = useLazyQuery(() => fetchOperators(m), [m]);
  const {
    data: lazyRegions,
    loading: regsLoading,
    ref: regsRef,
  } = useLazyQuery(() => fetchRegions(m), [m]);

  // Use prop data if available (background task finished), otherwise use lazy result
  const _operators =
    operatorsProp.length > 0 ? operatorsProp : (lazyOperators ?? []);
  const _regions = regionsProp.length > 0 ? regionsProp : (lazyRegions ?? []);

  // Unified Top 50 state — accounts (source), accounts (destination), regions/agents
  const groupNames = Object.keys(REVENUE_GROUPS) as string[];
  type Top50View = "source" | "destination" | "regions";
  const [top50View, setTop50View] = useState<Top50View>("source");
  const [selectedGroup, setSelectedGroup] = useState<string>(groupNames[0]);
  const [top50Rows, setTop50Rows] = useState<
    Array<{ name: string; total: number; success: number; amount: number }>
  >([]);
  const [top50Loading, setTop50Loading] = useState(false);
  useEffect(() => {
    const group = REVENUE_GROUPS[selectedGroup];
    if (!group) return;
    setTop50Loading(true);
    (top50View === "source"
      ? fetchOperatorsForGroup(m, group.keys).then((rows) =>
          rows.map((r) => ({
            name: r.operator,
            total: r.total,
            success: r.success,
            amount: r.amount,
          })),
        )
      : top50View === "destination"
        ? fetchDestinationsForGroup(m, group.keys).then((rows) =>
            rows.map((r) => ({
              name: r.operator,
              total: r.total,
              success: r.success,
              amount: r.amount,
            })),
          )
        : fetchRegionsForGroup(m, group.keys).then((rows) =>
            rows.map((r) => ({
              name: r.region,
              total: r.total,
              success: r.success,
              amount: r.amount,
            })),
          )
    )
      .then(setTop50Rows)
      .finally(() => setTop50Loading(false));
  }, [
    top50View,
    selectedGroup,
    m,
    fetchRegionsForGroup,
    fetchOperatorsForGroup,
    fetchDestinationsForGroup,
  ]);

  const peakRow = hourly.reduce(
    (b, r) => (r.total > b.total ? r : b),
    hourly[0] ?? { hour: 0, total: 0, success: 0, declined: 0, amount: 0 },
  );
  const quietRow = hourly
    .filter((r) => r.total > 0)
    .reduce((b, r) => (r.total < b.total ? r : b), peakRow);
  const worstRow = hourly.reduce((b, r) => {
    const ar = r.total > 0 ? r.declined / r.total : 0;
    const ab = b.total > 0 ? b.declined / b.total : 0;
    return ar > ab ? r : b;
  }, hourly[0] ?? { hour: 0, total: 0, success: 0, declined: 0, amount: 0 });

  // suppress unused-variable warnings for lazy loading refs
  void opsLoading;
  void regsLoading;

  return (
    <div className="space-y-6">
      {/* Hourly analysis */}
      <Section
        title="Profils de Trafic Horaire"
        icon={<Clock className="w-4 h-4" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {[
            {
              label: "Heure de Pointe",
              val: `${peakRow.hour.toString().padStart(2, "0")}:00`,
              sub: `${fmtN(peakRow.total)} tx · ${fmtPct((peakRow.total / Math.max(1, kpi.totalTransactions)) * 100)} du quotidien`,
              color:
                "border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/5 dark:text-indigo-400",
            },
            {
              label: "Heure Calme",
              val: `${quietRow.hour.toString().padStart(2, "0")}:00`,
              sub: `${fmtN(quietRow.total)} tx`,
              color:
                "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-400",
            },
            {
              label: "Pire Heure d'Échec",
              val: `${worstRow.hour.toString().padStart(2, "0")}:00`,
              sub:
                worstRow.total > 0
                  ? `${fmtPct((worstRow.declined / worstRow.total) * 100)} taux d'échec`
                  : "—",
              color:
                "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-400",
            },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 320,
                damping: 24,
                delay: i * 0.08,
              }}
              className={cn(
                "rounded-xl border p-4",
                item.color.split(" ").slice(0, 2).join(" "),
              )}
            >
              <div className="text-xs text-muted-foreground mb-1">
                {item.label}
              </div>
              <div
                className={cn("text-2xl font-bold", item.color.split(" ")[2])}
              >
                {item.val}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {item.sub}
              </div>
            </motion.div>
          ))}
        </div>
        <HourlyChart data={hourly} />
      </Section>

      {/* Unified Top 50 — source / destination / regions */}
      <div ref={opsRef}>
        {/* Sentinel to also trigger lazy regions fetch */}
        <div ref={regsRef} className="sr-only" aria-hidden />
        <Section
          title="Top 50 — Analyse Approfondie"
          icon={<Signal className="w-4 h-4" />}
          badge={top50Loading ? "chargement…" : `${top50Rows.length} entrées`}
        >
          {/* View selector + group pills */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
              {(
                [
                  { key: "source", label: "Comptes Source" },
                  { key: "destination", label: "Comptes Destination" },
                  { key: "regions", label: "Agents / Régions" },
                ] as {
                  key: "source" | "destination" | "regions";
                  label: string;
                }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTop50View(key)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                    top50View === key
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-border" />

            {/* Group pills */}
            {Object.entries(REVENUE_GROUPS).map(([name, { color }]) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedGroup(name)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  selectedGroup === name
                    ? "text-white border-transparent shadow-sm"
                    : "text-muted-foreground border-border bg-card hover:bg-muted/50",
                )}
                style={selectedGroup === name ? { background: color } : {}}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {[
                    "#",
                    top50View === "regions" ? "Agent / Région" : "Account",
                    "Total Tx",
                    "Réussies",
                    "Échecs",
                    "Taux Réussite",
                    "Montant (TND)",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wide text-muted-foreground font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top50Loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground text-xs"
                    >
                      Chargement…
                    </td>
                  </tr>
                ) : top50Rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground text-xs"
                    >
                      Aucune donnée pour cette sélection.
                    </td>
                  </tr>
                ) : (
                  top50Rows.map((row, idx) => {
                    const rate =
                      row.total > 0 ? (row.success / row.total) * 100 : 0;
                    return (
                      <tr
                        key={row.name}
                        className="border-b border-border hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums w-8">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 text-foreground font-medium max-w-50 truncate">
                          {row.name}
                        </td>
                        <td className="px-3 py-2.5 text-foreground font-semibold tabular-nums">
                          {fmtN(row.total)}
                        </td>
                        <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {fmtN(row.success)}
                        </td>
                        <td className="px-3 py-2.5 text-red-600 dark:text-red-400 tabular-nums">
                          {fmtN(row.total - row.success)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-bold tabular-nums w-12",
                                rate >= 95
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : rate >= 80
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-red-600 dark:text-red-400",
                              )}
                            >
                              {row.total > 0 ? fmtPct(rate) : "—"}
                            </span>
                            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  rate >= 95
                                    ? "bg-emerald-500"
                                    : rate >= 80
                                      ? "bg-amber-500"
                                      : "bg-red-500",
                                )}
                                style={{ width: `${clamp(rate, 0, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums font-mono">
                          {fmtAmount(row.amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* Performance metrics */}
      <Section
        title="Métriques de Performance Système"
        icon={<Zap className="w-4 h-4" />}
        collapsible
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Temps de traitement moy."
            value={fmtDuration(kpi.avgProcessingMs)}
            icon={
              <Clock className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
            }
            color="border-cyan-500/20 bg-cyan-500/5"
            size="sm"
          />
          <KPICard
            label="Heure de Pointe"
            value={`${kpi.peakHour.toString().padStart(2, "0")}:00`}
            sub="Heure la plus active"
            icon={
              <TrendingUp className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            }
            color="border-indigo-500/20 bg-indigo-500/5"
            size="sm"
          />
          <KPICard
            label="Abonnés uniques"
            value={<AnimCounter value={kpi.uniqueCustomers} />}
            icon={
              <Activity className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            }
            color="border-blue-500/20 bg-blue-500/5"
            size="sm"
          />
          <KPICard
            label="Code d'Erreur Principal"
            value={
              <span className="text-sm font-mono">{kpi.topErrorCode}</span>
            }
            icon={
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
            }
            color="border-red-500/20 bg-red-500/5"
            size="sm"
          />
        </div>
      </Section>

      {/* Canal × Hour activity heatmap */}
      <Section
        title="Heatmap Activité Canal × Heure"
        icon={<BarChart2 className="w-4 h-4" />}
        badge="nouveau"
        collapsible
      >
        <CanalHeatmap m={m} fetchCanalHourlyMatrix={fetchCanalHourlyMatrix} />
      </Section>
    </div>
  );
}
