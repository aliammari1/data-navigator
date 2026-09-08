"use client";

import { Radio, Users, Wifi, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LanControlCenter } from "@/features/dashboard-shell/components/lan-control-center";
import { useShellStore } from "@/features/dashboard-shell/shell/shell-store";
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
  const pathname = usePathname();
  const desktopMode = useShellStore((s) => s.desktopMode);
  const sidebarCollapsed = useShellStore((s) => s.sidebarCollapsed);

  const connected = state === "connected";
  const online = connected || state === "connecting";

  // The classic `AppSidebar` (`#app-sidebar`) occupies the viewport's left
  // edge — including this dock's default `left-3` resting spot — whenever the
  // windowed "Bureau" desktop workspace isn't the active surface (see
  // `DashboardLayout`'s three-way branch: any route other than a bare
  // `/dashboard` with `desktopMode` on renders the classic shell). Left
  // uncorrected, this fixed-position pill sits on top of (and steals pointer
  // events from) the sidebar's footer nav links, e.g. "Paramètres"/"Aide".
  // Offset past the sidebar's real (collapsed/expanded) width in that case;
  // only the Bureau workspace's bare `left-3` placement has no sidebar to clear.
  const sidebarVisible = !(desktopMode && pathname === "/dashboard");
  const leftOffsetPx = sidebarVisible ? (sidebarCollapsed ? 68 : 244) : 12;

  return (
    <div className="fixed bottom-3 z-40 hidden md:block" style={{ left: leftOffsetPx }}>
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
