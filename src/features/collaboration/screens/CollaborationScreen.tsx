"use client";

import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Bookmark,
  CheckCircle2,
  Edit3,
  Filter,
  GitBranch,
  HardDrive,
  Info,
  MessageSquare,
  Plus,
  Search,
  Send,
  Share2,
  Star,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCachedAnalyticsEntries,
  getCachedTelecomSourceFiles,
} from "@/features/telecom/lib/analytics-cache";
import { listDailyStats } from "@/features/telecom/lib/daily-stats-cache";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { runQuery } from "@/platform/duckdb/duckdb";
import { useDataStore } from "@/core/stores/data-store";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
  status: "online" | "away" | "offline";
  role: "owner" | "editor" | "viewer";
  lastSeen: Date;
  cursor?: { row: number; col: number };
  currentCell?: string;
}

interface Comment {
  id: string;
  authorId: string;
  content: string;
  timestamp: Date;
  cell?: string;
  resolved: boolean;
  reactions: { emoji: string; count: number; users: string[] }[];
  replies: Comment[];
  pinned: boolean;
  type: "comment" | "suggestion" | "question" | "approval";
}

interface Change {
  id: string;
  authorId: string;
  timestamp: Date;
  type: "edit" | "add_row" | "delete_row" | "schema" | "filter" | "sort";
  description: string;
  cell?: string;
  oldValue?: string;
  newValue?: string;
  rowsAffected?: number;
  approved?: boolean;
}

interface Notification {
  id: string;
  type: "mention" | "comment" | "change" | "approval" | "join";
  message: string;
  timestamp: Date;
  read: boolean;
  authorId: string;
}

interface CellAnnotation {
  cell: string;
  authorId: string;
  type: "highlight" | "comment" | "error" | "suggestion";
  note?: string;
}

// ─── Demo data ─────────────────────────────────────────────────────────────

const COLLABORATORS: Collaborator[] = [
  {
    id: "me",
    name: "You",
    email: "you@corp.com",
    avatar: "Y",
    color: "#6366f1",
    status: "online",
    role: "owner",
    lastSeen: new Date(),
  },
  {
    id: "alice",
    name: "Alice Chen",
    email: "alice@corp.com",
    avatar: "AC",
    color: "#22c55e",
    status: "online",
    role: "editor",
    lastSeen: new Date(),
    currentCell: "B3",
  },
  {
    id: "bob",
    name: "Bob Kim",
    email: "bob@corp.com",
    avatar: "BK",
    color: "#f59e0b",
    status: "away",
    role: "editor",
    lastSeen: new Date(Date.now() - 300000),
  },
  {
    id: "carol",
    name: "Carol Singh",
    email: "carol@corp.com",
    avatar: "CS",
    color: "#ef4444",
    status: "online",
    role: "viewer",
    lastSeen: new Date(),
    currentCell: "D7",
  },
  {
    id: "dave",
    name: "Dave Lopez",
    email: "dave@corp.com",
    avatar: "DL",
    color: "#8b5cf6",
    status: "offline",
    role: "viewer",
    lastSeen: new Date(Date.now() - 7200000),
  },
];

function mkAgo(ms: number) {
  return new Date(Date.now() - ms);
}

