"use client";

import { Activity, AlertCircle, BarChart2, Clock, Signal, TrendingUp, Zap } from "lucide-react";
import { motion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import { clamp, fmtAmount, fmtDuration, fmtN, fmtPct } from "@/features/telecom/lib/format";
import { REVENUE_GROUPS } from "@/features/telecom/lib/revenue-groups";
import type * as Types from "@/features/telecom/types";
import { useLazyQuery } from "@/hooks/use-lazy-query";
import { cn } from "@/shared/utils";
import { AnimCounter } from "./anim-counter";
import { CanalHeatmap } from "./canal-heatmap";
import { HourlyChart } from "./hourly-chart";
import { KPICard } from "./kpi-card";
import { Section } from "./section";

// ─── AnalysisTab ──────────────────────────────────────────────────────────────

export const AnalysisTab = memo(function AnalysisTab({
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
  fetchCanalHourlyMatrix: (m: Types.ColumnMapping) => Promise<Types.CanalHourCell[]>;
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
  const _operators = operatorsProp.length > 0 ? operatorsProp : (lazyOperators ?? []);
  const _regions = regionsProp.length > 0 ? regionsProp : (lazyRegions ?? []);

  // Unified Top 50 state — accounts (source), accounts (destination), regions/agents
  type Top50View = "source" | "destination" | "regions";
  const [top50View, setTop50View] = useState<Top50View>("source");
  const [selectedGroup, setSelectedGroup] = useState<string>("Recharge");
  const [selectedSubGroup, setSelectedSubGroup] = useState<string>("");

  // Get level 1 groups for the main category selection
  const level1Groups = useMemo(() =>
    Object.entries(REVENUE_GROUPS)
      .filter(([_, v]) => v.level === 1)
      .map(([k, v]) => ({ name: k, color: v.color })),
    [REVENUE_GROUPS]
  );
  const [top50Rows, setTop50Rows] = useState<
    Array<{
      name: string;
      msisdn: string;
      accountName: string;
      total: number;
      success: number;
      amount: number;
    }>
  >([]);
  const [top50Loading, setTop50Loading] = useState(false);
  const [sortBy, setSortBy] = useState<"nombre" | "montant">("nombre");
  const sortedTop50 = useMemo(
    () =>
      [...top50Rows].sort((a, b) =>
        sortBy === "nombre" ? b.total - a.total : b.amount - a.amount,
      ),
    [top50Rows, sortBy],
  );
  useEffect(() => {
    // Get the group to use (sub-group if selected, otherwise main group)
    const groupName = selectedSubGroup || selectedGroup;
    const group = REVENUE_GROUPS[groupName];

    if (!group || !group.keys || group.keys.length === 0) {
      setTop50Rows([]);
      return;
    }

    setTop50Loading(true);

    const fetchData = async () => {
      try {
        let rows: Types.OperatorRow[] | Types.RegionRow[];
        if (top50View === "source") {
          rows = await fetchOperatorsForGroup(m, group.keys);
        } else if (top50View === "destination") {
          rows = await fetchDestinationsForGroup(m, group.keys);
        } else {
          rows = await fetchRegionsForGroup(m, group.keys);
        }

        return rows.map((r) => ({
          name: top50View === "regions" ? (r as Types.RegionRow).region : (r as Types.OperatorRow).operator,
          msisdn: top50View === "regions" ? "" : (r as Types.OperatorRow).msisdn,
          accountName: top50View === "regions" ? "" : (r as Types.OperatorRow).accountName,
          total: r.total,
          success: r.success,
          amount: r.amount,
        }));
      } catch (error) {
        console.error("Failed to fetch top 50 data:", error);
        return [];
      }
    };

    fetchData().then(setTop50Rows).finally(() => setTop50Loading(false));
  }, [
    top50View,
    selectedGroup,
    selectedSubGroup,
    m,
    fetchRegionsForGroup,
    fetchOperatorsForGroup,
    fetchDestinationsForGroup,
  ]);

  const { peakRow, quietRow, worstRow } = useMemo(() => {
    const peak = hourly.reduce(
      (b, r) => (r.total > b.total ? r : b),
      hourly[0] ?? { hour: 0, total: 0, success: 0, declined: 0, amount: 0 },
    );
    const quiet = hourly
      .filter((r) => r.total > 0)
      .reduce((b, r) => (r.total < b.total ? r : b), peak);
    const worst = hourly.reduce((b, r) => {
      const ar = r.total > 0 ? r.declined / r.total : 0;
      const ab = b.total > 0 ? b.declined / b.total : 0;
      return ar > ab ? r : b;
    }, hourly[0] ?? { hour: 0, total: 0, success: 0, declined: 0, amount: 0 });
    return { peakRow: peak, quietRow: quiet, worstRow: worst };
  }, [hourly]);

  // suppress unused-variable warnings for lazy loading refs
  void opsLoading;
  void regsLoading;

  const hourlyStats = useMemo(
    () => [
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
    ],
    [peakRow, quietRow, worstRow, kpi.totalTransactions],
  );

  return (
    <div className="space-y-6">
      {/* Hourly analysis */}
      <Section title="Profils de Trafic Horaire" icon={<Clock className="w-4 h-4" />}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          {hourlyStats.map((item, i) => (
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
              className={cn("rounded-xl border p-4", item.color.split(" ").slice(0, 2).join(" "))}
            >
              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
              <div className={cn("text-2xl font-bold", item.color.split(" ")[2])}>{item.val}</div>
              <div className="text-xs text-muted-foreground mt-1">{item.sub}</div>
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
          {/* View selector + group pills + sort toggle — each on its own row */}
          <div className="flex flex-col gap-3 mb-4">
            {/* Row 1 — View toggle */}
            <div className="flex flex-wrap items-center gap-3">
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
            </div>

            {/* Row 2 — Level 1 + Level 2 group pills */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Level 1 Group pills (Main Categories) - only show groups with level === 1 */}
              {Object.entries(REVENUE_GROUPS)
                .filter(([_, v]) => v.level === 1)
                .map(([name, { color }]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSelectedGroup(name);
                      setSelectedSubGroup("");
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                      selectedGroup === name && !selectedSubGroup
                        ? "text-white border-transparent shadow-sm"
                        : "text-muted-foreground border-border bg-card hover:bg-muted/50",
                    )}
                    style={selectedGroup === name && !selectedSubGroup ? { background: color } : {}}
                  >
                    {name}
                  </button>
                ))}

              {/* Level 2 Sub-Group pills (show when a Level 1 group is selected) */}
              {selectedGroup && !selectedSubGroup && (
                <>
                  <div className="w-px h-5 bg-border" />
                  {Object.entries(REVENUE_GROUPS)
                    .filter(([_, v]) => v.parent === selectedGroup)
                    .map(([name, { color }]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setSelectedSubGroup(name)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                          selectedSubGroup === name
                            ? "text-white border-transparent shadow-sm"
                            : "text-muted-foreground border-border bg-card hover:bg-muted/50",
                        )}
                        style={selectedSubGroup === name ? { background: color } : {}}
                      >
                        {name}
                      </button>
                    ))}
                </>
              )}

              {selectedSubGroup && (
                <button
                  type="button"
                  onClick={() => setSelectedSubGroup("")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  ← All {selectedGroup}
                </button>
              )}
            </div>

            {/* Row 3 — Sort toggle */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setSortBy("nombre")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all",
                    sortBy === "nombre"
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <BarChart2 className="w-3 h-3" /> Par Nombre
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy("montant")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all",
                    sortBy === "montant"
                      ? "bg-card text-foreground shadow-sm border border-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TrendingUp className="w-3 h-3" /> Par Montant
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {[
                    { label: "#", key: null },
                    { label: top50View === "regions" ? "Agent / Région" : "Account (MSISDN)", key: null },
                    ...(top50View === "regions" ? [] : [{ label: "Account Name", key: null }]),
                    { label: "Total Tx", key: "nombre" },
                    { label: "Réussies", key: null },
                    { label: "Échecs", key: null },
                    { label: "Taux Réussite", key: null },
                    { label: "Montant (TND)", key: "montant" },
                  ].map(({ label, key }) => (
                    <th
                      key={label}
                      className={cn(
                        "px-3 py-2.5 text-left text-[10px] uppercase tracking-wide font-semibold whitespace-nowrap",
                        key && sortBy === key
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {label}
                      {key && sortBy === key && (
                        <span className="ml-1 text-primary">▼</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top50Loading ? (
                  <tr>
                    <td colSpan={top50View === "regions" ? 7 : 8} className="py-8 text-center text-muted-foreground text-xs">
                      Chargement…
                    </td>
                  </tr>
                ) : sortedTop50.length === 0 ? (
                  <tr>
                    <td colSpan={top50View === "regions" ? 7 : 8} className="py-8 text-center text-muted-foreground text-xs">
                      Aucune donnée pour cette sélection.
                    </td>
                  </tr>
                ) : (
                  sortedTop50.map((row, idx) => {
                    const rate = row.total > 0 ? (row.success / row.total) * 100 : 0;
                    return (
                      <tr
                        key={`${row.name}-${row.msisdn}`}
                        className="border-b border-border hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums w-8">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 text-foreground font-medium max-w-50 truncate">
                          {row.name}
                          {row.msisdn && ` (${row.msisdn})`}
                        </td>
                        {top50View !== "regions" && (
                          <td className="px-3 py-2.5 text-muted-foreground max-w-50 truncate">
                            {row.accountName || "—"}
                          </td>
                        )}
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
            icon={<Clock className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />}
            color="border-cyan-500/20 bg-cyan-500/5"
            size="sm"
          />
          <KPICard
            label="Heure de Pointe"
            value={`${kpi.peakHour.toString().padStart(2, "0")}:00`}
            sub="Heure la plus active"
            icon={<TrendingUp className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />}
            color="border-indigo-500/20 bg-indigo-500/5"
            size="sm"
          />
          <KPICard
            label="Abonnés uniques"
            value={<AnimCounter value={kpi.uniqueCustomers} />}
            icon={<Activity className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
            color="border-blue-500/20 bg-blue-500/5"
            size="sm"
          />
          <KPICard
            label="Code d'Erreur Principal"
            value={<span className="text-sm font-mono">{kpi.topErrorCode}</span>}
            icon={<AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />}
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
});
