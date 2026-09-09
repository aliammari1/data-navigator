// FACTS (GateGuard): importers — the "moudir-chat" screen (MoudirChatScreen)
//   renders exactly one instance and owns the $mod+K shortcut; any other app can
//   ask for it by dispatching CHAT_SEARCH_PALETTE_EVENT, which this component
//   listens for. Data — two lanes: (1) instant local fuzzy match over the
//   conversation titles already in the store (fuse.js, no IPC, runs on the raw
//   keystroke), (2) debounced FTS5 + semantic message search over chat.db via
//   searchMessagesRemote (electron/chat-search.ts). Selecting anything dispatches
//   JUMP_TO_MESSAGE_EVENT; the screen awaits openConversation, verifies it was
//   allowed, then stages pendingScrollToMessageId for <MoudirMessageList>. Props
//   take a STRUCTURAL conversation shape ({id,title,messageCount?}) so the screen
//   can pass its narrow useShallow projection without re-rendering mid-stream.
//   UI — shadcn command/dialog/empty/kbd/spinner primitives; no raw cmdk import.
//   Design: shadcn semantic tokens only, French-first. Offline.
"use client";

/**
 * ChatSearchPalette — Cmd/Ctrl+K over the Moudir chat history.
 *
 * Two search lanes, deliberately different speeds. Conversation titles are
 * already in memory, so fuse.js matches them on every keystroke and they render
 * first — the common case ("where was that Ventes thread?") never waits on IPC.
 * Message bodies live in SQLite, so that lane is debounced and shows a spinner.
 *
 * The window event "moudir-chat:jump-to-message" carries an optional messageId:
 * present for a message hit, absent when the user picked a whole conversation.
 * The screen resolves the conversation and the message list consumes the id.
 */

import Fuse from "fuse.js";
import { Bot, CornerDownLeft, MessageSquare, SearchX, UserRound } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { MOD_GLYPH } from "@/components/moudir-chat/utils";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import type { ChatSearchHit } from "@/platform/chat/chat-history-client";
import { searchMessagesRemote } from "@/platform/chat/chat-history-client";
import { cn } from "@/shared/utils";

/** The message lane is IPC + FTS5; the title lane is not debounced at all. */
const DEBOUNCE_MS = 180;
const MESSAGE_LIMIT = 40;
const RECENT_LIMIT = 8;
const TITLE_MATCH_LIMIT = 5;

/** Any app can request the palette; the chat screen owns the actual shortcut. */
export const CHAT_SEARCH_PALETTE_EVENT = "moudir-chat:search-palette";
export const JUMP_TO_MESSAGE_EVENT = "moudir-chat:jump-to-message";

/**
 * `messageId` is optional: a whole-conversation pick has no target bubble. The
 * old `-1` sentinel is gone — it forced every consumer to know the magic number.
 */
export interface JumpToMessageDetail {
  conversationId: string;
  messageId?: number | null;
}

/**
 * The minimum a conversation needs to appear here. Structural on purpose: the
 * screen subscribes to a narrow `{id, title}` projection so streamed tokens
 * touching `updatedAt` don't re-render the palette, and ConversationMeta still
 * satisfies this shape when a caller has the full row.
 */
export interface PaletteConversation {
  id: string;
  title: string;
  messageCount?: number;
}

export interface ChatSearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: PaletteConversation[];
}

/* ── Snippet rendering ────────────────────────────────────────────────────── */

