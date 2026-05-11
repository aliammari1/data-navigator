"use client";
/**
 * Sequential pipeline that runs every analyst step and streams progress
 * into the store.
 */

import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import { useTelecomStore } from "@/features/telecom/store";
import { detectAnomalies } from "./anomalies";
import { correlationMatrix } from "./correlations";
import { forecastSeries } from "./forecast";
import { generateHypotheses } from "./hypotheses";
import { generateNarrative } from "./narrative";
import { profileTable } from "./profile";
import { scoreQuality } from "./quality";
import { generateRecommendations } from "./recommendations";
import { segment } from "./segmentation";
import { runStatTests } from "./stats";
import { useAnalystStore } from "./store";
import {
  telecomHypotheses,
  telecomNarrativeFooter,
  telecomRecommendations,
} from "./telecom-bridge";
import type { AnalystState, AnalystStepId } from "./types";

interface Options {
  signal?: AbortSignal;
  onStep?: (step: AnalystStepId) => void;
}

async function runStep(
  table: string,
  key: keyof AnalystState,
  fn: () => Promise<unknown>,
  opts?: Options,
): Promise<void> {
  if (opts?.signal?.aborted) return;
  const { setStep, log } = useAnalystStore.getState();
  setStep(table, key, {
    status: "running",
    ranAt: Date.now(),
  } as AnalystState[typeof key]);
  opts?.onStep?.(key as AnalystStepId);
  const start = performance.now();
  try {
    const result = await fn();
    if (opts?.signal?.aborted) return;
    const durationMs = Math.round(performance.now() - start);
    setStep(table, key, {
      status: "done",
      result,
      durationMs,
      ranAt: Date.now(),
    } as AnalystState[typeof key]);
    log(table, {
      step: key as AnalystStepId,
      message: `${String(key)} complete`,
      durationMs,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    setStep(table, key, {
      status: "error",
      error,
      durationMs: Math.round(performance.now() - start),
      ranAt: Date.now(),
    } as AnalystState[typeof key]);
    log(table, {
      step: key as AnalystStepId,
      message: `${String(key)} failed`,
      detail: error,
    });
  }
}

async function profilesFor(table: string, opts?: Options) {
  const state = useAnalystStore.getState().states[table];
  const existing = state?.profile?.result ?? [];
  if (existing.length) return existing;
  await runStep(table, "profile", () => profileTable(table), opts);
  return useAnalystStore.getState().states[table]?.profile?.result ?? [];
}

export async function runAnalystStep(
  table: string,
  step: AnalystStepId,
  opts?: Options,
): Promise<void> {
  const { ensure } = useAnalystStore.getState();
  ensure(table);
  const isTelecom = table.startsWith(TELECOM_TABLE_BASE);
  const telecomMapping = isTelecom
    ? useTelecomStore.getState().columnMapping
    : null;

  if (step === "profile") {
    await runStep(table, "profile", () => profileTable(table), opts);
    return;
  }

  const profiles = await profilesFor(table, opts);
  if (!profiles.length) return;

  switch (step) {
    case "quality":
      await runStep(table, "quality", async () => scoreQuality(profiles), opts);
      return;
    case "hypotheses":
      await runStep(
        table,
        "hypotheses",
        async () => {
          const base = generateHypotheses(profiles);
          return telecomMapping
            ? [...telecomHypotheses(telecomMapping, profiles), ...base]
            : base;
        },
        opts,
      );
      return;
    case "statistics":
      await runStep(
        table,
        "statistics",
        () => runStatTests(table, profiles),
        opts,
      );
      return;
    case "anomalies":
      await runStep(
        table,
        "anomalies",
        () => detectAnomalies(table, profiles),
        opts,
      );
      return;
    case "correlations":
      await runStep(
        table,
        "correlations",
        () => correlationMatrix(table, profiles),
        opts,
      );
      return;
    case "segmentation":
      await runStep(
        table,
        "segmentation",
        async () => {
          const r = await segment(table, profiles);
          if (!r) throw new Error("Not enough numeric columns to segment.");
          return r;
        },
        opts,
      );
      return;
    case "forecast":
      await runStep(
        table,
        "forecast",
        () => forecastSeries(table, profiles),
        opts,
      );
      return;
    case "narrative":
      await runStep(
        table,
        "narrative",
        async () => {
          const state = useAnalystStore.getState().states[table];
          const base = generateNarrative(state);
          return telecomMapping
            ? [...base, ...telecomNarrativeFooter(telecomMapping, profiles)]
            : base;
        },
        opts,
      );
      return;
    case "recommendations":
      await runStep(
        table,
        "recommendations",
        async () => {
          const state = useAnalystStore.getState().states[table];
          const base = generateRecommendations(state);
          return telecomMapping
            ? [...base, ...telecomRecommendations(telecomMapping, profiles)]
            : base;
        },
        opts,
      );
      return;
    default:
      return;
  }
}

export async function runAll(table: string, opts?: Options): Promise<void> {
  const { ensure } = useAnalystStore.getState();
  ensure(table);
  const isTelecom = table.startsWith(TELECOM_TABLE_BASE);
  const telecomMapping = isTelecom
    ? useTelecomStore.getState().columnMapping
    : null;

  await runStep(table, "profile", () => profileTable(table), opts);

  const profiles =
    useAnalystStore.getState().states[table]?.profile?.result ?? [];
  if (!profiles.length) return;

  await Promise.all([
    runStep(table, "quality", async () => scoreQuality(profiles), opts),
    runStep(
      table,
      "hypotheses",
      async () => {
        const base = generateHypotheses(profiles);
        if (telecomMapping) {
          return [...telecomHypotheses(telecomMapping, profiles), ...base];
        }
        return base;
      },
      opts,
    ),
  ]);

  await Promise.all([
    runStep(table, "statistics", () => runStatTests(table, profiles), opts),
    runStep(table, "anomalies", () => detectAnomalies(table, profiles), opts),
    runStep(
      table,
      "correlations",
      () => correlationMatrix(table, profiles),
      opts,
    ),
  ]);

  await Promise.all([
    runStep(
      table,
      "segmentation",
      async () => {
        const r = await segment(table, profiles);
        if (!r) throw new Error("Not enough numeric columns to segment.");
        return r;
      },
      opts,
    ),
    runStep(table, "forecast", () => forecastSeries(table, profiles), opts),
  ]);

  // Narrative + recommendations consume everything above
  await runStep(
    table,
    "narrative",
    async () => {
      const state = useAnalystStore.getState().states[table];
      const base = generateNarrative(state);
      if (telecomMapping) {
        return [...base, ...telecomNarrativeFooter(telecomMapping, profiles)];
      }
      return base;
    },
    opts,
  );

  await runStep(
    table,
    "recommendations",
    async () => {
      const state = useAnalystStore.getState().states[table];
      const base = generateRecommendations(state);
      if (telecomMapping) {
        return [...base, ...telecomRecommendations(telecomMapping, profiles)];
      }
      return base;
    },
    opts,
  );
}
