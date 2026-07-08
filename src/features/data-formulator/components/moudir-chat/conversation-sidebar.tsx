"use client";

/**
 * ConversationSidebar — the Moudir chat's conversation rail.
 *
 * Binds ONLY to `useMoudirChatStore`: lists conversations (pinned group first,
 * then the rest), a debounced search, and a « Nouveau » action that seeds a
 * fresh conversation then hands focus to the composer via a window event.
 *
 * Each row is title + relative age + message count; hover reveals a ⋯ menu
 * (Épingler / Renommer / Supprimer). Renommer swaps the title for an inline
 * input; Supprimer confirms through an AlertDialog. The active row carries the
 * shared primary ring so it reads as selected across light and dark themes.
 *
 * Design: shadcn semantic tokens only, French copy, the warm Moudir mark, and
 * restrained motion (rows collapse out on removal, honoured only when the user
 * hasn't asked for reduced motion).
 */

import { MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/features/dashboard-home/lib/relative-time";
import type { ConversationMeta } from "@/platform/chat/chat-history-client";
import { cn } from "@/shared/utils";
import { useMoudirChatStore } from "../../store/moudir-chat-store";
import { EASE, Kicker, MoudirMark, useMotionOn } from "../moudir/moudir-kit";

/** Ask the composer to take focus after a conversation is created. */
const FOCUS_COMPOSER_EVENT = "moudir-chat:focus-composer";
const SEARCH_DEBOUNCE_MS = 200;

function focusComposer() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FOCUS_COMPOSER_EVENT));
}

/** French message-count label ("0 message", "3 messages"). */
function messageCountLabel(count: number): string {
  return `${count} ${count > 1 ? "messages" : "message"}`;
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Search box: types locally, debounces into the store's searchTerm. */
function SearchField() {
  const setSearchTerm = useMoudirChatStore((s) => s.setSearchTerm);
  const [value, setValue] = useState(() => useMoudirChatStore.getState().searchTerm);

  useEffect(() => {
    const id = window.setTimeout(() => {
      if (value !== useMoudirChatStore.getState().searchTerm) setSearchTerm(value);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [value, setSearchTerm]);

  function clear() {
    setValue("");
    setSearchTerm("");
  }

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Rechercher…"
        aria-label="Rechercher une conversation"
        className="h-8 pr-8 pl-8 text-sm"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Effacer la recherche"
          className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface ConversationRowProps {
  conversation: ConversationMeta;
  isActive: boolean;
}

function ConversationRow({ conversation, isActive }: ConversationRowProps) {
  const openConversation = useMoudirChatStore((s) => s.openConversation);
  const pin = useMoudirChatStore((s) => s.pin);
  const rename = useMoudirChatStore((s) => s.rename);
  const remove = useMoudirChatStore((s) => s.remove);

  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  function beginRename() {
    setDraft(conversation.title);
    setIsRenaming(true);
  }

  function commitRename() {
    const next = draft.trim();
    if (next && next !== conversation.title) void rename(conversation.id, next);
    setIsRenaming(false);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-current={isActive ? "true" : undefined}
        onClick={() => void openConversation(conversation.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void openConversation(conversation.id);
          }
        }}
        className={cn(
          "group/row w-full cursor-pointer rounded-lg border border-transparent px-2.5 py-2 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "border-border bg-accent ring-1 ring-primary/40 hover:bg-accent",
        )}
      >
        <div className="flex items-center gap-1.5">
          {conversation.pinned ? (
            <Pin aria-hidden className="size-3 shrink-0 text-muted-foreground" />
          ) : null}

          {isRenaming ? (
            <Input
              autoFocus
              value={draft}
              aria-label={`Renommer ${conversation.title}`}
              className="h-7 flex-1 text-sm"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setIsRenaming(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
            />
          ) : (
            <span className="flex-1 truncate text-sm font-medium" title={conversation.title}>
              {conversation.title}
            </span>
          )}

          {!isRenaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions pour ${conversation.title}`}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-40"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onSelect={() => void pin(conversation.id, !conversation.pinned)}>
                  {conversation.pinned ? <PinOff /> : <Pin />}
                  {conversation.pinned ? "Désépingler" : "Épingler"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => beginRename()}>
                  <Pencil />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setIsConfirmOpen(true);
                  }}
                >
                  <Trash2 />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {messageCountLabel(conversation.messageCount)}
          <span aria-hidden> · </span>
          {relativeTime(conversation.updatedAt)}
        </div>
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {conversation.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette conversation et tous ses messages seront supprimés définitivement.
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

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function ConversationSidebar() {
  const conversations = useMoudirChatStore((s) => s.conversations);
  const activeId = useMoudirChatStore((s) => s.activeId);
  const searchTerm = useMoudirChatStore((s) => s.searchTerm);
  const newConversation = useMoudirChatStore((s) => s.newConversation);
  const refreshConversations = useMoudirChatStore((s) => s.refreshConversations);
  const motionOn = useMotionOn();

  // Load the conversation list on mount.
  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  async function handleNew() {
    await newConversation();
    focusComposer();
  }

  const pinned = conversations.filter((c) => c.pinned);
  const rest = conversations.filter((c) => !c.pinned);
  const isEmpty = conversations.length === 0;
  const isSearching = searchTerm.trim().length > 0;

  const renderRow = (conversation: ConversationMeta) => (
    <motion.div
      key={conversation.id}
      layout={motionOn}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: motionOn ? 0.18 : 0, ease: EASE }}
      className="overflow-hidden pb-1"
    >
      <ConversationRow conversation={conversation} isActive={conversation.id === activeId} />
    </motion.div>
  );

  return (
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <MoudirMark size={22} />
          <Kicker tone="coral">Conversations</Kicker>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleNew()}
          className="w-full justify-start gap-1.5"
        >
          <Plus />
          Nouveau
        </Button>
        <SearchField />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <MoudirMark size={32} className="opacity-60" />
            <p className="text-sm text-muted-foreground">
              {isSearching
                ? `Aucun résultat pour « ${searchTerm.trim()} ».`
                : "Aucune conversation — démarrez-en une."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pinned.length > 0 ? (
              <section>
                <Kicker className="px-1.5">Épinglées</Kicker>
                <div className="mt-1.5">
                  <AnimatePresence initial={false}>{pinned.map(renderRow)}</AnimatePresence>
                </div>
              </section>
            ) : null}

            <section>
              {pinned.length > 0 && rest.length > 0 ? (
                <Kicker className="px-1.5">Récentes</Kicker>
              ) : null}
              <div className={cn(pinned.length > 0 && rest.length > 0 && "mt-1.5")}>
                <AnimatePresence initial={false}>{rest.map(renderRow)}</AnimatePresence>
              </div>
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}