/** Strip the FTS5 → / ← delimiters the snippet() macro injects. */
function stripSnippetDelimiters(raw: string): string {
  return raw
    .replace(/^\s*→\s*/, "")
    .replace(/\s*←\s*$/, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Term highlighter for the snippets.
 *
 * The split pattern is /g because String.split needs it, but membership is
 * checked against a lowercased term Set — NOT with `re.test(part)`. A global
 * regex carries `lastIndex` between calls, so testing each part in turn made
 * `test` alternate true/false regardless of content: roughly half the matches
 * rendered plain and half the plain text rendered as a <mark>.
 */
function useHighlighter(query: string) {
  return useMemo(() => {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return (text: string): ReactNode => stripSnippetDelimiters(text);
    }
    const splitter = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
    const matched = new Set(terms.map((t) => t.toLowerCase()));

    return (text: string): ReactNode => {
      const clean = stripSnippetDelimiters(text);
      return clean.split(splitter).map((part, i) =>
        matched.has(part.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-ai/20 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      );
    };
  }, [query]);
}

/* ── Palette ──────────────────────────────────────────────────────────────── */

export function ChatSearchPalette({ open, onOpenChange, conversations }: ChatSearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const trimmed = query.trim();
  const debouncedTerm = debounced.trim();
  const highlight = useHighlighter(debouncedTerm);

  // Other apps can open the palette without owning the shortcut.
  useEffect(() => {
    const onRequest = () => onOpenChange(true);
    window.addEventListener(CHAT_SEARCH_PALETTE_EVENT, onRequest);
    return () => window.removeEventListener(CHAT_SEARCH_PALETTE_EVENT, onRequest);
  }, [onOpenChange]);

  // Closing resets everything: reopening on a stale result set reads as a bug.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setDebounced("");
    setHits([]);
    setLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [open, query]);

  useEffect(() => {
    if (!open || !debouncedTerm) {
      setHits([]);
      setLoading(false);
      return;
    }
    // The cleanup flag also settles the out-of-order case: a slow earlier query
    // resolving after a faster later one can't overwrite the newer results.
    let cancelled = false;
    setLoading(true);
    searchMessagesRemote({ query: debouncedTerm, limit: MESSAGE_LIMIT })
      .then((rows) => {
        if (!cancelled) setHits(rows);
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, open]);

  /**
   * Lane 1 — titles. Rebuilt only when the conversation list identity changes.
   * `ignoreLocation` matters: a match deep in a long title should still count,
   * and Fuse's default location bias would rank it out of the results.
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

  const titleMatches = useMemo(
    () =>
      trimmed.length < 2
        ? []
        : fuse.search(trimmed, { limit: TITLE_MATCH_LIMIT }).map((r) => r.item),
    [fuse, trimmed],
  );

  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) map.set(c.id, c.title);
    return map;
  }, [conversations]);

  /** Lane 2 — messages, kept in backend rank order (first bucket = best hit). */
  const grouped = useMemo(() => {
    const map = new Map<string, ChatSearchHit[]>();
    for (const hit of hits) {
      const bucket = map.get(hit.conversationId) ?? [];
      bucket.push(hit);
      map.set(hit.conversationId, bucket);
    }
    return Array.from(map.entries()).map(([conversationId, entries]) => ({
      conversationId,
      title: titleById.get(conversationId) ?? "Conversation",
      entries,
    }));
  }, [hits, titleById]);

  const jump = useCallback(
    (conversationId: string, messageId?: number) => {
      window.dispatchEvent(
        new CustomEvent<JumpToMessageDetail>(JUMP_TO_MESSAGE_EVENT, {
          detail: { conversationId, messageId },
        }),
      );
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const hitCount = grouped.reduce((sum, g) => sum + g.entries.length, 0);
  const searching = trimmed.length > 0;
  const settled = !loading && debouncedTerm === trimmed;
  const nothingFound = searching && settled && hitCount === 0 && titleMatches.length === 0;

  const conversationRow = (conversation: PaletteConversation, prefix: string) => (
    <CommandItem
      key={`${prefix}-${conversation.id}`}
      value={`${prefix}:${conversation.id}`}
      onSelect={() => jump(conversation.id)}
      className="group items-center gap-3 rounded-lg px-3 py-2"
    >
      <MessageSquare
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-ai"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {conversation.title}
        </span>
        {typeof conversation.messageCount === "number" ? (
          <span className="block text-xs text-muted-foreground">
            {conversation.messageCount} message{conversation.messageCount > 1 ? "s" : ""}
          </span>
        ) : null}
      </span>
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-1/4 max-w-xl translate-y-0 gap-0 overflow-hidden rounded-2xl border border-border bg-popover p-0 shadow-2xl"
      >
        {/* Radix requires an accessible name on DialogContent; without this it
            warns and screen readers announce an unlabelled dialog. */}
        <DialogTitle className="sr-only">Rechercher dans les conversations</DialogTitle>

        <Command shouldFilter={false} label="Rechercher dans les conversations">
          <div className="relative">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Rechercher dans les conversations…"
              aria-label="Requête de recherche"
              className="h-12"
            />
            <KbdGroup className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 sm:flex">
              <Kbd>Esc</Kbd>
            </KbdGroup>
          </div>

          <CommandList className="max-h-80 py-1">
            {!searching ? (
              conversations.length === 0 ? (
                <Empty className="py-8">
                  <EmptyHeader>
                    <EmptyTitle className="text-sm">Aucune conversation</EmptyTitle>
                    <EmptyDescription>
                      Pose une première question à Moudir pour démarrer l'historique.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <CommandGroup heading="Conversations récentes">
                  {conversations
                    .slice(0, RECENT_LIMIT)
                    .map((conversation) => conversationRow(conversation, "rec"))}
                </CommandGroup>
              )
            ) : (
              <>
                {/* Titles resolve instantly — they render while the message lane
                    is still in flight, so the palette never looks frozen. */}
                {titleMatches.length > 0 ? (
                  <CommandGroup heading="Conversations">
                    {titleMatches.map((conversation) => conversationRow(conversation, "title"))}
                  </CommandGroup>
                ) : null}

                {titleMatches.length > 0 && hitCount > 0 ? <CommandSeparator /> : null}

                {loading && hitCount === 0 ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground"
                  >
                    <Spinner className="size-4" />
                    Recherche dans les messages…
                  </div>
                ) : null}

                {nothingFound ? (
                  <Empty className="py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <SearchX aria-hidden />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm">
                        Aucun résultat pour «&nbsp;{debouncedTerm}&nbsp;»
                      </EmptyTitle>
                      <EmptyDescription>
                        Essaie un mot-clé plus court, ou le nom d'une table.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}

                {grouped.map((group) => (
                  <CommandGroup key={group.conversationId} heading={group.title}>
                    {group.entries.map((hit) => (
                      <CommandItem
                        key={`hit-${hit.messageId}`}
                        value={`hit:${hit.conversationId}:${hit.messageId}`}
                        onSelect={() => jump(hit.conversationId, hit.messageId)}
                        className="group items-start gap-3 rounded-lg px-3 py-2"
                      >
                        {hit.role === "assistant" ? (
                          <Bot
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-ai"
                          />
                        ) : (
                          <UserRound
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground group-data-[selected=true]:text-ai"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {hit.role === "assistant" ? "Moudir" : "Vous"}
                            </span>
                            <span
                              className={cn(
                                "rounded-full border px-1.5 py-px text-[9px] font-medium tracking-wide uppercase",
                                hit.source === "semantic"
                                  ? "border-ai/40 bg-ai/10 text-ai"
                                  : "border-border bg-muted text-muted-foreground",
                              )}
                              title={
                                hit.source === "semantic"
                                  ? "Match par similarité sémantique (cosinus sur embeddings)"
                                  : "Match par mot-clé (FTS5)"
                              }
                            >
                              {hit.source === "semantic" ? "Sémantique" : "Mot-clé"}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm break-words text-foreground">
                            {highlight(hit.snippet)}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> Naviguer
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft aria-hidden className="size-3" /> Ouvrir
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>{MOD_GLYPH}K</Kbd> Fermer
            </span>
            <span className={cn("ml-auto tabular-nums", loading && "text-ai")}>
              {loading
                ? "Recherche…"
                : hitCount > 0
                  ? `${hitCount} résultat${hitCount > 1 ? "s" : ""}`
                  : searching && settled
                    ? "0 résultat"
                    : "Tapez pour rechercher"}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
