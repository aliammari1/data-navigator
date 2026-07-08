// FACTS (GateGuard): importers — src/app/dashboard/moudir/page.tsx (dashboard
//   <main> child) and the desktop app-registry "moudir-chat" entry (dynamic
//   import). State — binds ONLY to useMoudirChatStore (the Phase-B chat surface);
//   reads useActiveDatasetId to scope each turn's tools. Layout — a resizable two
//   pane: LEFT the <ConversationSidebar/> (collapsible ResizablePanel,
//   autoSaveId "moudir-chat-layout"); RIGHT a flex-col of a slim header
//   (Moudir identity · editable conversation title · "IA locale" badge · model
//   chip), the scrolling <MoudirMessageList/>, and the bottom <ChatComposer/>.
//   Command bus: useAppCommands("moudir-chat", {reset,cancel,ask}); window event
//   "moudir:ask" is owned here so other apps can delegate a question. This screen
//   REPLACES the swarm-based MoudirAssistantScreen (kept in the tree, untouched).
//   Design: shadcn semantic tokens only, French-first, the warm م mark. Offline.
"use client";

/**
 * Moudir — the assistant, as a real chat.
 *
 * A persistent, offline conversation with a sharp analyst. The sidebar lists
 * saved conversations; the thread streams the answer with first-class tool chips
 * and inline chart artifacts; the composer is the only way in. The heavy lifting
 * — streaming, the tool loop, persistence — lives in useMoudirChatStore and the
 * two Electron chat clients; this screen only assembles the parts and wires the
 * menu-command bus + the cross-app "moudir:ask" handoff.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { type LayoutStorage, useDefaultLayout } from "react-resizable-panels";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useActiveDatasetId } from "@/core/stores/data-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { DEFAULT_GGUF_MODEL } from "@/platform/ai/models/model-manifest";
import { cn } from "@/shared/utils";
import { MoudirMark } from "../components/moudir/moudir-kit";
import { ChatComposer } from "../components/moudir-chat/chat-composer";
import { ConversationSidebar } from "../components/moudir-chat/conversation-sidebar";
import { MoudirMessageList } from "../components/moudir-chat/message-list";
import { useMoudirChatStore } from "../store/moudir-chat-store";

const SIDEBAR_PANEL_ID = "moudir-chat-sidebar";
const MAIN_PANEL_ID = "moudir-chat-main";
/** Panels present at mount — lets useDefaultLayout restore the saved split. */
const PANEL_IDS = [SIDEBAR_PANEL_ID, MAIN_PANEL_ID];
/** Storage key for the persisted sidebar/main split (v4 replaces autoSaveId). */
const LAYOUT_ID = "moudir-chat-layout";

/** SSR-safe no-op storage so useDefaultLayout never touches localStorage during prerender. */
const NOOP_STORAGE: LayoutStorage = { getItem: () => null, setItem: () => {} };

/** Humanize a GGUF file name for the header chip ("gemma-4…q4_k_m.gguf" → "gemma 4 e4b it"). */
function humanizeModel(model: string): string {
  return model
    .replace(/\.gguf$/i, "")
    .replace(/-q\d.*$/i, "")
    .replace(/[-_]/g, " ")
    .trim();
}

/** The active conversation's title — click to rename in place (store.rename). */
function ConversationTitle() {
  const activeId = useMoudirChatStore((s) => s.activeId);
  const title = useMoudirChatStore(
    (s) => s.conversations.find((c) => c.id === s.activeId)?.title ?? null,
  );
  const rename = useMoudirChatStore((s) => s.rename);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!activeId || title === null) {
    return (
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        Nouvelle conversation
      </span>
    );
  }

  function begin() {
    setDraft(title ?? "");
    setEditing(true);
  }

  function commit() {
    const next = draft.trim();
    if (activeId && next && next !== title) void rename(activeId, next);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        aria-label="Renommer la conversation"
        className="h-7 min-w-0 flex-1 text-sm"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      title="Cliquer pour renommer"
      className="min-w-0 flex-1 truncate rounded-md px-1.5 py-0.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {title}
    </button>
  );
}

