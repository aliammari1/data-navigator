"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Palette,
  Database,
  Zap,
  Bell,
  Keyboard,
  Info,
  Check,
  RotateCcw,
  Save,
  Moon,
  Sun,
  Monitor,
  ChevronRight,
  Sliders,
  Globe,
  Eye,
} from "lucide-react";
import { useSettingsStore } from "@/core/stores/settings-store";
import type { AccentColor, DensityMode } from "@/core/stores/settings-store";
import { cn } from "@/shared/utils";

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted">
        <Icon className="w-4 h-4 text-indigo-400" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={cn(
          "relative w-10 h-6 rounded-full transition-colors flex-none",
          checked ? "bg-primary" : "bg-accent",
        )}
      >
        <span
          className={cn(
            "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
            checked ? "left-5" : "left-1",
          )}
        />
      </button>
    </div>
  );
}

// ─── Row item ─────────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
        )}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

function SettingSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── Accent picker ────────────────────────────────────────────────────────────

const ACCENTS: { value: AccentColor; label: string; bg: string }[] = [
  { value: "indigo", label: "Indigo", bg: "bg-indigo-500" },
  { value: "violet", label: "Violet", bg: "bg-violet-500" },
  { value: "cyan", label: "Cyan", bg: "bg-cyan-500" },
  { value: "emerald", label: "Emerald", bg: "bg-emerald-500" },
  { value: "amber", label: "Amber", bg: "bg-amber-500" },
  { value: "rose", label: "Rose", bg: "bg-rose-500" },
];

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], action: "Open command palette" },
  { keys: ["Ctrl", "\\"], action: "Toggle AI assistant panel" },
  { keys: ["Ctrl", "B"], action: "Toggle sidebar" },
  { keys: ["Ctrl", "U"], action: "Upload files" },
  { keys: ["Ctrl", "E"], action: "Export active data" },
  { keys: ["Ctrl", "Shift", "A"], action: "Open AI analysis" },
  { keys: ["Ctrl", "H"], action: "View history" },
  { keys: ["?"], action: "Show this shortcuts list" },
];

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "data", label: "Data", icon: Database },
  { id: "performance", label: "Performance", icon: Zap },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "about", label: "About", icon: Info },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const store = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabId>("appearance");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    store.resetToDefaults();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-full bg-background text-foreground">
      {/* Left sidebar */}
      <aside className="w-52 flex-none border-r border-border p-3 space-y-0.5">
        <div className="px-3 py-2 mb-2">
          <h1 className="text-base font-bold text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground">
            Preferences & configuration
          </p>
        </div>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors text-left",
                activeTab === tab.id
                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/25"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent",
              )}
            >
              <Icon className="w-4 h-4 flex-none" />
              {tab.label}
              {activeTab === tab.id && (
                <ChevronRight className="w-3 h-3 ml-auto" />
              )}
            </button>
          );
        })}
      </aside>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border flex-none">
          <div>
            <h2 className="text-base font-semibold text-foreground capitalize">
              {activeTab}
            </h2>
            <p className="text-xs text-muted-foreground">
              Manage your {activeTab} preferences
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-accent rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors",
                saved
                  ? "bg-emerald-600 text-white"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground",
              )}
            >
              {saved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        </div>

        {/* Tab panels */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-5 max-w-2xl"
            >
              {/* ── Appearance ── */}
              {activeTab === "appearance" && (
                <>
                  <Section title="Theme" icon={Moon}>
                    <SettingRow
                      label="Color scheme"
                      description="System follows your OS preference"
                    >
                      <div className="flex gap-1.5">
                        {(["dark", "light", "system"] as const).map((t) => {
                          const Icon =
                            t === "dark" ? Moon : t === "light" ? Sun : Monitor;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => store.setTheme(t)}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors border",
                                store.theme === t
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
                    <div className="flex gap-3 flex-wrap">
                      {ACCENTS.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => store.setAccentColor(a.value)}
                          className="flex flex-col items-center gap-1.5 group"
                        >
                          <div
                            className={cn(
                              "w-9 h-9 rounded-xl transition-all border-2",
                              a.bg,
                              store.accentColor === a.value
                                ? "border-white scale-110"
                                : "border-transparent group-hover:scale-105",
                            )}
                          >
                            {store.accentColor === a.value && (
                              <Check className="w-5 h-5 text-white m-auto mt-1.5" />
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {a.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="Layout & Display" icon={Eye}>
                    <SettingRow
                      label="Density"
                      description="Controls padding and spacing throughout the app"
                    >
                      <SettingSelect<DensityMode>
                        value={store.density}
                        onChange={store.setDensity}
                        options={[
                          { value: "compact", label: "Compact" },
                          { value: "comfortable", label: "Comfortable" },
                          { value: "spacious", label: "Spacious" },
                        ]}
                      />
                    </SettingRow>
                    <Toggle
                      checked={store.animationsEnabled}
                      onChange={store.setAnimationsEnabled}
                      label="Enable animations"
                      description="Framer Motion transitions throughout the app"
                    />
                    <Toggle
                      checked={store.showBreadcrumbs}
                      onChange={store.setShowBreadcrumbs}
                      label="Show breadcrumbs"
                      description="Path navigation in the top bar"
                    />
                    <Toggle
                      checked={store.sidebarPinned}
                      onChange={store.setSidebarPinned}
                      label="Pin sidebar open"
                      description="Sidebar stays expanded by default"
                    />
                    <Toggle
                      checked={store.compactNumbers}
                      onChange={store.setCompactNumbers}
                      label="Compact numbers"
                      description="Show 1.2M instead of 1,200,000"
                    />
                  </Section>
                </>
              )}

              {/* ── Data ── */}
              {activeTab === "data" && (
                <>
                  <Section title="Import & Parsing" icon={Database}>
                    <SettingRow label="Default CSV delimiter">
                      <SettingSelect<string>
                        value={store.data.csvDelimiter}
                        onChange={(v) =>
                          store.setData({
                            csvDelimiter: v as typeof store.data.csvDelimiter,
                          })
                        }
                        options={[
                          { value: ",", label: "Comma (,)" },
                          { value: ";", label: "Semicolon (;)" },
                          { value: "\t", label: "Tab (\\t)" },
                          { value: "|", label: "Pipe (|)" },
                        ]}
                      />
                    </SettingRow>
                    <SettingRow label="Max rows to load">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={100}
                          max={1000000}
                          step={1000}
                          value={store.data.defaultRowLimit}
                          onChange={(e) =>
                            store.setData({
                              defaultRowLimit: Number(e.target.value),
                            })
                          }
                          className="w-24 bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500"
                        />
                        <span className="text-xs text-muted-foreground">
                          rows
                        </span>
                      </div>
                    </SettingRow>
                    <SettingRow
                      label="Null display value"
                      description="How NULL values appear in tables"
                    >
                      <input
                        type="text"
                        value={store.data.nullDisplay}
                        onChange={(e) =>
                          store.setData({ nullDisplay: e.target.value })
                        }
                        className="w-20 bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-center font-mono"
                      />
                    </SettingRow>
                  </Section>

                  <Section title="Formatting" icon={Globe}>
                    <SettingRow label="Number locale">
                      <SettingSelect<string>
                        value={store.data.numberLocale}
                        onChange={(v) => store.setData({ numberLocale: v })}
                        options={[
                          { value: "en-US", label: "English (US)" },
                          { value: "en-GB", label: "English (UK)" },
                          { value: "de-DE", label: "German (DE)" },
                          { value: "fr-FR", label: "French (FR)" },
                          { value: "ar-SA", label: "Arabic (SA)" },
                        ]}
                      />
                    </SettingRow>
                    <SettingRow label="Date format">
                      <SettingSelect<string>
                        value={store.data.defaultDateFormat}
                        onChange={(v) =>
                          store.setData({ defaultDateFormat: v })
                        }
                        options={[
                          { value: "MMM d, yyyy", label: "Jan 1, 2025" },
                          { value: "yyyy-MM-dd", label: "2025-01-01" },
                          { value: "dd/MM/yyyy", label: "01/01/2025" },
                          { value: "MM/dd/yyyy", label: "01/01/2025 (US)" },
                        ]}
                      />
                    </SettingRow>
                    <Toggle
                      checked={store.data.enableQueryHistory}
                      onChange={(v) => store.setData({ enableQueryHistory: v })}
                      label="Save query history"
                      description="Remember past SQL & NL queries"
                    />
                  </Section>

                  <Section title="Auto-refresh" icon={Zap}>
                    <SettingRow
                      label="Refresh interval"
                      description="0 = disabled"
                    >
                      <div className="flex items-center gap-2">
                        <SettingSelect<string>
                          value={String(store.data.autoRefreshInterval)}
                          onChange={(v) =>
                            store.setData({ autoRefreshInterval: Number(v) })
                          }
                          options={[
                            { value: "0", label: "Off" },
                            { value: "10", label: "10s" },
                            { value: "30", label: "30s" },
                            { value: "60", label: "1 min" },
                            { value: "300", label: "5 min" },
                          ]}
                        />
                      </div>
                    </SettingRow>
                  </Section>
                </>
              )}

              {/* ── Performance ── */}
              {activeTab === "performance" && (
                <>
                  <Section title="DuckDB WASM" icon={Zap}>
                    <SettingRow
                      label="Worker threads"
                      description="More threads = faster queries (requires reload)"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1}
                          max={8}
                          step={1}
                          value={store.performance.duckdbWorkers}
                          onChange={(e) =>
                            store.setPerformance({
                              duckdbWorkers: Number(e.target.value),
                            })
                          }
                          className="w-28 accent-indigo-500"
                        />
                        <span className="text-sm text-foreground w-4 text-center">
                          {store.performance.duckdbWorkers}
                        </span>
                      </div>
                    </SettingRow>
                    <SettingRow label="Memory limit">
                      <SettingSelect<string>
                        value={String(store.performance.maxMemoryMB)}
                        onChange={(v) =>
                          store.setPerformance({ maxMemoryMB: Number(v) })
                        }
                        options={[
                          { value: "256", label: "256 MB" },
                          { value: "512", label: "512 MB" },
                          { value: "1024", label: "1 GB" },
                          { value: "2048", label: "2 GB" },
                        ]}
                      />
                    </SettingRow>
                    <Toggle
                      checked={store.performance.enableWASMStreaming}
                      onChange={(v) =>
                        store.setPerformance({ enableWASMStreaming: v })
                      }
                      label="WASM streaming instantiation"
                      description="Faster DuckDB startup when enabled"
                    />
                    <Toggle
                      checked={store.performance.cacheQueries}
                      onChange={(v) =>
                        store.setPerformance({ cacheQueries: v })
                      }
                      label="Cache query results"
                      description="Avoid re-running identical queries"
                    />
                  </Section>

                  <Section title="Rendering" icon={Sliders}>
                    <SettingRow
                      label="Virtualize tables at"
                      description="Rows above this threshold use virtual scrolling"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={50}
                          max={5000}
                          step={50}
                          value={store.performance.virtualizeThreshold}
                          onChange={(e) =>
                            store.setPerformance({
                              virtualizeThreshold: Number(e.target.value),
                            })
                          }
                          className="w-20 bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-right"
                        />
                        <span className="text-xs text-muted-foreground">
                          rows
                        </span>
                      </div>
                    </SettingRow>
                  </Section>
                </>
              )}

              {/* ── Notifications ── */}
              {activeTab === "notifications" && (
                <Section title="Notification Preferences" icon={Bell}>
                  <Toggle
                    checked={store.notifications.uploads}
                    onChange={(v) => store.setNotifications({ uploads: v })}
                    label="File uploads"
                    description="Notify when a file finishes uploading or fails"
                  />
                  <Toggle
                    checked={store.notifications.queries}
                    onChange={(v) => store.setNotifications({ queries: v })}
                    label="Long-running queries"
                    description="Alert when a query takes more than 5 seconds"
                  />
                  <Toggle
                    checked={store.notifications.errors}
                    onChange={(v) => store.setNotifications({ errors: v })}
                    label="Errors & warnings"
                    description="DuckDB errors, parse failures, data quality issues"
                  />
                  <Toggle
                    checked={store.notifications.collaboration}
                    onChange={(v) =>
                      store.setNotifications({ collaboration: v })
                    }
                    label="Collaboration"
                    description="Comments, mentions, and team activity"
                  />
                  <Toggle
                    checked={store.notifications.digest}
                    onChange={(v) => store.setNotifications({ digest: v })}
                    label="Daily digest"
                    description="Summary of activity (stored locally, offline)"
                  />
                </Section>
              )}

              {/* ── Shortcuts ── */}
              {activeTab === "shortcuts" && (
                <Section title="Keyboard Shortcuts" icon={Keyboard}>
                  <div className="space-y-2">
                    {SHORTCUTS.map((s) => (
                      <div
                        key={s.action}
                        className="flex items-center justify-between py-2 border-b border-border last:border-0"
                      >
                        <span className="text-sm text-foreground">
                          {s.action}
                        </span>
                        <div className="flex items-center gap-1">
                          {s.keys.map((k, i) => (
                            <span key={k}>
                              {i > 0 && (
                                <span className="text-muted-foreground mx-0.5">
                                  +
                                </span>
                              )}
                              <kbd className="px-2 py-0.5 bg-muted border border-border rounded text-[11px] text-foreground font-mono">
                                {k}
                              </kbd>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── About ── */}
              {activeTab === "about" && (
                <>
                  <Section title="About DataNavigator" icon={Info}>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                          <Database className="w-7 h-7 text-white" />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-foreground">
                            DataNavigator
                          </div>
                          <div className="text-sm text-muted-foreground">
                            v2.0.0 · Next.js 16 + DuckDB WASM
                          </div>
                        </div>
                      </div>
                      {[
                        {
                          label: "Runtime",
                          value: "Next.js 16.2.2 + Turbopack",
                        },
                        { label: "Query Engine", value: "DuckDB WASM 1.33.1" },
                        {
                          label: "AI Engine",
                          value: "Offline (NL2SQL + TF.js + Stats)",
                        },
                        { label: "Charts", value: "Apache ECharts 6.0" },
                        { label: "Animations", value: "Framer Motion 11" },
                        {
                          label: "AI Models",
                          value: "@huggingface/transformers (cached offline)",
                        },
                        { label: "License", value: "MIT" },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between py-2 border-b border-border last:border-0"
                        >
                          <span className="text-sm text-muted-foreground">
                            {row.label}
                          </span>
                          <span className="text-sm text-foreground font-mono">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Section>

                  <Section title="Privacy & Data" icon={Eye}>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        ✓{" "}
                        <strong className="text-foreground">
                          100% offline
                        </strong>{" "}
                        — all data stays in your browser. No telemetry, no cloud
                        sync, no external API calls.
                      </p>
                      <p>
                        ✓{" "}
                        <strong className="text-foreground">DuckDB WASM</strong>{" "}
                        runs entirely client-side via WebAssembly.
                      </p>
                      <p>
                        ✓{" "}
                        <strong className="text-foreground">AI features</strong>{" "}
                        use local algorithms and cached Hugging Face models —
                        your data never leaves your device.
                      </p>
                      <p>
                        ✓ <strong className="text-foreground">Settings</strong>{" "}
                        are persisted in{" "}
                        <code className="text-indigo-300">localStorage</code>{" "}
                        only.
                      </p>
                    </div>
                  </Section>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
