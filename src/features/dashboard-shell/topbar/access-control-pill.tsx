"use client";

import { ChevronDown, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useClickOutside } from "@/features/dashboard-shell/shell/use-click-outside";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";

/**
 * Role + cache-mode status pill. Both values are centralized in Settings
 * (Account / Performance tabs) — this is a read-only glance + deep link, not a
 * second place to change them. Uses the shared `useClickOutside` (listener
 * attached only while open) instead of an always-on `document` mousedown
 * listener.
 */
export function AccessControlPill() {
  const { roleLabel, cacheMode } = useDashboardAccess();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="hidden md:flex items-center gap-1.5 rounded-xl border border-border bg-accent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
        title="Role and cache mode (Settings)"
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
            className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
          >
            <div className="px-4 py-3">
              <div className="text-sm font-semibold text-foreground">Access & cache</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Shared across dashboard pages on this device. Managed in Settings.
              </div>
            </div>
            <div className="space-y-1 border-t border-border p-2">
              <Link
                href="/dashboard/settings?tab=account"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-accent"
              >
                Role — <span className="font-medium">{roleLabel}</span>
              </Link>
              <Link
                href="/dashboard/settings?tab=performance"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2.5 py-2 text-xs text-foreground hover:bg-accent"
              >
                Cache profile —{" "}
                <span className="font-medium">
                  {cacheMode === "low-memory" ? "Low memory" : "Balanced"}
                </span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
