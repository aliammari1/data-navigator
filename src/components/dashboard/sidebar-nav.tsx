"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Command,
  Database,
  FileJson,
  FlaskConical,
  FolderOpen,
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
  Pin,
  PinOff,
  Receipt,
  Search,
  Settings,
  Star,
  Sun,
  Table2,
  Upload,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/stores/settings-store";
import { useDataStore } from "@/lib/stores/data-store";
import type { Dataset } from "@/lib/stores/data-store";
import { useFoldersStore } from "@/lib/stores/folders-store";
import type { CatalogFolder } from "@/lib/stores/folders-store";

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
        title: "Browser",
        href: "/dashboard/browser",
        icon: FolderOpen,
        description: "Browse all files",
        keywords: ["files", "browse"],
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
        title: "CSV Parser",
        href: "/dashboard/csv-parser",
        icon: FileJson,
        description: "Advanced CSV parsing",
        keywords: ["csv", "parse", "delimiter"],
      },
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
        badgeColor: "violet",
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
        badgeColor: "violet",
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

const ALL_ITEMS: NavItem[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items),
  ...FOOTER_ITEMS,
];

// ─── Accent palette ──────────────────────────────────────────────────────────

const ACCENT = {
  indigo: {
    active: "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
    icon: "text-indigo-400",
    glow: "shadow-indigo-500/20",
    badge: "bg-indigo-500 text-white",
  },
  violet: {
    active: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    icon: "text-violet-400",
    glow: "shadow-violet-500/20",
    badge: "bg-violet-500 text-white",
  },
  cyan: {
    active: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
    icon: "text-cyan-400",
    glow: "shadow-cyan-500/20",
    badge: "bg-cyan-500 text-white",
  },
  emerald: {
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    icon: "text-emerald-400",
    glow: "shadow-emerald-500/20",
    badge: "bg-emerald-500 text-white",
  },
  amber: {
    active: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    icon: "text-amber-400",
    glow: "shadow-amber-500/20",
    badge: "bg-amber-500 text-white",
  },
  rose: {
    active: "bg-rose-500/15 text-rose-300 border-rose-500/25",
    icon: "text-rose-400",
    glow: "shadow-rose-500/20",
    badge: "bg-rose-500 text-white",
  },
};

// ─── Command Palette ─────────────────────────────────────────────────────────

function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
                        i === selected ? "bg-indigo-500/20" : "bg-accent",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4",
                          i === selected
                            ? "text-indigo-400"
                            : "text-muted-foreground",
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {item.title}
                      </div>
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

