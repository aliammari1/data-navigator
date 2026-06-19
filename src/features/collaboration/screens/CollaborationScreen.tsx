"use client";

/**
 * Collaborative workspace — wired to the real CRDT substrate.
 *
 * Everything on this screen traces to a real source:
 *  - comments / changes / chat   → the per-room Yjs doc (durable y-indexeddb,
 *    LAN-syncable), read via selector hooks (`useYArray`) and mutated via
 *    `room-actions` transactions. No mock useState arrays, no last-write clobber.
 *  - peers / presence            → y-protocols Awareness (room + LAN), no mock
 *    collaborators, no hand-rolled heartbeat.
 *  - audit                       → the shared LAN audit Y.Array (incremental).
 *  - workspace stats             → DuckDB catalog + Dexie telecom caches
 *    (visibility-gated polling — paused when the tab is hidden).
 *  - charts                      → `OffscreenChart` (echarts in OffscreenCanvas)
 *    with options derived from real CRDT timestamps/contributions. No Math.random.
 *  - lists                       → `@tanstack/react-virtual` (comments, changes,
 *    chat, audit) so large histories render at 60fps.
 */

import {
  Activity,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Filter,
  GitBranch,
  HardDrive,
  History,
  MessageSquare,
  Plus,
  Search,
  Send,
  Share2,
  Star,
  StickyNote,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import { useDataStore } from "@/core/stores/data-store";
import {
  getCachedAnalyticsEntries,
  getCachedTelecomSourceFiles,
} from "@/features/telecom/lib/analytics-cache";
import { listDailyStats } from "@/features/telecom/lib/daily-stats-cache";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { runReadOnlyQuery } from "@/platform/duckdb/duckdb";
import { type EChartsOption, OffscreenChart } from "@/platform/viz";
import { VirtualList } from "../components/VirtualList";
import { usePresence } from "../lib/use-presence";
import { useLAN, useLANAudit } from "../lib/use-lan";
import { useRoom, useLocalPeer } from "../lib/room-provider";
import {
  type RoomChange,
  type RoomChatMessage,
  type RoomComment,
  changeFromYMap,
  chatFromYMap,
  commentFromYMap,
} from "../lib/room";
import {
  addComment,
  addReply,
  contributionCounts,
  hourlyActivity,
  recordChange,
  resolveComment,
  sendChat,
  togglePin,
  toggleReaction,
} from "../lib/room-actions";
import { shallowArrayEqual, useYArray } from "../lib/use-y";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PresenceBar } from "../components/PresenceBar";
import { ApprovalWorkflow } from "../components/ApprovalWorkflow";
import { AuditTrail } from "../components/AuditTrail";
import { StickyNoteAnnotation } from "../components/StickyNoteAnnotation";
import { useAnnotations } from "../hooks/useAnnotations";
import { useApprovalCRDT, useAuditCRDT, useCollabHubReady } from "../collab/collab-hub-crdt";

type CommentType = RoomComment["type"];

// ─── Telecom report sections (annotation/approval/audit targets) ──────────────
// These are the exact report sections collab-hub targeted; the collaboration
// screen now owns them so review/approval/audit ride one CRDT substrate.
const REPORT_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "channels", label: "Channels" },
  { id: "anomalies", label: "Anomalies" },
  { id: "operators", label: "Operators" },
  { id: "regions", label: "Regions" },
];

const QUICK_EMOJIS = ["👍", "✅", "❓", "🚀"] as const;

// ─── Utils ────────────────────────────────────────────────────────────────────

function formatAge(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function initialsOf(name: string): string {
  const t = name.trim();
  return t ? t[0].toUpperCase() : "?";
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Avatar({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ backgroundColor: color }}
    >
      {initialsOf(name)}
    </div>
  );
}