const INITIAL_COMMENTS: Comment[] = [
  {
    id: "c1",
    authorId: "alice",
    content:
      "Revenue for Q3 looks off — should we double-check the ERP export?",
    timestamp: mkAgo(3600000),
    cell: "revenue",
    resolved: false,
    pinned: true,
    reactions: [{ emoji: "👍", count: 2, users: ["me", "bob"] }],
    replies: [],
    type: "question",
  },
  {
    id: "c2",
    authorId: "bob",
    content:
      "Suggestion: rename `amt` → `revenue` for clarity across all pipelines.",
    timestamp: mkAgo(7200000),
    cell: "revenue",
    resolved: false,
    pinned: false,
    reactions: [{ emoji: "✅", count: 1, users: ["carol"] }],
    replies: [
      {
        id: "c2r1",
        authorId: "carol",
        content: "Agreed, this confused me last week.",
        timestamp: mkAgo(5400000),
        resolved: false,
        reactions: [],
        replies: [],
        pinned: false,
        type: "comment",
      },
    ],
    type: "suggestion",
  },
  {
    id: "c3",
    authorId: "carol",
    content:
      "The profit_margin column has ~3% null values — should we impute or flag?",
    timestamp: mkAgo(86400000),
    cell: "profit_margin",
    resolved: true,
    pinned: false,
    reactions: [{ emoji: "👀", count: 3, users: ["me", "alice", "bob"] }],
    replies: [],
    type: "question",
  },
  {
    id: "c4",
    authorId: "me",
    content:
      "Added DuckDB materialized view for this dataset. Queries now 40× faster ⚡",
    timestamp: mkAgo(1800000),
    cell: undefined,
    resolved: false,
    pinned: false,
    reactions: [
      { emoji: "🚀", count: 4, users: ["alice", "bob", "carol", "dave"] },
    ],
    replies: [],
    type: "comment",
  },
];

const INITIAL_CHANGES: Change[] = [
  {
    id: "ch1",
    authorId: "alice",
    timestamp: mkAgo(600000),
    type: "edit",
    description: "Fixed revenue value for row 4821",
    cell: "revenue",
    oldValue: "0.00",
    newValue: "482.50",
    approved: true,
  },
  {
    id: "ch2",
    authorId: "bob",
    timestamp: mkAgo(1200000),
    type: "schema",
    description: "Added profit_margin column (DOUBLE)",
    rowsAffected: 141800,
    approved: true,
  },
  {
    id: "ch3",
    authorId: "carol",
    timestamp: mkAgo(3600000),
    type: "filter",
    description: "Applied filter: status = 'active'",
    rowsAffected: 98400,
  },
  {
    id: "ch4",
    authorId: "me",
    timestamp: mkAgo(7200000),
    type: "add_row",
    description: "Inserted 1,240 rows from Jan batch",
    rowsAffected: 1240,
    approved: true,
  },
  {
    id: "ch5",
    authorId: "alice",
    timestamp: mkAgo(86400000),
    type: "delete_row",
    description: "Removed 38 duplicate rows (dedup on order_id)",
    rowsAffected: 38,
    approved: true,
  },
  {
    id: "ch6",
    authorId: "bob",
    timestamp: mkAgo(172800000),
    type: "sort",
    description: "Sorted by revenue DESC for dashboard view",
    approved: undefined,
  },
];

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: "n1",
    type: "mention",
    message: "Alice Chen mentioned you in a comment on 'revenue'",
    timestamp: mkAgo(300000),
    read: false,
    authorId: "alice",
  },
  {
    id: "n2",
    type: "change",
    message: "Bob Kim added profit_margin column",
    timestamp: mkAgo(1200000),
    read: false,
    authorId: "bob",
  },
  {
    id: "n3",
    type: "join",
    message: "Carol Singh joined the dataset",
    timestamp: mkAgo(3600000),
    read: true,
    authorId: "carol",
  },
  {
    id: "n4",
    type: "approval",
    message: "Your row insertion was approved by Alice",
    timestamp: mkAgo(7200000),
    read: true,
    authorId: "alice",
  },
];

const ANNOTATIONS: CellAnnotation[] = [
  {
    cell: "revenue",
    authorId: "alice",
    type: "comment",
    note: "Check Q3 values",
  },
  { cell: "profit_margin", authorId: "carol", type: "error", note: "3% nulls" },
  {
    cell: "email",
    authorId: "bob",
    type: "suggestion",
    note: "Normalize domain casing",
  },
  { cell: "department", authorId: "me", type: "highlight" },
];

// ─── Utils ──────────────────────────────────────────────────────────────────

