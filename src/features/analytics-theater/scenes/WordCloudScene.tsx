"use client";

import type { ECharts } from "echarts/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { fmtN } from "@/features/telecom/lib/format";
import { SceneShell } from "../components/SceneShell";
import { useSceneData } from "../hooks/use-scene-data";
import { asNum, asStr, buildWordCloudSql } from "../lib/queries";
import { seriesColor, TEXT_COLOR, TOOLTIP_BG, TOOLTIP_BORDER } from "../lib/theme";

interface Word {
  name: string;
  value: number;
}

/**
 * Real word cloud via `echarts-wordcloud`. The extension registers its
 * `wordCloud` series via global side-effects on the FULL echarts build, so we
 * dynamically import the dedicated `echarts-wordcloud` module (full echarts +
 * extension) ONLY here and render in-thread against that instance — the
 * tree-shaken core used elsewhere does not have the series registered.
 *
 * Hover tooltips are native ECharts (canvas) — no React re-render per hover,
 * fixing the old flexbox cloud's per-mousemove `setState`.
 */
export default function WordCloudScene() {
  const scene = useSceneData(buildWordCloudSql);

  const words = useMemo<Word[]>(() => {
    const out: Word[] = [];
    for (const row of scene.rows) {
      const name = asStr(row.word);
      const value = asNum(row.count);
      if (name && value > 0) out.push({ name, value });
    }
    return out;
  }, [scene.rows]);

  const total = useMemo(
    () => words.reduce((a, w) => a + w.value, 0),
    [words],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const [ready, setReady] = useState(false);

  // Lazily load the full-echarts + wordcloud bundle and init one chart.
  useEffect(() => {
    let disposed = false;
    let resize: (() => void) | null = null;
    void (async () => {
      const el = containerRef.current;
      if (!el) return;
      const { echartsWordCloud } = await import("../lib/echarts-wordcloud");
      if (disposed || !containerRef.current) return;
      const chart = echartsWordCloud.init(containerRef.current, null, {
        renderer: "canvas",
      }) as unknown as ECharts;
      chartRef.current = chart;
      resize = () => chart.resize();
      window.addEventListener("resize", resize);
      setReady(true);
    })();
    return () => {
      disposed = true;
      if (resize) window.removeEventListener("resize", resize);
      chartRef.current?.dispose?.();
      chartRef.current = null;
    };
  }, []);

  // Push the option whenever data (or readiness) changes. The `wordCloud` series
  // is not part of `echarts/core`'s `EChartsOption` types (it's registered by the
  // full-build extension), so the option is a plain object cast at the call site.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    const option: Record<string, unknown> = {
      backgroundColor: "transparent",
      tooltip: {
        show: true,
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDER,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
        formatter: (p: { name: string; value: number }) => {
          const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
          return `<b>${p.name}</b><br/>${fmtN(p.value)} (${pct}%)`;
        },
      },
      series: [
        {
          type: "wordCloud",
          shape: "circle",
          keepAspect: false,
          left: "center",
          top: "center",
          width: "92%",
          height: "92%",
          sizeRange: [12, 64],
          rotationRange: [-30, 30],
          rotationStep: 30,
          gridSize: 10,
          drawOutOfBound: false,
          shrinkToFit: true,
          layoutAnimation: true,
          textStyle: { fontFamily: "sans-serif", fontWeight: "bold" },
          emphasis: {
            focus: "self",
            textStyle: { textShadowBlur: 10, textShadowColor: "#333" },
          },
          data: words.map((w, i) => ({
            name: w.name,
            value: w.value,
            textStyle: { color: seriesColor(i % 12) },
          })),
        },
      ],
    };
    chart.setOption(option as Parameters<typeof chart.setOption>[0], true);
  }, [words, total, ready]);

  return (
    <SceneShell
      isLoading={scene.isLoading}
      error={scene.error}
      unsupported={scene.unsupported}
      unsupportedHint="Add a dataset with a free-text column (remark, comment, message…) to build a word cloud."
      isEmpty={scene.isEmpty || words.length === 0}
      onRetry={scene.refetch}
    >
      <div className="space-y-4">
        {scene.note && (
          <p className="text-xs text-muted-foreground">{scene.note}</p>
        )}
        <Card>
          <CardContent className="pt-4">
            <div
              ref={containerRef}
              style={{ height: 360, width: "100%", background: "#0f172a" }}
              className="rounded-lg"
            />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          {fmtN(words.length)} distinct tokens · {fmtN(total)} total occurrences
        </p>
      </div>
    </SceneShell>
  );
}
