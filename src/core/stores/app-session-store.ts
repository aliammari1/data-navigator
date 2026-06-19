import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { TELECOM_TABLE_BASE } from "@/features/telecom/lib/names";
import { createDrizzleStorage } from "@/platform/storage/drizzle-storage";

interface TelecomSessionState {
  tableName: string;
  fileName: string;
  reportDate: string;
  setTableName: (tableName: string) => void;
  setFileName: (fileName: string) => void;
  setReportDate: (reportDate: string) => void;
  setSession: (next: { tableName?: string; fileName?: string; reportDate?: string }) => void;
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
      version: 1,
      storage: createJSONStorage(() => createDrizzleStorage({ namespace: "store" })),
      // Coerce a missing/empty tableName back to TELECOM_TABLE_BASE and ensure
      // fileName/reportDate are strings.
      migrate: (persisted, _version) => {
        const prev = (persisted ?? {}) as Partial<TelecomSessionState>;
        const tableName =
          typeof prev.tableName === "string" && prev.tableName.trim() !== ""
            ? prev.tableName
            : TELECOM_TABLE_BASE;
        return {
          tableName,
          fileName: typeof prev.fileName === "string" ? prev.fileName : "",
          reportDate: typeof prev.reportDate === "string" ? prev.reportDate : "",
        };
      },
      partialize: (s) => ({
        tableName: s.tableName,
        fileName: s.fileName,
        reportDate: s.reportDate,
      }),
    },
  ),
);

// ─── Selector hooks ─────────────────────────────────────────────────────────

export const useTelecomSession = () =>
  useTelecomSessionStore(
    useShallow((s) => ({
      tableName: s.tableName,
      fileName: s.fileName,
      reportDate: s.reportDate,
    })),
  );

export const useTelecomSessionActions = () =>
  useTelecomSessionStore(
    useShallow((s) => ({
      setTableName: s.setTableName,
      setFileName: s.setFileName,
      setReportDate: s.setReportDate,
      setSession: s.setSession,
    })),
  );