function formatAge(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function getCollaborator(id: string): Collaborator {
  return COLLABORATORS.find((c) => c.id === id) ?? COLLABORATORS[0];
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Avatar({
  collab,
  size = "sm",
  showStatus = false,
}: {
  collab: Collaborator;
  size?: "sm" | "md" | "lg";
  showStatus?: boolean;
}) {
  const sz =
    size === "sm"
      ? "w-7 h-7 text-xs"
      : size === "md"
        ? "w-9 h-9 text-sm"
        : "w-12 h-12 text-base";
  const dotSz = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const statusColor =
    collab.status === "online"
      ? "bg-green-400"
      : collab.status === "away"
        ? "bg-yellow-400"
        : "bg-muted";
  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sz} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
        style={{ backgroundColor: collab.color }}
      >
        {collab.avatar}
      </div>
      {showStatus && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotSz} rounded-full border-2 border-border ${statusColor}`}
        />
      )}
    </div>
  );
}

function CommentCard({
  comment,
  onResolve,
  onReact,
  onReply,
}: {
  comment: Comment;
  onResolve: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (id: string, text: string) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [expanded, setExpanded] = useState(!comment.resolved);
  const author = getCollaborator(comment.authorId);

  const typeStyle: Record<Comment["type"], { color: string; label: string }> = {
    comment: { color: "text-muted-foreground", label: "comment" },
    suggestion: { color: "text-blue-400", label: "suggestion" },
    question: { color: "text-yellow-400", label: "question" },
    approval: { color: "text-green-400", label: "approval" },
  };
  const ts = typeStyle[comment.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: comment.resolved ? 0.5 : 1, y: 0 }}
      className={`rounded-xl border overflow-hidden ${
        comment.pinned
          ? "border-yellow-500/30 bg-yellow-500/5"
          : comment.resolved
            ? "border-border bg-muted"
            : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        className="w-full text-left p-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          <Avatar collab={author} size="sm" showStatus />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {author.name}
              </span>
              <span className={`text-xs ${ts.color}`}>{ts.label}</span>
              {comment.cell && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                  {comment.cell}
                </span>
              )}
              {comment.pinned && (
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              )}
              {comment.resolved && (
                <CheckCircle2 className="w-3 h-3 text-green-400" />
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatAge(comment.timestamp)}
              </span>
            </div>
            <p className="text-xs text-foreground mt-1 line-clamp-2">
              {comment.content}
            </p>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
              <p className="text-xs text-foreground">{comment.content}</p>

              {/* Reactions */}
              <div className="flex items-center gap-1 flex-wrap">
                {comment.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => onReact(comment.id, r.emoji)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted hover:bg-accent text-xs text-foreground transition-colors"
                  >
                    {r.emoji} {r.count}
                  </button>
                ))}
                {["👍", "✅", "❓", "🚀"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(comment.id, emoji)}
                    className="text-xs px-1.5 py-0.5 rounded-full bg-muted hover:bg-accent text-muted-foreground transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Replies */}
              {comment.replies.map((reply) => {
                const ra = getCollaborator(reply.authorId);
                return (
                  <div
                    key={reply.id}
                    className="flex gap-2 pl-3 border-l border-border"
                  >
                    <Avatar collab={ra} size="sm" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground">
                          {ra.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatAge(reply.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground mt-0.5">
                        {reply.content}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowReply(!showReply)}
                  className="text-xs px-2 py-1 bg-muted hover:bg-accent rounded-lg text-foreground transition-colors"
                >
                  Reply
                </button>
                {!comment.resolved && (
                  <button
                    type="button"
                    onClick={() => onResolve(comment.id)}
                    className="text-xs px-2 py-1 bg-green-500/10 hover:bg-green-500/20 rounded-lg text-green-300 transition-colors"
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
                      if (e.key === "Enter" && replyText.trim()) {
                        onReply(comment.id, replyText.trim());
                        setReplyText("");
                        setShowReply(false);
                      }
                    }}
                    className="flex-1 px-2 py-1.5 bg-muted border border-border rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (replyText.trim()) {
                        onReply(comment.id, replyText.trim());
                        setReplyText("");
                        setShowReply(false);
                      }
                    }}
                    className="p-1.5 bg-primary hover:bg-primary/90 rounded-lg text-primary-foreground"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChangeItem({ change }: { change: Change }) {
  const author = getCollaborator(change.authorId);
  const typeIcons: Record<Change["type"], React.ElementType> = {
    edit: Edit3,
    add_row: Plus,
    delete_row: Trash2,
    schema: GitBranch,
    filter: Filter,
    sort: BarChart3,
  };
  const typeColors: Record<Change["type"], string> = {
    edit: "text-blue-400 bg-blue-400/10",
    add_row: "text-green-400 bg-green-400/10",
    delete_row: "text-red-400 bg-red-400/10",
    schema: "text-orange-400 bg-orange-400/10",
    filter: "text-purple-400 bg-purple-400/10",
    sort: "text-cyan-400 bg-cyan-400/10",
  };
  const Icon = typeIcons[change.type];
  const color = typeColors[change.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border hover:border-border transition-colors"
    >
      <div className={`p-1.5 rounded-lg flex-shrink-0 ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Avatar collab={author} size="sm" />
          <span className="text-xs font-semibold text-foreground">
            {author.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatAge(change.timestamp)}
          </span>
          {change.approved === true && (
            <CheckCircle2 className="w-3 h-3 text-green-400" />
          )}
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
    </motion.div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function CollaborationScreen() {
  const access = useDashboardAccess();
  const { datasets, transforms, savedCharts } = useDataStore();
  const [collaborators] = useState<Collaborator[]>(COLLABORATORS);
  const [comments, setComments] = useState<Comment[]>(INITIAL_COMMENTS);
  const [changes] = useState<Change[]>(INITIAL_CHANGES);
  const [notifications, setNotifications] = useState<Notification[]>(
    INITIAL_NOTIFICATIONS,
  );
  const [activeTab, setActiveTab] = useState<
    "overview" | "comments" | "changes" | "live"
  >("overview");
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState<Comment["type"]>("comment");
  const [commentCell, setCommentCell] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterResolved, setFilterResolved] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [liveMessages, setLiveMessages] = useState<
    { id: string; authorId: string; text: string; ts: Date }[]
  >([
    {
      id: "lm1",
      authorId: "alice",
      text: "Just joined — reviewing the revenue column now",
      ts: mkAgo(120000),
    },
    {
      id: "lm2",
      authorId: "bob",
      text: "I added the profit_margin column, let me know if the formula looks right",
      ts: mkAgo(900000),
    },
    {
      id: "lm3",
      authorId: "carol",
      text: "The null rate on profit_margin is concerning, ~3%",
      ts: mkAgo(600000),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [duckdbLoaded, setDuckdbLoaded] = useState(false);
  const [workspaceStats, setWorkspaceStats] = useState({
    telecomAnalytics: 0,
    telecomSources: 0,
    dailySnapshots: 0,
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  // ─── DuckDB init ─────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (initRef.current) return;
      initRef.current = true;
      try {
        const tables = await runQuery("SHOW TABLES").catch(() => []);
        const hasData = tables.length > 0;
        if (hasData) {
          const tableName = String(Object.values(tables[0])[0]);
          await runQuery(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
          if (!cancelled) {
            setDuckdbLoaded(true);
          }
        } else {
          if (!cancelled) setDuckdbLoaded(true);
        }
      } catch (e) {
        console.error("DuckDB:", e);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [changes.length]);

  useEffect(() => {
    let cancelled = false;
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
    loadWorkspaceStats();
    const timer = window.setInterval(loadWorkspaceStats, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // ─── Simulate live cursor movement ───────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      // Just animate — no state update to avoid flicker
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ─── Actions ─────────────────────────────────────────────────────────

  const handleAddComment = useCallback(() => {
    if (!access.permissions.canEditComments || !newComment.trim()) return;
    const comment: Comment = {
      id: `c-${Date.now()}`,
      authorId: "me",
      content: newComment.trim(),
      timestamp: new Date(),
      cell: commentCell.trim() || undefined,
      resolved: false,
      pinned: false,
      reactions: [],
      replies: [],
      type: commentType,
    };
    setComments((prev) => [comment, ...prev]);
    setNewComment("");
    setCommentCell("");
  }, [
    access.permissions.canEditComments,
    newComment,
    commentCell,
    commentType,
  ]);

  const handleResolve = useCallback(
    (id: string) => {
      if (!access.permissions.canEditComments) return;
      setComments((prev) =>
        prev.map((c) => (c.id === id ? { ...c, resolved: true } : c)),
      );
    },
    [access.permissions.canEditComments],
  );

  const handleReact = useCallback(
    (commentId: string, emoji: string) => {
      if (!access.permissions.canEditComments) return;
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c;
          const existing = c.reactions.find((r) => r.emoji === emoji);
          if (existing) {
            if (existing.users.includes("me")) {
              return {
                ...c,
                reactions: c.reactions
                  .map((r) =>
                    r.emoji === emoji
                      ? {
                          ...r,
                          count: r.count - 1,
                          users: r.users.filter((u) => u !== "me"),
                        }
                      : r,
                  )
                  .filter((r) => r.count > 0),
              };
            }
            return {
              ...c,
              reactions: c.reactions.map((r) =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, users: [...r.users, "me"] }
                  : r,
              ),
            };
          }
          return {
            ...c,
            reactions: [...c.reactions, { emoji, count: 1, users: ["me"] }],
          };
        }),
      );
    },
    [access.permissions.canEditComments],
  );

  const handleReply = useCallback(
    (commentId: string, text: string) => {
      if (!access.permissions.canEditComments) return;
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c;
          const reply: Comment = {
            id: `reply-${Date.now()}`,
            authorId: "me",
            content: text,
            timestamp: new Date(),
            resolved: false,
            reactions: [],
            replies: [],
            pinned: false,
            type: "comment",
          };
          return { ...c, replies: [...c.replies, reply] };
        }),
      );
    },
    [access.permissions.canEditComments],
  );

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    setLiveMessages((prev) => [
      ...prev,
      {
        id: `lm-${Date.now()}`,
        authorId: "me",
        text: chatInput.trim(),
        ts: new Date(),
      },
    ]);
    setChatInput("");
    setTimeout(
      () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  }, [chatInput]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────────

  const filteredComments = useMemo(() => {
    let list = [...comments];
    if (searchQuery)
      list = list.filter((c) =>
        c.content.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    if (!filterResolved) list = list.filter((c) => !c.resolved);
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }, [comments, searchQuery, filterResolved]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const onlineCollaborators = collaborators.filter(
    (c) => c.status === "online",
  );

  // ─── Charts ───────────────────────────────────────────────────────────

  const activityChart = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const data = hours.map((h) => ({
      hour: `${h}:00`,
      edits: Math.floor(Math.random() * 15) + (h >= 9 && h <= 17 ? 10 : 0),
    }));
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      grid: { top: 10, bottom: 25, left: 35, right: 10 },
      xAxis: {
        type: "category",
        data: data.map((d) => d.hour),
        axisLabel: { color: "#94a3b8", fontSize: 9, interval: 3 },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#94a3b8", fontSize: 9 },
        splitLine: { lineStyle: { color: "#1e293b" } },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.edits),
          barWidth: "60%",
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#6366f1" },
                { offset: 1, color: "#3730a3" },
              ],
            },
          },
        },
      ],
    };
  }, []);

  const contributionChart = useMemo(() => {
    const data = collaborators
      .filter((c) => c.id !== "me")
      .map((c) => ({
        name: c.name.split(" ")[0],
        value: Math.floor(Math.random() * 50) + 5,
        itemStyle: { color: c.color },
      }));
    data.push({ name: "You", value: 45, itemStyle: { color: "#6366f1" } });
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        textStyle: { color: "#f1f5f9" },
      },
      series: [
        {
          type: "pie",
          radius: ["40%", "68%"],
          data,
          label: { color: "#94a3b8", fontSize: 10 },
          emphasis: { itemStyle: { shadowBlur: 8 } },
        },
      ],
    };
  }, [collaborators]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 flex-shrink-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Collaborative
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex -space-x-2">
                  {onlineCollaborators.map((c) => (
                    <div
                      key={c.id}
                      className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: c.color }}
                      title={c.name}
                    >
                      {c.avatar[0]}
                    </div>
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {onlineCollaborators.length} online · {collaborators.length}{" "}
                  total
                </span>
                {duckdbLoaded && (
                  <span className="text-xs text-green-400">● DuckDB live</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {access.roleLabel} · {access.cacheMode}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 bg-accent hover:bg-accent rounded-lg text-foreground transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-3 border-b border-border">
                      <span className="text-sm font-semibold text-foreground">
                        Notifications
                      </span>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Mark all read
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.map((n) => {
                        const a = getCollaborator(n.authorId);
                        return (
                          <div
                            key={n.id}
                            className={`flex gap-2 p-3 border-b border-border ${!n.read ? "bg-indigo-500/5" : ""}`}
                          >
                            <Avatar collab={a} size="sm" showStatus />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-foreground leading-relaxed">
                                {n.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatAge(n.timestamp)}
                              </p>
                            </div>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-indigo-400 mt-1 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
        <div className="flex gap-1 mt-3 bg-card rounded-xl p-1 border border-border w-fit">
          {(["overview", "comments", "changes", "live"] as const).map((tab) => {
            const icons = {
              overview: Activity,
              comments: MessageSquare,
              changes: GitBranch,
              live: Zap,
            };
            const Icon = icons[tab];
            const cnts: Record<string, number> = {
              overview: 0,
              comments: filteredComments.filter((c) => !c.resolved).length,
              changes: changes.length,
              live: liveMessages.length,
            };
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
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {cnts[tab] > 0 && (
                  <span
                    className={`text-xs px-1 rounded-full ${activeTab === tab ? "bg-white/20" : "bg-accent text-foreground"}`}
                  >
                    {cnts[tab]}
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
                    value: onlineCollaborators.length,
                    icon: Users,
                    color: "bg-green-600",
                    sub: `of ${collaborators.length} members`,
                  },
                  {
                    label: "Open Comments",
                    value: comments.filter((c) => !c.resolved).length,
                    icon: MessageSquare,
                    color: "bg-blue-600",
                    sub: `${comments.filter((c) => c.resolved).length} resolved`,
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
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {s.label}
                      </span>
                      <div className={`p-1.5 rounded-lg ${s.color}`}>
                        <s.icon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      {s.value}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.sub}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Team & activity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  {/* Team */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-400" /> Team Members
                    </h3>
                    <div className="space-y-2">
                      {collaborators.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 p-2 rounded-xl bg-muted hover:bg-accent transition-colors"
                        >
                          <Avatar collab={c} size="md" showStatus />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {c.name}
                              </span>
                              {c.id === "me" && (
                                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1 rounded">
                                  you
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {c.email}
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded border ${
                                c.role === "owner"
                                  ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/25"
                                  : c.role === "editor"
                                    ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                                    : "bg-muted text-foreground border-border"
                              }`}
                            >
                              {c.role}
                            </span>
                            {c.currentCell && (
                              <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                                editing: {c.currentCell}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {c.status === "online"
                                ? "online"
                                : formatAge(c.lastSeen)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column annotations */}
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Bookmark className="w-4 h-4 text-yellow-400" /> Column
                      Annotations
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {ANNOTATIONS.map((ann) => {
                        const a = getCollaborator(ann.authorId);
                        const typeStyle: Record<
                          CellAnnotation["type"],
                          { color: string; icon: React.ElementType }
                        > = {
                          highlight: {
                            color: "border-yellow-500/30 bg-yellow-500/5",
                            icon: Star,
                          },
                          comment: {
                            color: "border-blue-500/30 bg-blue-500/5",
                            icon: MessageSquare,
                          },
                          error: {
                            color: "border-red-500/30 bg-red-500/5",
                            icon: AlertCircle,
                          },
                          suggestion: {
                            color: "border-purple-500/30 bg-purple-500/5",
                            icon: Info,
                          },
                        };
                        const ts2 = typeStyle[ann.type];
                        const AIcon = ts2.icon;
                        return (
                          <div
                            key={`${ann.cell}-${ann.authorId}`}
                            className={`p-2 rounded-xl border ${ts2.color}`}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <AIcon className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs font-mono text-foreground">
                                {ann.cell}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div
                                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: a.color }}
                              >
                                {a.avatar[0]}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {a.name.split(" ")[0]}
                              </span>
                            </div>
                            {ann.note && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {ann.note}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Edit Activity (today)
                    </h3>
                    <ReactECharts
                      option={activityChart}
                      style={{ height: 160 }}
                    />
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">
                      Contributions
                    </h3>
                    <ReactECharts
                      option={contributionChart}
                      style={{ height: 160 }}
                    />
                  </div>
                </div>
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
              <div className="p-3 border-b border-border space-y-2 flex-shrink-0">
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
                      onChange={(e) =>
                        setCommentType(e.target.value as Comment["type"])
                      }
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
                        access.permissions.canEditComments
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
                      disabled={!access.permissions.canEditComments}
                      className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={handleAddComment}
                      disabled={
                        !access.permissions.canEditComments ||
                        !newComment.trim()
                      }
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

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <AnimatePresence>
                  {filteredComments.map((c) => (
                    <CommentCard
                      key={c.id}
                      comment={c}
                      onResolve={handleResolve}
                      onReact={handleReact}
                      onReply={handleReply}
                    />
                  ))}
                </AnimatePresence>
                {filteredComments.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>No comments yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Changes ─────────────────────────────────────────── */}
          {activeTab === "changes" && (
            <motion.div
              key="changes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-4 space-y-2"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-indigo-400" /> Change Log (
                  {changes.length})
                </h2>
                <span className="text-xs text-muted-foreground">
                  {changes.filter((c) => c.approved).length} approved ·{" "}
                  {changes.filter((c) => c.approved === undefined).length}{" "}
                  pending
                </span>
              </div>
              {changes.map((change, idx) => (
                <motion.div
                  key={change.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <ChangeItem change={change} />
                </motion.div>
              ))}
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
              {/* Online users sidebar */}
              <div className="w-52 border-r border-border p-3 flex-shrink-0">
                <div className="text-xs text-muted-foreground mb-2 font-semibold">
                  ONLINE
                </div>
                <div className="space-y-1">
                  {collaborators
                    .filter((c) => c.status !== "offline")
                    .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted"
                      >
                        <Avatar collab={c} size="sm" showStatus />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">
                            {c.id === "me" ? "You" : c.name.split(" ")[0]}
                          </div>
                          {c.currentCell && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {c.currentCell}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
                <div className="text-xs text-muted-foreground mt-3 mb-2 font-semibold">
                  AWAY
                </div>
                {collaborators
                  .filter((c) => c.status === "offline")
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 p-1.5 rounded-lg opacity-50"
                    >
                      <Avatar collab={c} size="sm" showStatus />
                      <span className="text-xs text-muted-foreground truncate">
                        {c.name.split(" ")[0]}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Chat */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {liveMessages.map((msg) => {
                    const a = getCollaborator(msg.authorId);
                    const isMe = msg.authorId === "me";
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-start gap-2 ${isMe ? "flex-row-reverse" : ""}`}
                      >
                        <Avatar collab={a} size="sm" showStatus />
                        <div
                          className={`max-w-xs ${isMe ? "items-end" : "items-start"} flex flex-col`}
                        >
                          {!isMe && (
                            <span className="text-xs font-semibold text-muted-foreground mb-0.5">
                              {a.name.split(" ")[0]}
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
                      </motion.div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-border flex gap-2">
                  <Avatar collab={collaborators[0]} size="sm" />
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
        </AnimatePresence>
      </div>
    </div>
  );
}
