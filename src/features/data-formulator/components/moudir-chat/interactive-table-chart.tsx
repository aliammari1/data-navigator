"use client";

/**
 * InteractiveTableChart — renders Markdown tables with a 1-click
 * "Visualiser en graphique (Chat-with-Chart)" toggle and full conversational chart capabilities.
 *
 * Why this exists:
 * Small local LLMs (e.g. Granite 3B, Phi-3) often output tabular data in Markdown
 * (e.g. `Label | Value`) instead of calling the `make_chart` tool call, claiming
 * "Le graphique est prêt à être affiché".
 *
 * This component automatically inspects table columns and rows:
 *   1. Identifies label (dimension) and numeric (measure) columns.
 *   2. Provides a 1-click toggle between [📋 Tableau] and [📊 Graphique interactif].
 *   3. When switched to chart mode, synthesizes a ChartPart and mounts ChatChartArtifact,
 *      unlocking full Chat-with-Chart drilldown, live filtering, and anomaly explanation.
 */

import {
  AreaChart as AreaChartIcon,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { ChatChartArtifact } from "./chat-chart-artifact";
import type { ChartPart } from "../../store/moudir-chat-store";

interface TableNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: TableNode[];
}

interface InteractiveTableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  node?: TableNode;
  children?: React.ReactNode;
}

function extractTextFromHast(node?: TableNode): string {
  if (!node) return "";
  if (node.type === "text" && typeof node.value === "string") {
    return node.value;
  }
  if (Array.isArray(node.children)) {
    return node.children.map(extractTextFromHast).join("");
  }
  return "";
}

