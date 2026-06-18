"use client";

/**
 * use-geo-insights
 *
 * On-demand AI narration of the geo aggregates, plus the seeded statistical
 * anomaly detection that grounds it.
 *
 *  - Anomalous regions are found with the platform's seeded analysis worker
 *    (`detectRegionAnomalies` → GESD/MAD, off the main thread) over the real
 *    per-region success-rate series — not an ad-hoc threshold.
 *  - The narrative is produced by the provider registry
 *    (`useAI().generateStructured(req, GeoInsightSchema)`), grammar-valid JSON by
 *    construction — no regex/parseJSON repair loop, no direct web-llm.
 *
 * Inference is explicit (button-triggered), never on mount, so the route never
 * warms a model the user did not ask for.
 */

import { useCallback, useState } from "react";
import { useAI } from "@/platform/ai/provider";
import type { UseGeoDataResult } from "./use-geo-data";
import { type GeoInsight, GeoInsightSchema, buildGeoInsightPrompt } from "../lib/ai-insights";
import { detectRegionAnomalies, type RegionAnomaly } from "../lib/anomaly";

export interface UseGeoInsightsResult {
  insight: GeoInsight | null;
  anomalies: RegionAnomaly[];
  generating: boolean;
  error: string | null;
  /** Provider warm-up / inference progress (0–100) for the active model. */
  progress: number;
  generate: () => Promise<void>;
  reset: () => void;
}

export function useGeoInsights(geo: UseGeoDataResult): UseGeoInsightsResult {
  const ai = useAI();
  const [insight, setInsight] = useState<GeoInsight | null>(null);
  const [anomalies, setAnomalies] = useState<RegionAnomaly[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (geo.regions.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      // 1) Seeded, off-main-thread anomaly detection over real success rates.
      const names = geo.regions.map((r) => r.name);
      const series = geo.regions.map((r) => r.successRate);
      const found = await detectRegionAnomalies(names, series);
      setAnomalies(found);

      // 2) Grounded, grammar-valid structured narration.
      const { system, prompt } = buildGeoInsightPrompt({
        datasetName: geo.datasetName,
        regions: geo.regions,
        totalTransactions: geo.totalTransactions,
        avgSuccessRate: geo.avgSuccessRate,
        dominantChannels: geo.dominantChannels,
        anomalousRegions: found.map((a) => a.region),
      });
      const result = await ai.generateStructured(
        { system, prompt, temperature: 0.2, maxTokens: 900 },
        GeoInsightSchema,
      );
      setInsight(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insight generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [ai, geo]);

  const reset = useCallback(() => {
    setInsight(null);
    setAnomalies([]);
    setError(null);
  }, []);

  return {
    insight,
    anomalies,
    generating,
    error,
    progress: ai.progress?.progress ?? 0,
    generate,
    reset,
  };
}
