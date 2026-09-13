// FACTS (GateGuard): importer — MoudirChatScreen renders this twice at most: as a
//   fixed 260px grid track above 768px, and inside a <Sheet> below it. Binds ONLY
//   to useMoudirChatStore, plus useActiveDatasetId so a conversation created here
//   is scoped to the same dataset the screen's header advertises. Search is TWO
//   lanes: fuse.js narrows the already-loaded list on the keystroke (no IPC), and
//   store.setSearchTerm — which debounces internally at 180ms — replaces it with
//   real FTS results. This file must NOT debounce again. It must also NOT call
//   refreshConversations on mount: the screen already does, and two calls raced on
//   every cold start. Pinned conversations live in their own non-scrolling section
//   so they stay visible; "Récentes" owns the scroller and switches to
//   @tanstack/react-virtual past VIRTUALIZE_ABOVE rows (motion is dropped on that
//   path — a virtualizer and layout animations fight over the same transforms).
//   Rows are shadcn <Item>s with a full-bleed ::after button so the ⋯ menu isn't
//   nested inside an interactive element. Design: shadcn semantic tokens only,
//   French copy, the warm Moudir mark, motion gated on useMotionOn().
"use client";

/**
 * ConversationSidebar — the Moudir chat's conversation rail.
 *
 * Lists conversations (pinned first, then recent), an instant-then-authoritative
 * search, and a « Nouveau » action that seeds a dataset-scoped conversation and
 * hands focus to the composer via a window event.
 *
 * Each row is title + relative age + message count; hover reveals a ⋯ menu
 * (Épingler / Renommer / Supprimer). Renommer swaps the title for an inline
 * input that commits on blur; Supprimer confirms through an AlertDialog. The
 * active row carries the shared primary ring, and shows a spinner while its turn
 * is streaming.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import Fuse from "fuse.js";
import {
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOD_GLYPH } from "@/components/moudir-chat/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useActiveDatasetId } from "@/core/stores/data-store";
import type { ConversationMeta } from "@/platform/chat/chat-history-client";
import { relativeTime } from "@/shared/relative-time";
import { cn } from "@/shared/utils";
import { useMoudirChatStore } from "../../store/moudir-chat-store";
import { EASE, Kicker, MoudirMark, useMotionOn } from "../moudir/moudir-kit";

/** Ask the composer to take focus after a conversation is created. */
const FOCUS_COMPOSER_EVENT = "moudir-chat:focus-composer";

/** Past this many recent rows the list virtualizes and drops its animations. */
const VIRTUALIZE_ABOVE = 40;
/** Measured row height (title + meta line + 4px gap) for the virtual estimate. */
const ROW_HEIGHT = 60;

function focusComposer() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT));
}

/** French message-count label ("0 message", "3 messages"). */
function messageCountLabel(count: number): string {
  return `${count} ${count > 1 ? "messages" : "message"}`;
}

/* ── Recency grouping (Claude / ChatGPT desktop standard) ─────────────────── */

type RailItem =
  | { kind: "header"; key: string; label: string }
  | { kind: "row"; key: string; conversation: ConversationMeta };

/** Measured header height for the virtualizer estimate. */
const HEADER_HEIGHT = 28;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Bucket unpinned conversations by recency. Grouping is pure view policy over
 * the store's pin + recency order — the relative order inside a bucket never
 * changes, so search filtering and virtualization stay stable.
 */
function groupByRecency(rest: ConversationMeta[]): { label: string; items: ConversationMeta[] }[] {
  const today = startOfDay(Date.now());
  const day = 86_400_000;
  const buckets: { label: string; items: ConversationMeta[] }[] = [
    { label: "Aujourd'hui", items: [] },
    { label: "Hier", items: [] },
    { label: "7 derniers jours", items: [] },
    { label: "30 derniers jours", items: [] },
    { label: "Plus anciens", items: [] },
  ];
  for (const c of rest) {
    const age = today - startOfDay(c.updatedAt);
    const bucket =
      age <= 0
        ? buckets[0]
        : age <= day
          ? buckets[1]
          : age <= 7 * day
            ? buckets[2]
            : age <= 30 * day
              ? buckets[3]
              : buckets[4];
    bucket?.items.push(c);
  }
  return buckets.filter((b) => b.items.length > 0);
}

