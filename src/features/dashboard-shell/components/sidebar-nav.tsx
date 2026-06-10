"use client";

import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Database,
  FlaskConical,
  Folders,
  GitBranch,
  HelpCircle,
  History,
  Keyboard,
  Layers,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Receipt,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  Sun,
  Table2,
  Upload,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActivityStore } from "@/core/stores/activity-store";
import { useAppContextStore } from "@/core/stores/app-context-store";
import type { Dataset } from "@/core/stores/data-store";
import { useDataStore } from "@/core/stores/data-store";
import type { CatalogFolder } from "@/core/stores/folders-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import { useSettingsStore } from "@/core/stores/settings-store";

import { authClient } from "@/platform/auth/auth-client";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { cn } from "@/shared/utils";

export type TelecomDashboardTab =
  | "overview"
  | "canals"
  | "analysis"
  | "grid"
  | "period"
  | "day"
  | "history"
  | "config";

export const TELECOM_NAV_ITEMS: Array<{
  key: TelecomDashboardTab;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    key: "overview",
    label: "Vue d'ensemble",
    description: "KPIs, statut global et synthèse",
    icon: LayoutDashboard,
  },
  {
    key: "canals",
    label: "Canaux",
    description: "Analyse par canal transactionnel",
    icon: Layers,
  },
  {
    key: "analysis",
    label: "Analyse",
    description: "Erreurs, opérateurs, régions et tendances",
    icon: BarChart3,
  },
  {
    key: "grid",
    label: "Données brutes",
    description: "Exploration filtrée des transactions",
    icon: Table2,
  },
  {
    key: "period",
    label: "Période",
    description: "Studio de période et comparaisons",
    icon: CalendarDays,
  },
  {
    key: "day",
    label: "Journalier",
    description: "Analytics par jour",
    icon: Activity,
  },
  {
    key: "history",
    label: "Historique",
    description: "Analyses et fichiers en cache",
    icon: History,
  },
  {
    key: "config",
    label: "Configuration",
    description: "Mapping, statuts et paramètres",
    icon: Settings2,
  },
];

// ─── Nav definition ─────────────────────────────────────────────────────────

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  description: string;
  badge?: string;
  badgeColor?: string;
  keywords?: string[];
}

export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Overview & KPIs",
        keywords: ["home", "overview", "analytics"],
      },
      {
        title: "Upload",
        href: "/dashboard/upload",
        icon: Upload,
        description: "Import data files",
        keywords: ["import", "csv", "json"],
      },
      {
        title: "Folders",
        href: "/dashboard/folders",
        icon: Folders,
        description: "Folder tree & tags",
        keywords: ["folder", "organize"],
      },
    ],
  },
  {
    label: "Data",
    items: [
      {
        title: "Transform",
        href: "/dashboard/transform",
        icon: Layers,
        description: "Pipelines & ETL",
        keywords: ["etl", "pipeline", "transform"],
      },
      {
        title: "Parsed Data",
        href: "/dashboard/parsed",
        icon: Table2,
        description: "Column profiler",
        keywords: ["profile", "quality", "columns"],
      },
      {
        title: "History",
        href: "/dashboard/history",
        icon: History,
        description: "Version history",
        keywords: ["version", "diff", "changes"],
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        title: "AI Analysis",
        href: "/dashboard/ai-analysis",
        icon: Brain,
        description: "Stats & anomalies",
        badge: "AI",
        badgeColor: "blue",
        keywords: ["ai", "ml", "anomaly", "insight"],
      },
      {
        title: "Data Formulator",
        href: "/dashboard/data-formulator",
        icon: FlaskConical,
        description: "Visual query builder",
        badge: "NEW",
        badgeColor: "emerald",
        keywords: ["formulator", "query", "chart", "visual"],
      },
      {
        title: "Telecom Report",
        href: "/dashboard/telecom-report",
        icon: Receipt,
        description: "Daily transaction KPIs",
        keywords: ["telecom", "report", "kpi", "canal"],
      },
      {
        title: "Agent Canvas",
        href: "/dashboard/agent-canvas",
        icon: Brain,
        description: "AI builds dashboard live",
        badge: "A2UI",
        badgeColor: "blue",
        keywords: ["agent", "ai", "live", "canvas", "build", "a2ui"],
      },
      {
        title: "Data Lineage",
        href: "/dashboard/lineage",
        icon: GitBranch,
        description: "Track data flow",
        keywords: ["lineage", "graph", "dag"],
      },
      {
        title: "Collaborative",
        href: "/dashboard/collaborative",
        icon: Users,
        description: "Team workspace",
        badge: "3",
        badgeColor: "blue",
        keywords: ["team", "share", "comment"],
      },
      {
        title: "Charts",
        href: "/dashboard/charts",
        icon: BarChart3,
        description: "Visualizations",
        keywords: ["chart", "graph", "visualize"],
      },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    description: "Preferences",
  },
  {
    title: "Help",
    href: "/dashboard/help",
    icon: HelpCircle,
    description: "Docs & support",
  },
];

