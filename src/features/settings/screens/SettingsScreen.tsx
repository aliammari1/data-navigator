"use client";

import { lazy, Suspense, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bell,
  ChevronRight,
  Database,
  HardDrive,
  Info,
  Keyboard,
  Loader2,
  Palette,
  RotateCcw,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/core/stores/settings-store";
import { cn } from "@/shared/utils";

/**
 * Settings shell.
 *
 * This is intentionally lean: tab chrome + lazy per-panel mounting only. The
 * previous 738-line monolith subscribed to the WHOLE store (re-rendering every
 * panel on every keystroke), hand-rolled inaccessible controls, fired a SQLite
 * write per intermediate value, and animated unconditionally. All of that now
 * lives in the per-tab panels, which each subscribe to narrow selector slices.
 *
 * Persistence is automatic (every committed change writes through the store's
 * drizzle adapter), so there is no fake "Save" button — feedback is a toast and
 * the real durable controls are in the Storage tab (export / import / quota).
 */

const AppearancePanel = lazy(() =>
  import("../components/panels/appearance-panel").then((m) => ({
    default: m.AppearancePanel,
  })),
);
const DataPanel = lazy(() =>
  import("../components/panels/data-panel").then((m) => ({
    default: m.DataPanel,
  })),
);
const PerformancePanel = lazy(() =>
  import("../components/panels/performance-panel").then((m) => ({
    default: m.PerformancePanel,
  })),
);
const NotificationsPanel = lazy(() =>
  import("../components/panels/notifications-panel").then((m) => ({
    default: m.NotificationsPanel,
  })),
);
const AccountPanel = lazy(() =>
  import("../components/panels/account-panel").then((m) => ({
    default: m.AccountPanel,
  })),
);
const StoragePanel = lazy(() =>
  import("../components/panels/storage-panel").then((m) => ({
    default: m.StoragePanel,
  })),
);
const ShortcutsPanel = lazy(() =>
  import("../components/panels/shortcuts-panel").then((m) => ({
    default: m.ShortcutsPanel,
  })),
);
const AboutPanel = lazy(() =>
  import("../components/panels/about-panel").then((m) => ({
    default: m.AboutPanel,
  })),
);

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette, Panel: AppearancePanel },
  { id: "data", label: "Data", icon: Database, Panel: DataPanel },
  { id: "performance", label: "Performance", icon: Zap, Panel: PerformancePanel },
  { id: "account", label: "Account", icon: User, Panel: AccountPanel },
  { id: "notifications", label: "Notifications", icon: Bell, Panel: NotificationsPanel },
  { id: "storage", label: "Storage", icon: HardDrive, Panel: StoragePanel },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard, Panel: ShortcutsPanel },
  { id: "about", label: "About", icon: Info, Panel: AboutPanel },
] as const;

type TabId = (typeof TABS)[number]["id"];

function PanelFallback() {
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );
}

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<TabId>("appearance");

  // Animations respect BOTH the user's app setting and OS reduced-motion.
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const prefersReduced = useReducedMotion();
  const animate = animationsEnabled && !prefersReduced;

  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  const handleReset = () => {
    resetToDefaults();
    toast.success("Settings reset to defaults");
  };

  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const ActivePanel = active.Panel;

  return (
    <div className=" flex h-full text-foreground">
      {/* SettingsEffects is now mounted globally in DashboardClientShell. */}

      {/* Left rail */}
      <aside className="hidden w-52 flex-none space-y-0.5 border-r border-border/80 p-3 md:block">
        <div className="px-3 py-2 mb-2">
          <h1 className="text-base font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Preferences & configuration
          </p>
        </div>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left border",
                isActive
                  ? "bg-primary/15 text-primary border-primary/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border-transparent",
              )}
            >
              <Icon className="w-4 h-4 flex-none" />
              {tab.label}
              {isActive && <ChevronRight className="w-3 h-3 ml-auto" />}
            </button>
          );
        })}
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className=" flex flex-none items-center justify-between px-4 py-3.5 md:px-6">
          <div>
            <h2 className="text-base font-semibold text-foreground capitalize">
              {active.label}
            </h2>
            <p className="text-xs text-muted-foreground">
              Changes save automatically
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset defaults
          </button>
        </div>

        {/* Mobile tab strip */}
        <div className="md:hidden flex gap-1 overflow-x-auto px-4 py-2 border-b border-border/80">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border",
                  isActive
                    ? "bg-primary/15 text-primary border-primary/25"
                    : "text-muted-foreground border-transparent",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className=" max-w-5xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeTab}
                initial={animate ? { opacity: 0, y: 8 } : false}
                animate={animate ? { opacity: 1, y: 0 } : { opacity: 1 }}
                exit={animate ? { opacity: 0 } : { opacity: 1 }}
                transition={{ duration: animate ? 0.15 : 0 }}
                className="space-y-5 max-w-2xl"
              >
                <Suspense fallback={<PanelFallback />}>
                  <ActivePanel />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
