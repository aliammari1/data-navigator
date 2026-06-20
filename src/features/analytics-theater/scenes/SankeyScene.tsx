"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtN } from "@/features/telecom/lib/format";
import { SceneShell } from "../components/SceneShell";
import { TheaterChart } from "../components/TheaterChart";
import { useSceneData } from "../hooks/use-scene-data";
import { asNum, asStr, buildSankeySql } from "../lib/queries";
import { seriesColor, TEXT_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from "../lib/theme";

interface SankeyNode {
  name: string;
  itemStyle?: { color: string };
}
interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

/**
 * Build a two-column Sankey from src/tgt/value rows. Source and target names are
 * disambiguated (prefixed) so a value appearing as both a source and a target
 * doesn't create an illegal self/cyclic link in ECharts.
 */
function buildGraph(rows: Record<string, unknown>[]): {
  nodes: SankeyNode[];
  links: SankeyLink[];
  total: number;
} {
  const sources = new Map<string, number>();
  const targets = new Map<string, number>();
  const links: SankeyLink[] = [];
  let total = 0;

  for (const row of rows) {
    const src = asStr(row.src);
    const tgt = asStr(row.tgt);
    const v = asNum(row.v);
    if (!src || !tgt || v <= 0) continue;
    const srcKey = `▸ ${src}`;
    const tgtKey = `${tgt} ◂`;
    sources.set(srcKey, (sources.get(srcKey) ?? 0) + v);
    targets.set(tgtKey, (targets.get(tgtKey) ?? 0) + v);
    links.push({ source: srcKey, target: tgtKey, value: v });
    total += v;
  }

  const nodes: SankeyNode[] = [];
  let ci = 0;
  for (const name of sources.keys()) {
    nodes.push({ name, itemStyle: { color: seriesColor(ci++) } });
  }
  for (const name of targets.keys()) {
    nodes.push({ name, itemStyle: { color: seriesColor(ci++) } });
  }
  return { nodes, links, total };
}

export default function SankeyScene() {
  const scene = useSceneData(buildSankeySql);

  const { nodes, links, total } = useMemo(() => buildGraph(scene.rows), [scene.rows]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item" as const,
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDER,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
        formatter: (p: {
          dataType: string;
          name: string;
          value: number;
          data: { source?: string; target?: string };
        }) => {
          if (p.dataType === "edge") {
            const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
            return `${p.data.source ?? ""} → ${p.data.target ?? ""}<br/><b>${fmtN(
              p.value,
            )}</b> (${pct}%)`;
          }
          return `<b>${p.name}</b><br/>${fmtN(p.value ?? 0)}`;
        },
      },
      series: [
        {
          type: "sankey" as const,
          layout: "none" as const,
          emphasis: { focus: "adjacency" as const },
          nodes,
          links,
          lineStyle: { color: "source" as const, opacity: 0.4, curveness: 0.5 },
          label: { color: TEXT_COLOR, fontSize: 11 },
          nodeWidth: 16,
          nodeGap: 10,
          left: "5%",
          right: "8%",
          top: 12,
          bottom: 12,
        },
      ],
    }),
    [nodes, links, total],
  );

  return (
    <SceneShell
      isLoading={scene.isLoading}
      error={scene.error}
      unsupported={scene.unsupported}
      unsupportedHint="Add a dataset with two categorical columns to draw a flow diagram."
      isEmpty={scene.isEmpty || links.length === 0}
      onRetry={scene.refetch}
    >
      <div className="space-y-4">
        {scene.note && <p className="text-xs text-muted-foreground">{scene.note}</p>}
        <Card>
          <CardContent className="pt-4">
            <TheaterChart option={option} height={440} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="pt-3 text-center">
            <p className="text-xs text-muted-foreground">Total flow</p>
            <p className="mt-1 text-xl font-bold text-foreground">{fmtN(total)}</p>
          </CardContent>
        </Card>
      </div>
    </SceneShell>
  );
}
