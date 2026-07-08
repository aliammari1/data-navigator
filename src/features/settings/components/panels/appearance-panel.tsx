"use client";

import { Check, Eye, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useSettingsStore } from "@/core/stores/settings-store";
import type { AccentColor, DensityMode } from "@/core/stores/settings-store";
import { cn } from "@/shared/utils";
import { Section, SettingRow, SettingSelect, Toggle } from "../controls";

const ACCENTS: { value: AccentColor; label: string; bg: string }[] = [
  { value: "blue", label: "Bleu", bg: "bg-blue-600" },
  { value: "indigo", label: "Indigo", bg: "bg-indigo-500" },
  { value: "violet", label: "Violet", bg: "bg-violet-500" },
  { value: "cyan", label: "Cyan", bg: "bg-cyan-500" },
  { value: "emerald", label: "Emerald", bg: "bg-emerald-500" },
  { value: "amber", label: "Amber", bg: "bg-amber-500" },
  { value: "rose", label: "Rose", bg: "bg-rose-500" },
];

export function AppearancePanel() {
  const {
    theme,
    accentColor,
    density,
    animationsEnabled,
    showBreadcrumbs,
    sidebarPinned,
    compactNumbers,
  } = useSettingsStore(
    useShallow((s) => ({
      theme: s.theme,
      accentColor: s.accentColor,
      density: s.density,
      animationsEnabled: s.animationsEnabled,
      showBreadcrumbs: s.showBreadcrumbs,
      sidebarPinned: s.sidebarPinned,
      compactNumbers: s.compactNumbers,
    })),
  );

  // Setters are stable references — pull them individually (no re-render churn).
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const setDensity = useSettingsStore((s) => s.setDensity);
  const setAnimationsEnabled = useSettingsStore((s) => s.setAnimationsEnabled);
  const setShowBreadcrumbs = useSettingsStore((s) => s.setShowBreadcrumbs);
  const setSidebarPinned = useSettingsStore((s) => s.setSidebarPinned);
  const setCompactNumbers = useSettingsStore((s) => s.setCompactNumbers);

  return (
    <>
      <Section title="Theme" icon={Moon}>
        <SettingRow label="Color scheme" description="System follows your OS preference">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Color scheme">
            {(["dark", "light", "system"] as const).map((t) => {
              const Icon = t === "dark" ? Moon : t === "light" ? Sun : Monitor;
              const active = theme === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors border",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              );
            })}
          </div>
        </SettingRow>
      </Section>

      <Section title="Accent Color" icon={Palette}>
        <div className="flex gap-3 flex-wrap" role="radiogroup" aria-label="Accent color">
          {ACCENTS.map((a) => {
            const active = accentColor === a.value;
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={a.label}
                onClick={() => setAccentColor(a.value)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl transition-all border-2 flex items-center justify-center",
                    a.bg,
                    active
                      ? "border-foreground scale-110"
                      : "border-transparent group-hover:scale-105",
                  )}
                >
                  {active && <Check className="w-5 h-5 text-white" />}
                </div>
                <span className="text-[10px] text-muted-foreground">{a.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Layout & Display" icon={Eye}>
        <SettingRow
          label="Density"
          description="Controls padding and corner radius throughout the app"
        >
          <SettingSelect<DensityMode>
            value={density}
            onChange={setDensity}
            ariaLabel="Density"
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
              { value: "spacious", label: "Spacious" },
            ]}
          />
        </SettingRow>
        <Toggle
          checked={animationsEnabled}
          onChange={setAnimationsEnabled}
          label="Enable animations"
          description="Motion transitions throughout the app"
        />
        <Toggle
          checked={showBreadcrumbs}
          onChange={setShowBreadcrumbs}
          label="Show breadcrumbs"
          description="Path navigation in the top bar"
        />
        <Toggle
          checked={sidebarPinned}
          onChange={setSidebarPinned}
          label="Pin sidebar open"
          description="Sidebar stays expanded by default"
        />
        <Toggle
          checked={compactNumbers}
          onChange={setCompactNumbers}
          label="Compact numbers"
          description="Show 1.2M instead of 1,200,000"
        />
      </Section>
    </>
  );
}
