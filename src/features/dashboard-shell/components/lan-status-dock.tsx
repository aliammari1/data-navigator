"use client";

import { Radio, Users, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LanControlCenter } from "@/features/dashboard-shell/components/lan-control-center";
import {
  getLANPeers,
  getLANStatus,
  subscribeLAN,
} from "@/platform/lan/lan-collab";

export function LanStatusDock() {
  const [status, setStatus] = useState(getLANStatus());
  const [peerCount, setPeerCount] = useState(getLANPeers().length);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return subscribeLAN(() => {
      setStatus(getLANStatus());
      setPeerCount(getLANPeers().length);
    });
  }, []);

  const connected = status === "connected";

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
        <Radio className="h-3.5 w-3.5 text-cyan-500" />
        <span className="font-medium">LAN</span>
        <span className="inline-flex w-18 items-center gap-1 text-muted-foreground">
          {connected ? (
            <><Wifi className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">online</span></>
          ) : (
            <><WifiOff className="h-3 w-3" /><span>offline</span></>
          )}
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
