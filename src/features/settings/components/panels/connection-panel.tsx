"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disconnectLAN } from "@/platform/lan/lan-collab";
import { type RuntimeMode, useRuntimeMode } from "@/platform/runtime-mode";
import { Section } from "../controls";

type RuntimeBridge = {
  setMode: (mode: RuntimeMode) => Promise<RuntimeMode>;
};

export function ConnectionPanel() {
  const mode = useRuntimeMode((s) => s.mode);
  const setMode = useRuntimeMode((s) => s.setMode);
  const [bridge, setBridge] = useState<RuntimeBridge | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBridge((window as Window & { electronRuntime?: RuntimeBridge }).electronRuntime ?? null);
  }, []);

  const changeMode = async (next: RuntimeMode) => {
    if (!bridge || next === mode || busy) return;
    setBusy(true);
    try {
      if (next === "offline") await disconnectLAN();
      const selected = await bridge.setMode(next);
      setMode(selected);
      toast.success(selected === "offline" ? "Offline mode is active" : "Online mode is active");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change connection mode");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Connection mode" icon={Wifi}>
      <p className="mb-4 text-sm text-muted-foreground">
        Choose how this workspace connects. Every new app launch starts Offline.
      </p>
      <div role="group" aria-label="Connection mode" className="grid gap-3 sm:grid-cols-2">
        {[
          {
            id: "offline" as const,
            icon: WifiOff,
            title: "Offline",
            description: "Keep the workspace local. Ends any active collaboration session.",
          },
          {
            id: "online" as const,
            icon: Wifi,
            title: "Online",
            description: "Show Collaboration and allow manual update checks.",
          },
        ].map((option) => {
          const Icon = option.icon;
          const selected = mode === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={!bridge || busy}
              onClick={() => void changeMode(option.id)}
              className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent"}`}
            >
              <Icon
                className={`mb-3 size-5 ${selected ? "text-primary" : "text-muted-foreground"}`}
              />
              <span className="block text-sm font-semibold text-foreground">{option.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
      {mode === "online" && (
        <p className="mt-4 text-xs text-muted-foreground">
          LAN access opens only while you host a collaboration session. Guests need its invite link
          and access code, then your approval.
        </p>
      )}
    </Section>
  );
}
