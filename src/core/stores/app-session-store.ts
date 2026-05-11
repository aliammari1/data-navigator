import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";

interface TelecomSessionState {
  tableName: string;
  fileName: string;
  reportDate: string;
  setTableName: (tableName: string) => void;
  setFileName: (fileName: string) => void;
  setReportDate: (reportDate: string) => void;
  setSession: (next: {
    tableName?: string;
    fileName?: string;
    reportDate?: string;
  }) => void;
}

export const useTelecomSessionStore = create<TelecomSessionState>()(
  persist(
    (set) => ({
      tableName: TELECOM_TABLE_BASE,
      fileName: "",
      reportDate: "",
      setTableName: (tableName) => set({ tableName }),
      setFileName: (fileName) => set({ fileName }),
      setReportDate: (reportDate) => set({ reportDate }),
      setSession: (next) =>
        set((state) => ({
          tableName: next.tableName ?? state.tableName,
          fileName: next.fileName ?? state.fileName,
          reportDate: next.reportDate ?? state.reportDate,
        })),
    }),
    {
      name: "telecom-session-context-v1",
      partialize: (s) => ({
        tableName: s.tableName,
        fileName: s.fileName,
        reportDate: s.reportDate,
      }),
    },
  ),
);