function parseNumber(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/[\s\u00A0\u202F]/g, "")
    .replace(/[€$£¥%]/g, "")
    .replace(/'/g, "")
    .replace(/,/g, ".");

  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseHastTable(node?: TableNode) {
  const headers: string[] = [];
  const rows: string[][] = [];

  if (!node || !Array.isArray(node.children)) {
    return { headers, rows, isChartable: false, dimensionCol: "", metricCol: "", chartRows: [] };
  }

  for (const child of node.children) {
    if (child.tagName === "thead") {
      for (const tr of child.children || []) {
        if (tr.tagName === "tr") {
          for (const cell of tr.children || []) {
            if (cell.tagName === "th" || cell.tagName === "td") {
              headers.push(extractTextFromHast(cell).trim());
            }
          }
        }
      }
    } else if (child.tagName === "tbody") {
      for (const tr of child.children || []) {
        if (tr.tagName === "tr") {
          const row: string[] = [];
          for (const cell of tr.children || []) {
            if (cell.tagName === "td" || cell.tagName === "th") {
              row.push(extractTextFromHast(cell).trim());
            }
          }
          if (row.length > 0) {
            rows.push(row);
          }
        }
      }
    }
  }

  if (headers.length < 2 || rows.length === 0) {
    return { headers, rows, isChartable: false, dimensionCol: "", metricCol: "", chartRows: [] };
  }

  // Find column types by testing rows
  const colNumericScores = headers.map((_, colIdx) => {
    let numericCount = 0;
    for (const r of rows) {
      if (r[colIdx] && parseNumber(r[colIdx]) !== null) {
        numericCount++;
      }
    }
    return numericCount / rows.length;
  });

  // Numeric column has score >= 0.7
  const metricColIdx = colNumericScores.findIndex((score) => score >= 0.7);
  // Dimension column is the first non-numeric column (or index 0 if different from metric)
  const dimensionColIdx = headers.findIndex((_, idx) => idx !== metricColIdx && colNumericScores[idx] < 0.7);

  const effectiveDimIdx = dimensionColIdx >= 0 ? dimensionColIdx : (metricColIdx === 0 ? 1 : 0);
  const effectiveMetricIdx = metricColIdx >= 0 ? metricColIdx : (effectiveDimIdx === 0 ? 1 : 0);

  const dimensionCol = headers[effectiveDimIdx] || "Catégorie";
  const metricCol = headers[effectiveMetricIdx] || "Valeur";
  const isChartable = metricColIdx >= 0 && rows.length >= 2;

  const chartRows = rows.map((r) => {
    const label = r[effectiveDimIdx] ?? "";
    const rawVal = r[effectiveMetricIdx] ?? "0";
    const num = parseNumber(rawVal) ?? 0;
    return {
      [dimensionCol]: label,
      [metricCol]: num,
      x_val: label,
      y_val: num,
      label,
      value: num,
    };
  });

  return {
    headers,
    rows,
    isChartable,
    dimensionCol,
    metricCol,
    chartRows,
  };
}

export function InteractiveTableChart({ node, children, className, ...props }: InteractiveTableProps) {
  const tableData = useMemo(() => parseHastTable(node), [node]);
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie" | "area">("bar");

  if (!tableData.isChartable) {
    return (
      <div className="my-2 overflow-x-auto rounded-lg border border-border/70 bg-card/40">
        <table className={cn("w-full border-collapse text-xs", className)} {...props}>
          {children}
        </table>
      </div>
    );
  }

  const chartPart: ChartPart = {
    kind: "chart",
    chartType,
    x: tableData.dimensionCol,
    y: tableData.metricCol,
    aggregate: "none",
    title: `${tableData.metricCol} par ${tableData.dimensionCol}`,
    datasetId: null,
    rows: tableData.chartRows,
  };

  return (
    <div className="my-3 flex flex-col rounded-xl border border-ai/25 bg-card/60 shadow-xs overflow-hidden transition-all">
      {/* Smart Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant="outline"
            className="gap-1 border-ai/30 bg-ai/10 text-ai text-[10px] font-medium tracking-wide py-0.5 px-2"
          >
            <Sparkles className="size-2.5 text-ai shrink-0" />
            Chat-with-Chart
          </Badge>
          <span className="truncate font-medium text-foreground/80 text-[11px]">
            {tableData.dimensionCol} · {tableData.metricCol}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {viewMode === "chart" && (
            <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/80 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "h-5 px-1.5 text-[10px]",
                  chartType === "bar" && "bg-primary/15 text-primary font-medium",
                )}
                onClick={() => setChartType("bar")}
                title="Barres"
              >
                <BarChart3 className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "h-5 px-1.5 text-[10px]",
                  chartType === "line" && "bg-primary/15 text-primary font-medium",
                )}
                onClick={() => setChartType("line")}
                title="Lignes"
              >
                <LineChartIcon className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "h-5 px-1.5 text-[10px]",
                  chartType === "area" && "bg-primary/15 text-primary font-medium",
                )}
                onClick={() => setChartType("area")}
                title="Aires"
              >
                <AreaChartIcon className="size-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  "h-5 px-1.5 text-[10px]",
                  chartType === "pie" && "bg-primary/15 text-primary font-medium",
                )}
                onClick={() => setChartType("pie")}
                title="Camembert"
              >
                <PieChartIcon className="size-3" />
              </Button>
            </div>
          )}

          <div className="flex items-center rounded-md border border-border/60 bg-background/80 p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                "h-5 gap-1 px-2 text-[10px] transition-colors",
                viewMode === "table" ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setViewMode("table")}
            >
              <TableIcon className="size-3" />
              <span>Tableau</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                "h-5 gap-1 px-2 text-[10px] transition-colors",
                viewMode === "chart" ? "bg-ai/20 text-ai font-medium" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setViewMode("chart")}
            >
              <BarChart3 className="size-3 text-ai" />
              <span>Graphique</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Content: Table or Interactive Chart */}
      {viewMode === "table" ? (
        <div className="flex flex-col">
          <div className="overflow-x-auto p-1">
            <table className={cn("w-full border-collapse text-xs", className)} {...props}>
              {children}
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-3 py-1.5">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3 text-ai" />
              Visualisez et explorez ces données de manière interactive.
            </span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="h-6 gap-1.5 bg-ai/15 text-ai hover:bg-ai/25 border border-ai/30 text-[11px] font-medium transition-all"
              onClick={() => setViewMode("chart")}
            >
              <BarChart3 className="size-3 text-ai" />
              <span>Afficher en graphique (Chat-with-Chart)</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-2">
          <ChatChartArtifact part={chartPart} />
        </div>
      )}
    </div>
  );
}
