"use client";

import { useState } from "react";
import { Plus, X, LayoutDashboard, BarChart3, Layers, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/shared/utils";
import { useWidgetRegistry } from "@/features/data-formulator/core/widget-registry";
import type { ChartSpec, QueryResult } from "@/features/data-formulator/core/types";

const TELECOM_PAGES = [
  { id: "telecom-overview", label: "Overview", icon: LayoutDashboard },
  { id: "telecom-analysis", label: "Analysis", icon: BarChart3 },
  { id: "telecom-canals", label: "Canals", icon: Layers },
  { id: "telecom-config", label: "Config", icon: Settings2 },
];

interface AttachWidgetDialogProps {
  chartSpec: ChartSpec;
  result: QueryResult | null;
  tableName: string;
  open: boolean;
  onClose: () => void;
}

export function AttachWidgetDialog({
  chartSpec,
  result,
  tableName,
  open,
  onClose,
}: AttachWidgetDialogProps) {
  const { addWidget, widgets } = useWidgetRegistry();
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");

  const handleAttach = () => {
    if (selectedPages.length === 0) return;
    addWidget({
      chartSpec,
      result,
      title: chartSpec.title,
      size,
      attachedTo: selectedPages,
      tableName,
    });
    onClose();
    setSelectedPages([]);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="w-96 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Plus className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold text-foreground">Attach to Telecom Page</span>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto p-1 rounded-lg hover:bg-foreground/10 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Select pages</p>
              <div className="space-y-1.5">
                {TELECOM_PAGES.map((page) => {
                  const Icon = page.icon;
                  const isSelected = selectedPages.includes(page.id);
                  return (
                    <button
                      key={page.id}
                      type="button"
                      onClick={() =>
                        setSelectedPages((prev) =>
                          isSelected ? prev.filter((p) => p !== page.id) : [...prev, page.id],
                        )
                      }
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors",
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-muted border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="w-4 h-4 flex-none" />
                      <span className="text-xs font-medium">{page.label}</span>
                      {isSelected && (
                        <span className="ml-auto text-[10px] bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Widget size</p>
              <div className="flex gap-2">
                {(["sm", "md", "lg"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                      size === s
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                        : "bg-muted border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAttach}
              disabled={selectedPages.length === 0}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl text-xs font-medium text-emerald-300 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Attach widget ({selectedPages.length} page{selectedPages.length !== 1 ? "s" : ""})
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
