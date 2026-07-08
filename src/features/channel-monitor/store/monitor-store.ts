"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDrizzleStorage, createSelectors, durablePersist } from "@/platform/storage";
import {
  acknowledgeEventRecord,
  addEventRecord,
  addNotificationRecord,
  clearEventRecords,
  clearNotificationRecords,
  listRecentEvents,
  listRecentNotifications,
  markAllNotificationsReadRecords,
} from "../db/monitor-db";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertMetric = "success_rate" | "volume" | "failure_count" | "avg_amount";
export type AlertCondition = "falls_below" | "exceeds" | "equals";
export type AlertAction = "in_app" | "sound";
export type ChannelHealth = "healthy" | "degraded" | "critical" | "unknown";

export interface AlertRule {
  id: string;
  channels: string[]; // empty = all channels
  metric: AlertMetric;
  condition: AlertCondition;
  threshold: number;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled: boolean;
  lastTriggered: string | null; // ISO string
  label: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  channel: string;
  metric: AlertMetric;
  severity: AlertSeverity;
  triggeredAt: string; // ISO string
  actualValue: number;
  threshold: number;
  acknowledged: boolean;
  label: string;
}

export interface ChannelStatus {
  channel: string;
  displayName: string;
  health: ChannelHealth;
  successRate: number;
  txnPerMin: number;
  amountToday: number;
  failureCount: number;
  trend: "up" | "down" | "stable";
  lastIncident: string | null;
  lastIncidentAt: string | null; // ISO string
  updatedAt: string;
}

