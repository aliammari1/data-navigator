/**
 * Shared, allocation-free formatters for the channel monitor.
 *
 * The previous screen called `new Date(...).toLocaleString("fr-FR")` inline in
 * render — once per event row, per notification row and per `lastUpdated` tick.
 * Each call allocates a fresh `Intl` formatter. Here we allocate ONE formatter
 * per format and reuse it, and lean on tree-shaken `date-fns` for relative time.
 */

import { formatDistanceToNowStrict } from "date-fns";

// One formatter instance per shape, allocated at module load and reused.
const DATE_TIME_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

const DATE_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short" });

const TIME_FR = new Intl.DateTimeFormat("fr-FR", { timeStyle: "medium" });

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Short date + time, e.g. "11/06/2026 14:32". Reuses one Intl instance. */
export function formatDateTime(value: string | number | Date): string {
  return DATE_TIME_FR.format(toDate(value));
}

/** Short date only, e.g. "11/06/2026". */
export function formatDate(value: string | number | Date): string {
  return DATE_FR.format(toDate(value));
}

/** Time only, e.g. "14:32:05". */
export function formatTime(value: string | number | Date): string {
  return TIME_FR.format(toDate(value));
}

/** Compact relative age, e.g. "3h ago", "12 minutes ago". */
export function formatRelative(value: string | number | Date): string {
  try {
    return `${formatDistanceToNowStrict(toDate(value))} ago`;
  } catch {
    return "—";
  }
}
