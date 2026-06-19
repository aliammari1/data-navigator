"use client";

import { Radio, Users, Wifi, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { LanControlCenter } from "@/features/dashboard-shell/components/lan-control-center";
import {
  type LanRestingState,
  useLanStatus,
} from "@/features/dashboard-shell/shell/use-lan-status";
import { cn } from "@/shared/utils";

const STATE_LABEL: Record<LanRestingState, string> = {
  disabled: "LAN disabled",
  offline: "offline",
  connecting: "connecting",
  connected: "online",
  unreachable: "unreachable",
};

/**
 * LAN status dock with a real tri-state (plus) resting model.
 *
 * Distinguishes "no hub configured" (`disabled`) from "offline"
 * (`navigator.onLine === false`) and "hub unreachable" — the dock no longer
 * shows a single binary online/offline derived from a status that ignored the
 * browser online signal, so it never implies it is spinning against a dead
 * endpoint when no hub was set up.
 */
export function LanStatusDock() {
  const { state, peerCount } = useLanStatus();
  const [open, setOpen] = useState(false);

  const connected = state === "connected";
  const online = connected || state === "connecting";

  return (
    <div className="fixed bottom-3 left-3 z-40 hidden md:block">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="mb-2"
          >
            <LanControlCenter />
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] shadow-lg backdrop-blur hover:bg-muted"
      >
        <Radio
          className={cn(
            "h-3.5 w-3.5",
            state === "disabled" ? "text-muted-foreground" : "text-cyan-500",
          )}
        />
        <span className="font-medium">LAN</span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {online ? (
            <Wifi className={cn("h-3 w-3", connected ? "text-emerald-500" : "text-amber-500")} />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span className={cn(connected && "text-emerald-600")}>{STATE_LABEL[state]}</span>
        </span>
        {connected && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />
            {peerCount}
          </span>
        )}
      </button>
    </div>
  );
}