function NavButton({
  item,
  collapsed,
  accent,
}: {
  item: NavItem;
  collapsed: boolean;
  accent: keyof typeof ACCENT;
}) {
  const pathname = usePathname();
  const { pinnedItems, togglePinnedItem } = useSettingsStore();
  const [hovered, setHovered] = useState(false);
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href));
  const isPinned = pinnedItems.includes(item.href);
  const colors = ACCENT[accent];
  const Icon = item.icon;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper for hover state only — no interactive role needed
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 border border-transparent",
          isActive
            ? cn("border", colors.active)
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
        )}
      >
        <Icon
          className={cn(
            "w-4 h-4 flex-none transition-colors",
            isActive
              ? colors.icon
              : "text-muted-foreground group-hover:text-foreground",
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate font-medium">{item.title}</span>
            {item.badge && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                  item.badgeColor === "violet"
                    ? "bg-violet-500/20 text-violet-300"
                    : item.badgeColor === "blue"
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-accent text-muted-foreground",
                )}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>

      {/* Pin button (hover) */}
      {!collapsed && hovered && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            togglePinnedItem(item.href);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          {isPinned ? (
            <PinOff className="w-3 h-3" />
          ) : (
            <Pin className="w-3 h-3" />
          )}
        </button>
      )}

      {/* Tooltip for collapsed */}
      {collapsed && hovered && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 bg-popover border border-border rounded-lg px-2.5 py-1.5 text-xs text-popover-foreground whitespace-nowrap shadow-xl pointer-events-none">
          {item.title}
          {item.badge && (
            <span className="ml-1.5 text-muted-foreground">({item.badge})</span>
          )}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-popover" />
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
  const { accentColor, pinnedItems } = useSettingsStore();
  const accent = accentColor;
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  const toggleSection = (label: string) => {
    setCollapsedSections((s) => ({ ...s, [label]: !s[label] }));
  };

  const pinnedNavItems = ALL_ITEMS.filter((item) =>
    pinnedItems.includes(item.href),
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-full bg-background border-r border-border overflow-hidden flex-none"
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b border-border flex-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-none shadow-lg shadow-indigo-500/25">
            <Database className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="min-w-0"
            >
              <div className="text-sm font-bold text-foreground truncate">
                DataNavigator
              </div>
              <div className="text-[10px] text-muted-foreground">
                v2.0 · DuckDB WASM
              </div>
            </motion.div>
          )}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onToggle}
          className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-none"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
          )}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/5">
        {/* Pinned items */}
        {!collapsed && pinnedNavItems.length > 0 && (
          <div className="px-3 mb-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Star className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pinned
              </span>
            </div>
            <div className="space-y-0.5">
              {pinnedNavItems.map((item) => (
                <NavButton
                  key={item.href}
                  item={item}
                  collapsed={false}
                  accent={accent}
                />
              ))}
            </div>
            <div className="mt-2 border-t border-border" />
          </div>
        )}

        {/* Main sections */}
        {NAV_SECTIONS.map((section) => {
          const isSectionCollapsed = collapsedSections[section.label];
          return (
            <div key={section.label} className="px-3">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  className="w-full flex items-center gap-1.5 mb-1 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span className="flex-1 text-left">{section.label}</span>
                  {isSectionCollapsed ? (
                    <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <ChevronUp className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              )}
              <AnimatePresence initial={false}>
                {!isSectionCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-0.5"
                  >
                    {section.items.map((item) => (
                      <NavButton
                        key={item.href}
                        item={item}
                        collapsed={collapsed}
                        accent={accent}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {!collapsed && <div className="mt-2" />}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex-none border-t border-border p-3 space-y-0.5">
        {FOOTER_ITEMS.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            collapsed={collapsed}
            accent={accent}
          />
        ))}

        {/* AI toggle button */}
        {onAiToggle && (
          <button
            type="button"
            onClick={onAiToggle}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent transition-all"
          >
            <Brain className="w-4 h-4 flex-none text-violet-400" />
            {!collapsed && (
              <>
                <span className="flex-1 font-medium">AI Assistant</span>
                <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">
                  ⌃\
                </span>
              </>
            )}
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
  parquet: "bg-indigo-500/20 text-indigo-300",
  sql: "bg-orange-500/20 text-orange-300",
};

// ─── Dataset Picker ──────────────────────────────────────────────────────────

function DatasetPicker() {
  const { datasets, activeDatasetId, setActiveDataset, loadedTableNames } =
    useDataStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeDs = datasets.find((d) => d.id === activeDatasetId) ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
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
        <Database className="w-3.5 h-3.5 text-indigo-400 flex-none" />
        {activeDs ? (
          <>
            <span className="truncate text-foreground font-medium">
              {activeDs.name}
            </span>
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
              <span className="text-xs font-semibold text-foreground">
                Switch Dataset
              </span>
              <span className="text-[10px] text-muted-foreground">
                {datasets.length} uploaded
              </span>
            </div>
            {datasets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                <Database className="w-8 h-8 text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">
                  No datasets uploaded yet
                </p>
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
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors",
                        active && "bg-indigo-500/10",
                      )}
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center flex-none",
                          active ? "bg-indigo-500/20" : "bg-accent",
                        )}
                      >
                        <Table2
                          className={cn(
                            "w-3.5 h-3.5",
                            active
                              ? "text-indigo-400"
                              : "text-muted-foreground",
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
                              FORMAT_COLORS[ds.format] ??
                                "bg-accent text-muted-foreground",
                            )}
                          >
                            {ds.format}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          <span className="text-muted-foreground">
                            {fmtCompact(ds.rowCount)} rows
                          </span>
                          <span
                            className={
                              live ? "text-green-400" : "text-amber-400"
                            }
                          >
                            {live ? "● live" : "⊘ stale"}
                          </span>
                        </div>
                      </div>
                      {active && (
                        <Check className="w-3.5 h-3.5 text-indigo-400 flex-none" />
                      )}
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

// ─── Global Data Search ──────────────────────────────────────────────────────

function GlobalDataSearch() {
  const { datasets, setActiveDataset } = useDataStore();
  const { folders } = useFoldersStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"files" | "folders">("files");
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
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
    return folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .slice(0, 8) as (Dataset | CatalogFolder)[];
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
                placeholder={
                  scope === "files" ? "Search datasets…" : "Search folders…"
                }
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
                  {scope === "files"
                    ? "No datasets uploaded"
                    : "No folders created"}
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
                        router.push("/dashboard");
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent transition-colors"
                    >
                      <Table2 className="w-4 h-4 text-indigo-400 flex-none" />
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
                          FORMAT_COLORS[ds.format] ??
                            "bg-accent text-muted-foreground",
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
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCmdPalette]);

  // Click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false);
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
      color: "text-violet-400",
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
    setTheme(
      theme === "dark" ? "light" : theme === "light" ? "system" : "dark",
    );
  };

  const ThemeIcon = !mounted ? Monitor : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
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
    <header className="h-14 flex items-center gap-3 px-4 border-b border-border bg-background/80 backdrop-blur flex-none">
      {/* Breadcrumbs */}
      {showBreadcrumbs && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 flex-1">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <ChevronRight className="w-3 h-3 flex-none text-muted-foreground" />
              )}
              <Link
                href={crumb.href}
                className={cn(
                  "truncate hover:text-foreground transition-colors",
                  i === crumbs.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground",
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

      {/* Global data search */}
      <GlobalDataSearch />

      {/* Page search trigger */}
      <button
        type="button"
        onClick={onCmdPalette}
        className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent/80 border border-border rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors group"
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
        className="w-8 h-8 rounded-xl bg-accent hover:bg-accent/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <ThemeIcon className="w-4 h-4" />
      </button>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative w-8 h-8 rounded-xl bg-accent hover:bg-accent/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
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
                <span className="text-sm font-semibold text-foreground">
                  Notifications
                </span>
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
                      !n.read && "bg-indigo-500/5",
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
                      <p className="text-xs text-foreground leading-relaxed">
                        {n.msg}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {n.time}
                      </p>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1 flex-none" />
                    )}
                  </div>
                );
              })}
              <div className="px-4 py-2.5 text-center">
                <button
                  type="button"
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
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
          className="w-8 h-8 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 flex items-center justify-center text-violet-400 hover:text-violet-300 transition-colors"
          title="AI Assistant (Ctrl+\)"
        >
          <Brain className="w-4 h-4" />
        </button>
      )}

      {/* Settings shortcut */}
      <Link
        href="/dashboard/settings"
        className="w-8 h-8 rounded-xl bg-accent hover:bg-accent/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
                {user?.image && (
                  <AvatarImage src={user.image} alt={displayName} />
                )}
                <AvatarFallback className="rounded-xl text-xs font-semibold">
                  {userInitials || "DN"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {displayName}
                </div>
                {user?.email ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </div>
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
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onAiToggle]);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onAiToggle={onAiToggle}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar
          onCmdPalette={() => setCmdOpen(true)}
          onAiToggle={onAiToggle}
          user={user}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
