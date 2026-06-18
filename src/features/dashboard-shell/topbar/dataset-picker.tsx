"use client";

import { AlertCircle, Check, ChevronDown, Database, Table2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import { useDataStore } from "@/core/stores/data-store";
import {
  FORMAT_COLORS,
  fmtCompact,
} from "@/features/dashboard-shell/topbar/format-helpers";
import { useClickOutside } from "@/features/dashboard-shell/shell/use-click-outside";
import { cn } from "@/shared/utils";

/**
 * Active-dataset picker.
 *
 * Subscribes to narrow `useDataStore` selectors (datasets / activeDatasetId /
 * setters) instead of the whole store, so unrelated data-store mutations no
 * longer re-render the always-mounted topbar. The click-outside listener is the
 * shared `useClickOutside` hook, attached only while open.
 */
export function DatasetPicker() {
  const datasets = useDataStore((s) => s.datasets);
  const activeDatasetId = useDataStore((s) => s.activeDatasetId);
  const setActiveDataset = useDataStore((s) => s.setActiveDataset);
  const loadedTableNames = useDataStore((s) => s.loadedTableNames);
  const setAppContext = useAppContextStore((s) => s.setContext);
  const addActivity = useActivityStore((s) => s.addEvent);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const activeDs = datasets.find((d) => d.id === activeDatasetId) ?? null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 border border-border rounded-xl text-xs transition-colors max-w-44"
        title="Switch active dataset"
      >
        <Database className="w-3.5 h-3.5 text-blue-400 flex-none" />
        {activeDs ? (
          <>
            <span className="truncate text-foreground font-medium">{activeDs.name}</span>
            {!loadedTableNames.includes(activeDs.tableName) && (
              <AlertCircle
                className="w-3 h-3 text-amber-400 flex-none"
                aria-label="Not in session — re-upload to restore"
              />
            )}
          </>
        ) : (
          <span className="text-muted-foreground">No dataset</span>
        )}
        <ChevronDown className="w-3 h-3 text-muted-foreground flex-none ml-0.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-80 bg-popover border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Switch Dataset</span>
              <span className="text-[10px] text-muted-foreground">{datasets.length} uploaded</span>
            </div>
            {datasets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                <Database className="w-8 h-8 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">No datasets uploaded yet</p>
                <button
                  type="button"
                  onClick={() => {
                    router.push("/dashboard/upload");
                    setOpen(false);
                  }}
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Upload a file
                </button>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto py-1">
                {datasets.map((ds) => {
                  const live = loadedTableNames.includes(ds.tableName);
                  const active = ds.id === activeDatasetId;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => {
                        setActiveDataset(ds.id);
                        setAppContext({
                          activeDomain: "general",
                          activeDatasetId: ds.id,
                          activeTableName: ds.tableName,
                        });
                        addActivity({
                          type: "dataset_selected",
                          message: `Selected dataset ${ds.name}`,
                          datasetId: ds.id,
                          tableName: ds.tableName,
                        });
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors",
                        active && "bg-blue-500/10",
                      )}
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center flex-none",
                          active ? "bg-blue-500/20" : "bg-accent",
                        )}
                      >
                        <Table2
                          className={cn(
                            "w-3.5 h-3.5",
                            active ? "text-blue-400" : "text-muted-foreground",
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {ds.name}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] px-1 py-0.5 rounded flex-none",
                              FORMAT_COLORS[ds.format] ?? "bg-accent text-muted-foreground",
                            )}
                          >
                            {ds.format}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          <span className="text-muted-foreground">{fmtCompact(ds.rowCount)} rows</span>
                          <span className={live ? "text-green-400" : "text-amber-400"}>
                            {live ? "● live" : "⊘ stale"}
                          </span>
                        </div>
                      </div>
                      {active && <Check className="w-3.5 h-3.5 text-blue-400 flex-none" />}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
