"use client";

/**
 * Top-level monitoring engine. Runs ONCE at the screen root (not per tab), so
 * alert evaluation continues regardless of which tab is active — the previous
 * design only evaluated while the Channel Health tab was mounted.
 *
 * Per-tick it:
 *   1. pulls real metrics from DuckDB (or the deterministic demo) off the
 *      main-thread query worker,
 *   2. runs the deterministic rule engine (no Math.random),
 *   3. persists fired events/notifications (Dexie, async),
 *   4. surfaces sound + OS notifications for backgrounded alerts.
 *
 * It is Page-Visibility gated: no work (and no audio) while the window/tab is
 * hidden, except OS notifications which are exactly what a hidden monitor needs.
 */

import { useEffect, useRef, useState } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { fetchMetrics } from "../data/metrics-source";
import { evaluateRules } from "../lib/engine-core";
import { playSoundAlert } from "../lib/audio";
import { notify, requestNotificationPermission } from "../lib/notify";
import { monitorStoreApi } from "../store/monitor-store";

export const REFRESH_INTERVAL_MS = 30_000;

export interface MonitorEngineState {
  /** Where the latest snapshot came from. */
  source: "duckdb" | "demo";
  /** ISO timestamp of the last successful refresh. */
  lastRefresh: string | null;
}

export function useMonitorEngine(): MonitorEngineState {
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const datasets = useDataStore((s) => s.datasets);

  const [state, setState] = useState<MonitorEngineState>({
    source: "demo",
    lastRefresh: null,
  });

  // Cooldown ledger persists across ticks but not across remounts (fine — the
  // event history in Dexie is the durable record).
  const lastFiredRef = useRef<Map<string, number>>(new Map());
  const tickRef = useRef(0);
  const datasetRef = useRef<{ id: string | null }>({ id: activeDatasetId });
  datasetRef.current.id = activeDatasetId;

  // Ask for OS notification permission once (best-effort, offline).
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const runTick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        // Skip compute while hidden; reschedule cheaply.
        timer = window.setTimeout(runTick, REFRESH_INTERVAL_MS);
        return;
      }

      const dataset = datasets.find((d) => d.id === datasetRef.current.id);
      const tick = tickRef.current++;

      try {
        const { statuses, source } = await fetchMetrics(dataset, tick);
        if (cancelled) return;

        const store = monitorStoreApi.getState();
        const statusMap: Record<string, (typeof statuses)[number]> = {};
        for (const st of statuses) statusMap[st.channel] = st;
        store.setAllChannelStatuses(statusMap);

        const fired = evaluateRules(statuses, store.alertRules, lastFiredRef.current);
        for (const { event, notification } of fired) {
          store.addEvent(event);
          store.addNotification(notification);

          const rule = store.alertRules.find((r) => r.id === event.ruleId);
          if (store.soundEnabled && rule?.actions.includes("sound")) {
            playSoundAlert(event.severity, store.soundVolume);
          }
          // OS notification when window is backgrounded (or always for critical).
          if (
            event.severity === "critical" ||
            (typeof document !== "undefined" && document.visibilityState !== "visible")
          ) {
            notify(notification.message, `Channel: ${event.channel}`, event.severity);
          }
        }

        setState({ source, lastRefresh: new Date().toISOString() });
      } catch {
        // Swallow — next tick retries. Never throw out of the loop.
      } finally {
        if (!cancelled) timer = window.setTimeout(runTick, REFRESH_INTERVAL_MS);
      }
    };

    // Kick off immediately, then on the interval.
    void runTick();

    // Re-run promptly when the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible" && timer !== undefined) {
        window.clearTimeout(timer);
        void runTick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // datasets array identity changes are fine to re-bind on (cheap).
  }, [datasets]);

  return state;
}
