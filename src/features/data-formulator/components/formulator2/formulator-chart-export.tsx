"use client";

/**
 * Chart-export bridge — the thin wiring between the chart canvas (which owns the
 * live main-thread ECharts instance and the resolved rows) and the header
 * toolbar (which owns the « Exporter » menu but neither the instance nor the
 * data).
 *
 * Why a context instead of props: the toolbar lives in the screen HEADER while
 * the chart lives in the resizable BODY, so they can't pass props directly. The
 * canvas registers a stable instance getter (a ref — never triggers a re-render)
 * and publishes the current rows + export-readiness (reactive state — the menu
 * enables/disables from it). The connected toolbar reads both and wires the
 * three export actions to the offline `chart-export` helpers.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  copyChartPng,
  type EChartsInstanceGetter,
  exportChartPng,
  exportRowsCsv,
} from "@/platform/viz/chart-export";
import type { Row } from "../../core/formulator/model";
import { FormulatorToolbar } from "./formulator-toolbar";

const PNG_FILENAME = "formulateur-graphique";
const CSV_FILENAME = "formulateur-donnees";

interface ExportState {
  rows: Row[];
  canExport: boolean;
}

interface ChartExportContextValue {
  /** Canvas registers its live-instance getter here (stable, ref-backed). */
  registerGetInstance: (getter: EChartsInstanceGetter) => void;
  /** Canvas publishes the resolved rows + whether a chart is exportable. */
  setExportState: (state: ExportState) => void;
  /** Toolbar reads the current instance getter to drive PNG/clipboard export. */
  getInstance: EChartsInstanceGetter;
  rows: Row[];
  canExport: boolean;
}

const ChartExportContext = createContext<ChartExportContextValue | null>(null);

export function FormulatorChartExportProvider({ children }: Readonly<{ children: ReactNode }>) {
  const getterRef = useRef<EChartsInstanceGetter>(() => null);
  const [state, setState] = useState<ExportState>({ rows: [], canExport: false });

  const registerGetInstance = useCallback((getter: EChartsInstanceGetter) => {
    getterRef.current = getter;
  }, []);

  const getInstance = useCallback<EChartsInstanceGetter>(() => getterRef.current(), []);

  const setExportState = useCallback((next: ExportState) => {
    // Skip no-op publishes: the canvas effect fires on every resolve, but rows
    // identity only changes on a real query, so this keeps the toolbar stable.
    setState((prev) =>
      prev.canExport === next.canExport && prev.rows === next.rows ? prev : next,
    );
  }, []);

  const value = useMemo<ChartExportContextValue>(
    () => ({
      registerGetInstance,
      setExportState,
      getInstance,
      rows: state.rows,
      canExport: state.canExport,
    }),
    [registerGetInstance, setExportState, getInstance, state],
  );

  return <ChartExportContext.Provider value={value}>{children}</ChartExportContext.Provider>;
}

export function useChartExport(): ChartExportContextValue {
  const ctx = useContext(ChartExportContext);
  if (!ctx) {
    throw new Error("useChartExport must be used within a FormulatorChartExportProvider");
  }
  return ctx;
}

/**
 * Header toolbar wired to the export bridge. Undo/redo are self-contained inside
 * <FormulatorToolbar/> (they bind the store directly); this connector only
 * supplies the three export handlers + the enablement flag.
 */
export function FormulatorToolbarConnected() {
  const { getInstance, rows, canExport } = useChartExport();

  const onExportPng = useCallback(() => {
    const ok = exportChartPng(getInstance, PNG_FILENAME);
    if (!ok) toast.error("Graphique indisponible pour l'export.");
  }, [getInstance]);

  const onCopyPng = useCallback(async () => {
    try {
      await copyChartPng(getInstance);
      toast("Image copiée dans le presse-papiers");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Copie impossible");
    }
  }, [getInstance]);

  const onExportCsv = useCallback(() => {
    if (rows.length === 0) {
      toast.error("Aucune donnée à exporter.");
      return;
    }
    exportRowsCsv(rows, CSV_FILENAME);
  }, [rows]);

  return (
    <FormulatorToolbar
      onExportPng={onExportPng}
      onCopyPng={() => void onCopyPng()}
      onExportCsv={onExportCsv}
      canExport={canExport}
    />
  );
}
