"use client";

/**
 * Tab 3 — Revenue Impact Simulator.
 *
 * Baseline (volume, success rate, avg ticket) and the channel revenue breakdown
 * come from REAL DuckDB data via `useForecastData`. The sliders apply
 * deterministic what-if multipliers on top of the real baseline.
 *
 * Saved scenarios are persisted to a feature-local Dexie DB (scoped to the
 * active dataset) so they survive a reload — replacing the previous in-memory
 * React-state-only list.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { fmtCompact, fmtN } from "@/features/telecom/lib/format";
import { SavedScenarioList } from "../components/SavedScenarioList";
import {
  deleteScenario,
  listScenarios,
  putScenario,
  type SavedScenarioRecord,
} from "../data/forecast-db";
import { useForecastData } from "../data/use-forecast-data";
import {
  AnimatedNumber,
  baselineFromDaily,
  cn,
  LoadingState,
  NoDatasetState,
  NotEnoughDataState,
} from "./shared";

const CHANNEL_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#a78bfa",
];

export default function RevenueSimulatorTab() {
  const data = useForecastData();
  const queryClient = useQueryClient();
  const tableName = data.tableName ?? "";
  const [successAdj, setSuccessAdj] = useState(0);
  const [volumeAdj, setVolumeAdj] = useState(0);
  const [amountAdj, setAmountAdj] = useState(0);
  const [scenarioName, setScenarioName] = useState("");
  const [compareSelected, setCompareSelected] = useState<string[]>([]);

  // Saved scenarios persisted to Dexie, scoped to the active dataset.
  const scenariosKey = ["forecast", "scenarios", tableName] as const;
  const { data: savedScenarios = [] } = useQuery({
    queryKey: scenariosKey,
    enabled: Boolean(tableName),
    queryFn: () => listScenarios(tableName),
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (rec: Omit<SavedScenarioRecord, "id" | "updatedAt">) => putScenario(rec),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenariosKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScenario(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scenariosKey }),
  });

  const baseline = useMemo(() => baselineFromDaily(data.daily), [data.daily]);
  const baseSuccessRate = baseline.successRate;
  const baseVolume = baseline.volume;
  const baseAmount = baseline.avgAmount;
  const baseDailyRevenue = baseline.revenue;

  const adjustedRevenue = useMemo(() => {
    const adjVolume = baseVolume * (1 + volumeAdj / 100);
    const adjAmount = baseAmount * (1 + amountAdj / 100);
    const adjSuccess = Math.min(1, Math.max(0, baseSuccessRate + successAdj / 100));
    return adjVolume * adjAmount * adjSuccess;
  }, [successAdj, volumeAdj, amountAdj, baseSuccessRate, baseVolume, baseAmount]);

  const delta = adjustedRevenue - baseDailyRevenue;

  const pieOption = useMemo(() => {
    const volumeFactor = 1 + volumeAdj / 100;
    const amountFactor = 1 + amountAdj / 100;
    const successFactor =
      baseSuccessRate > 0
        ? Math.min(1, Math.max(0, baseSuccessRate + successAdj / 100)) / baseSuccessRate
        : 1;
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#e2e8f0" },
        formatter: (p: { name: string; value: number; percent: number }) =>
          `${p.name}<br/>${fmtN(p.value, 0)} TND (${p.percent.toFixed(1)}%)`,
      },
      legend: {
        orient: "vertical",
        right: 0,
        top: "center",
        textStyle: { color: "#94a3b8", fontSize: 11 },
      },
      series: [
        {
          name: "Revenue by Channel",
          type: "pie",
          radius: ["40%", "68%"],
          center: ["40%", "50%"],
          data: data.channels.map((ch) => ({
            name: ch.label,
            value: Math.round(ch.amount * volumeFactor * amountFactor * successFactor),
          })),
          label: { show: false },
          itemStyle: { borderRadius: 4 },
          color: CHANNEL_COLORS,
        },
      ],
    };
  }, [successAdj, volumeAdj, amountAdj, baseSuccessRate, data.channels]);

  const saveScenario = useCallback(() => {
    if (!scenarioName.trim() || !tableName) return;
    saveMutation.mutate({
      tableName,
      name: scenarioName.trim(),
      successAdj,
      volumeAdj,
      amountAdj,
      projectedRevenue: adjustedRevenue,
      delta,
    });
    setScenarioName("");
  }, [
    scenarioName,
    tableName,
    saveMutation,
    successAdj,
    volumeAdj,
    amountAdj,
    adjustedRevenue,
    delta,
  ]);

  const toggleCompare = (id: string) => {
    setCompareSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev,
    );
  };

  const compareScenarios = savedScenarios.filter((s) => compareSelected.includes(s.id));

  if (data.noDataset) return <NoDatasetState what="the revenue simulator" />;
  if (data.isLoading) return <LoadingState />;
  if (data.daily.length < 1) return <NotEnoughDataState what="The simulator" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="bg-slate-900/60 ring-slate-700/40">
            <CardHeader>
              <CardTitle className="text-slate-200">Latest Baseline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-slate-500">Volume</p>
                  <p className="text-lg font-bold text-slate-100">{fmtN(baseVolume)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Success Rate</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {(baseSuccessRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Revenue</p>
                  <p className="text-lg font-bold text-slate-100">
                    {fmtCompact(baseDailyRevenue)} TND
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 ring-slate-700/40">
            <CardHeader>
              <CardTitle className="text-slate-200">Adjust Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SliderRow
                label="Success Rate Adjustment"
                value={successAdj}
                onChange={setSuccessAdj}
                min={-20}
                max={20}
                step={1}
                unit="pp"
              />
              <SliderRow
                label="Volume Adjustment"
                value={volumeAdj}
                onChange={setVolumeAdj}
                min={-50}
                max={100}
                step={5}
                unit="%"
              />
              <SliderRow
                label="Avg Amount Adjustment"
                value={amountAdj}
                onChange={setAmountAdj}
                min={-30}
                max={30}
                step={1}
                unit="%"
              />
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 ring-slate-700/40">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Adjusted Revenue</p>
                  <AnimatedNumber
                    value={adjustedRevenue}
                    format={(v) => `${fmtN(v, 0)} TND`}
                    className="text-2xl font-bold text-slate-50"
                  />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 mb-0.5">Delta</p>
                  <div
                    className={cn(
                      "flex items-center gap-1 text-xl font-bold",
                      delta >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    <span>{delta >= 0 ? "↑" : "↓"}</span>
                    <AnimatedNumber
                      value={delta}
                      format={(v) => `${v >= 0 ? "+" : ""}${fmtN(v, 0)} TND`}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="bg-slate-900/60 ring-slate-700/40">
            <CardHeader>
              <CardTitle className="text-slate-200">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {data.channels.length > 0 ? (
                <ReactECharts option={pieOption} style={{ height: 260 }} />
              ) : (
                <p className="py-12 text-center text-sm text-slate-500">
                  No channel breakdown available for this dataset.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900/60 ring-slate-700/40">
            <CardHeader>
              <CardTitle className="text-slate-200">Save Scenario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Scenario name…"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveScenario()}
                  className="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={saveScenario}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>

              <SavedScenarioList
                scenarios={savedScenarios}
                compareSelected={compareSelected}
                onToggleCompare={toggleCompare}
                onDelete={(id) => {
                  deleteMutation.mutate(id);
                  setCompareSelected((prev) => prev.filter((x) => x !== id));
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {compareScenarios.length > 1 && (
        <Card className="bg-slate-900/60 ring-slate-700/40">
          <CardHeader>
            <CardTitle className="text-slate-200">Scenario Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left py-2 text-slate-400 font-medium">Metric</th>
                  {compareScenarios.map((sc) => (
                    <th key={sc.id} className="text-right py-2 text-slate-400 font-medium">
                      {sc.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    {
                      label: "Success Adj.",
                      get: (s: SavedScenarioRecord) =>
                        `${s.successAdj > 0 ? "+" : ""}${s.successAdj}pp`,
                    },
                    {
                      label: "Volume Adj.",
                      get: (s: SavedScenarioRecord) =>
                        `${s.volumeAdj > 0 ? "+" : ""}${s.volumeAdj}%`,
                    },
                    {
                      label: "Amount Adj.",
                      get: (s: SavedScenarioRecord) =>
                        `${s.amountAdj > 0 ? "+" : ""}${s.amountAdj}%`,
                    },
                    {
                      label: "Revenue",
                      get: (s: SavedScenarioRecord) => `${fmtN(s.projectedRevenue, 0)} TND`,
                    },
                    {
                      label: "Delta",
                      get: (s: SavedScenarioRecord) =>
                        `${s.delta >= 0 ? "+" : ""}${fmtN(s.delta, 0)} TND`,
                    },
                  ] as const
                ).map((row) => (
                  <tr key={row.label} className="border-b border-slate-800/60">
                    <td className="py-2 text-slate-400">{row.label}</td>
                    {compareScenarios.map((sc) => (
                      <td
                        key={sc.id}
                        className={cn(
                          "py-2 text-right",
                          row.label === "Delta"
                            ? sc.delta >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                            : "text-slate-300",
                        )}
                      >
                        {row.get(sc)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-300">{label}</span>
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-slate-400",
          )}
        >
          {value > 0 ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-slate-600 mt-1">
        <span>
          {min}
          {unit}
        </span>
        <span>
          +{max}
          {unit}
        </span>
      </div>
    </div>
  );
}
