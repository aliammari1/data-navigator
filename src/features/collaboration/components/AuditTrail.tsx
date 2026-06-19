"use client";

import * as React from "react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FileText,
  Download,
  StickyNote,
  CheckCircle2,
  Filter,
  Search,
  Trash2,
  AlertTriangle,
  Clock,
  Database,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { AuditEventType, CollabAuditEvent as AuditEvent } from "@/platform/collab";
import { clearAudit, useAuditCRDT } from "../collab/collab-hub-crdt";

// ─── Event type config ────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<
  AuditEventType,
  {
    icon: React.ReactNode;
    color: string;
    bg: string;
    label: string;
    filterLabel: string;
  }
> = {
  data: {
    icon: <Database className="size-3.5" />,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-100 dark:bg-blue-900/40",
    label: "Data",
    filterLabel: "Data Actions",
  },
  export: {
    icon: <Download className="size-3.5" />,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    label: "Export",
    filterLabel: "Exports",
  },
  annotation: {
    icon: <StickyNote className="size-3.5" />,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/40",
    label: "Annotation",
    filterLabel: "Annotations",
  },
  approval: {
    icon: <CheckCircle2 className="size-3.5" />,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-100 dark:bg-violet-900/40",
    label: "Approval",
    filterLabel: "Approvals",
  },
  filter: {
    icon: <Filter className="size-3.5" />,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-100 dark:bg-cyan-900/40",
    label: "Filter",
    filterLabel: "Filters",
  },
  system: {
    icon: <FileText className="size-3.5" />,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "System",
    filterLabel: "System",
  },
};

type FilterType = "all" | AuditEventType;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function exportToCSV(events: AuditEvent[]) {
  const header = ["ID", "Type", "Description", "User", "Timestamp"];
  const rows = events.map((e) => [
    e.id,
    e.type,
    `"${e.description.replace(/"/g, '""')}"`,
    e.user,
    new Date(e.at).toISOString(),
  ]);
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-trail-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Event row ────────────────────────────────────────────────────────────────

const EventRow = React.memo(function EventRow({
  event,
  showDate,
}: {
  event: AuditEvent;
  showDate: boolean;
}) {
  const cfg = EVENT_TYPE_CONFIG[event.type];

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            cfg.bg,
            cfg.color,
          )}
        >
          {cfg.icon}
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="pb-3 min-w-0 flex-1">
        {showDate && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {formatDate(event.at)}
          </p>
        )}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug text-foreground">{event.description}</p>
          <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
            {formatTime(event.at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-1.5 py-px text-[9px] font-medium uppercase tracking-wide",
              cfg.bg,
              cfg.color,
            )}
          >
            {cfg.label}
          </span>
          <span className="text-[10px] text-muted-foreground">{event.user}</span>
        </div>
      </div>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

const FILTER_BUTTONS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "data", label: "Data Actions" },
  { key: "export", label: "Exports" },
  { key: "annotation", label: "Annotations" },
  { key: "approval", label: "Approvals" },
];

export function AuditTrail() {
  // Audit is now a shared CRDT Y.Array (LAN-synced, y-indexeddb durable) — the
  // double localStorage write and the 500-entry zustand-persist serialize are
  // gone; this hook re-renders only when the log actually changes.
  const auditEvents = useAuditCRDT();
  const clearAuditEvents = clearAudit;
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  // Defer the search term so typing stays responsive even on large logs, and
  // memoize the filter pass so it only runs when inputs actually change
  // (previously it filtered the full ≤500-entry array on every render).
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return auditEvents.filter((e) => {
      const matchType = filterType === "all" || e.type === filterType;
      const matchSearch =
        !q || e.description.toLowerCase().includes(q) || e.user.toLowerCase().includes(q);
      return matchType && matchSearch;
    });
  }, [auditEvents, filterType, deferredSearch]);

  // Precompute which rows render a date header — virtualized rows mount out of
  // order, so a running Set during render cannot be relied upon.
  const showDateAt = useMemo(() => {
    const flags = new Array<boolean>(filtered.length);
    const seen = new Set<string>();
    for (let i = 0; i < filtered.length; i++) {
      const key = formatDate(filtered[i].at);
      flags[i] = !seen.has(key);
      seen.add(key);
    }
    return flags;
  }, [filtered]);

  // Per-type counts shown on the filter pills, computed once per log change.
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<AuditEventType, number>> = {};
    for (const e of auditEvents) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [auditEvents]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  const handleExport = () => exportToCSV(filtered);
  const handleClear = () => {
    clearAuditEvents();
    setConfirmClear(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events…"
            className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50 dark:bg-input/30"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setConfirmClear(true)}
            disabled={auditEvents.length === 0}
          >
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_BUTTONS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            onClick={() => setFilterType(key)}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              filterType === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1 opacity-70">({typeCounts[key as AuditEventType] ?? 0})</span>
            )}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {auditEvents.length} total events
        </span>
        <span>{filtered.length} shown</span>
        {auditEvents.length >= 500 && (
          <Badge variant="outline" className="text-[10px]">
            Max 500 entries
          </Badge>
        )}
      </div>

      {/* Timeline (virtualized — only visible rows mount) */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <FileText className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {auditEvents.length === 0
              ? "No audit events yet. Actions will appear here."
              : "No events match your filter."}
          </p>
        </div>
      ) : (
        <div ref={parentRef} className="max-h-[500px] overflow-y-auto pr-1">
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const event = filtered[vi.index];
              return (
                <div
                  key={event.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={vi.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <EventRow event={event} showDate={showDateAt[vi.index]} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm clear dialog */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Clear Audit History
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete all {auditEvents.length} audit events. This action cannot
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClear}>
              <Trash2 className="mr-1.5 size-3.5" />
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