export default function MoudirChatScreen() {
  const windowId = useWindowId();
  const activeDatasetId = useActiveDatasetId();

  const status = useMoudirChatStore((s) => s.status);
  const refreshConversations = useMoudirChatStore((s) => s.refreshConversations);
  const newConversation = useMoudirChatStore((s) => s.newConversation);
  const cancel = useMoudirChatStore((s) => s.cancel);
  const activeModel = useMoudirChatStore(
    (s) => s.conversations.find((c) => c.id === s.activeId)?.model ?? null,
  );

  const streaming = status === "streaming";
  const modelLabel = humanizeModel(activeModel ?? DEFAULT_GGUF_MODEL);

  // Remember the sidebar/main split across reloads. v4 dropped `autoSaveId`; the
  // supported path is useDefaultLayout + a storage impl (guarded so prerender
  // never reads localStorage).
  const layoutStorage = useMemo<LayoutStorage>(
    () =>
      typeof window !== "undefined" && window.localStorage ? window.localStorage : NOOP_STORAGE,
    [],
  );
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: LAYOUT_ID,
    panelIds: PANEL_IDS,
    storage: layoutStorage,
  });

  // Load the conversation list once; DON'T auto-open one — the empty intro shows
  // until the user sends or picks a conversation.
  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  // Ask flow shared by the "moudir:ask" window event and the menu "ask" command:
  // create a conversation if none is active, then stream the turn scoped to the
  // active dataset.
  const askFlow = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text) return;
      const store = useMoudirChatStore.getState();
      if (!store.activeId) await store.newConversation(activeDatasetId ?? null, null);
      await store.send(text, { datasetId: activeDatasetId ?? null });
    },
    [activeDatasetId],
  );

  // Cross-app handoff: other apps dispatch `moudir:ask` to delegate a question.
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt) void askFlow(prompt);
    };
    window.addEventListener("moudir:ask", handler as EventListener);
    return () => window.removeEventListener("moudir:ask", handler as EventListener);
  }, [askFlow]);

  // Menu bar bridge — the desktop's app menu drives these over the command bus.
  useAppCommands(
    "moudir-chat",
    {
      reset: () => void newConversation(),
      cancel: () => cancel(),
      ask: (payload) => {
        const prompt = (payload as { prompt?: string } | undefined)?.prompt;
        if (prompt) void askFlow(prompt);
      },
    },
    { windowId },
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id={SIDEBAR_PANEL_ID}
          defaultSize="260px"
          minSize="200px"
          maxSize="440px"
          collapsible
          collapsedSize={0}
          className="overflow-hidden"
        >
          <ConversationSidebar />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel id={MAIN_PANEL_ID} className="min-w-0">
          <div className="flex h-full min-h-0 flex-col">
            {/* Slim header — Moudir identity · editable title · IA-locale · model. */}
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
              <MoudirMark size={26} thinking={streaming} />
              <span className="shrink-0 text-sm font-semibold text-foreground">Moudir</span>
              <span aria-hidden className="shrink-0 text-muted-foreground/40">
                /
              </span>
              <ConversationTitle />
              <div className="ml-1 flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <span
                    aria-hidden
                    className={cn("size-1.5 rounded-full bg-ai", streaming && "animate-pulse")}
                  />
                  IA locale
                </Badge>
                <span className="hidden rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">
                  {modelLabel}
                </span>
              </div>
            </header>

            {/* The scrolling thread. */}
            <div className="min-h-0 flex-1">
              <MoudirMessageList />
            </div>

            {/* Composer — the only way to talk to Moudir. */}
            <div className="shrink-0 border-t border-border bg-background px-3 py-3">
              <div className="mx-auto max-w-3xl">
                <ChatComposer />
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
