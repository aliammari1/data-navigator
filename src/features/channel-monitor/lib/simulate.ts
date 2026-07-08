/**
 * Deterministic demo data generator (DEMO FALLBACK ONLY).
 *
 * The previous screen baked `Math.random()` / `Math.sin`-hash synthetic data
 * directly into render and the alert-evaluation effect, which made the feature
 * non-deterministic and impossible to test. Real metrics now come from DuckDB
 * (see `data/metrics-source.ts`). This module is used ONLY when no dataset is
 * loaded, and is fully deterministic: same `tick` + same `seed` ⇒ same output,
 * driven by the platform-shared `mulberry32` PRNG (never bare Math.random).
 */

import { DEFAULT_SEED, mulberry32 } from "@/platform/viz";
import { CHANNELS } from "./channels";
import type { ChannelHealth, ChannelStatus } from "../store/monitor-store";

/** Per-channel baselines for the deterministic demo. */
const BASELINE: Record<string, { sr: number; vol: number; amt: number }> = {
  bill_payment: { sr: 97.2, vol: 142, amt: 4_820_000 },
  voice_fixed_ttcash: { sr: 91.5, vol: 98, amt: 1_240_000 },
  voice_fixed_voucher: { sr: 88.4, vol: 76, amt: 950_000 },
  voice_mobile_ttcash: { sr: 96.1, vol: 210, amt: 3_150_000 },
  voice_mobile_voucher: { sr: 83.2, vol: 185, amt: 2_780_000 },
  data_sabba: { sr: 99.1, vol: 320, amt: 6_400_000 },
  data_evoucher: { sr: 94.8, vol: 255, amt: 5_100_000 },
  voucher_for_payment: { sr: 78.3, vol: 45, amt: 540_000 },
  credit_transfer: { sr: 98.7, vol: 390, amt: 7_800_000 },
  voucher_convergent: { sr: 92.0, vol: 130, amt: 2_600_000 },
};

function classifyHealth(successRate: number): ChannelHealth {
  return successRate > 95 ? "healthy" : successRate >= 85 ? "degraded" : "critical";
}

/** Hash a channel key into a stable integer offset for seeding. */
function keySeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Generate one deterministic snapshot of all channels at logical time `tick`.
 * `tick` advances every refresh so the demo "moves" but stays reproducible.
 */
export function simulateStatuses(tick: number, seed = DEFAULT_SEED): ChannelStatus[] {
  const now = Date.now();
  return CHANNELS.map((ch) => {
    const base = BASELINE[ch.key] ?? { sr: 90, vol: 100, amt: 1_000_000 };
    const rng = mulberry32((seed ^ keySeed(ch.key) ^ (tick * 2654435761)) >>> 0);
    const srNoise = (rng() - 0.5) * 3;
    const volNoise = (rng() - 0.5) * 20;
    const amtScale = 0.9 + rng() * 0.2;

    const successRate = Math.max(50, Math.min(99.9, base.sr + srNoise));
    const txnPerMin = Math.max(10, Math.round(base.vol + volNoise));
    const amountToday = Math.round(base.amt * amtScale);
    const failureCount = Math.round(txnPerMin * (1 - successRate / 100) * 60);

    const prevRng = mulberry32((seed ^ keySeed(ch.key) ^ ((tick - 1) * 2654435761)) >>> 0);
    const prevSr = Math.max(50, Math.min(99.9, base.sr + (prevRng() - 0.5) * 3));
    const trend: ChannelStatus["trend"] =
      successRate > prevSr + 0.5 ? "up" : successRate < prevSr - 0.5 ? "down" : "stable";

    const health = classifyHealth(successRate);
    const hasIncident = health !== "healthy";
    const incidentHours = Math.floor(rng() * 12) + 1;
    const incidentTypes = ["success rate drop", "volume spike", "timeout surge", "error burst"];
    const incidentType = incidentTypes[Math.floor(rng() * incidentTypes.length)];

    return {
      channel: ch.key,
      displayName: ch.label,
      health,
      successRate,
      txnPerMin,
      amountToday,
      failureCount,
      trend,
      lastIncident: hasIncident ? `${incidentHours}h ago: ${incidentType}` : null,
      lastIncidentAt: hasIncident ? new Date(now - incidentHours * 3_600_000).toISOString() : null,
      updatedAt: new Date(now).toISOString(),
    };
  });
}

/** Deterministic per-channel daily-compliance series for the SLA trend demo. */
export function simulateDailyCompliance(
  channelKey: string,
  target: number,
  days = 30,
  seed = DEFAULT_SEED,
): number[] {
  const rng = mulberry32((seed ^ keySeed(channelKey)) >>> 0);
  return Array.from({ length: days }, () => {
    const v = target - 5 + rng() * 12;
    return Math.max(70, Math.min(100, v));
  });
}
