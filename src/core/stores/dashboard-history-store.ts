"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useWidgetRegistry } from "@/features/data-formulator/core/widget-registry";
import type { DesktopWidget } from "@/features/desktop/store/desktop-store";
import { useDesktopStore } from "@/features/desktop/store/desktop-store";
import { createDrizzleStorage } from "@/platform/storage";

type HistoryEntryType =
  | "pin-formulator-widget"
  | "unpin-formulator-widget"
  | "pin-kpi-widget"
  | "remove-kpi-widget";

export interface HistoryEntry {
  id: string;
  type: HistoryEntryType;
  timestamp: number;
  description: string;
  /** For formulator chart actions */
  formulatorWidgetId?: string;
  chartTitle?: string;
  /** Widget position/config so we can restore the desktop widget on undo */
  widgetSnapshot?: {
    widgetType: string;
    config: Record<string, unknown>;
    x: number;
    y: number;
  };
}

interface DashboardHistoryState {
  entries: HistoryEntry[];
  undoneIds: string[];

  /** Pin a formulator chart widget to dashboard + desktop + record. */
  doPinFormulatorWidget: (widgetId: string, title: string) => void;
  /** Unpin a formulator chart widget from dashboard + desktop + record. */
  doUnpinFormulatorWidget: (widgetId: string, title: string) => void;
  /** Pin a KPI/amount/customers widget from the dashboard KPI cards + record. */
  doPinWidget: (
    widgetType: string,
    config: Record<string, unknown>,
    x: number,
    y: number,
    label: string,
  ) => void;
  /** Remove a desktop widget (called from widgets-layer right-click) + record. */
  doRemoveWidget: (
    widgetId: string,
    widgetType: string,
    config: Record<string, unknown>,
    x: number,
    y: number,
    label: string,
  ) => void;

  undoEntry: (id: string) => void;
  redoEntry: (id: string) => void;
  clearHistory: () => void;
}

