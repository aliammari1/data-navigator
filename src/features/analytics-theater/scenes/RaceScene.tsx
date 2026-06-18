"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtCompact } from "@/features/telecom/lib/format";
import { SceneShell } from "../components/SceneShell";
import { TheaterChart } from "../components/TheaterChart";
import { useSceneData } from "../hooks/use-scene-data";
import { asNum, asStr, buildRaceSql } from "../lib/queries";
import {
  AXIS_LINE,
  seriesColor,
  SPLIT_LINE_STYLE,
  TEXT_COLOR,
  TOOLTIP_BG,
  TOOLTIP_BORDER,
} from "../lib/theme";

interface RaceFrame {
  date: string;
  /** Cumulative value per category up to and including this date. */
  data: { name: string; value: number }[];
}

/**
 * Build cumulative race frames from per-(date, category) aggregated rows.
 * Cumulating in-thread is O(rows) over a few hundred aggregated rows — DuckDB
 * already did the heavy GROUP BY.
 */
function buildFrames(rows: Record<string, unknown>[]): {
  frames: RaceFrame[];
  categories: string[];
} {
  const byDate = new Map<string, Map<string, number>>();
  const categories = new Set<string>();
  for (const row of rows) {
    const d = asStr(row.d);
    const cat = asStr(row.cat);
    const v = asNum(row.v);
    if (!d || d === "null" || !cat) continue;
    categories.add(cat);
    let m = byDate.get(d);
    if (!m) {
      m = new Map();
      byDate.set(d, m);
    }
    m.set(cat, (m.get(cat) ?? 0) + v);
  }

  const dates = Array.from(byDate.keys()).sort();
  const catList = Array.from(categories);
  const cumulative = new Map<string, number>(catList.map((c) => [c, 0]));

  const frames: RaceFrame[] = [];
  for (const date of dates) {
    const dayMap = byDate.get(date);
    if (dayMap) {
      for (const [cat, val] of dayMap) {
        cumulative.set(cat, (cumulative.get(cat) ?? 0) + val);
      }
    }
    frames.push({
      date,
      data: catList.map((name) => ({ name, value: cumulative.get(name) ?? 0 })),
    });
  }
  return { frames, categories: catList };
}

export default function RaceScene() {
  const scene = useSceneData(buildRaceSql);
  const containerRef = useRef<HTMLDivElement>(null);

  const { frames, categories } = useMemo(
    () => buildFrames(scene.rows),
    [scene.rows],
  );

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c, i) => {
      map.set(c, seriesColor(i));
    });
    return map;
  }, [categories]);

  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Clamp / reset when the dataset (and thus frame count) changes.
  useEffect(() => {
    setFrameIdx(0);
    setPlaying(frames.length > 1);
  }, [frames.length]);

  // rAF-driven advance, gated on tab visibility — no setInterval, no work when
  // the tab is backgrounded.
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      if (!document.hidden && t - last >= 800 / speed) {
        last = t;
        setFrameIdx((i) => {
          if (i >= frames.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, frames.length]);

  const frame = frames[Math.min(frameIdx, Math.max(0, frames.length - 1))];

  const option = useMemo(() => {
    if (!frame) return {};
    const sorted = [...frame.data].sort((a, b) => a.value - b.value);
    return {
      backgroundColor: "transparent",
      animation: true,
      animationDuration: Math.round(500 / speed),
      animationDurationUpdate: Math.round(500 / speed),
      animationEasing: "linear" as const,
      animationEasingUpdate: "linear" as const,
      grid: { top: 10, bottom: 10, left: 16, right: 100, containLabel: true },
      xAxis: {
        type: "value" as const,
        axisLabel: {
          color: TEXT_COLOR,
          fontSize: 10,
          formatter: (v: number) => fmtCompact(v),
        },
        axisLine: AXIS_LINE,
        splitLine: SPLIT_LINE_STYLE,
      },
      yAxis: {
        type: "category" as const,
        data: sorted.map((d) => d.name),
        axisLabel: { color: TEXT_COLOR, fontSize: 10 },
        axisLine: AXIS_LINE,
        animationDuration: 200,
        animationDurationUpdate: 200,
      },
      series: [
        {
          type: "bar" as const,
          realtimeSort: true,
          data: sorted.map((d) => ({
            value: d.value,
            itemStyle: {
              color: colorOf.get(d.name),
              borderRadius: [0, 6, 6, 0] as [number, number, number, number],
            },
          })),
          label: {
            show: true,
            position: "right" as const,
            color: TEXT_COLOR,
            fontSize: 11,
            formatter: (p: { value: number }) => fmtCompact(p.value),
          },
        },
      ],
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDER,
        textStyle: { color: TEXT_COLOR, fontSize: 12 },
      },
    };
  }, [frame, speed, colorOf]);

  // Champion history: who held #1 across all frames.
  const champions = useMemo(() => {
    const tally = new Map<string, number>();
    for (const f of frames) {
      const top = [...f.data].sort((a, b) => b.value - a.value)[0];
      if (top) tally.set(top.name, (tally.get(top.name) ?? 0) + 1);
    }
    return Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  }, [frames]);

  return (
    <SceneShell
      isLoading={scene.isLoading}
      error={scene.error}
      unsupported={scene.unsupported}
      unsupportedHint="Add a dataset with a date/timestamp column and a categorical column to run a race."
      isEmpty={scene.isEmpty || frames.length === 0}
      onRetry={scene.refetch}
    >
      <div className="space-y-4" ref={containerRef}>
        {scene.note && (
          <p className="text-xs text-muted-foreground">{scene.note}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            variant={playing ? "outline" : "default"}
            className="min-w-[100px]"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "Pause" : "Play"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrameIdx(0);
              setPlaying(false);
            }}
          >
            Reset
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Speed:</span>
            {[0.5, 1, 2].map((s) => (
              <Button
                key={s}
                size="sm"
                variant={speed === s ? "default" : "outline"}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </Button>
            ))}
          </div>
          {frame && (
            <div className="ml-auto text-sm font-medium text-foreground">
              {frame.date}{" "}
              <span className="text-xs text-muted-foreground">
                ({frameIdx + 1}/{frames.length})
              </span>
            </div>
          )}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${frames.length ? ((frameIdx + 1) / frames.length) * 100 : 0}%`,
            }}
          />
        </div>

        <Card>
          <CardContent className="pt-4">
            <TheaterChart option={option} height={360} />
          </CardContent>
        </Card>

        {champions.length > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">
                Lead History — days in front
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {champions.map(([cat, days], i) => (
                  <div
                    key={cat}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: colorOf.get(cat) }}
                    />
                    <span className="text-xs text-foreground">{cat}</span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {days}d
                    </span>
                    {i === 0 && (
                      <span className="text-xs text-yellow-400">lead</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </SceneShell>
  );
}
