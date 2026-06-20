"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/shared/utils";

/** Level-3 collapsible — type / method */
export function CL3({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden transition-colors duration-200",
        open ? "border-border/60 bg-background/80" : "border-border/40 bg-background/50",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-1 h-3.5 rounded-full transition-colors duration-200 flex-none",
              open ? "bg-muted-foreground/60" : "bg-border",
            )}
          />
          <span className="text-xs font-semibold text-muted-foreground">{title}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-muted-foreground/50 transition-transform duration-200 flex-none",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 py-3 border-t border-border/40">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
