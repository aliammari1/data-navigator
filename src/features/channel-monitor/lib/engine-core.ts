/**
 * Deterministic rule evaluation — pure, testable, no RNG.
 *
 * The previous logic fired alerts on `Math.random() < 0.05` inside a React
 * effect, which (a) made firing non-deterministic and untestable, (b) only ran
 * while the Channel Health tab was mounted. This module is a pure function of
 * (statuses, rules, lastFired) and runs from the top-level engine hook
 * regardless of which tab is open. Re-fires are debounced per rule+channel via
 * a cooldown window instead of random sampling.
 */

import { channelLabel } from "./channels";
import type {
  AlertEvent,
  AlertMetric,
  AlertRule,
  ChannelStatus,
  NotificationEntry,
} from "../store/monitor-store";

/** Minimum gap before the same rule+channel can fire again (ms). */
export const FIRE_COOLDOWN_MS = 5 * 60 * 1000;

function metricValue(metric: AlertMetric, st: ChannelStatus): number {
  switch (metric) {
    case "success_rate":
      return st.successRate;
    case "volume":
      return st.txnPerMin * 60; // per-hour
    case "failure_count":
      return st.failureCount;
    case "avg_amount":
      return st.amountToday / Math.max(1, st.txnPerMin * 60);
    default:
      return 0;
  }
}

function conditionMet(rule: AlertRule, actual: number): boolean {
  switch (rule.condition) {
    case "falls_below":
      return actual < rule.threshold;
    case "exceeds":
      return actual > rule.threshold;
    case "equals":
      return Math.abs(actual - rule.threshold) < 0.5;
    default:
      return false;
  }
}

export interface FiredAlert {
  event: AlertEvent;
  notification: NotificationEntry;
}

/**
 * Evaluate every enabled rule against the current statuses.
 *
 * @param lastFired  Map of `${ruleId}:${channel}` → last fire epoch-ms.
 * @param now        Injected clock for determinism in tests.
 */
export function evaluateRules(
  statuses: ChannelStatus[],
  rules: AlertRule[],
  lastFired: Map<string, number>,
  now: number = Date.now(),
): FiredAlert[] {
  const fired: FiredAlert[] = [];
  const nowIso = new Date(now).toISOString();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const st of statuses) {
      if (rule.channels.length > 0 && !rule.channels.includes(st.channel)) continue;

      const actual = metricValue(rule.metric, st);
      if (!conditionMet(rule, actual)) continue;

      const cooldownKey = `${rule.id}:${st.channel}`;
      const last = lastFired.get(cooldownKey) ?? 0;
      if (now - last < FIRE_COOLDOWN_MS) continue;

      lastFired.set(cooldownKey, now);

      const id = `auto-${now}-${rule.id}-${st.channel}`;
      const event: AlertEvent = {
        id,
        ruleId: rule.id,
        channel: st.channel,
        metric: rule.metric,
        severity: rule.severity,
        triggeredAt: nowIso,
        actualValue: actual,
        threshold: rule.threshold,
        acknowledged: false,
        label: rule.label,
      };
      const notification: NotificationEntry = {
        id: `notif-${id}`,
        message: `${rule.label} — ${channelLabel(st.channel)} (${actual.toFixed(1)})`,
        severity: rule.severity,
        timestamp: nowIso,
        read: false,
      };
      fired.push({ event, notification });
    }
  }

  return fired;
}
