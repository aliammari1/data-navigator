"use client";

import { useEffect, useMemo, useRef } from "react";
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

const CLOUD_HEIGHT = 360;
const MIN_FONT = 12;
const MAX_FONT = 64;

/**
 * Word cloud rendered with wordcloud2 (timdream) directly on a 2D canvas.
 *
 * The previous implementation used the `echarts-wordcloud` extension, which is
 * incompatible with echarts 6, so this scene now owns its own canvas and drives
 * wordcloud2's standalone renderer. Hover tooltips are drawn through
 * wordcloud2's `hover` callback into a positioned overlay, so there is no React
 * re-render per mousemove. The renderer is dynamically imported so it stays out
 * of the main client chunk.
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

  const total = useMemo(() => words.reduce((a, w) => a + w.value, 0), [words]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (words.length === 0) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const { default: WordCloud } = await import("../lib/wordcloud");
      if (cancelled || WordCloud.isSupported === false) return;

      // Stable color per token (palette cycles like the old echarts series).
      const colorByWord = new Map(words.map((w, i) => [w.name, seriesColor(i % 12)]));
      const maxV = Math.max(...words.map((w) => w.value), 1);
      const minV = Math.min(...words.map((w) => w.value), 0);

      const showTooltip = (item: [string, number] | undefined, event: MouseEvent) => {
        const tooltip = tooltipRef.current;
        const container = containerRef.current;
        if (!tooltip || !container) return;
        if (!item) {
          tooltip.style.opacity = "0";
          return;
        }
        const [word, weight] = item;
        const pct = total > 0 ? ((weight / total) * 100).toFixed(1) : "0";
        // Build via DOM nodes (not innerHTML) so user-supplied tokens cannot inject markup.
        const strong = document.createElement("strong");
        strong.textContent = word;
        tooltip.replaceChildren(
          strong,
          document.createElement("br"),
          document.createTextNode(`${fmtN(weight)} (${pct}%)`),
        );
        tooltip.style.opacity = "1";
        const rect = container.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top + 12}px`;
      };

      const render = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (cancelled || !canvas || !container) return;
        canvas.width = container.clientWidth || 600;
        canvas.height = CLOUD_HEIGHT;
        WordCloud(canvas, {
          list: words.map((w) => [w.name, w.value] as [string, number]),
          backgroundColor: "transparent",
          gridSize: 8,
          fontFamily: "sans-serif",
          fontWeight: "bold",
          shape: "circle",
          drawOutOfBound: false,
          shrinkToFit: true,
          rotateRatio: 0.5,
          rotationSteps: 2,
          minRotation: -Math.PI / 6,
          maxRotation: Math.PI / 6,
          weightFactor: (weight) => {
            const t = maxV > minV ? (weight - minV) / (maxV - minV) : 1;
            return MIN_FONT + (MAX_FONT - MIN_FONT) * Math.sqrt(t);
          },
          color: (word) => colorByWord.get(word) ?? TEXT_COLOR,
          hover: (item, _dimension, event) => showTooltip(item, event),
        });
      };

      render();

      const onResize = () => {
        WordCloud.stop();
        render();
      };
      window.addEventListener("resize", onResize);
      cleanup = () => {
        window.removeEventListener("resize", onResize);
        WordCloud.stop();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [words, total]);

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
        {scene.note && <p className="text-xs text-muted-foreground">{scene.note}</p>}
        <Card>
          <CardContent className="pt-4">
            <div
              ref={containerRef}
              className="relative rounded-lg"
              style={{ height: CLOUD_HEIGHT, width: "100%", background: "#0f172a" }}
            >
              <canvas
                ref={canvasRef}
                style={{ width: "100%", height: CLOUD_HEIGHT, display: "block" }}
              />
              <div
                ref={tooltipRef}
                style={{
                  position: "absolute",
                  pointerEvents: "none",
                  opacity: 0,
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  lineHeight: 1.3,
                  background: TOOLTIP_BG,
                  border: `1px solid ${TOOLTIP_BORDER}`,
                  color: TEXT_COLOR,
                  transition: "opacity 0.1s",
                  whiteSpace: "nowrap",
                  zIndex: 10,
                }}
              />
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          {fmtN(words.length)} distinct tokens · {fmtN(total)} total occurrences
        </p>
      </div>
    </SceneShell>
  );
}
