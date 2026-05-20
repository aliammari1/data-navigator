"use client";

/**
 * KPI Catalog Store
 * Persisted Dexie/IndexedDB storage for approved KPI definitions.
 * Uses Zustand for reactive UI state with IndexedDB persistence.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { bigIntJsonReplacer, sanitizeJsonValue } from "../json";
import type { KpiContract } from "./kpi-contract";

export interface KpiCatalogState {
  kpis: KpiContract[];
  selectedKpiId: string | null;
  searchQuery: string;
  filterStatus: "all" | "draft" | "pending" | "approved" | "rejected";

  addKpi: (kpi: KpiContract) => void;
  updateKpi: (id: string, updater: (kpi: KpiContract) => KpiContract) => void;
  removeKpi: (id: string) => void;
  selectKpi: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: KpiCatalogState["filterStatus"]) => void;

  getKpi: (id: string) => KpiContract | undefined;
  getApprovedKpis: () => KpiContract[];
  getByStatus: (status: KpiContract["reviewStatus"]) => KpiContract[];
}

export const useKpiCatalogStore = create<KpiCatalogState>()(
  persist(
    (set, get) => ({
      kpis: [],
      selectedKpiId: null,
      searchQuery: "",
      filterStatus: "all",

      addKpi: (kpi) =>
        set((state) => ({
          kpis: [...state.kpis, kpi],
          selectedKpiId: kpi.id,
        })),

      updateKpi: (id, updater) =>
        set((state) => ({
          kpis: state.kpis.map((k) => (k.id === id ? updater(k) : k)),
        })),

      removeKpi: (id) =>
        set((state) => ({
          kpis: state.kpis.filter((k) => k.id !== id),
          selectedKpiId: state.selectedKpiId === id ? null : state.selectedKpiId,
        })),

      selectKpi: (id) => set({ selectedKpiId: id }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setFilterStatus: (filterStatus) => set({ filterStatus }),

      getKpi: (id) => get().kpis.find((k) => k.id === id),

      getApprovedKpis: () => get().kpis.filter((k) => k.reviewStatus === "approved"),

      getByStatus: (status) => get().kpis.filter((k) => k.reviewStatus === status),
    }),
    {
      name: "moudir-kpi-catalog",
      storage: createJSONStorage(() => localStorage, {
        replacer: (key, value) => bigIntJsonReplacer(key, sanitizeJsonValue(value)),
        reviver: (key, value) => value, // BigInt strings remain as strings on load
      }),
      partialize: (state) => ({
        kpis: state.kpis,
      }),
    },
  ),
);
