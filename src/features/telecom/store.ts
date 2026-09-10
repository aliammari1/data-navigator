/**
 * Telecom column mapping helpers.
 *
 * Runtime analytics state lives in TanStack Query. UI persistence is handled in
 * use-telecom-ui without subscribing the report provider to an external store.
 */

import { create } from "zustand";
import { createJSONStorage, persist, subscribeWithSelector } from "zustand/middleware";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";
import type { CanalRule, ColumnMapping, StatusMapping } from "./types";

export type { ColumnMapping };

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

export function normalizeColumnMapping(mapping?: Partial<ColumnMapping> | null): ColumnMapping {
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
  columnMapping: ColumnMapping;
  statusMapping: StatusMapping[];
  canalRules: CanalRule[];
  fileName: string;
  reportDate: string;
  commandOpen: boolean;
  setColumnMapping: (m: ColumnMapping) => void;
  setStatusMapping: (sm: StatusMapping[]) => void;
  setCanalRules: (rules: CanalRule[]) => void;
  upsertCanalRule: (rule: CanalRule) => void;
  removeCanalRule: (id: string) => void;
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
      columnMapping: DEFAULT_MAPPING,
      statusMapping: [],
      canalRules: [],
      fileName: "",
      reportDate: "",
      commandOpen: false,

      setColumnMapping: (columnMapping) =>
        set({
          columnMapping: normalizeColumnMapping(columnMapping),
        }),

      setStatusMapping: (statusMapping) => set({ statusMapping }),

      setCanalRules: (canalRules) => set({ canalRules }),

      upsertCanalRule: (rule) =>
        set((s) => {
          const existingIndex = s.canalRules.findIndex((r) => r.id === rule.id);
          if (existingIndex >= 0) {
            const next = s.canalRules.slice();
            next[existingIndex] = rule;
            return { canalRules: next };
          }
          return { canalRules: [...s.canalRules, rule] };
        }),

      removeCanalRule: (id) =>
        set((s) => ({
          canalRules: s.canalRules.filter((r) => r.id !== id),
        })),

      setFileName: (fileName) => set({ fileName }),

      setReportDate: (reportDate) => set({ reportDate }),

      setCommandOpen: (commandOpen) => set({ commandOpen }),

      resetSession: () =>
        set({
          fileName: "",
          reportDate: "",
          columnMapping: DEFAULT_MAPPING,
          statusMapping: [],
          canalRules: [],
        }),
    })),
    {
      name: "telecom-session-v1",
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),

      partialize: (s) => ({
        columnMapping: normalizeColumnMapping(s.columnMapping),
        statusMapping: s.statusMapping,
        canalRules: s.canalRules,
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
        };
      },
    },
  ),
);
