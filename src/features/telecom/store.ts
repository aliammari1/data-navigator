/**
 * F8 — Zustand Telecom Analytics Store
 * UI state (tab, mapping, statusMapping) persists across refreshes via localStorage.
 * Analytics data (kpi, canals, etc.) is NOT persisted — too large, recomputed on load.
 */

import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type {
  MainTab,
  ColumnMapping,
  StatusMapping,
  CustomKPI,
} from "./types";

export { type MainTab, type ColumnMapping, type StatusMapping, type CustomKPI };

export const DEFAULT_MAPPING: ColumnMapping = {
  transactionId: "TRANSACTION_ID",
  transactionDate: "TRANSACTION_DATE",
  transactionTime: "",
  canal: "CHANNEL",
  serviceCode: "SERVICE_CLASS_NAME",
  serviceName: "SERVICE_CLASS_NAME",
  transactionType: "BRAND_CATEGORY_NAME",
  subscriberType: "",
  msisdn: "CUSTOMER_MSISDN",
  amount: "ORIGINAL_AMOUNT",
  status: "TRANSACTION_STATUS",
  errorCode: "REMARK",
  errorMessage: "REMARK",
  operator: "SALES_PERSON",
  region: "ACCOUNT_GROUP_ID",
  processingTimeMs: "",
  previousBalance: "BALANCE_BEFORE",
  newBalance: "BALANCE_AFTER",
  totalAmount: "ORIGINAL_AMOUNT",
  retryCount: "",
};

interface TelecomStore {
  activeTab: MainTab;
  columnMapping: ColumnMapping;
  statusMapping: StatusMapping[];
  customKPIs: CustomKPI[];
  fileName: string;
  reportDate: string;
  commandOpen: boolean;
  globalSearchOpen: boolean;
  layoutLocked: boolean;

  setActiveTab: (tab: MainTab) => void;
  setColumnMapping: (m: ColumnMapping) => void;
  setStatusMapping: (sm: StatusMapping[]) => void;
  addCustomKPI: (kpi: CustomKPI) => void;
  updateCustomKPI: (id: string, patch: Partial<CustomKPI>) => void;
  removeCustomKPI: (id: string) => void;
  setFileName: (name: string) => void;
  setReportDate: (date: string) => void;
  setCommandOpen: (v: boolean) => void;
  setGlobalSearchOpen: (v: boolean) => void;
  setLayoutLocked: (v: boolean) => void;
  resetSession: () => void;
}

export const useTelecomStore = create<TelecomStore>()(
  persist(
    subscribeWithSelector((set) => ({
      activeTab: "overview",
      columnMapping: DEFAULT_MAPPING,
      statusMapping: [],
      customKPIs: [],
      fileName: "",
      reportDate: "",
      commandOpen: false,
      globalSearchOpen: false,
      layoutLocked: false,

      setActiveTab: (tab) => set({ activeTab: tab }),
      setColumnMapping: (columnMapping) => set({ columnMapping }),
      setStatusMapping: (statusMapping) => set({ statusMapping }),
      addCustomKPI: (kpi) =>
        set((s) => ({ customKPIs: [...s.customKPIs, kpi] })),
      updateCustomKPI: (id, patch) =>
        set((s) => ({
          customKPIs: s.customKPIs.map((k) =>
            k.id === id ? { ...k, ...patch } : k,
          ),
        })),
      removeCustomKPI: (id) =>
        set((s) => ({ customKPIs: s.customKPIs.filter((k) => k.id !== id) })),
      setFileName: (fileName) => set({ fileName }),
      setReportDate: (reportDate) => set({ reportDate }),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setGlobalSearchOpen: (globalSearchOpen) => set({ globalSearchOpen }),
      setLayoutLocked: (layoutLocked) => set({ layoutLocked }),
      resetSession: () =>
        set({
          fileName: "",
          reportDate: "",
          activeTab: "overview",
          statusMapping: [],
          customKPIs: [],
        }),
    })),
    {
      name: "telecom-session-v1",
      partialize: (s) => ({
        activeTab: s.activeTab,
        columnMapping: s.columnMapping,
        statusMapping: s.statusMapping,
        customKPIs: s.customKPIs,
        fileName: s.fileName,
        reportDate: s.reportDate,
        layoutLocked: s.layoutLocked,
      }),
    },
  ),
);
