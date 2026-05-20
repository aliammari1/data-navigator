"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartSpec, QueryResult } from "@/features/data-formulator/core/types";

export type WidgetSize = "sm" | "md" | "lg" | "wide" | "full";

export interface FormulatorWidget {
  id: string;
  chartSpec: ChartSpec;
  result: QueryResult | null;
  title: string;
  size: WidgetSize;
  attachedTo: string[]; // page IDs like "telecom-overview", "telecom-analysis"
  createdAt: number;
  tableName: string;
}

interface WidgetRegistryStore {
  widgets: FormulatorWidget[];
  addWidget: (widget: Omit<FormulatorWidget, "id" | "createdAt">) => void;
  removeWidget: (id: string) => void;
  attachToPage: (widgetId: string, pageId: string) => void;
  detachFromPage: (widgetId: string, pageId: string) => void;
  updateWidget: (id: string, patch: Partial<FormulatorWidget>) => void;
  getWidgetsForPage: (pageId: string) => FormulatorWidget[];
}

export const useWidgetRegistry = create<WidgetRegistryStore>()(
  persist(
    (set, get) => ({
      widgets: [],

      addWidget: (widget) =>
        set((s) => ({
          widgets: [
            {
              ...widget,
              id: `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              createdAt: Date.now(),
            },
            ...s.widgets,
          ],
        })),

      removeWidget: (id) =>
        set((s) => ({
          widgets: s.widgets.filter((w) => w.id !== id),
        })),

      attachToPage: (widgetId, pageId) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === widgetId && !w.attachedTo.includes(pageId)
              ? { ...w, attachedTo: [...w.attachedTo, pageId] }
              : w,
          ),
        })),

      detachFromPage: (widgetId, pageId) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === widgetId
              ? { ...w, attachedTo: w.attachedTo.filter((p) => p !== pageId) }
              : w,
          ),
        })),

      updateWidget: (id, patch) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.id === id ? { ...w, ...patch } : w,
          ),
        })),

      getWidgetsForPage: (pageId) =>
        get().widgets.filter((w) => w.attachedTo.includes(pageId)),
    }),
    {
      name: "formulator-widget-registry-v1",
    },
  ),
);
