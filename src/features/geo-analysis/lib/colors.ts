/**
 * Shared color helpers for geo-analysis. Pure functions, no side effects.
 */

/** Red (low) -> green (high) hue ramp over the 70–100% success window. */
export function successRateToColor(rate: number): string {
  const pct = Math.max(0, Math.min(1, (rate - 70) / 30));
  const hue = Math.round(pct * 120);
  return `hsl(${hue}, 70%, 50%)`;
}

export function successRateToFill(rate: number, alpha = 0.7): string {
  const pct = Math.max(0, Math.min(1, (rate - 70) / 30));
  const hue = Math.round(pct * 120);
  return `hsla(${hue}, 70%, 50%, ${alpha})`;
}

const CHANNEL_HUES = [220, 160, 280, 40, 200, 320, 80, 260, 0, 120];

export function channelColor(idx: number): string {
  return `hsl(${CHANNEL_HUES[idx % CHANNEL_HUES.length]}, 65%, 55%)`;
}
