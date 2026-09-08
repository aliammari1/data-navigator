"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  StickyNote,
  X,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  Trash2,
  Send,
  CircleDot,
  Share2,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  useAnnotations,
  type NoteColor,
  type NotePriority,
  type Annotation,
} from "../hooks/useAnnotations";
import { useCursorNotes, addCursorNote } from "../hooks/use-cursor-notes";
import { CursorNoteMarker } from "./CursorNoteMarker";
import { currentUserName } from "../collab/collab-hub-crdt";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { readLANSettings } from "@/platform/lan/lan-collab";

// ─── Color config ─────────────────────────────────────────────────────────────

const COLOR_MAP: Record<NoteColor, { header: string; bg: string; border: string; label: string }> =
  {
    yellow: {
      header: "bg-yellow-400/80 dark:bg-yellow-500/60",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      border: "border-yellow-300 dark:border-yellow-700",
      label: "Yellow",
    },
    blue: {
      header: "bg-blue-400/80 dark:bg-blue-500/60",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-300 dark:border-blue-700",
      label: "Blue",
    },
    green: {
      header: "bg-emerald-400/80 dark:bg-emerald-500/60",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-300 dark:border-emerald-700",
      label: "Green",
    },
    pink: {
      header: "bg-pink-400/80 dark:bg-pink-500/60",
      bg: "bg-pink-50 dark:bg-pink-950/30",
      border: "border-pink-300 dark:border-pink-700",
      label: "Pink",
    },
    purple: {
      header: "bg-violet-400/80 dark:bg-violet-500/60",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      border: "border-violet-300 dark:border-violet-700",
      label: "Purple",
    },
  };

