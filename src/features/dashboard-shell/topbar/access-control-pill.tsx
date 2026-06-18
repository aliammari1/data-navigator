"use client";

import { ChevronDown, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { useClickOutside } from "@/features/dashboard-shell/shell/use-click-outside";
import { cn } from "@/shared/utils";

/**
 * Role + cache-mode pill. Uses the shared `useClickOutside` (listener attached
 * only while open) instead of an always-on `document` mousedown listener.
 */
export function AccessControlPill() {
  const { role, roleLabel, cacheMode, setRole, setCacheMode } = useDashboardAccess();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="hidden md:flex items-center gap-1.5 rounded-xl border border-border bg-accent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
        title="Role based access and cache mode"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-medium text-foreground">{roleLabel}</span>
        <span className="text-[10px] uppercase">
          {cacheMode === "low-memory" ? "Low cache" : "Balanced"}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
          >
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">Access & cache</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Shared across dashboard pages on this device.
              </div>
            </div>
            <div className="space-y-3 p-3">
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(["owner", "editor", "viewer"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRole(option)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize",
                        role === option
                          ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Medium PC cache
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(["balanced", "low-memory"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCacheMode(option)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-[11px] font-semibold",
                        cacheMode === option
                          ? "border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option === "low-memory" ? "Low memory" : "Balanced"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
