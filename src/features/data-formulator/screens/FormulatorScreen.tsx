"use client";

/**
 * FormulatorScreen — the Data-Formulator-clone workspace (design doc:
 * docs/planning/v2/formulator-clone-design.md).
 *
 * Assembly only: every panel is a self-contained formulator2 component bound
 * to useFormulatorV2Store; this file owns layout, dataset init, and the desktop
 * menu's app-command bus (reset/cancel/ask). The `moudir:ask` window event now
 * belongs to the standalone Moudir assistant (app "moudir-chat"), which grew
 * out of MoudirSwarmScreen.
 */

import { Database, FlaskConical, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useDataStore } from "@/core/stores/data-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { FormChartCanvas } from "../components/formulator2/chart-canvas";
import { ChartTypeGallery } from "../components/formulator2/chart-type-gallery";
import { NodeCodePanel } from "../components/formulator2/code-panel";
import { DeriveVerification } from "../components/formulator2/derive-verification";
import {
  FormulatorChartExportProvider,
  FormulatorToolbarConnected,
} from "../components/formulator2/formulator-chart-export";
import { NodeDataTable } from "../components/formulator2/node-data-table";
import { ShelfWorkspace } from "../components/formulator2/shelf-workspace";
import { ThreadsPanel } from "../components/formulator2/threads-panel";
import type { ColType, ColumnInfo } from "../core/types";
import { useFormStatus, useFormulatorV2Store } from "../store/formulator-store";

/** Event fired by <DeriveVerification/> « Affiner » — focus the shelf prompt. */
const REFINE_FOCUS_EVENT = "formulator:refine-focus";

const COL_TYPES: ReadonlySet<string> = new Set(["number", "string", "date", "boolean"]);

function toColumnInfo(col: { name: string; type: string }): ColumnInfo {
  const type: ColType = COL_TYPES.has(col.type) ? (col.type as ColType) : "unknown";
  return { name: col.name, type, dbType: col.type };
}

export default function FormulatorScreen() {
  const router = useRouter();
  const dataset = useDataStore((s) => s.datasets.find((d) => d.id === s.activeDatasetId) ?? null);
  const initFromDataset = useFormulatorV2Store((s) => s.initFromDataset);
  const setInstruction = useFormulatorV2Store((s) => s.setInstruction);
  const formulate = useFormulatorV2Store((s) => s.formulate);
  const resetAll = useFormulatorV2Store((s) => s.resetAll);
  const cancelDerivation = useFormulatorV2Store((s) => s.cancelDerivation);
  const { status, statusText } = useFormStatus();

  // « Affiner » focuses the shelf's instruction textarea (the single <textarea>
  // inside ShelfWorkspace); we scope the lookup to a ref so we never guess.
  const shelfRef = useRef<HTMLDivElement>(null);
  const focusInstruction = useCallback(() => {
    const textarea = shelfRef.current?.querySelector("textarea");
    if (textarea) {
      textarea.focus();
      textarea.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const handler = () => focusInstruction();
    window.addEventListener(REFINE_FOCUS_EVENT, handler);
    return () => window.removeEventListener(REFINE_FOCUS_EVENT, handler);
  }, [focusInstruction]);

  const viewName = dataset ? (dataset.viewName ?? dataset.tableName) : null;

  useEffect(() => {
    if (!dataset || !viewName) return;
    initFromDataset({
      id: dataset.id,
      name: dataset.name,
      viewName,
      columns: dataset.columns.map(toColumnInfo),
      rowCount: dataset.rowCount,
    });
  }, [dataset, viewName, initFromDataset]);

  const menuWindowId = useWindowId();
  useAppCommands(
    "moudir",
    {
      reset: () => resetAll(),
      cancel: () => cancelDerivation(),
      ask: (payload) => {
        const prompt = (payload as { prompt?: string } | undefined)?.prompt?.trim();
        if (!prompt) return;
        setInstruction(prompt);
        void formulate();
      },
    },
    { windowId: menuWindowId },
  );

  if (!dataset || !viewName) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <Database className="size-8 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">
            Aucun jeu de données actif
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Importez un fichier pour commencer à formuler des visualisations — les champs
            apparaîtront comme des concepts à glisser sur les étagères.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/upload")}>Importer des données</Button>
      </div>
    );
  }

  return (
    <FormulatorChartExportProvider>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <FlaskConical className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-sm font-semibold">Formulateur</h1>
          <span className="max-w-48 truncate rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {dataset.name}
          </span>
          <ChartTypeGallery />
          <div className="flex-1" />
          {status === "deriving" && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-ai" aria-hidden="true" />
              {statusText || "Dérivation en cours…"}
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={cancelDerivation}>
                Annuler
              </Button>
            </span>
          )}
          <FormulatorToolbarConnected />
          <span className="rounded-md border border-ai/30 bg-ai/10 px-2 py-0.5 text-[10px] font-medium text-ai">
            IA locale
          </span>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Nouveau
          </Button>
        </header>

        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="formulator-workspace" minSize="30%">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel id="formulator-shelf" defaultSize="46%" minSize="20%" className="p-4">
                <div ref={shelfRef}>
                  <ShelfWorkspace />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="formulator-canvas" minSize="25%" className="p-4">
                <div className="flex flex-col gap-4">
                  <DeriveVerification />
                  <FormChartCanvas />
                  <NodeCodePanel />
                  <NodeDataTable />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="formulator-threads"
            defaultSize="20rem"
            minSize="14rem"
            collapsible
            collapsedSize={0}
            className="border-l border-border p-3"
          >
            <ThreadsPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </FormulatorChartExportProvider>
  );
}