function CommentCard({
  comment,
  myId,
  canEdit,
  onResolve,
  onReact,
  onReply,
  onPin,
}: {
  comment: RoomComment;
  myId: string;
  canEdit: boolean;
  onResolve: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (id: string, text: string) => void;
  onPin: (id: string) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [expanded, setExpanded] = useState(!comment.resolved);

  const typeStyle: Record<CommentType, { color: string; label: string }> = {
    comment: { color: "text-muted-foreground", label: "comment" },
    suggestion: { color: "text-blue-400", label: "suggestion" },
    question: { color: "text-yellow-400", label: "question" },
    approval: { color: "text-green-400", label: "approval" },
  };
  const ts = typeStyle[comment.type];
  const reactionEntries = Object.entries(comment.reactions);

  const submitReply = () => {
    if (!replyText.trim()) return;
    onReply(comment.id, replyText.trim());
    setReplyText("");
    setShowReply(false);
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden mb-2 ${
        comment.pinned
          ? "border-yellow-500/30 bg-yellow-500/5"
          : comment.resolved
            ? "border-border bg-muted"
            : "border-border bg-card"
      }`}
      style={{ opacity: comment.resolved ? 0.6 : 1 }}
    >
      <button type="button" className="w-full text-left p-3" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start gap-2">
          <Avatar name={comment.authorName} color={comment.authorColor} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{comment.authorName}</span>
              <span className={`text-xs ${ts.color}`}>{ts.label}</span>
              {comment.cell && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                  {comment.cell}
                </span>
              )}
              {comment.pinned && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
              {comment.resolved && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatAge(comment.timestamp)}
              </span>
            </div>
            <p className="text-xs text-foreground mt-1 line-clamp-2">{comment.content}</p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <p className="text-xs text-foreground">{comment.content}</p>

          {/* Reactions */}
          <div className="flex items-center gap-1 flex-wrap">
            {reactionEntries.map(([emoji, users]) => (
              <button
                key={emoji}
                type="button"
                disabled={!canEdit}
                onClick={() => onReact(comment.id, emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-foreground transition-colors disabled:opacity-50 ${
                  users.includes(myId) ? "bg-indigo-500/20" : "bg-muted hover:bg-accent"
                }`}
              >
                {emoji} {users.length}
              </button>
            ))}
            {QUICK_EMOJIS.filter((e) => !comment.reactions[e]).map((emoji) => (
              <button
                key={emoji}
                type="button"
                disabled={!canEdit}
                onClick={() => onReact(comment.id, emoji)}
                className="text-xs px-1.5 py-0.5 rounded-full bg-muted hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Replies */}
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2 pl-3 border-l border-border">
              <Avatar name={reply.authorName} color="#64748b" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{reply.authorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatAge(reply.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-foreground mt-0.5">{reply.content}</p>
              </div>
            </div>
          ))}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setShowReply(!showReply)}
              className="text-xs px-2 py-1 bg-muted hover:bg-accent rounded-lg text-foreground transition-colors disabled:opacity-50"
            >
              Reply
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onPin(comment.id)}
              className="text-xs px-2 py-1 bg-muted hover:bg-accent rounded-lg text-foreground transition-colors disabled:opacity-50"
            >
              {comment.pinned ? "Unpin" : "Pin"}
            </button>
            {!comment.resolved && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => onResolve(comment.id)}
                className="text-xs px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded-lg text-green-300 transition-colors disabled:opacity-50"
              >
                Resolve
              </button>
            )}
          </div>

          {showReply && (
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitReply();
                }}
                className="flex-1 px-2 py-1.5 bg-muted border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                aria-label="Send reply"
                onClick={submitReply}
                className="p-1.5 bg-primary hover:bg-primary/90 rounded-lg text-primary-foreground"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CHANGE_ICONS: Record<RoomChange["type"], React.ElementType> = {
  edit: Edit3,
  add_row: Plus,
  delete_row: Trash2,
  schema: GitBranch,
  filter: Filter,
  sort: BarChart3,
};
const CHANGE_COLORS: Record<RoomChange["type"], string> = {
  edit: "text-blue-400 bg-blue-400/10",
  add_row: "text-green-400 bg-green-400/10",
  delete_row: "text-red-400 bg-red-400/10",
  schema: "text-orange-400 bg-orange-400/10",
  filter: "text-purple-400 bg-purple-400/10",
  sort: "text-cyan-400 bg-cyan-400/10",
};