const ALL_ITEMS: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), ...FOOTER_ITEMS];

// ─── Command Palette ─────────────────────────────────────────────────────────

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? ALL_ITEMS.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.keywords?.some((k) => k.includes(q))
        );
      })
    : ALL_ITEMS.slice(0, 8);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && filtered[selected]) {
        router.push(filtered[selected].href);
        onClose();
      }
      if (e.key === "Escape") onClose();
    },
    [filtered, selected, router, onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-lg bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground flex-none" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={handleKey}
                placeholder="Search pages, features…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-accent border border-border rounded text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="py-1 max-h-80 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No results for "{query}"
                </div>
              )}
              {filtered.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      router.push(item.href);
                      onClose();
                    }}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      i === selected ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-none",
                        i === selected ? "bg-blue-500/20" : "bg-accent",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4",
                          i === selected ? "text-blue-400" : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </div>
                    </div>
                    {i === selected && (
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-none" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Keyboard className="w-3 h-3" /> Navigate
              </span>
              <span>↑↓ to move</span>
              <span>↵ to open</span>
              <span>ESC to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Nav Item ────────────────────────────────────────────────────────────────

function NavButton({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
  const Icon = item.icon;

  return (
    <div className="relative group">
      <Link
        href={item.href}
        title={collapsed ? item.title : undefined}
        className={cn(
          "flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-colors duration-100 border-l-2",
          collapsed ? "px-3 justify-center" : "pl-3 pr-2",
          isActive
            ? "border-teal-400 bg-foreground/6 text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/4",
        )}
      >
        <Icon
          className={cn(
            "w-4 h-4 flex-none shrink-0 transition-colors",
            isActive ? "text-teal-400" : "text-muted-foreground/70 group-hover:text-foreground",
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.title}</span>
            {item.badge && (
              <span className="text-[10px] font-mono text-muted-foreground/60 pr-1">
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>

      {collapsed && (
        <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-popover border border-border rounded-md px-2 py-1 text-xs text-popover-foreground whitespace-nowrap shadow-lg">
            {item.title}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function AppSidebar({
  collapsed,
  onToggle,
  onAiToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onAiToggle?: () => void;
}) {
  const { pinnedItems } = useSettingsStore();
  const pathname = usePathname();
  const router = useRouter();
  function handleTelecomTab(key: TelecomDashboardTab) {
    router.push(`/dashboard/telecom-report/${key}`);
  }

  function isTelecomTabActive(key: TelecomDashboardTab): boolean {
    return pathname === `/dashboard/telecom-report/${key}`;
  }
  const pinnedNavItems = ALL_ITEMS.filter((item) => pinnedItems.includes(item.href));

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 52 : 220 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className="relative hidden h-full flex-none flex-col overflow-hidden border-r border-border/60 bg-background md:flex"
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center h-12 border-b border-border/60 flex-none gap-2.5",
          collapsed ? "px-3 justify-center" : "px-3",
        )}
      >
        <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center flex-none shrink-0">
          <Database className="w-3.5 h-3.5 text-teal-400" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="flex-1 min-w-0"
          >
            <div className="text-sm font-semibold text-foreground truncate leading-none">
              DataNavigator
            </div>
            <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">DuckDB WASM</div>
          </motion.div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="w-6 h-6 rounded-md hover:bg-foreground/6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors flex-none"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
          </button>
        )}
        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute inset-0 w-full h-full"
            aria-label="Expand sidebar"
          />
        )}
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-none">
        {/* Pinned */}
        {!collapsed && pinnedNavItems.length > 0 && (
          <div className="px-2 mb-1">
            <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40">
              Pinned
            </div>
            {pinnedNavItems.map((item) => (
              <NavButton key={item.href} item={item} collapsed={false} />
            ))}
            <div className="my-2 mx-2 border-t border-border/40" />
          </div>
        )}

        {/* Main nav sections */}
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="px-2 mb-1">
            {!collapsed && (
              <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40">
                {section.label}
              </div>
            )}
            {collapsed && <div className="my-1 mx-1 border-t border-border/30" />}
            {section.items.map((item) => (
              <NavButton key={item.href} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}

        {/* Telecom section */}
        <div className="mx-2 my-2 border-t border-border/40" />
        <div className="px-2">
          {!collapsed && (
            <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-teal-500/60 flex items-center gap-1.5">
              <Receipt className="w-2.5 h-2.5" />
              Telecom
            </div>
          )}
          {TELECOM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = isTelecomTabActive(item.key);
            return (
              <div key={item.key} className="relative group">
                <button
                  type="button"
                  onClick={() => handleTelecomTab(item.key)}
                  className={cn(
                    "w-full flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-colors duration-100 border-l-2",
                    collapsed ? "px-3 justify-center" : "pl-3 pr-2",
                    isActive
                      ? "border-teal-400 bg-teal-400/8 text-teal-300"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/4",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 flex-none shrink-0",
                      isActive
                        ? "text-teal-400"
                        : "text-muted-foreground/60 group-hover:text-foreground",
                    )}
                  />
                  {!collapsed && (
                    <span className="flex-1 truncate text-left text-sm">{item.label}</span>
                  )}
                </button>
                {collapsed && (
                  <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-popover border border-border rounded-md px-2 py-1 text-xs text-popover-foreground whitespace-nowrap shadow-lg">
                      {item.label}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-none border-t border-border/60 px-2 py-2 space-y-px">
        {FOOTER_ITEMS.map((item) => (
          <NavButton key={item.href} item={item} collapsed={collapsed} />
        ))}
        {onAiToggle && (
          <button
            type="button"
            onClick={onAiToggle}
            title={collapsed ? "AI Assistant" : undefined}
            className={cn(
              "w-full flex items-center gap-2.5 py-1.5 rounded-lg text-sm transition-colors border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/4",
              collapsed ? "px-3 justify-center" : "pl-3 pr-2",
            )}
          >
            <Brain className="w-4 h-4 flex-none shrink-0 text-muted-foreground/60" />
            {!collapsed && <span className="flex-1 text-left">AI Assistant</span>}
          </button>
        )}
      </div>
    </motion.aside>
  );
}

// ─── Header Helpers ─────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

const FORMAT_COLORS: Record<string, string> = {
  csv: "bg-green-500/20 text-green-300",
  json: "bg-blue-500/20 text-blue-300",
  excel: "bg-emerald-500/20 text-emerald-300",
  parquet: "bg-blue-500/20 text-blue-300",
  sql: "bg-orange-500/20 text-orange-300",
};

// ─── Dataset Picker ──────────────────────────────────────────────────────────

function DatasetPicker() {
  const { datasets, activeDatasetId, setActiveDataset, loadedTableNames } = useDataStore();
  const setAppContext = useAppContextStore((s) => s.setContext);
  const addActivity = useActivityStore((s) => s.addEvent);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeDs = datasets.find((d) => d.id === activeDatasetId) ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/80 border border-border rounded-xl text-xs transition-colors max-w-44"
        title="Switch active dataset"
      >
        <Database className="w-3.5 h-3.5 text-blue-400 flex-none" />
        {activeDs ? (
          <>
            <span className="truncate text-foreground font-medium">{activeDs.name}</span>
            {!loadedTableNames.includes(activeDs.tableName) && (
              <AlertCircle
                className="w-3 h-3 text-amber-400 flex-none"
                aria-label="Not in session — re-upload to restore"
              />
            )}
          </>
        ) : (
          <span className="text-muted-foreground">No dataset</span>
        )}
        <ChevronDown className="w-3 h-3 text-muted-foreground flex-none ml-0.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-80 bg-popover border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="text-xs font-semibold text-foreground">Switch Dataset</span>
              <span className="text-[10px] text-muted-foreground">{datasets.length} uploaded</span>
            </div>
            {datasets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                <Database className="w-8 h-8 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">No datasets uploaded yet</p>
                <button
                  type="button"
                  onClick={() => {
                    router.push("/dashboard/upload");
                    setOpen(false);
                  }}
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Upload a file
                </button>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto py-1">
                {datasets.map((ds) => {
                  const live = loadedTableNames.includes(ds.tableName);
                  const active = ds.id === activeDatasetId;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => {
                        setActiveDataset(ds.id);
                        setAppContext({
                          activeDomain: "general",
                          activeDatasetId: ds.id,
                          activeTableName: ds.tableName,
                        });
                        addActivity({
                          type: "dataset_selected",
                          message: `Selected dataset ${ds.name}`,
                          datasetId: ds.id,
                          tableName: ds.tableName,
                        });
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors",
                        active && "bg-blue-500/10",
                      )}
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center flex-none",
                          active ? "bg-blue-500/20" : "bg-accent",
                        )}
                      >
                        <Table2
                          className={cn(
                            "w-3.5 h-3.5",
                            active ? "text-blue-400" : "text-muted-foreground",
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {ds.name}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] px-1 py-0.5 rounded flex-none",
                              FORMAT_COLORS[ds.format] ?? "bg-accent text-muted-foreground",
                            )}
                          >
                            {ds.format}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          <span className="text-muted-foreground">
                            {fmtCompact(ds.rowCount)} rows
                          </span>
                          <span className={live ? "text-green-400" : "text-amber-400"}>
                            {live ? "● live" : "⊘ stale"}
                          </span>
                        </div>
                      </div>
                      {active && <Check className="w-3.5 h-3.5 text-blue-400 flex-none" />}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccessControlPill() {
  const { role, roleLabel, cacheMode, setRole, setCacheMode } = useDashboardAccess();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="hidden md:flex items-center gap-1.5 rounded-xl border border-border bg-accent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
        title="Role based access and cache mode"
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
            className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
          >
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-foreground">Access & cache</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Shared across dashboard pages on this device.
              </div>
            </div>
            <div className="space-y-3 p-3">
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(["owner", "editor", "viewer"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRole(option)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-[11px] font-semibold capitalize",
                        role === option
                          ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Medium PC cache
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {(["balanced", "low-memory"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCacheMode(option)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-[11px] font-semibold",
                        cacheMode === option
                          ? "border-cyan-500/35 bg-cyan-500/12 text-cyan-700 dark:text-cyan-300"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {option === "low-memory" ? "Low memory" : "Balanced"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Global Data Search ──────────────────────────────────────────────────────

function GlobalDataSearch() {
  const { datasets, setActiveDataset } = useDataStore();
  const setAppContext = useAppContextStore((s) => s.setContext);
  const addActivity = useActivityStore((s) => s.addEvent);
  const { folders } = useFoldersStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"files" | "folders">("files");
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    if (scope === "files") {
      return datasets
        .filter((d) => d.name.toLowerCase().includes(q) || d.format.includes(q))
        .slice(0, 8) as (Dataset | CatalogFolder)[];
    }
    return folders.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8) as (
      | Dataset
      | CatalogFolder
    )[];
  }, [query, scope, datasets, folders]);

  const displayList = query
    ? results
    : scope === "files"
      ? (datasets.slice(0, 6) as (Dataset | CatalogFolder)[])
      : (folders.slice(0, 6) as (Dataset | CatalogFolder)[]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 border border-border rounded-xl text-xs transition-colors",
          open
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-accent hover:bg-accent/80 text-muted-foreground hover:text-foreground",
        )}
        title="Search files & folders"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Data search</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-2xl shadow-2xl z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Scope tabs */}
            <div className="flex gap-1 p-2 border-b border-border">
              {(["files", "folders"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    "flex-1 py-1 rounded-lg text-xs font-medium transition-colors",
                    scope === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {s === "files" ? "📊 All Files" : "📁 Folders"}
                </button>
              ))}
            </div>

            {/* Search input */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Search className="w-3.5 h-3.5 text-muted-foreground flex-none" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scope === "files" ? "Search datasets…" : "Search folders…"}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-64 overflow-y-auto py-1">
              {!query && displayList.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {scope === "files" ? "No datasets uploaded" : "No folders created"}
                </div>
              )}
              {query && results.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
              {displayList.map((item) => {
                if (scope === "files") {
                  const ds = item as Dataset;
                  return (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => {
                        setActiveDataset(ds.id);
                        setAppContext({
                          activeDomain: "general",
                          activeDatasetId: ds.id,
                          activeTableName: ds.tableName,
                        });
                        addActivity({
                          type: "dataset_selected",
                          message: `Selected dataset ${ds.name}`,
                          datasetId: ds.id,
                          tableName: ds.tableName,
                        });
                        router.push("/dashboard");
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                    >
                      <Table2 className="w-4 h-4 text-blue-400 flex-none" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {ds.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {ds.format} · {fmtCompact(ds.rowCount)} rows
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded flex-none",
                          FORMAT_COLORS[ds.format] ?? "bg-accent text-muted-foreground",
                        )}
                      >
                        {ds.format}
                      </span>
                    </button>
                  );
                }
                const folder = item as CatalogFolder;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      router.push("/dashboard/folders");
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                  >
                    <Folders className="w-4 h-4 text-yellow-400 flex-none" />
                    <span className="text-xs font-medium text-foreground truncate">
                      {folder.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Topbar ──────────────────────────────────────────────────────────────────

function Topbar({
  onCmdPalette,
  onAiToggle,
  user,
}: {
  onCmdPalette: () => void;
  onAiToggle?: () => void;
  user?: DashboardUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { showBreadcrumbs } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onCmdPalette();
      }
    };
    globalThis.window.addEventListener("keydown", handler);
    return () => globalThis.window.removeEventListener("keydown", handler);
  }, [onCmdPalette]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build breadcrumbs
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    label: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    href: `/${segments.slice(0, i + 1).join("/")}`,
  }));

  const NOTIFS = [
    {
      id: "n1",
      icon: Database,
      color: "text-emerald-400",
      msg: "DuckDB WASM loaded — 10,000 rows ready",
      time: "just now",
      read: false,
    },
    {
      id: "n2",
      icon: Zap,
      color: "text-blue-400",
      msg: "AI Analysis completed in 1.2s",
      time: "5m ago",
      read: false,
    },
    {
      id: "n3",
      icon: Users,
      color: "text-blue-400",
      msg: "Alice commented on revenue column",
      time: "12m ago",
      read: true,
    },
    {
      id: "n4",
      icon: GitBranch,
      color: "text-amber-400",
      msg: "Data lineage updated — 3 new nodes",
      time: "1h ago",
      read: true,
    },
  ];
  const unread = NOTIFS.filter((n) => !n.read).length;

  const cycleTheme = () => {
    setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark");
  };

  const ThemeIcon = !mounted
    ? Monitor
    : theme === "dark"
      ? Moon
      : theme === "light"
        ? Sun
        : Monitor;
  const displayName = user?.name || user?.email || "Local user";
  const userInitials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="z-40 flex h-14 flex-none items-center gap-2 overflow-hidden border-b border-border bg-background/80 px-2 backdrop-blur sm:gap-3 sm:px-4">
      {/* Breadcrumbs */}
      {showBreadcrumbs && (
        <nav className="hidden min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground sm:flex">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="w-3 h-3 flex-none text-muted-foreground" />}
              <Link
                href={crumb.href}
                className={cn(
                  "truncate hover:text-foreground transition-colors",
                  i === crumbs.length - 1 ? "text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <div className="flex-1" />

      {/* Active dataset picker */}
      <DatasetPicker />

      <div className="hidden md:block">
        <AccessControlPill />
      </div>

      {/* Global data search */}
      <div className="hidden sm:block">
        <GlobalDataSearch />
      </div>

      {/* Page search trigger */}
      <button
        type="button"
        onClick={onCmdPalette}
        className="flex items-center gap-2 rounded-xl border border-border bg-accent px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:px-3"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Search…</span>
        <kbd className="hidden md:flex items-center gap-0.5 px-1.5 py-0.5 bg-accent rounded text-[10px] border border-border">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      {/* Theme toggle */}
      <button
        type="button"
        onClick={cycleTheme}
        className="hidden h-8 w-8 items-center justify-center rounded-xl bg-accent text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:flex"
      >
        <ThemeIcon className="w-4 h-4" />
      </button>

      {/* Notifications */}
      <div className="relative hidden sm:block" ref={notifRef}>
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative w-8 h-8 rounded-xl bg-accent hover:bg-accent/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>

        <AnimatePresence>
          {notifOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-80 bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {NOTIFS.map((n) => {
                const NIcon = n.icon;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 border-b border-border hover:bg-accent transition-colors",
                      !n.read && "bg-blue-500/5",
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-none bg-accent",
                        n.color,
                      )}
                    >
                      <NIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-relaxed">{n.msg}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.time}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-blue-400 mt-1 flex-none" />}
                  </div>
                );
              })}
              <div className="px-4 py-2.5 text-center">
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Mark all read
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI toggle */}
      {onAiToggle && (
        <button
          type="button"
          onClick={onAiToggle}
          className="hidden h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 transition-colors hover:bg-blue-500/20 hover:text-blue-300 sm:flex"
          title="AI Assistant (Ctrl+\)"
        >
          <Brain className="w-4 h-4" />
        </button>
      )}

      {/* Settings shortcut */}
      <Link
        href="/dashboard/settings"
        className="hidden h-8 w-8 items-center justify-center rounded-xl bg-accent text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground sm:flex"
      >
        <Settings className="w-4 h-4" />
      </Link>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="size-8 rounded-xl">
            {user?.image && <AvatarImage src={user.image} alt={displayName} />}
            <AvatarFallback className="rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
              {userInitials || "DN"}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuLabel>
            <div className="flex items-center gap-3">
              <Avatar className="size-9 rounded-xl">
                {user?.image && <AvatarImage src={user.image} alt={displayName} />}
                <AvatarFallback className="rounded-xl text-xs font-semibold">
                  {userInitials || "DN"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                {user?.email ? (
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                ) : (
                  <div className="text-xs text-amber-400">Local mode</div>
                )}
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user ? (
            <>
              <DropdownMenuItem disabled>
                <UserCircle className="size-4" />
                Signed in
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
                <LogOut className="size-4" />
                {signingOut ? "Signing out..." : "Sign out"}
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={() => router.push("/login")}>
              <LogOut className="size-4 rotate-180" />
              Sign in to enable sync
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function DashboardLayout({
  children,
  onAiToggle,
  user,
}: {
  children: React.ReactNode;
  onAiToggle?: () => void;
  user?: DashboardUser;
}) {
  const { sidebarPinned } = useSettingsStore();
  const [collapsed, setCollapsed] = useState(!sidebarPinned);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Ctrl+\ toggles AI panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        onAiToggle?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    globalThis.window.addEventListener("keydown", handler);
    return () => globalThis.window.removeEventListener("keydown", handler);
  }, [onAiToggle]);

  return (
    <div className="dn-app-bg flex h-screen w-full overflow-hidden text-foreground">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onAiToggle={onAiToggle}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onCmdPalette={() => setCmdOpen(true)} onAiToggle={onAiToggle} user={user} />
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