/** Flatten groups into header + row items for the virtualizer. */
function flattenGroups(groups: { label: string; items: ConversationMeta[] }[]): RailItem[] {
  const flat: RailItem[] = [];
  groups.forEach((g, gi) => {
    flat.push({ kind: "header", key: `g${gi}-${g.label}`, label: g.label });
    for (const c of g.items) flat.push({ kind: "row", key: c.id, conversation: c });
  });
  return flat;
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/**
 * Search box. Writes straight through to the store on every keystroke — the
 * store debounces the chat.db round-trip itself (SEARCH_DEBOUNCE_MS there). The
 * local 200ms timer this used to own stacked on top of that one for ~380ms of
 * dead air before the first result moved.
 */
function SearchField() {
  const searchTerm = useMoudirChatStore((s) => s.searchTerm);
  const setSearchTerm = useMoudirChatStore((s) => s.setSearchTerm);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Rechercher…"
        aria-label="Rechercher une conversation"
        className="h-8 pr-8 pl-8 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape" && searchTerm) {
            e.preventDefault();
            e.stopPropagation();
            setSearchTerm("");
          }
        }}
      />
      {searchTerm ? (
        <button
          type="button"
          onClick={() => setSearchTerm("")}
          aria-label="Effacer la recherche"
          className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* ── Row ──────────────────────────────────────────────────────────────────── */

interface ConversationRowProps {
  conversation: ConversationMeta;
  isActive: boolean;
  isStreaming: boolean;
}

function ConversationRow({ conversation, isActive, isStreaming }: ConversationRowProps) {
  const openConversation = useMoudirChatStore((s) => s.openConversation);
  const pin = useMoudirChatStore((s) => s.pin);
  const rename = useMoudirChatStore((s) => s.rename);
  const remove = useMoudirChatStore((s) => s.remove);

  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Escape unmounts the Input, firing onBlur. Without this the blur handler
  // would commit the draft the user just abandoned.
  const cancelledRef = useRef(false);

  const beginRename = useCallback(() => {
    setDraft(conversation.title);
    cancelledRef.current = false;
    setIsRenaming(true);
  }, [conversation.title]);

  const commitRename = useCallback(() => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setIsRenaming(false);
      return;
    }
    const next = draft.trim();
    if (next && next !== conversation.title) void rename(conversation.id, next);
    setIsRenaming(false);
  }, [conversation.id, conversation.title, draft, rename]);

  return (
    <>
      {/* `relative` anchors the full-bleed ::after button below. The row is NOT
          role="button" any more: a dropdown trigger and a text input nested
          inside an interactive element is invalid, and it forced a
          stopPropagation call on every child. */}
      <Item
        size="sm"
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group/row relative gap-1.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors",
          "has-[button:hover]:bg-muted/50 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring",
          isActive && "border-border bg-accent ring-1 ring-primary/40",
        )}
      >
        <ItemContent className="min-w-0 gap-0.5">
          {isRenaming ? (
            <Input
              autoFocus
              value={draft}
              maxLength={120}
              aria-label={`Renommer ${conversation.title}`}
              className="relative z-10 h-7 w-full text-sm"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelledRef.current = true;
                  setIsRenaming(false);
                }
              }}
            />
          ) : (
            <ItemTitle className="min-w-0 gap-1.5">
              {conversation.pinned ? (
                <Pin aria-hidden className="size-3 shrink-0 text-muted-foreground" />
              ) : null}
              {/* The ::after overlay makes the whole row clickable while keeping
                  a single real <button> as the accessible target. Clicking mid
                  stream is allowed on purpose — the store refuses and surfaces
                  lastNotice, which the screen renders. */}
              <button
                type="button"
                onClick={() => void openConversation(conversation.id)}
                className="min-w-0 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
                title={conversation.title}
              >
                {conversation.title}
              </button>
              {isStreaming ? <Spinner className="size-3 shrink-0 text-ai" /> : null}
            </ItemTitle>
          )}

          <ItemDescription className="truncate text-[11px]">
            {messageCountLabel(conversation.messageCount)}
            <span aria-hidden> · </span>
            {relativeTime(conversation.updatedAt)}
          </ItemDescription>
        </ItemContent>

        {!isRenaming ? (
          <ItemActions className="relative z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions pour ${conversation.title}`}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => void pin(conversation.id, !conversation.pinned)}>
                  {conversation.pinned ? <PinOff /> : <Pin />}
                  {conversation.pinned ? "Désépingler" : "Épingler"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={beginRename}>
                  <Pencil />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    // Let the menu close before the AlertDialog opens, or focus
                    // returns to a trigger that's mid-unmount.
                    e.preventDefault();
                    setIsConfirmOpen(true);
                  }}
                >
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ItemActions>
        ) : null}
      </Item>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {conversation.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette conversation et tous ses messages seront supprimés définitivement.
              {isStreaming ? " La réponse en cours sera interrompue." : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove(conversation.id)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */

export function ConversationSidebar() {
  const conversations = useMoudirChatStore((s) => s.conversations);
  const activeId = useMoudirChatStore((s) => s.activeId);
  const searchTerm = useMoudirChatStore((s) => s.searchTerm);
  const status = useMoudirChatStore((s) => s.status);
  const newConversation = useMoudirChatStore((s) => s.newConversation);
  const activeDatasetId = useActiveDatasetId();
  const motionOn = useMotionOn();

  // NOTE: no refreshConversations() on mount. MoudirChatScreen already loads the
  // list, and both effects firing produced two listConversations round-trips on
  // every cold start — the second one racing in with an unsearched list.

  const handleNew = useCallback(async () => {
    // Scope the new conversation to whatever the header says is active,
    // otherwise the first turn's tools see no dataset.
    await newConversation(activeDatasetId ?? null, null);
    focusComposer();
  }, [activeDatasetId, newConversation]);

  const trimmed = searchTerm.trim();

  /**
   * Instant lane: the store's list is authoritative but arrives one debounce
   * later. Fuse narrows what's already on screen so the rail responds on the
   * keystroke, and typo-tolerantly, which FTS5 prefix matching won't do.
   */
  const fuse = useMemo(
    () =>
      new Fuse(conversations, {
        keys: ["title"],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [conversations],
  );

  const visible = useMemo(() => {
    if (trimmed.length < 2) return conversations;
    const fuzzy = fuse.search(trimmed).map((r) => r.item);
    // Fuse ranks by score; the store already ranked by pin + recency, so keep
    // the store's order and use Fuse purely as a filter.
    const keep = new Set(fuzzy.map((c) => c.id));
    return conversations.filter((c) => keep.has(c.id));
  }, [conversations, fuse, trimmed]);

  const pinned = useMemo(() => visible.filter((c) => c.pinned), [visible]);
  const rest = useMemo(() => visible.filter((c) => !c.pinned), [visible]);
  const groups = useMemo(() => groupByRecency(rest), [rest]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  const isEmpty = visible.length === 0;
  const isSearching = trimmed.length > 0;
  const streamingId = status === "streaming" ? activeId : null;

  const row = useCallback(
    (conversation: ConversationMeta) => (
      <ConversationRow
        conversation={conversation}
        isActive={conversation.id === activeId}
        isStreaming={conversation.id === streamingId}
      />
    ),
    [activeId, streamingId],
  );

  /* Virtualization: only the recent list, only past the threshold. A
     virtualizer positions rows with transforms, which is exactly what motion's
     `layout` animates — running both makes rows jump on every scroll tick. */
  const virtualized = rest.length > VIRTUALIZE_ABOVE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtualized ? flat.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flat[index]?.kind === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => flat[index]?.key ?? index,
    overscan: 8,
  });

  const animatedRow = (conversation: ConversationMeta) => (
    <motion.li
      key={conversation.id}
      layout={motionOn}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: motionOn ? 0.18 : 0, ease: EASE }}
      className="overflow-hidden pb-1"
    >
      {row(conversation)}
    </motion.li>
  );

  return (
    <nav
      aria-label="Conversations"
      className="flex h-full w-full min-w-0 shrink-0 flex-col bg-card/40"
    >
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-muted-foreground/80" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conversations
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleNew()}
          className="w-full justify-start gap-1.5"
        >
          <Plus />
          Nouveau
          <Kbd className="ml-auto bg-primary-foreground/15 text-primary-foreground/80">
            {MOD_GLYPH}N
          </Kbd>
        </Button>
        <SearchField />
      </div>

      {/* Pins don't scroll away. They're a short, deliberately-curated set, and
          keeping them pinned to the top of the rail is the whole point. */}
      {pinned.length > 0 ? (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-border p-2">
          <Kicker className="px-1.5">Épinglées</Kicker>
          <ul className="mt-1.5">
            <AnimatePresence initial={false}>{pinned.map(animatedRow)}</AnimatePresence>
          </ul>
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {isEmpty ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MoudirMark size={28} className="opacity-70" />
              </EmptyMedia>
              <EmptyTitle className="text-sm">
                {isSearching ? "Aucun résultat" : "Aucune conversation"}
              </EmptyTitle>
              <EmptyDescription>
                {isSearching
                  ? `Rien ne correspond à « ${trimmed} ».`
                  : "Pose une première question pour démarrer l'historique."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : rest.length === 0 ? null : virtualized ? (
          <ul
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
            aria-label={`${rest.length} conversations récentes`}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const entry = flat[item.index];
              if (!entry) return null;
              return (
                <li
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute top-0 left-0 w-full pb-1"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  {entry.kind === "header" ? (
                    <Kicker className="px-1.5">{entry.label}</Kicker>
                  ) : (
                    row(entry.conversation)
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.label}>
                <Kicker className="px-1.5">{group.label}</Kicker>
                <ul className="mt-1.5">
                  <AnimatePresence initial={false}>{group.items.map(animatedRow)}</AnimatePresence>
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </nav>
  );
}