export interface NotificationEntry {
  id: string;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  read: boolean;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

type MonitorStore = {
  // Small, durable config (persisted to IndexedDB via durablePersist).
  alertRules: AlertRule[];
  soundEnabled: boolean;
  soundVolume: number; // 0–1
  slaTargets: Record<string, number>; // channel key -> % ("global" = fallback)

  // High-volume, in-memory mirrors of the Dexie tables (NOT persisted here).
  alertEvents: AlertEvent[];
  notifications: NotificationEntry[];
  channelStatuses: Record<string, ChannelStatus>;
  hydrated: boolean;

  // Lifecycle
  hydrateFromDb: () => Promise<void>;

  // Rules
  addRule: (rule: AlertRule) => void;
  updateRule: (id: string, patch: Partial<AlertRule>) => void;
  deleteRule: (id: string) => void;

  // Events (mirror → Dexie)
  addEvent: (event: AlertEvent) => void;
  acknowledgeEvent: (id: string) => void;
  clearEvents: () => void;

  // Channel statuses (transient)
  setChannelStatus: (channel: string, status: ChannelStatus) => void;
  setAllChannelStatuses: (statuses: Record<string, ChannelStatus>) => void;

  // SLA
  setSlaTarget: (channel: string, target: number) => void;

  // Sound
  setSoundEnabled: (v: boolean) => void;
  setSoundVolume: (v: number) => void;

  // Notifications (mirror → Dexie)
  addNotification: (n: NotificationEntry) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  testAlert: (ruleId: string) => void;
};

// ─── Default Rules ────────────────────────────────────────────────────────────

const DEFAULT_RULES: AlertRule[] = [
  {
    id: "default-1",
    channels: [],
    metric: "success_rate",
    condition: "falls_below",
    threshold: 90,
    severity: "critical",
    actions: ["in_app", "sound"],
    enabled: true,
    lastTriggered: null,
    label: "Success rate falls below 90%",
  },
  {
    id: "default-2",
    channels: [],
    metric: "volume",
    condition: "exceeds",
    threshold: 15000,
    severity: "info",
    actions: ["in_app"],
    enabled: true,
    lastTriggered: null,
    label: "Volume exceeds 15 000/hour",
  },
  {
    id: "default-3",
    channels: [],
    metric: "failure_count",
    condition: "exceeds",
    threshold: 500,
    severity: "warning",
    actions: ["in_app", "sound"],
    enabled: true,
    lastTriggered: null,
    label: "Failed transactions exceed 500",
  },
];

const IN_MEMORY_EVENT_CAP = 2000;
const IN_MEMORY_NOTIF_CAP = 200;

// ─── Store ────────────────────────────────────────────────────────────────────

const useMonitorStoreBase = create<MonitorStore>()(
  persist(
    (set, get) => ({
      alertRules: DEFAULT_RULES,
      soundEnabled: true,
      soundVolume: 0.6,
      slaTargets: { global: 95 },

      alertEvents: [],
      notifications: [],
      channelStatuses: {},
      hydrated: false,

      hydrateFromDb: async () => {
        if (get().hydrated) return;
        const [events, notifications] = await Promise.all([
          listRecentEvents(IN_MEMORY_EVENT_CAP),
          listRecentNotifications(IN_MEMORY_NOTIF_CAP),
        ]);
        set({ alertEvents: events, notifications, hydrated: true });
      },

      addRule: (rule) => set((s) => ({ alertRules: [...s.alertRules, rule] })),

      updateRule: (id, patch) =>
        set((s) => ({
          alertRules: s.alertRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      deleteRule: (id) => set((s) => ({ alertRules: s.alertRules.filter((r) => r.id !== id) })),

      addEvent: (event) => {
        // Async write-through to IndexedDB (non-blocking — no localStorage stall).
        void addEventRecord(event);
        set((s) => ({
          alertEvents: [event, ...s.alertEvents].slice(0, IN_MEMORY_EVENT_CAP),
          alertRules: s.alertRules.map((r) =>
            r.id === event.ruleId ? { ...r, lastTriggered: event.triggeredAt } : r,
          ),
        }));
      },

      acknowledgeEvent: (id) => {
        void acknowledgeEventRecord(id);
        set((s) => ({
          alertEvents: s.alertEvents.map((e) => (e.id === id ? { ...e, acknowledged: true } : e)),
        }));
      },

      clearEvents: () => {
        void clearEventRecords();
        set({ alertEvents: [] });
      },

      setChannelStatus: (channel, status) =>
        set((s) => ({ channelStatuses: { ...s.channelStatuses, [channel]: status } })),

      setAllChannelStatuses: (statuses) => set({ channelStatuses: statuses }),

      setSlaTarget: (channel, target) =>
        set((s) => ({ slaTargets: { ...s.slaTargets, [channel]: target } })),

      setSoundEnabled: (v) => set({ soundEnabled: v }),
      setSoundVolume: (v) => set({ soundVolume: v }),

      addNotification: (n) => {
        void addNotificationRecord(n);
        set((s) => ({
          notifications: [n, ...s.notifications].slice(0, IN_MEMORY_NOTIF_CAP),
        }));
      },

      markAllNotificationsRead: () => {
        void markAllNotificationsReadRecords();
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      clearNotifications: () => {
        void clearNotificationRecords();
        set({ notifications: [] });
      },

      testAlert: (ruleId) => {
        const rule = get().alertRules.find((r) => r.id === ruleId);
        if (!rule) return;
        const now = Date.now();
        const event: AlertEvent = {
          id: `test-${now}`,
          ruleId,
          channel: rule.channels[0] ?? "ALL",
          metric: rule.metric,
          severity: rule.severity,
          triggeredAt: new Date(now).toISOString(),
          actualValue: rule.threshold - 1,
          threshold: rule.threshold,
          acknowledged: false,
          label: `[TEST] ${rule.label}`,
        };
        get().addEvent(event);
        get().addNotification({
          id: `notif-test-${now}`,
          message: `[TEST] Rule triggered: ${rule.label}`,
          severity: rule.severity,
          timestamp: new Date(now).toISOString(),
          read: false,
        });
      },
    }),
    // Only the SMALL config is persisted (rules / sound / SLA). The high-volume
    // events + notifications live in Dexie (see db/monitor-db.ts), so persist
    // never serializes unbounded history on every mutation.
    {
      ...durablePersist<MonitorStore>({
        name: "channel-monitor-store",
        version: 2,
        getDefaults: (): MonitorStore => ({
          alertRules: DEFAULT_RULES,
          soundEnabled: true,
          soundVolume: 0.6,
          slaTargets: { global: 95 },
          // Volatile slices — defaults only; never persisted.
          alertEvents: [],
          notifications: [],
          channelStatuses: {},
          hydrated: false,
          // Actions are recreated by the store factory; the type requires the
          // full shape, so supply noops in the defaults.
          hydrateFromDb: async () => {},
          addRule: () => {},
          updateRule: () => {},
          deleteRule: () => {},
          addEvent: () => {},
          acknowledgeEvent: () => {},
          clearEvents: () => {},
          setChannelStatus: () => {},
          setAllChannelStatuses: () => {},
          setSlaTarget: () => {},
          setSoundEnabled: () => {},
          setSoundVolume: () => {},
          addNotification: () => {},
          markAllNotificationsRead: () => {},
          clearNotifications: () => {},
          testAlert: () => {},
        }),
        persistKeys: ["alertRules", "soundEnabled", "soundVolume", "slaTargets"],
      }),
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
    },
  ),
);

/** Selector-augmented store: use `useMonitorStore.use.field()` for atomic reads. */
export const useMonitorStore = createSelectors(useMonitorStoreBase);

/** Non-reactive access for the engine hook / imperative callers. */
export const monitorStoreApi = useMonitorStoreBase;
