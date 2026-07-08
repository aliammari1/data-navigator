/**
 * Static help-center content (features, FAQ, keyboard shortcuts).
 *
 * Kept as a plain, dependency-light data module (no `"use client"`) so the
 * copy can be indexed once for fuzzy search and reused by the screen, the
 * search hook, and — in future — the command palette without shipping the
 * component tree alongside it.
 */

import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Code2,
  FileText,
  Folder,
  GitBranch,
  History,
  Layers,
  Receipt,
  Table2,
  Upload,
  Users,
} from "lucide-react";

export interface ShortcutDef {
  keys: string[];
  desc: string;
}

export interface ShortcutGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  shortcuts: ShortcutDef[];
}

export interface FeatureDef {
  id: string;
  icon: LucideIcon;
  color: string;
  title: string;
  href: string;
  summary: string;
  tips: string[];
}

export interface FaqDef {
  id: string;
  q: string;
  a: string;
}

export const FEATURES: readonly FeatureDef[] = [
  {
    id: "upload",
    icon: Upload,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    title: "Upload",
    href: "/dashboard/upload",
    summary:
      "Import CSV, JSON, XLSX or TSV files. Auto-detects column types, checks data quality, and loads the data into DuckDB WASM for SQL queries.",
    tips: [
      "Drag & drop multiple files at once",
      "Use the Settings tab to force a specific delimiter",
      "DuckDB table name is derived from the filename",
      "Re-upload to restore a table after page refresh",
    ],
  },
  {
    id: "csv-parser",
    icon: FileText,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    title: "CSV Parser",
    href: "/dashboard/csv-parser",
    summary:
      "Paste raw delimited text or drop a file. Rename columns, change types, filter rows with simple expressions, then export or load to DuckDB.",
    tips: [
      "Pipe (|) delimiter is pre-selected — ideal for telecom reports",
      "Rename a column by clicking its name in the column panel",
      "Filter syntax: STATUS = SUCCESS · AMOUNT > 1000 · NAME LIKE %Ali%",
      "Export sends the filtered & transformed data as a clean CSV",
    ],
  },
  {
    id: "telecom-report",
    icon: Receipt,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    title: "Telecom Report",
    href: "/dashboard/telecom-report",
    summary:
      "Purpose-built dashboard for DailyTransactions CSV reports. Generates KPIs by status and by channel (TTCASH, Voucher, Bill Payment, Data, Credit Transfer…).",
    tips: [
      "Expected file format: DailyTransactions_YYYYMMDD.csv (pipe-delimited)",
      "Upload the file in the Telecom Report page — not the generic Upload page",
      "KPIs only count transactions with status REUSSIE (PST, PST1…PST9)",
      "Use the date picker to filter a specific period",
    ],
  },
  {
    id: "ai-analysis",
    icon: Brain,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    title: "AI Analysis",
    href: "/dashboard/ai-analysis",
    summary:
      "Runs automated statistical analysis on the active dataset: distributions, outliers, correlations and trend detection — all offline.",
    tips: [
      "Select the active dataset from the header picker first",
      "Click a column to drill down into its distribution",
      "Anomalies are flagged with a z-score threshold of ±2.5",
    ],
  },
  {
    id: "parsed",
    icon: Table2,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    title: "Parsed Data",
    href: "/dashboard/parsed",
    summary:
      "Column-level profiler for the active dataset: type breakdown, null rates, unique counts, min/max/mean and sample values.",
    tips: [
      "Sort columns by null rate to quickly spot quality issues",
      "Click a column to see the full value distribution",
    ],
  },
  {
    id: "transform",
    icon: Layers,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    title: "Transform",
    href: "/dashboard/transform",
    summary:
      "Build visual ETL pipelines: filter, aggregate, join, pivot and rename steps that chain together with full SQL under the hood.",
    tips: [
      "Each step generates a DuckDB CTE — view the SQL at any time",
      "Save a pipeline to reuse it on new data uploads",
    ],
  },
  {
    id: "lineage",
    icon: GitBranch,
    color: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    title: "Data Lineage",
    href: "/dashboard/lineage",
    summary:
      "Interactive DAG that shows where each dataset came from, what transformed it, and what depends on it.",
    tips: [
      "Click a node to see its full metadata",
      "Impact analysis: what breaks if this table changes?",
    ],
  },
  {
    id: "history",
    icon: History,
    color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    title: "History",
    href: "/dashboard/history",
    summary:
      "Version history for datasets: diff two versions, restore a previous snapshot, or see who changed what.",
    tips: [
      "Snapshots are taken automatically on each upload",
      "Diff view highlights added/removed rows",
    ],
  },
  {
    id: "collaborative",
    icon: Users,
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    title: "Collaborative",
    href: "/dashboard/collaborative",
    summary:
      "Leave comments on columns or datasets, track changes with team chat, and see live cursors from other open tabs.",
    tips: [
      "Uses Yjs CRDT — works offline-first, syncs when tabs reconnect",
      "Mention a colleague with @name in comments",
    ],
  },
  {
    id: "folders",
    icon: Folder,
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    title: "Folders",
    href: "/dashboard/folders",
    summary:
      "Organise datasets into folders with tags and descriptions. Drag to reorder. Folders persist locally in IndexedDB and survive across sessions.",
    tips: ["Tag datasets for quick filtering in the global search"],
  },
] as const;

