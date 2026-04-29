import { create } from "zustand";
import type { ChartCustomization } from "@/lib/types/chart";

interface ChartStore {
  customizations: Record<string, ChartCustomization>;
  activeChartId: string | null;
  updateCustomization: (
    chartId: string,
    config: Partial<ChartCustomization>,
  ) => void;
  setActiveChart: (id: string | null) => void;
}

const defaultCustomization: ChartCustomization = {
  colors: ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a"],
  showLegend: true,
  legendPosition: "bottom",
  showGrid: true,
  showTooltip: true,
  showAxes: true,
  animate: true,
  barDirection: "vertical",
  barStacked: false,
  donutHoleSize: 60,
  lineType: "monotone",
  areaStyle: false,
};

export const useChartStore = create<ChartStore>((set) => ({
  customizations: {},
  activeChartId: null,
  updateCustomization: (chartId, config) =>
    set((state) => ({
      customizations: {
        ...state.customizations,
        [chartId]: {
          ...(state.customizations[chartId] || defaultCustomization),
          ...config,
        },
      },
    })),
  setActiveChart: (id) => set({ activeChartId: id }),
}));

export const getDefaultCustomization = () => ({ ...defaultCustomization });