function ChangeItem({ change }: { change: RoomChange }) {
  const Icon = CHANGE_ICONS[change.type] ?? Edit3;
  const color = CHANGE_COLORS[change.type] ?? CHANGE_COLORS.edit;
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border mb-2">
      <div className={`p-1.5 rounded-lg shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-foreground">{change.authorName}</span>
          <span className="text-xs text-muted-foreground">{formatAge(change.timestamp)}</span>
          {change.approved === true && <CheckCircle2 className="w-3 h-3 text-green-400" />}
          {change.approved === false && <X className="w-3 h-3 text-red-400" />}
        </div>
        <p className="text-xs text-foreground mt-1">{change.description}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {change.rowsAffected !== undefined && (
            <span>{change.rowsAffected.toLocaleString()} rows</span>
          )}
          {change.oldValue && change.newValue && (
            <span className="font-mono">
              <span className="text-red-300">{change.oldValue}</span>
              {" → "}
              <span className="text-green-300">{change.newValue}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Report annotations (ported from collab-hub AnnotationsTab) ──────────────

function HubLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Activity className="size-4 animate-pulse" />
      Loading collaboration data…
    </div>
  );
}

function SectionAnnotationRow({
  section,
  onCount,
}: {
  section: (typeof REPORT_SECTIONS)[number];
  onCount: (sectionId: string, count: number) => void;
}) {
  const { notes, unresolvedCount } = useAnnotations(section.id);

  useEffect(() => {
    onCount(section.id, notes.length);
  }, [section.id, notes.length, onCount]);

  if (notes.length === 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-center gap-3">
        <StickyNote className="size-4 text-amber-500 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">{section.label}</p>
          <p className="text-xs text-muted-foreground">
            {notes.length} note{notes.length !== 1 ? "s" : ""}
            {unresolvedCount > 0 && ` · ${unresolvedCount} unresolved`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {unresolvedCount > 0 && (
          <Badge className="bg-amber-500 text-white text-[10px]">{unresolvedCount}</Badge>
        )}
        <StickyNoteAnnotation sectionId={section.id} sectionLabel={section.label} />
      </div>
    </div>
  );
}

function ReportAnnotationsEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <StickyNote className="size-10 text-muted-foreground/30" />
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">No annotations yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add notes to any report section using the sticky note button.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {REPORT_SECTIONS.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2"
          >
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <StickyNoteAnnotation sectionId={s.id} sectionLabel={s.label} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportAnnotations() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const handleCount = useCallback((sectionId: string, count: number) => {
    setCounts((prev) => (prev[sectionId] === count ? prev : { ...prev, [sectionId]: count }));
  }, []);

  const hasAny = useMemo(() => Object.values(counts).some((c) => c > 0), [counts]);

  // Always mount the rows so each `useAnnotations` hook stays subscribed and
  // reports its count; toggle the empty-state overlay from the reactive totals.
  return (
    <div className="space-y-3">
      {REPORT_SECTIONS.map((section) => (
        <SectionAnnotationRow key={section.id} section={section} onCount={handleCount} />
      ))}
      {!hasAny && <ReportAnnotationsEmpty />}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CollaborationScreen() {
  const access = useDashboardAccess();
  const canEdit = access.permissions.canEditComments;
  // Narrow selectors so unrelated store mutations (active dataset, etc.) don't
  // re-render the whole collaboration screen.
  const datasets = useDataStore((s) => s.datasets);
  const transforms = useDataStore((s) => s.transforms);
  const savedCharts = useDataStore((s) => s.savedCharts);
  const room = useRoom();
  const me = useLocalPeer();

  // ── CRDT-backed collaborative state (selector hooks → minimal re-renders) ──
  const comments = useYArray<Y.Map<unknown>, RoomComment[]>(
    room.comments,
    (arr) => arr.map(commentFromYMap),
    shallowArrayEqual,
    true,
  );
  const changes = useYArray<Y.Map<unknown>, RoomChange[]>(
    room.changes,
    (arr) => arr.map(changeFromYMap),
    shallowArrayEqual,
    true,
  );
  const chat = useYArray<Y.Map<unknown>, RoomChatMessage[]>(
    room.chat,
    (arr) => arr.map(chatFromYMap),
    shallowArrayEqual,
    true,
  );

  // ── Real presence (room awareness) + LAN status/audit ──
  const peers = usePresence(room.awareness);
  const { status: lanStatus } = useLAN();
  const audit = useLANAudit();

  // ── Telecom-report collaboration substrate (annotations / approval / audit) ──
  // Boots the shared CRDT doc (cross-tab + LAN sync, durable persistence, one-shot
  // legacy migration). The report-review tabs gate on this so local IndexedDB
  // content loads before any LAN peer state.
  const hubReady = useCollabHubReady();
  const auditEvents = useAuditCRDT();
  const { record: approval } = useApprovalCRDT();

  // ── UI-only state ──
  const [activeTab, setActiveTab] = useState<
    "overview" | "comments" | "changes" | "live" | "annotations" | "approval" | "audit"
  >("overview");
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState<CommentType>("comment");
  const [commentCell, setCommentCell] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResolved, setFilterResolved] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [duckdbLoaded, setDuckdbLoaded] = useState(false);
  const [workspaceStats, setWorkspaceStats] = useState({
    telecomAnalytics: 0,
    telecomSources: 0,
    dailySnapshots: 0,
  });
  const initRef = useRef(false);

  // ─── DuckDB liveness probe (one-shot) ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (initRef.current) return;
      initRef.current = true;
      try {
        const tables = await runReadOnlyQuery("SHOW TABLES").catch(() => []);
        if (tables.length > 0) {
          const tableName = String(Object.values(tables[0])[0]);
          await runReadOnlyQuery(`SELECT COUNT(*) as cnt FROM ${quoteIdentifier(tableName)}`);
        }
        if (!cancelled) setDuckdbLoaded(true);
      } catch {
        if (!cancelled) setDuckdbLoaded(true);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Workspace stats (visibility-gated polling) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function loadWorkspaceStats() {
      const [analytics, sources, snapshots] = await Promise.all([
        getCachedAnalyticsEntries(),
        getCachedTelecomSourceFiles(),
        listDailyStats(),
      ]);
      if (!cancelled) {
        setWorkspaceStats({
          telecomAnalytics: analytics.length,
          telecomSources: sources.length,
          dailySnapshots: snapshots.length,
        });
      }
    }

    const tick = () => {
      if (document.visibilityState === "visible") void loadWorkspaceStats();
    };
    // Only poll while visible — paused entirely when the route/tab is hidden.
    tick();
    timer = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // ─── Actions (CRDT transactions) ────────────────────────────────────────
  const handleAddComment = useCallback(() => {
    if (!canEdit || !newComment.trim()) return;
    addComment(room, me, {
      content: newComment,
      cell: commentCell.trim() ? commentCell.trim() : null,
      type: commentType,
    });
    setNewComment("");
    setCommentCell("");
  }, [canEdit, newComment, commentCell, commentType, room, me]);

  const handleResolve = useCallback(
    (id: string) => {
      if (!canEdit) return;
      resolveComment(room, id);
    },
    [canEdit, room],
  );

  const handlePin = useCallback(
    (id: string) => {
      if (!canEdit) return;
      togglePin(room, id);
    },
    [canEdit, room],
  );

  const handleReact = useCallback(
    (commentId: string, emoji: string) => {
      if (!canEdit) return;
      toggleReaction(room, commentId, emoji, me.id);
    },
    [canEdit, room, me.id],
  );

  const handleReply = useCallback(
    (commentId: string, text: string) => {
      if (!canEdit) return;
      addReply(room, me, commentId, text);
    },
    [canEdit, room, me],
  );

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    sendChat(room, me, chatInput);
    setChatInput("");
  }, [chatInput, room, me]);

  // Record a demo "filter change" entry so the change log is wired to the doc
  // (real edits originate from grid/transform features routed through the same
  // recordChange helper; this keeps the screen's own action wired to the CRDT).
  const handleLogFilterChange = useCallback(() => {
    if (!canEdit) return;
    recordChange(room, me, {
      type: "filter",
      description: `${me.name} adjusted the active view filter`,
    });
  }, [canEdit, room, me]);

  // ─── Derived ─────────────────────────────────────────────────────────────
  const filteredComments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = comments;
    if (q) list = list.filter((c) => c.content.toLowerCase().includes(q));
    if (!filterResolved) list = list.filter((c) => !c.resolved);
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.timestamp - a.timestamp;
    });
  }, [comments, searchQuery, filterResolved]);

  const openComments = useMemo(() => comments.filter((c) => !c.resolved).length, [comments]);
  const resolvedComments = comments.length - openComments;

  // ─── Charts (real data → OffscreenChart) ────────────────────────────────
  const activityOption = useMemo<EChartsOption>(() => {
    const buckets = hourlyActivity(comments, changes, chat);
    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      grid: { top: 10, bottom: 25, left: 35, right: 10 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { color: "#94a3b8", fontSize: 9, interval: 3 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLabel: { color: "#94a3b8", fontSize: 9 },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: buckets,
          barWidth: "60%",
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#1E40AF" },
                { offset: 1, color: "#3730a3" },
              ],
            },
          },
        },
      ],
    };
  }, [comments, changes, chat]);

  const contributionOption = useMemo<EChartsOption>(() => {
    const counts = contributionCounts(comments, chat);
    const data = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        name: c.name,
        value: c.count,
        itemStyle: { color: c.color },
      }));
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["40%", "68%"],
          data:
            data.length > 0
              ? data
              : [{ name: "No activity", value: 1, itemStyle: { color: "#334155" } }],
          label: { color: "#94a3b8", fontSize: 10 },
          emphasis: { itemStyle: { shadowBlur: 8 } },
        },
      ],
    };
  }, [comments, chat]);

  const onlineCount = peers.length;
  const lanLabel =
    lanStatus === "connected"
      ? "LAN connected"
      : lanStatus === "connecting"
        ? "LAN connecting…"
        : lanStatus === "error"
          ? "LAN error"
          : "Local only";

  const tabCounts: Record<string, number> = {
    overview: 0,
    comments: openComments,
    changes: changes.length,
    live: chat.length,
    annotations: 0,
    approval: approval.status === "REVIEW" ? 1 : 0,
    audit: auditEvents.length,
  };

  return (
    <div className=" flex flex-col">
      {/* Header */}
      <div className=" shrink-0 px-4 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-linear-to-br from-green-500 to-emerald-600 rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Collaborative</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <div className="flex -space-x-2">
                  {peers.slice(0, 6).map((p) => (
                    <div
                      key={p.clientId}
                      className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: p.color }}
                      title={p.name}
                    >
                      {initialsOf(p.name)}
                    </div>
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">{onlineCount} online</span>
                <span
                  className={`text-xs ${
                    lanStatus === "connected"
                      ? "text-green-400"
                      : lanStatus === "error"
                        ? "text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  ● {lanLabel}
                </span>
                {duckdbLoaded && <span className="text-xs text-green-400">● DuckDB live</span>}
                <span className="text-xs text-muted-foreground">
                  {access.roleLabel} · {access.cacheMode}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!access.permissions.canShareView}
              className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" /> Invite
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mt-3 bg-card rounded-xl p-1 border border-border w-fit">
          {(
            ["overview", "comments", "changes", "live", "annotations", "approval", "audit"] as const
          ).map((tab) => {
            const icons = {
              overview: Activity,
              comments: MessageSquare,
              changes: GitBranch,
              live: Zap,
              annotations: StickyNote,
              approval: CheckCircle2,
              audit: ClipboardList,
            };
            const labels: Record<typeof tab, string> = {
              overview: "Overview",
              comments: "Comments",
              changes: "Changes",
              live: "Live",
              annotations: "Annotations",
              approval: "Approval",
              audit: "Audit",
            };
            const Icon = icons[tab];
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {labels[tab]}
                {tabCounts[tab] > 0 && (
                  <span
                    className={`text-xs px-1 rounded-full ${activeTab === tab ? "bg-white/20" : "bg-accent text-foreground"}`}
                  >
                    {tabCounts[tab]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ── Overview ─────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Online Now",
                    value: onlineCount,
                    icon: Users,
                    color: "bg-green-600",
                    sub: lanLabel,
                  },
                  {
                    label: "Open Comments",
                    value: openComments,
                    icon: MessageSquare,
                    color: "bg-blue-600",
                    sub: `${resolvedComments} resolved`,
                  },
                  {
                    label: "Workspace",
                    value: datasets.length,
                    icon: GitBranch,
                    color: "bg-indigo-600",
                    sub: `${transforms.length} transforms · ${savedCharts.length} charts`,
                  },
                  {
                    label: "Telecom Cache",
                    value: workspaceStats.telecomAnalytics,
                    icon: HardDrive,
                    color: "bg-purple-600",
                    sub: `${workspaceStats.telecomSources} files · ${workspaceStats.dailySnapshots} days`,
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <div className={`p-1.5 rounded-lg ${s.color}`}>
                        <s.icon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground">{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Team & activity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  {/* Team (live peers from awareness) */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-400" /> Team Members
                    </h3>
                    <div className="space-y-2">
                      {peers.length === 0 && (
                        <div className="text-xs text-muted-foreground py-4 text-center">
                          No peers connected. Join a LAN room from the control center to collaborate
                          across machines — comments and chat still persist locally offline.
                        </div>
                      )}
                      {peers.map((p) => (
                        <div
                          key={p.clientId}
                          className="flex items-center gap-3 p-2 rounded-xl bg-muted"
                        >
                          <Avatar name={p.name} color={p.color} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {p.name}
                              </span>
                              {p.id === me.id && (
                                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1 rounded">
                                  you
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.page ?? "—"}</div>
                          </div>
                          <span className="text-xs px-1.5 py-0.5 rounded border bg-blue-500/15 text-blue-300 border-blue-500/25">
                            {p.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Activity by hour</h3>
                    <OffscreenChart option={activityOption} height={160} />
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Contributions</h3>
                    <OffscreenChart option={contributionOption} height={160} />
                  </div>
                </div>
              </div>

              {/* Audit trail (real shared LAN audit, virtualized) */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-cyan-400" /> Session Audit ({audit.length})
                </h3>
                {audit.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    No audit events yet.
                  </div>
                ) : (
                  <VirtualList
                    items={[...audit].reverse()}
                    getKey={(a) => a.id}
                    estimateSize={44}
                    className="max-h-64"
                    renderItem={(a) => (
                      <div className="flex items-center gap-2 py-1.5 text-xs border-b border-border/60">
                        <span className="font-mono text-cyan-300">{a.event}</span>
                        <span className="text-foreground">{a.peerName}</span>
                        {a.detail && (
                          <span className="text-muted-foreground truncate">{a.detail}</span>
                        )}
                        <span className="text-muted-foreground ml-auto">
                          {formatAge(typeof a.at === "number" ? a.at : Date.parse(a.at))}
                        </span>
                      </div>
                    )}
                  />
                )}
              </div>
            </motion.div>
          )}

          {/* ── Comments ─────────────────────────────────────────── */}
          {activeTab === "comments" && (
            <motion.div
              key="comments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="p-3 border-b border-border space-y-2 shrink-0">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search comments..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFilterResolved(!filterResolved)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterResolved ? "bg-primary text-primary-foreground" : "bg-accent text-foreground hover:bg-accent"}`}
                  >
                    {filterResolved ? "All" : "Open only"}
                  </button>
                </div>

                {/* New comment */}
                <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={commentType}
                      onChange={(e) => setCommentType(e.target.value as CommentType)}
                      className="px-2 py-1 bg-muted border border-border rounded-lg text-xs text-foreground focus:outline-none"
                    >
                      <option value="comment">Comment</option>
                      <option value="suggestion">Suggestion</option>
                      <option value="question">Question</option>
                      <option value="approval">Approval</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Column (optional)"
                      value={commentCell}
                      onChange={(e) => setCommentCell(e.target.value)}
                      className="w-28 px-2 py-1 bg-muted border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={
                        canEdit
                          ? "Add a comment, suggestion or question..."
                          : "Viewer role can read comments only"
                      }
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                      disabled={!canEdit}
                      className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      type="button"
                      aria-label="Add comment"
                      onClick={handleAddComment}
                      disabled={!canEdit || !newComment.trim()}
                      className="px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-lg text-primary-foreground transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {filteredComments.length} comment(s)
                </div>
              </div>

              {filteredComments.length === 0 ? (
                <div className="flex-1 text-center py-12 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No comments yet</p>
                </div>
              ) : (
                <VirtualList
                  items={filteredComments}
                  getKey={(c) => c.id}
                  estimateSize={120}
                  className="flex-1 p-3"
                  renderItem={(c) => (
                    <CommentCard
                      comment={c}
                      myId={me.id}
                      canEdit={canEdit}
                      onResolve={handleResolve}
                      onReact={handleReact}
                      onReply={handleReply}
                      onPin={handlePin}
                    />
                  )}
                />
              )}
            </motion.div>
          )}

          {/* ── Changes ─────────────────────────────────────────── */}
          {activeTab === "changes" && (
            <motion.div
              key="changes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden p-4"
            >
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-indigo-400" /> Change Log ({changes.length})
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {changes.filter((c) => c.approved).length} approved
                  </span>
                  <button
                    type="button"
                    onClick={handleLogFilterChange}
                    disabled={!canEdit}
                    className="text-xs px-2 py-1 bg-accent hover:bg-accent rounded-lg text-foreground disabled:opacity-50"
                  >
                    Log view change
                  </button>
                </div>
              </div>
              {changes.length === 0 ? (
                <div className="flex-1 text-center py-12 text-muted-foreground">
                  <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No changes recorded yet</p>
                </div>
              ) : (
                <VirtualList
                  items={changes}
                  getKey={(c) => c.id}
                  estimateSize={80}
                  className="flex-1"
                  renderItem={(c) => <ChangeItem change={c} />}
                />
              )}
            </motion.div>
          )}

          {/* ── Live ─────────────────────────────────────────────── */}
          {activeTab === "live" && (
            <motion.div
              key="live"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex overflow-hidden"
            >
              {/* Online users sidebar (live awareness) */}
              <div className="w-52 border-r border-border p-3 shrink-0 overflow-y-auto">
                <div className="text-xs text-muted-foreground mb-2 font-semibold">
                  ONLINE ({peers.length})
                </div>
                <div className="space-y-1">
                  {peers.map((p) => (
                    <div
                      key={p.clientId}
                      className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted"
                    >
                      <Avatar name={p.name} color={p.color} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {p.id === me.id ? "You" : p.name}
                        </div>
                        {p.cursor?.selection && (
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {p.cursor.selection}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {peers.length === 0 && (
                    <div className="text-xs text-muted-foreground">Just you (local).</div>
                  )}
                </div>
              </div>

              {/* Chat (CRDT chat array, virtualized) */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {chat.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    No messages yet — say hello to the room.
                  </div>
                ) : (
                  <VirtualList
                    items={chat}
                    getKey={(m) => m.id}
                    estimateSize={64}
                    className="flex-1 p-3"
                    renderItem={(msg) => {
                      const isMe = msg.authorId === me.id;
                      return (
                        <div
                          className={`flex items-start gap-2 mb-3 ${isMe ? "flex-row-reverse" : ""}`}
                        >
                          <Avatar name={msg.authorName} color={msg.authorColor} />
                          <div
                            className={`max-w-xs flex flex-col ${isMe ? "items-end" : "items-start"}`}
                          >
                            {!isMe && (
                              <span className="text-xs font-semibold text-muted-foreground mb-0.5">
                                {msg.authorName}
                              </span>
                            )}
                            <div
                              className={`px-3 py-2 rounded-xl text-sm ${
                                isMe
                                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                                  : "bg-muted text-foreground rounded-tl-sm"
                              }`}
                            >
                              {msg.text}
                            </div>
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {formatAge(msg.ts)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                )}
                <div className="p-3 border-t border-border flex gap-2">
                  <Avatar name={me.name} color={me.color} />
                  <input
                    type="text"
                    placeholder="Send a message to the team..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendChat();
                    }}
                    className="flex-1 px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    aria-label="Send chat message"
                    onClick={handleSendChat}
                    disabled={!chatInput.trim()}
                    className="p-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 rounded-xl text-primary-foreground transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Annotations (telecom report sections) ─────────────── */}
          {activeTab === "annotations" && (
            <motion.div
              key="annotations"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4"
            >
              {!hubReady ? (
                <HubLoading />
              ) : (
                <div className="max-w-2xl space-y-4">
                  <PresenceBar currentPage="Collaboration · Report Review" />
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Report Annotations</h2>
                    <p className="text-sm text-muted-foreground">
                      Comment on each telecom report section — notes merge across tabs and LAN
                      peers.
                    </p>
                  </div>
                  <ReportAnnotations />
                </div>
              )}
            </motion.div>
          )}

          {/* ── Approval workflow ─────────────────────────────────── */}
          {activeTab === "approval" && (
            <motion.div
              key="approval"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4"
            >
              {!hubReady ? (
                <HubLoading />
              ) : (
                <div className="max-w-xl space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Approval Workflow</h2>
                    <p className="text-sm text-muted-foreground">
                      Review and sign off the report before sharing.
                    </p>
                  </div>
                  <Card>
                    <CardContent className="pt-6">
                      <ApprovalWorkflow />
                    </CardContent>
                  </Card>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Audit trail ───────────────────────────────────────── */}
          {activeTab === "audit" && (
            <motion.div
              key="audit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4"
            >
              {!hubReady ? (
                <HubLoading />
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Audit Trail</h2>
                    <p className="text-sm text-muted-foreground">
                      Complete log of every action taken on this report.
                    </p>
                  </div>
                  <Card>
                    <CardContent className="pt-6">
                      <AuditTrail />
                    </CardContent>
                  </Card>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