const PRIORITY_MAP: Record<NotePriority, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-muted text-muted-foreground" },
  important: {
    label: "Important",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  urgent: {
    label: "Urgent",
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
};

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onResolve,
  onUnresolve,
  onDelete,
  onReply,
  currentUser,
  canEdit,
}: {
  note: Annotation;
  onResolve: (id: string) => void;
  onUnresolve: (id: string) => void;
  onDelete: (id: string) => void;
  onReply: (id: string, text: string) => void;
  currentUser: string;
  canEdit: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const colors = COLOR_MAP[note.color];
  const priority = PRIORITY_MAP[note.priority];

  const handleReply = () => {
    if (!canEdit || !replyText.trim()) return;
    onReply(note.id, replyText.trim());
    setReplyText("");
    setReplyOpen(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "rounded-lg border overflow-hidden",
        colors.bg,
        colors.border,
        note.resolved && "opacity-60",
      )}
    >
      {/* Colored header strip */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-1.5 text-xs font-medium",
          colors.header,
        )}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{note.author}</span>
          <span
            className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", priority.className)}
          >
            {priority.label}
          </span>
        </div>
        <span className="text-foreground/70">{relativeTime(note.at)}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p
          className={cn(
            "text-sm leading-relaxed text-foreground",
            note.resolved && "line-through opacity-70",
          )}
        >
          {note.text}
        </p>
      </div>

      {/* Replies */}
      {note.replies.length > 0 && (
        <div className="border-t border-current/10 px-3 pb-2 pt-1.5 space-y-1.5">
          {note.replies.map((r) => (
            <div key={r.id} className="flex gap-2 text-xs">
              <CircleDot className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div>
                <span className="font-semibold text-foreground">{r.author}</span>
                <span className="ml-1.5 text-muted-foreground">{r.text}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      <AnimatePresence>
        {replyOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-current/10 px-3 pb-2 pt-1.5"
          >
            <div className="flex gap-1.5">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply…"
                className="min-h-12 resize-none text-xs"
                disabled={!canEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleReply();
                }}
              />
              <Button size="icon-sm" onClick={handleReply} disabled={!canEdit || !replyText.trim()}>
                <Send className="size-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-1 border-t border-current/10 px-2 py-1">
        <Button
          variant="ghost"
          size="xs"
          className="h-6 gap-1 text-xs"
          onClick={() => setReplyOpen((v) => !v)}
          disabled={!canEdit}
        >
          <MessageSquare className="size-3" />
          Reply
        </Button>

        {note.resolved ? (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 gap-1 text-xs text-muted-foreground"
            onClick={() => onUnresolve(note.id)}
            disabled={!canEdit}
          >
            Unresolve
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 gap-1 text-xs text-emerald-600 dark:text-emerald-400"
            onClick={() => onResolve(note.id)}
            disabled={!canEdit}
          >
            <CheckCircle2 className="size-3" />
            Resolve
          </Button>
        )}

        {note.author === currentUser && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto h-6 text-destructive"
            onClick={() => onDelete(note.id)}
            disabled={!canEdit}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface StickyNoteAnnotationProps {
  sectionId: string;
  sectionLabel: string;
}

export function StickyNoteAnnotation({ sectionId, sectionLabel }: StickyNoteAnnotationProps) {
  const access = useDashboardAccess();
  const canEdit = access.permissions.canEditComments;

  // Author identity comes from the LAN peer (shared with presence/audit), so the
  // "delete own note" affordance matches who actually wrote it across machines.
  const username = currentUserName();
  const { notes, addNote, resolveNote, unresolveNote, deleteNote, replyToNote, unresolvedCount } =
    useAnnotations(sectionId);

  const cursorNotes = useCursorNotes(sectionId);

  // Remember the last-used note style across panel opens (the panel unmounts on
  // close), via the UI-pref store.
  const lastNoteColor = useCollabHubStore.use.lastNoteColor();
  const lastNotePriority = useCollabHubStore.use.lastNotePriority();
  const setLastNoteStyle = useCollabHubStore.use.setLastNoteStyle();

  const [panelOpen, setPanelOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [text, setText] = useState("");
  const [color, setColor] = useState<NoteColor>(lastNoteColor);
  const [priority, setPriority] = useState<NotePriority>(lastNotePriority);
  const [shareWithCollab, setShareWithCollab] = useState(false);
  const [currentRow, setCurrentRow] = useState<number | undefined>(undefined);

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [sectionContainer, setSectionContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let el = anchorRef.current?.parentElement ?? null;
    let candidate: HTMLElement | null = null;
    while (el) {
      if (el.dataset.sectionId === sectionId) {
        candidate = el;
        break;
      }
      if (
        candidate === null &&
        getComputedStyle(el).position !== "static" &&
        el.clientHeight > 64
      ) {
        candidate = el;
      }
      el = el.parentElement;
    }
    const target = candidate ?? document.body;
    if (getComputedStyle(target).position === "static") {
      target.style.position = "relative";
    }
    setSectionContainer(target);
  }, [sectionId]);

  useEffect(() => {
    const target = sectionContainer;
    if (!target) return;
    if (target.dataset.sectionId === sectionId) return;
    target.dataset.sectionId = sectionId;
    return () => {
      if (target.dataset.sectionId === sectionId) delete target.dataset.sectionId;
    };
  }, [sectionContainer, sectionId]);

  const resolvedNotes = notes.filter((n) => n.resolved);
  const unresolvedNotes = notes.filter((n) => !n.resolved);

  const handlePost = () => {
    if (!canEdit || !text.trim()) return;
    const trimmed = text.trim();
    addNote(trimmed, color, priority);
    if (shareWithCollab) {
      const settings = readLANSettings();
      addCursorNote({
        sectionId,
        authorPeerId: settings.peer.id,
        authorName: settings.peer.name,
        authorColor: settings.peer.color,
        row: currentRow,
        text: trimmed,
      });
    }
    setLastNoteStyle(color, priority);
    setText("");
  };

  const handleResolve = useCallback(
    (id: string) => {
      if (!canEdit) return;
      resolveNote(id);
    },
    [canEdit, resolveNote],
  );

  const handleUnresolve = useCallback(
    (id: string) => {
      if (!canEdit) return;
      unresolveNote(id);
    },
    [canEdit, unresolveNote],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!canEdit) return;
      deleteNote(id);
    },
    [canEdit, deleteNote],
  );

  const handleReply = useCallback(
    (id: string, text: string) => {
      if (!canEdit) return;
      replyToNote(id, text);
    },
    [canEdit, replyToNote],
  );

  return (
    <div className="relative inline-flex">
      {/* Trigger button */}
      <motion.button
        ref={anchorRef}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setPanelOpen((v) => !v)}
        className={cn(
          "relative flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          panelOpen && "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
        )}
        title={`Annotations for ${sectionLabel}`}
      >
        <StickyNote className="size-4" />
        {unresolvedCount > 0 && (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
            {unresolvedCount > 9 ? "9+" : unresolvedCount}
          </span>
        )}
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border",
              "bg-popover shadow-lg ring-1 ring-foreground/5",
            )}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between rounded-t-xl border-b border-border bg-muted/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <StickyNote className="size-4 text-amber-500" />
                <span className="text-sm font-medium">{sectionLabel}</span>
                {unresolvedCount > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px]">{unresolvedCount}</Badge>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setPanelOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>

            {/* Add note form */}
            <div className="border-b border-border p-3 space-y-2.5">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a note…"
                className="min-h-[72px] resize-none text-sm"
                disabled={!canEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handlePost();
                }}
              />

              {/* Color selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Color</span>
                <div className="flex gap-1.5">
                  {(Object.keys(COLOR_MAP) as NoteColor[]).map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColor(c)}
                      title={COLOR_MAP[c].label}
                      className={cn(
                        "size-5 rounded-full transition-transform",
                        COLOR_MAP[c].header,
                        color === c && "ring-2 ring-offset-1 ring-foreground scale-110",
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Priority + share + post */}
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {(["normal", "important", "urgent"] as NotePriority[]).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPriority(p)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
                        PRIORITY_MAP[p].className,
                        priority === p ? "ring-2 ring-offset-1 ring-foreground/40" : "opacity-60",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <label
                  className={cn(
                    "ml-auto flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                    shareWithCollab
                      ? "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                  )}
                  title="Publish this note as a cursor-anchored sticky note visible to every LAN peer"
                >
                  <input
                    type="checkbox"
                    checked={shareWithCollab}
                    onChange={(e) => setShareWithCollab(e.target.checked)}
                    disabled={!canEdit}
                    className="size-3 accent-sky-500"
                  />
                  <Share2 className="size-3" />
                  Share
                </label>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={handlePost}
                  disabled={!canEdit || !text.trim()}
                >
                  Post Note
                </Button>
              </div>
            </div>

            {/* Notes list */}
            <div className="max-h-72 overflow-y-auto p-3 space-y-2">
              <AnimatePresence mode="popLayout">
                {unresolvedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onResolve={handleResolve}
                    onUnresolve={handleUnresolve}
                    onDelete={handleDelete}
                    onReply={handleReply}
                    currentUser={username}
                    canEdit={canEdit}
                  />
                ))}
              </AnimatePresence>

              {/* Resolved toggle */}
              {resolvedNotes.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowResolved((v) => !v)}
                    className="flex w-full items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showResolved ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                    {showResolved ? "Hide resolved" : `Show ${resolvedNotes.length} resolved`}
                  </button>
                  <AnimatePresence>
                    {showResolved && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-2"
                      >
                        {resolvedNotes.map((note) => (
                          <NoteCard
                            key={note.id}
                            note={note}
                            onResolve={handleResolve}
                            onUnresolve={handleUnresolve}
                            onDelete={handleDelete}
                            onReply={handleReply}
                            currentUser={username}
                            canEdit={canEdit}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {notes.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No annotations yet. Add the first note!
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CursorNotesOverlay
        notes={cursorNotes}
        container={sectionContainer}
      />
    </div>
  );
}

interface CursorNotesOverlayProps {
  notes: ReturnType<typeof useCursorNotes>;
  container: HTMLElement | null;
}

function CursorNotesOverlay({ notes, container }: CursorNotesOverlayProps) {
  const containerRef = useMemo<{ readonly current: HTMLElement | null }>(
    () => ({ current: container }),
    [container],
  );
  if (notes.length === 0 || !container) return null;
  return createPortal(
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {notes.map((note) => (
        <CursorNoteMarker key={note.id} note={note} containerRef={containerRef} />
      ))}
    </div>,
    container,
  );
}