export const FAQS: readonly FaqDef[] = [
  {
    id: "faq-on-device",
    q: "Does any data leave my device?",
    a: "No external upload is required. Analytics run in the browser via DuckDB WASM, telecom files restore from IndexedDB, and local login uses a SQLite database on this machine.",
  },
  {
    id: "faq-refresh",
    q: "Will the Telecom Report survive a page refresh?",
    a: "Yes. The latest telecom source file, analytics cache, status mapping, layout, SQL history, and bookmarks are kept locally so the report can restore itself between sessions.",
  },
  {
    id: "faq-delimiters",
    q: "What delimiters are supported for the Telecom Report?",
    a: "The telecom report expects a pipe-delimited (|) CSV as generated by the billing system. If your file uses a different separator, pre-convert it in the CSV Parser page first.",
  },
  {
    id: "faq-max-size",
    q: "What is the maximum file size?",
    a: "Practical limit is around 500 MB in-browser. For larger files, use the CSV Parser's row-limit setting to sample the data, or split the file beforehand.",
  },
  {
    id: "faq-join",
    q: "How do I query two datasets together with a JOIN?",
    a: "Upload both files, then open the Browser (SQL IDE) page. Both tables are accessible by their DuckDB names. Example: SELECT a.*, b.name FROM table_a a JOIN table_b b ON a.id = b.id",
  },
  {
    id: "faq-shared-worker",
    q: "Why do I get a 'SharedWorker unavailable' message?",
    a: "The SharedWorker enables one DuckDB instance shared across all open tabs. It requires the worker to be built (run `npm run build:worker`). Without it, each tab gets its own DuckDB instance — everything still works, just tables won't be shared across tabs.",
  },
] as const;

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    id: "global",
    label: "Global shortcuts",
    icon: Code2,
    iconClassName: "text-indigo-400",
    shortcuts: [
      { keys: ["Ctrl", "K"], desc: "Open command palette" },
      { keys: ["Ctrl", "B"], desc: "Toggle sidebar" },
      { keys: ["Ctrl", "\\"], desc: "Toggle AI assistant" },
    ],
  },
  {
    id: "sql-ide",
    label: "SQL IDE shortcuts",
    icon: Code2,
    iconClassName: "text-emerald-400",
    shortcuts: [
      { keys: ["Ctrl", "Enter"], desc: "Run query" },
      { keys: ["Ctrl", "Shift", "F"], desc: "Format SQL" },
      { keys: ["Ctrl", "Z"], desc: "Undo" },
    ],
  },
] as const;
