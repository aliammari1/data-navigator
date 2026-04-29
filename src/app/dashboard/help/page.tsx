"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart3,
  Brain,
  ChevronDown,
  ChevronRight,
  Code2,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  GitBranch,
  History,
  HelpCircle,
  Keyboard,
  Layers,
  MessageSquare,
  Receipt,
  Search,
  Settings,
  Table2,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Data ─────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], desc: "Open command palette" },
  { keys: ["Ctrl", "B"], desc: "Toggle sidebar" },
  { keys: ["Ctrl", "\\"], desc: "Toggle AI assistant" },
];

const FEATURES = [
  {
    icon: Upload,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    title: "Upload",
    href: "/dashboard/upload",
    summary: "Import CSV, JSON, XLSX or TSV files. Auto-detects column types, checks data quality, and loads the data into DuckDB WASM for SQL queries.",
    tips: [
      "Drag & drop multiple files at once",
      "Use the Settings tab to force a specific delimiter",
      "DuckDB table name is derived from the filename",
      "Re-upload to restore a table after page refresh",
    ],
  },
  {
    icon: FileText,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    title: "CSV Parser",
    href: "/dashboard/csv-parser",
    summary: "Paste raw delimited text or drop a file. Rename columns, change types, filter rows with simple expressions, then export or load to DuckDB.",
    tips: [
      "Pipe (|) delimiter is pre-selected — ideal for telecom reports",
      "Rename a column by clicking its name in the column panel",
      "Filter syntax: STATUS = SUCCESS · AMOUNT > 1000 · NAME LIKE %Ali%",
      "Export sends the filtered & transformed data as a clean CSV",
    ],
  },
  {
    icon: Code2,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    title: "Browser (SQL IDE)",
    href: "/dashboard/browser",
    summary: "Write and execute SQL queries against any loaded DuckDB table. Supports full DuckDB syntax: joins, window functions, aggregations.",
    tips: [
      "Press Ctrl+Enter to run the current query",
      "Use SHOW TABLES to list all loaded tables",
      "Results are shown below the editor with column types",
      "Query history is saved automatically",
    ],
  },
  {
    icon: Receipt,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    title: "Telecom Report",
    href: "/dashboard/telecom-report",
    summary: "Purpose-built dashboard for DailyTransactions CSV reports. Generates KPIs by status and by channel (TTCASH, Voucher, Bill Payment, Data, Credit Transfer…).",
    tips: [
      "Expected file format: DailyTransactions_YYYYMMDD.csv (pipe-delimited)",
      "Upload the file in the Telecom Report page — not the generic Upload page",
      "KPIs only count transactions with status REUSSIE (PST, PST1…PST9)",
      "Use the date picker to filter a specific period",
    ],
  },
  {
    icon: Brain,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    title: "AI Analysis",
    href: "/dashboard/ai-analysis",
    summary: "Runs automated statistical analysis on the active dataset: distributions, outliers, correlations and trend detection — all offline.",
    tips: [
      "Select the active dataset from the header picker first",
      "Click a column to drill down into its distribution",
      "Anomalies are flagged with a z-score threshold of ±2.5",
    ],
  },
  {
    icon: Table2,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    title: "Parsed Data",
    href: "/dashboard/parsed",
    summary: "Column-level profiler for the active dataset: type breakdown, null rates, unique counts, min/max/mean and sample values.",
    tips: [
      "Sort columns by null rate to quickly spot quality issues",
      "Click a column to see the full value distribution",
    ],
  },
  {
    icon: Layers,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    title: "Transform",
    href: "/dashboard/transform",
    summary: "Build visual ETL pipelines: filter, aggregate, join, pivot and rename steps that chain together with full SQL under the hood.",
    tips: [
      "Each step generates a DuckDB CTE — view the SQL at any time",
      "Save a pipeline to reuse it on new data uploads",
    ],
  },
  {
    icon: GitBranch,
    color: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    title: "Data Lineage",
    href: "/dashboard/lineage",
    summary: "Interactive DAG that shows where each dataset came from, what transformed it, and what depends on it.",
    tips: [
      "Click a node to see its full metadata",
      "Impact analysis: what breaks if this table changes?",
    ],
  },
  {
    icon: History,
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    title: "History",
    href: "/dashboard/history",
    summary: "Version history for datasets: diff two versions, restore a previous snapshot, or see who changed what.",
    tips: [
      "Snapshots are taken automatically on each upload",
      "Diff view highlights added/removed rows",
    ],
  },
  {
    icon: Users,
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    title: "Collaborative",
    href: "/dashboard/collaborative",
    summary: "Leave comments on columns or datasets, track changes with team chat, and see live cursors from other open tabs.",
    tips: [
      "Uses Yjs CRDT — works offline-first, syncs when tabs reconnect",
      "Mention a colleague with @name in comments",
    ],
  },
  {
    icon: Folder,
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    title: "Folders",
    href: "/dashboard/folders",
    summary: "Organise datasets into folders with tags and descriptions. Drag to reorder. Folders persist in localStorage.",
    tips: [
      "Tag datasets for quick filtering in the global search",
    ],
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Does any data leave my device?",
    a: "No external upload is required. Analytics run in the browser via DuckDB WASM, telecom files restore from IndexedDB, and local login uses a SQLite database on this machine.",
  },
  {
    q: "Will the Telecom Report survive a page refresh?",
    a: "Yes. The latest telecom source file, analytics cache, status mapping, layout, SQL history, and bookmarks are kept locally so the report can restore itself between sessions.",
  },
  {
    q: "What delimiters are supported for the Telecom Report?",
    a: "The telecom report expects a pipe-delimited (|) CSV as generated by the billing system. If your file uses a different separator, pre-convert it in the CSV Parser page first.",
  },
  {
    q: "What is the maximum file size?",
    a: "Practical limit is around 500 MB in-browser. For larger files, use the CSV Parser's row-limit setting to sample the data, or split the file beforehand.",
  },
  {
    q: "How do I query two datasets together with a JOIN?",
    a: "Upload both files, then open the Browser (SQL IDE) page. Both tables are accessible by their DuckDB names. Example: SELECT a.*, b.name FROM table_a a JOIN table_b b ON a.id = b.id",
  },
  {
    q: "Why do I get a 'SharedWorker unavailable' message?",
    a: "The SharedWorker enables one DuckDB instance shared across all open tabs. It requires the worker to be built (run `bun run build:worker`). Without it, each tab gets its own DuckDB instance — everything still works, just tables won't be shared across tabs.",
  },
];