function nextId() {
  return `dh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getRegistry() {
  return useWidgetRegistry.getState();
}

function getDesktopStore() {
  return useDesktopStore.getState();
}

function findDesktopChartWidget(formulatorWidgetId: string) {
  const { widgets } = getDesktopStore();
  return (
    widgets.find(
      (w) => w.type === "pinned-chart" && w.config.formulatorWidgetId === formulatorWidgetId,
    ) ?? null
  );
}

function findDesktopKpiWidget(widgetType: string, config: Record<string, unknown>) {
  const { widgets } = getDesktopStore();
  const configStr = JSON.stringify(config);
  return (
    widgets.find((w) => w.type === widgetType && JSON.stringify(w.config) === configStr) ?? null
  );
}

type SetFn = (fn: (s: DashboardHistoryState) => Partial<DashboardHistoryState>) => void;
function pushEntry(set: SetFn, entry: HistoryEntry) {
  set((s) => ({ entries: [entry, ...s.entries].slice(0, 200) }));
}

export const useDashboardHistoryStore = create<DashboardHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      undoneIds: [],

      doPinFormulatorWidget: (widgetId, title) => {
        getRegistry().pinWidget(widgetId);
        const count = getDesktopStore().widgets.length;
        getDesktopStore().addWidget({
          type: "pinned-chart",
          config: { formulatorWidgetId: widgetId, title },
          x: 20 + count * 16,
          y: 20 + count * 16,
        });
        pushEntry(set, {
          id: nextId(),
          type: "pin-formulator-widget",
          timestamp: Date.now(),
          description: `Graphique épinglé : ${title}`,
          formulatorWidgetId: widgetId,
          chartTitle: title,
          widgetSnapshot: {
            widgetType: "pinned-chart",
            config: { formulatorWidgetId: widgetId, title },
            x: 20 + count * 16,
            y: 20 + count * 16,
          },
        });
      },

      doUnpinFormulatorWidget: (widgetId, title) => {
        const desktopWidget = findDesktopChartWidget(widgetId);
        const snap: HistoryEntry["widgetSnapshot"] = desktopWidget
          ? {
              widgetType: "pinned-chart",
              config: desktopWidget.config,
              x: desktopWidget.x,
              y: desktopWidget.y,
            }
          : {
              widgetType: "pinned-chart",
              config: { formulatorWidgetId: widgetId, title },
              x: 20,
              y: 20,
            };

        getRegistry().unpinWidget(widgetId);
        if (desktopWidget) getDesktopStore().removeWidget(desktopWidget.id);

        pushEntry(set, {
          id: nextId(),
          type: "unpin-formulator-widget",
          timestamp: Date.now(),
          description: `Graphique désépinglé : ${title}`,
          formulatorWidgetId: widgetId,
          chartTitle: title,
          widgetSnapshot: snap,
        });
      },

      doPinWidget: (widgetType, config, x, y, label) => {
        getDesktopStore().addWidget({
          type: widgetType as DesktopWidget["type"],
          config,
          x,
          y,
        });
        pushEntry(set, {
          id: nextId(),
          type: "pin-kpi-widget",
          timestamp: Date.now(),
          description: `Widget épinglé : ${label}`,
          widgetSnapshot: { widgetType, config, x, y },
        });
      },

      doRemoveWidget: (widgetId, widgetType, config, x, y, label) => {
        // If this is a pinned-chart widget, also unpin the formulator widget
        if (widgetType === "pinned-chart" && typeof config.formulatorWidgetId === "string") {
          getRegistry().unpinWidget(config.formulatorWidgetId);
        }
        getDesktopStore().removeWidget(widgetId);
        pushEntry(set, {
          id: nextId(),
          type: "remove-kpi-widget",
          timestamp: Date.now(),
          description: `Widget retiré : ${label}`,
          formulatorWidgetId:
            widgetType === "pinned-chart" ? String(config.formulatorWidgetId ?? "") : undefined,
          widgetSnapshot: { widgetType, config, x, y },
        });
      },

      undoEntry: (id) => {
        const { entries, undoneIds } = get();
        if (undoneIds.includes(id)) return;
        const entry = entries.find((e) => e.id === id);
        if (!entry) return;

        const ds = getDesktopStore();
        const reg = getRegistry();

        switch (entry.type) {
          case "pin-formulator-widget":
            // Reverse: unpin + remove desktop widget
            if (entry.formulatorWidgetId) {
              reg.unpinWidget(entry.formulatorWidgetId);
              const w = findDesktopChartWidget(entry.formulatorWidgetId);
              if (w) ds.removeWidget(w.id);
            }
            break;

          case "unpin-formulator-widget":
            // Reverse: pin + restore desktop widget
            if (entry.formulatorWidgetId) {
              reg.pinWidget(entry.formulatorWidgetId);
              if (entry.widgetSnapshot) {
                const count = ds.widgets.length;
                ds.addWidget({
                  type: "pinned-chart",
                  config: entry.widgetSnapshot.config,
                  x: entry.widgetSnapshot.x ?? 20 + count * 16,
                  y: entry.widgetSnapshot.y ?? 20 + count * 16,
                });
              }
            }
            break;

          case "pin-kpi-widget":
            // Reverse: remove the desktop widget
            if (entry.widgetSnapshot) {
              const w = findDesktopKpiWidget(
                entry.widgetSnapshot.widgetType,
                entry.widgetSnapshot.config,
              );
              if (w) ds.removeWidget(w.id);
            }
            break;

          case "remove-kpi-widget":
            // Reverse: restore the widget (and re-pin formulator widget if applicable)
            if (entry.widgetSnapshot) {
              const count = ds.widgets.length;
              ds.addWidget({
                type: entry.widgetSnapshot.widgetType as Parameters<typeof ds.addWidget>[0]["type"],
                config: entry.widgetSnapshot.config,
                x: 20 + count * 16,
                y: 20 + count * 16,
              });
              if (entry.formulatorWidgetId) reg.pinWidget(entry.formulatorWidgetId);
            }
            break;
        }

        set((s) => ({ undoneIds: [...s.undoneIds, id] }));
      },

      redoEntry: (id) => {
        const { entries, undoneIds } = get();
        if (!undoneIds.includes(id)) return;
        const entry = entries.find((e) => e.id === id);
        if (!entry) return;

        const ds = getDesktopStore();
        const reg = getRegistry();

        switch (entry.type) {
          case "pin-formulator-widget":
            if (entry.formulatorWidgetId && entry.widgetSnapshot) {
              reg.pinWidget(entry.formulatorWidgetId);
              const count = ds.widgets.length;
              ds.addWidget({
                type: "pinned-chart",
                config: entry.widgetSnapshot.config,
                x: 20 + count * 16,
                y: 20 + count * 16,
              });
            }
            break;

          case "unpin-formulator-widget":
            if (entry.formulatorWidgetId) {
              reg.unpinWidget(entry.formulatorWidgetId);
              const w = findDesktopChartWidget(entry.formulatorWidgetId);
              if (w) ds.removeWidget(w.id);
            }
            break;

          case "pin-kpi-widget":
            if (entry.widgetSnapshot) {
              const count = ds.widgets.length;
              ds.addWidget({
                type: entry.widgetSnapshot.widgetType as Parameters<typeof ds.addWidget>[0]["type"],
                config: entry.widgetSnapshot.config,
                x: 20 + count * 16,
                y: 20 + count * 16,
              });
            }
            break;

          case "remove-kpi-widget":
            if (entry.widgetSnapshot) {
              if (entry.formulatorWidgetId) reg.unpinWidget(entry.formulatorWidgetId);
              const w = findDesktopKpiWidget(
                entry.widgetSnapshot.widgetType,
                entry.widgetSnapshot.config,
              );
              if (w) ds.removeWidget(w.id);
            }
            break;
        }

        set((s) => ({ undoneIds: s.undoneIds.filter((uid) => uid !== id) }));
      },

      clearHistory: () => set({ entries: [], undoneIds: [] }),
    }),
    {
      name: "data-navigator-dashboard-history",
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "dashboard-history" })),
      partialize: (s) => ({ entries: s.entries, undoneIds: s.undoneIds }),
    },
  ),
);
