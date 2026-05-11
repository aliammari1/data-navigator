/**
 * F8 — Zustand Telecom Analytics Store
 * UI state (tab, mapping, statusMapping) persists across refreshes via localStorage.
 * Analytics data (kpi, canals, etc.) is NOT persisted — too large, recomputed on load.
 */

import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import type { ColumnMapping, CustomKPI, MainTab, StatusMapping } from "./types";

export type { ColumnMapping, CustomKPI, MainTab, StatusMapping };

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

export function normalizeColumnMapping(
  mapping?: Partial<ColumnMapping> | null,
): ColumnMapping {
  const merged = {
    ...DEFAULT_MAPPING,
    ...(mapping ?? {}),
  };

  return {
    ...merged,

    // Critical fields must never become empty.
    transactionId: merged.transactionId || DEFAULT_MAPPING.transactionId,
    transactionDate: merged.transactionDate || DEFAULT_MAPPING.transactionDate,
    canal: merged.canal || DEFAULT_MAPPING.canal,
    serviceCode: merged.serviceCode || DEFAULT_MAPPING.serviceCode,
    serviceName: merged.serviceName || DEFAULT_MAPPING.serviceName,
    transactionType: merged.transactionType || DEFAULT_MAPPING.transactionType,
    msisdn: merged.msisdn || DEFAULT_MAPPING.msisdn,
    amount: merged.amount || DEFAULT_MAPPING.amount,
    status: merged.status || DEFAULT_MAPPING.status,
    errorCode: merged.errorCode || DEFAULT_MAPPING.errorCode,
    errorMessage: merged.errorMessage || DEFAULT_MAPPING.errorMessage,
    operator: merged.operator || DEFAULT_MAPPING.operator,
    region: merged.region || DEFAULT_MAPPING.region,
    previousBalance: merged.previousBalance || DEFAULT_MAPPING.previousBalance,
    newBalance: merged.newBalance || DEFAULT_MAPPING.newBalance,
    totalAmount: merged.totalAmount || DEFAULT_MAPPING.totalAmount,

    // Optional fields may remain empty.
    transactionTime: merged.transactionTime ?? "",
    subscriberType: merged.subscriberType ?? "",
    processingTimeMs: merged.processingTimeMs ?? "",
    retryCount: merged.retryCount ?? "",
  };
}

interface TelecomStore {
  activeTab: MainTab;
  columnMapping: ColumnMapping;
  statusMapping: StatusMapping[];
  customKPIs: CustomKPI[];
  fileName: string;
  reportDate: string;
  commandOpen: boolean;
  globalSearchOpen: boolean;

  setActiveTab: (tab: MainTab) => void;
  setColumnMapping: (m: ColumnMapping) => void;
  setStatusMapping: (sm: StatusMapping[]) => void;
  addCustomKPI: (kpi: CustomKPI) => void;
  updateCustomKPI: (id: string, patch: Partial<CustomKPI>) => void;
  removeCustomKPI: (id: string) => void;
  setFileName: (name: string) => void;
  setReportDate: (date: string) => void;
  setCommandOpen: (v: boolean) => void;
  resetSession: () => void;
}

type PersistedTelecomStore = Partial<TelecomStore> & {
  columnMapping?: Partial<ColumnMapping>;
};

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

      setActiveTab: (tab) => set({ activeTab: tab }),

      setColumnMapping: (columnMapping) =>
        set({
          columnMapping: normalizeColumnMapping(columnMapping),
        }),

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
        set((s) => ({
          customKPIs: s.customKPIs.filter((k) => k.id !== id),
        })),

      setFileName: (fileName) => set({ fileName }),

      setReportDate: (reportDate) => set({ reportDate }),

      setCommandOpen: (commandOpen) => set({ commandOpen }),

      resetSession: () =>
        set({
          fileName: "",
          reportDate: "",
          activeTab: "overview",
          columnMapping: DEFAULT_MAPPING,
          statusMapping: [],
          customKPIs: [],
        }),
    })),
    {
      name: "telecom-session-v1",

      partialize: (s) => ({
        activeTab: s.activeTab,
        columnMapping: normalizeColumnMapping(s.columnMapping),
        statusMapping: s.statusMapping,
        customKPIs: s.customKPIs,
        fileName: s.fileName,
        reportDate: s.reportDate,
      }),

      merge: (persistedState, currentState) => {
        const persisted = persistedState as PersistedTelecomStore | undefined;

        return {
          ...currentState,
          ...(persisted ?? {}),
          columnMapping: normalizeColumnMapping(persisted?.columnMapping),
          commandOpen: false,
          globalSearchOpen: false,
        };
      },
    },
  ),
);
