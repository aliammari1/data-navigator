"use client";

/**
 * Durable, queryable, async store for alert events + notifications.
 *
 * The previous implementation persisted up to 500 events to `localStorage` via
 * `JSON.stringify` on EVERY mutation — synchronous main-thread serialization
 * that grows unbounded and blocks on each ack/add. Here the high-volume history
 * lives in its own IndexedDB database (Dexie): async (non-blocking), queryable
 * by index, survives reloads, and never overflows the 5-10 MB localStorage cap.
 *
 * Only small config (rules / sound / SLA targets) stays in the zustand persist
 * (see `store/monitor-store.ts`). This DB is namespaced separately from the
 * platform app-db so the monitor history cannot bloat the shared profile cache.
 */

import Dexie, { type Table } from "dexie";
import type { AlertEvent, NotificationEntry } from "../store/monitor-store";

/** Hard cap on retained rows so IndexedDB cannot grow without bound. */
export const EVENT_RETENTION = 5000;
export const NOTIFICATION_RETENTION = 500;

class MonitorDatabase extends Dexie {
  events!: Table<AlertEvent, string>;
  notifications!: Table<NotificationEntry, string>;

  constructor() {
    super("channel-monitor-v1");
    this.version(1).stores({
      // Indexed columns enable severity/channel/time queries without table scans.
      events: "id, triggeredAt, severity, channel, acknowledged, ruleId",
      notifications: "id, timestamp, read, severity",
    });
  }
}

/** Lazily-constructed singleton — never touch IndexedDB during SSR. */
let _db: MonitorDatabase | null = null;

export function getMonitorDb(): MonitorDatabase | null {
  if (typeof indexedDB === "undefined") return null;
  _db ??= new MonitorDatabase();
  return _db;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function addEventRecord(event: AlertEvent): Promise<void> {
  const db = getMonitorDb();
  if (!db) return;
  await db.events.put(event);
  await pruneTable(db.events, "triggeredAt", EVENT_RETENTION);
}

export async function addEventRecords(events: AlertEvent[]): Promise<void> {
  const db = getMonitorDb();
  if (!db || events.length === 0) return;
  await db.events.bulkPut(events);
  await pruneTable(db.events, "triggeredAt", EVENT_RETENTION);
}

export async function acknowledgeEventRecord(id: string): Promise<void> {
  const db = getMonitorDb();
  if (!db) return;
  await db.events.update(id, { acknowledged: true });
}

export async function clearEventRecords(): Promise<void> {
  const db = getMonitorDb();
  if (!db) return;
  await db.events.clear();
}

/** Newest-first window of events (bounded — never materializes the full table). */
export async function listRecentEvents(limit = 2000): Promise<AlertEvent[]> {
  const db = getMonitorDb();
  if (!db) return [];
  return db.events.orderBy("triggeredAt").reverse().limit(limit).toArray();
}

export async function countEvents(): Promise<number> {
  const db = getMonitorDb();
  if (!db) return 0;
  return db.events.count();
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function addNotificationRecord(n: NotificationEntry): Promise<void> {
  const db = getMonitorDb();
  if (!db) return;
  await db.notifications.put(n);
  await pruneTable(db.notifications, "timestamp", NOTIFICATION_RETENTION);
}

export async function markAllNotificationsReadRecords(): Promise<void> {
  const db = getMonitorDb();
  if (!db) return;
  await db.notifications.toCollection().modify({ read: true });
}

export async function clearNotificationRecords(): Promise<void> {
  const db = getMonitorDb();
  if (!db) return;
  await db.notifications.clear();
}

export async function listRecentNotifications(limit = 200): Promise<NotificationEntry[]> {
  const db = getMonitorDb();
  if (!db) return [];
  return db.notifications.orderBy("timestamp").reverse().limit(limit).toArray();
}

// ─── Retention ───────────────────────────────────────────────────────────────

/** Drop the oldest rows beyond `keep`, ordered by `tsIndex`. */
async function pruneTable<T>(
  table: Table<T, string>,
  tsIndex: string,
  keep: number,
): Promise<void> {
  const total = await table.count();
  if (total <= keep) return;
  const excess = total - keep;
  const oldest = await table.orderBy(tsIndex).limit(excess).primaryKeys();
  if (oldest.length) await table.bulkDelete(oldest);
}
