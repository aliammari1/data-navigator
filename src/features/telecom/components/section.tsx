"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  icon,
  children,
  badge,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-muted/30 overflow-hidden">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: collapsible sections toggled by button inside heading */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: intentional — section header acts as toggle */}
      <div
        className={cn(
          "flex items-center justify-between px-5 py-3.5 border-b border-border",
          collapsible &&
            "cursor-pointer hover:bg-muted/40 transition-colors select-none",
        )}
        onClick={() => collapsible && setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-bold text-foreground">{title}</span>
          {badge && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 font-semibold">
              {badge}
            </span>
          )}
        </div>
        {collapsible && (
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {(!collapsible || open) && (
          <motion.div
            initial={collapsible ? { height: 0, opacity: 0 } : false}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
