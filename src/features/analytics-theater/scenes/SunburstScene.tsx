"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtN } from "@/features/telecom/lib/format";
import { SceneShell } from "../components/SceneShell";
import { TheaterChart } from "../components/TheaterChart";
import { useSceneData } from "../hooks/use-scene-data";
import { asNum, asStr, buildSunburstSql } from "../lib/queries";
import { seriesColor, TEXT_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from "../lib/theme";

interface SunburstNode {
  name: string;
  value?: number;
  itemStyle?: { color: string };
  children?: SunburstNode[];
}

/** Nest (l1, l2, v) rows into a two-level sunburst tree. */
function buildTree(rows: Record<string, unknown>[]): {
  tree: SunburstNode[];
  total: number;
} {
  const l1Map = new Map<string, Map<string, number>>();
  const l1Totals = new Map<string, number>();
  let total = 0;

  for (const row of rows) {
    const l1 = asStr(row.l1);
    const l2 = asStr(row.l2);
    const v = asNum(row.v);
    if (!l1 || v <= 0) continue;
    let inner = l1Map.get(l1);
    if (!inner) {
      inner = new Map();
      l1Map.set(l1, inner);
    }
    if (l2 && l2 !== "null") inner.set(l2, (inner.get(l2) ?? 0) + v);
    l1Totals.set(l1, (l1Totals.get(l1) ?? 0) + v);
    total += v;
  }

  const orderedL1 = Array.from(l1Totals.entries()).sort((a, b) => b[1] - a[1]);
  const tree: SunburstNode[] = orderedL1.map(([l1, l1Total], i) => {
    const color = seriesColor(i);
    const inner = l1Map.get(l1);
    const children =
      inner && inner.size > 0
        ? Array.from(inner.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([l2, v]) => ({
              name: l2,
              value: v,
              itemStyle: { color },
            }))
        : undefined;
    return {
      name: l1,
      itemStyle: { color },
      ...(children ? { children } : { value: l1Total }),
    };
  });

  return { tree, total };
}

export default function SunburstScene() {
  const scene = useSceneData(buildSunburstSql);
  const [breadcrumb, setBreadcrumb] = useState<string[]>(["All"]);

  const { tree, total } = useMemo(() => buildTree(scene.rows), [scene.rows]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item" as const,
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDER,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
        formatter: (p: { name: string; value: number }) => {
          const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
          return `<b>${p.name}</b><br/>${fmtN(p.value ?? 0)} (${pct}%)`;
        },
      },
      series: [
        {
          type: "sunburst" as const,
          data: tree,
          radius: ["15%", "90%"],
          center: ["50%", "50%"],
          sort: undefined,
          emphasis: {
            focus: "ancestor" as const,
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" },
          },
          levels: [
            {},
            {
              r0: "15%",
              r: "55%",
              itemStyle: { borderWidth: 2, borderColor: "#0f172a" },
              label: { rotate: "tangential" as const, fontSize: 11, color: "#fff" },
            },
            {
              r0: "55%",
              r: "90%",
              itemStyle: { borderWidth: 2, borderColor: "#0f172a" },
              label: { fontSize: 9, color: TEXT_COLOR },
            },
          ],
          label: { color: TEXT_COLOR },
        },
      ],
    }),
    [tree, total],
  );

  return (
    <SceneShell
      isLoading={scene.isLoading}
      error={scene.error}
      unsupported={scene.unsupported}
      unsupportedHint="Add a dataset with a categorical column to draw a hierarchy."
      isEmpty={scene.isEmpty || tree.length === 0}
      onRetry={scene.refetch}
    >
      <div className="space-y-4">
        {scene.note && <p className="text-xs text-muted-foreground">{scene.note}</p>}

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={`${b}-${i}`}>
              {i > 0 && <span className="text-muted-foreground/40">&#8250;</span>}
              <button
                type="button"
                className={
                  i === breadcrumb.length - 1
                    ? "font-semibold text-foreground"
                    : "cursor-pointer bg-transparent p-0 hover:text-foreground"
                }
                onClick={() => setBreadcrumb(breadcrumb.slice(0, i + 1))}
              >
                {b}
              </button>
            </React.Fragment>
          ))}
        </div>

        <Card>
          <CardContent className="pt-2">
            <TheaterChart
              option={option}
              height={460}
              onEvents={{
                click: (p) => {
                  const name = typeof p.name === "string" ? p.name : null;
                  if (!name) return;
                  setBreadcrumb((prev) => {
                    const idx = prev.indexOf(name);
                    if (idx >= 0) return prev.slice(0, idx + 1);
                    return [...prev, name];
                  });
                },
              }}
            />
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Click any segment to drill down; click a breadcrumb to navigate back.
        </p>
      </div>
    </SceneShell>
  );
}