// ─── Accordion item ───────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground flex-none transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ f }: { f: (typeof FEATURES)[0] }) {
  const [open, setOpen] = useState(false);
  const Icon = f.icon;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center flex-none", f.color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground">{f.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{f.summary.slice(0, 72)}…</div>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground flex-none transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">{f.summary}</p>
              {f.tips.length > 0 && (
                <ul className="space-y-1.5">
                  {f.tips.map((tip) => (
                    <li key={tip} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="w-3 h-3 text-indigo-400 flex-none mt-0.5" />
                      {tip}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<"features" | "faq" | "shortcuts">("features");

  const filteredFeatures = search
    ? FEATURES.filter(
        (f) =>
          f.title.toLowerCase().includes(search.toLowerCase()) ||
          f.summary.toLowerCase().includes(search.toLowerCase()),
      )
    : FEATURES;

  const filteredFAQs = search
    ? FAQS.filter(
        (f) =>
          f.q.toLowerCase().includes(search.toLowerCase()) ||
          f.a.toLowerCase().includes(search.toLowerCase()),
      )
    : FAQS;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Help & Documentation</h1>
              <p className="text-sm text-muted-foreground">
                DataNavigator — offline-first data analysis platform
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search features, FAQ…"
              className="w-full h-10 pl-9 pr-4 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
        </motion.div>

        {/* Section tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl">
          {(["features", "faq", "shortcuts"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSection(s)}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                activeSection === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "faq" ? "FAQ" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Features section */}
        {activeSection === "features" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            {filteredFeatures.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">
                No features match &ldquo;{search}&rdquo;
              </p>
            )}
            {filteredFeatures.map((f) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <FeatureCard f={f} />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* FAQ section */}
        {activeSection === "faq" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            {filteredFAQs.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">
                No FAQ matches &ldquo;{search}&rdquo;
              </p>
            )}
            {filteredFAQs.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </motion.div>
        )}

        {/* Shortcuts section */}
        {activeSection === "shortcuts" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Keyboard className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-foreground">Global shortcuts</span>
              </div>
              <div className="divide-y divide-border">
                {SHORTCUTS.map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">{desc}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <span key={k}>
                          <kbd className="inline-flex items-center px-2 py-0.5 bg-muted border border-border rounded text-xs font-mono text-foreground">
                            {k}
                          </kbd>
                          {i < keys.length - 1 && (
                            <span className="text-muted-foreground text-xs mx-0.5">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-foreground">SQL IDE shortcuts</span>
              </div>
              <div className="divide-y divide-border">
                {[
                  { keys: ["Ctrl", "Enter"], desc: "Run query" },
                  { keys: ["Ctrl", "Shift", "F"], desc: "Format SQL" },
                  { keys: ["Ctrl", "Z"], desc: "Undo" },
                ].map(({ keys, desc }) => (
                  <div key={desc} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted-foreground">{desc}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <span key={k}>
                          <kbd className="inline-flex items-center px-2 py-0.5 bg-muted border border-border rounded text-xs font-mono text-foreground">
                            {k}
                          </kbd>
                          {i < keys.length - 1 && (
                            <span className="text-muted-foreground text-xs mx-0.5">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className="border-t border-border pt-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Found a bug or have a feature request?
          </p>
          <a
            href="https://github.com/anthropics/claude-code/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Open an issue on GitHub <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
