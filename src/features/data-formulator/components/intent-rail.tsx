"use client";

import {
  BarChart3,
  BellRing,
  ClipboardList,
  Gauge,
  HelpCircle,
  LineChart,
  Settings2,
  Target,
} from "lucide-react";
import type { ManagerIntent } from "@/features/data-formulator/core/language/intent";
import { INTENT_PROFILES } from "@/features/data-formulator/core/language/intent";
import { cn } from "@/shared/utils";

interface IntentRailProps {
  activeIntent: ManagerIntent;
  onIntentChange: (intent: ManagerIntent) => void;
}

const ICONS: Record<ManagerIntent, typeof HelpCircle> = {
  ask: HelpCircle,
  kpi: Gauge,
  dashboard: BarChart3,
  investigate: Target,
  signal: BellRing,
  brief: ClipboardList,
  scenario: LineChart,
  setup: Settings2,
};

export function IntentRail({
  activeIntent,
  onIntentChange,
}: IntentRailProps) {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-white/10 bg-background/85 p-2 shadow-xl backdrop-blur-xl md:flex-col md:overflow-visible">
      {INTENT_PROFILES.map((profile) => {
        const Icon = ICONS[profile.intent];
        const active = profile.intent === activeIntent;
        return (
          <button
            key={profile.intent}
            type="button"
            onClick={() => onIntentChange(profile.intent)}
            className={cn(
              "flex min-w-24 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors md:min-w-0",
              active
                ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-200"
                : "border-transparent bg-transparent text-muted-foreground hover:border-white/10 hover:bg-white/4 hover:text-foreground",
            )}
            title={profile.description}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">{profile.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
