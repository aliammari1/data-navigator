// FACTS (GateGuard): importers — src/app/dashboard/moudir/page.tsx (dashboard
//   <main> child) and the desktop app-registry "moudir-chat" entry (dynamic
//   import). State — binds ONLY to useMoudirChatStore (the Phase-B chat surface);
//   reads useActiveDatasetId to scope each turn's tools AND to label the header.
//   Layout — CSS grid shell: LEFT a fixed 260px <ConversationSidebar/> track
//   (toggled with $mod+\, persisted as a boolean, made `inert` while collapsed so
//   it never holds focus); RIGHT a flex-col of a slim header (Moudir identity ·
//   editable title · dataset chip · "IA locale" badge · model chip · search), the
//   scrolling <MoudirMessageList/>, and the bottom <ChatComposer/>. Under 768px
//   the sidebar becomes a <Sheet> with its OWN open state (the persisted desktop
//   boolean must never auto-open a drawer). A ResizablePanelGroup (LAYOUT_ID
//   "moudir-chat-canvas:<orientation>", panels chat+artifact, useDefaultLayout +
//   guarded localStorage) is mounted ONLY while a canvas artifact is open; under
//   1024px the canvas becomes a <Sheet> instead. The sidebar is deliberately NOT
//   a ResizablePanel: panel sizes are proportional and rescale on window resize,
//   and the reading column is already capped at max-w-3xl so widening it only
//   moves whitespace. Keys — one tinykeys map read through a latest-state ref so
//   the listeners register once: $mod+K search, $mod+\ sidebar, $mod+N new,
//   Escape cancel/close. Command bus: useAppCommands("moudir-chat",
//   {reset,cancel,ask}); window events "moudir:ask" and JUMP_TO_MESSAGE_EVENT are
//   owned here so other apps can delegate. This screen REPLACES the swarm-based
//   MoudirAssistantScreen (kept in the tree, untouched). Design: shadcn semantic
//   tokens only, French-first, the warm M mark. Offline.
"use client";

/**
 * Moudir — the assistant, as a real chat.
 *
 * A persistent, offline conversation with a sharp analyst. The sidebar lists
 * saved conversations; the thread streams the answer with first-class tool chips
 * and inline artifacts; the composer is the only way in; anything worth keeping
 * open expands into the canvas beside the thread. The heavy lifting — streaming,
 * the tool loop, persistence — lives in useMoudirChatStore and the two Electron
 * chat clients; this screen only assembles the parts and wires the menu-command
 * bus, the shortcut map, and the cross-app "moudir:ask" handoff.
 */

import { Database, PanelLeft, Search, X } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LayoutStorage, useDefaultLayout } from "react-resizable-panels";
import { toast } from "sonner";
import { tinykeys } from "tinykeys";
import { useShallow } from "zustand/react/shallow";
import { MoudirCanvas } from "@/components/moudir-chat/moudir-canvas";
import {
  humanizeModel,
  isEditableTarget,
  MOD_GLYPH,
  useMediaQuery,
  usePersistentState,
} from "@/components/moudir-chat/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useActiveDatasetId, useDataStore } from "@/core/stores/data-store";
import { useAppCommands } from "@/features/desktop/core/menu/app-commands";
import { useWindowId } from "@/features/desktop/core/menu/window-context";
import { DEFAULT_GGUF_MODEL } from "@/platform/ai/models/model-manifest";
import { cn } from "@/shared/utils";
import { MoudirMark } from "../components/moudir/moudir-kit";
import { ChatComposer } from "../components/moudir-chat/chat-composer";
import { ChatFilterBreadcrumbs } from "../components/moudir-chat/chat-filter-breadcrumbs";
import {
  ChatSearchPalette,
  JUMP_TO_MESSAGE_EVENT,
  type JumpToMessageDetail,
} from "../components/moudir-chat/chat-search-palette";
import { ConversationSidebar } from "../components/moudir-chat/conversation-sidebar";
import { MoudirMessageList } from "../components/moudir-chat/message-list";
import { generateExecutivePresentation } from "../core/presentation/deck-generator";
import { loadMoudirSystemPrompt, useMoudirChatStore } from "../store/moudir-chat-store";

/* ── Layout constants ─────────────────────────────────────────────────────── */

/** The two panels of the canvas split. The sidebar is NOT one of them. */
const CHAT_PANEL_ID = "moudir-chat-thread";
const ARTIFACT_PANEL_ID = "moudir-chat-artifact";
const PANEL_IDS = [CHAT_PANEL_ID, ARTIFACT_PANEL_ID];

/**
 * Storage key prefix for the persisted thread/canvas split (v4 replaces
 * autoSaveId). The orientation is appended: a horizontal split stores a WIDTH
 * and a vertical one stores a HEIGHT, so they must not share an entry.
 */
const LAYOUT_ID = "moudir-chat-canvas";

/** SSR-safe no-op storage so useDefaultLayout never touches localStorage during prerender. */
const NOOP_STORAGE: LayoutStorage = { getItem: () => null, setItem: () => {} };

const SIDEBAR_WIDTH = "260px";
const SIDEBAR_OPEN_KEY = "moudir-chat:sidebar-open";
const CANVAS_ORIENTATION_KEY = "moudir-chat:canvas-orientation";

/** Collapsed-sidebar guard: `inert` removes it from focus order entirely.
 *  React 19 types `inert` as a real boolean attribute (React 18 required the
 *  empty-string form), and this app is pinned to React 19. */
const INERT_ATTR = { inert: true } as const;

/* ── Header: editable conversation title ──────────────────────────────────── */

/** The active conversation's title — click to rename in place (store.rename). */
function ConversationTitle() {
  const activeId = useMoudirChatStore((s) => s.activeId);
  const title = useMoudirChatStore(
    (s) => s.conversations.find((c) => c.id === s.activeId)?.title ?? null,
  );
  const rename = useMoudirChatStore((s) => s.rename);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Escape unmounts the Input, which fires onBlur. Without this flag the blur
  // handler would commit the very draft the user just tried to throw away.
  const cancelledRef = useRef(false);

  const begin = useCallback(() => {
    setDraft(title ?? "");
    cancelledRef.current = false;
    setEditing(true);
  }, [title]);

  const commit = useCallback(() => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditing(false);
      return;
    }
    const next = draft.trim();
    if (activeId && next && next !== title) void rename(activeId, next);
    setEditing(false);
  }, [activeId, draft, rename, title]);

  if (!activeId || title === null) {
    return (
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        Nouvelle conversation
      </span>
    );
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        maxLength={120}
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
            // Stop the global Escape binding from also cancelling the turn.
            e.stopPropagation();
            cancelledRef.current = true;
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

/* ── Header: what data this turn can see ──────────────────────────────────── */

/**
 * Every turn is scoped to the active dataset, so the header has to say which one.
 * When nothing is loaded that is itself the most important fact on screen.
 */
function DatasetChip({ datasetId }: { datasetId: string | null }) {
  if (!datasetId) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-dashed text-muted-foreground"
        title="Moudir répondra sans données tant qu'aucun jeu n'est actif"
      >
        <Database aria-hidden className="size-3" />
        Aucun jeu de données
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="max-w-[16ch] gap-1.5" title={datasetId}>
      <Database aria-hidden className="size-3 shrink-0" />
      {/* TODO: render the dataset's display name once data-store exposes it. */}
      <span className="truncate">{datasetId}</span>
    </Badge>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────────── */

export default function MoudirChatScreen() {
  const windowId = useWindowId();
  const activeDatasetId = useActiveDatasetId();

  const status = useMoudirChatStore((s) => s.status);
  const refreshConversations = useMoudirChatStore((s) => s.refreshConversations);
  const newConversation = useMoudirChatStore((s) => s.newConversation);
  const cancel = useMoudirChatStore((s) => s.cancel);
  const retryLast = useMoudirChatStore((s) => s.retryLast);
  const openConversation = useMoudirChatStore((s) => s.openConversation);
  const canvasArtifact = useMoudirChatStore((s) => s.canvasArtifact);
  const closeCanvas = useMoudirChatStore((s) => s.closeCanvas);
  const lastNotice = useMoudirChatStore((s) => s.lastNotice);
  const notify = useMoudirChatStore((s) => s.notify);

  // Narrow projection: the full conversations array changes on every streamed
  // token that touches updatedAt, which would re-render this whole screen
  // mid-stream. The palette only needs id + title.
  //
  // `useShallow` compares only ONE level deep, so an array of freshly-created
  // `{ id, title }` objects is never shallow-equal — the snapshot changed on
  // every render, which produced "getSnapshot should be cached" and then
  // "Maximum update depth exceeded". Subscribe to arrays of primitives instead
  // and rebuild the objects in a memo keyed on those primitives.
  const conversationIds = useMoudirChatStore(useShallow((s) => s.conversations.map((c) => c.id)));
  const conversationTitles = useMoudirChatStore(
    useShallow((s) => s.conversations.map((c) => c.title)),
  );
  const conversations = useMemo(
    () => conversationIds.map((id, i) => ({ id, title: conversationTitles[i] })),
    [conversationIds, conversationTitles],
  );

  const activeModel = useMoudirChatStore(
    (s) => s.conversations.find((c) => c.id === s.activeId)?.model ?? null,
  );

  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  /** Desktop: the grid track's collapsed state, persisted. */
  const [sidebarOpen, setSidebarOpen] = usePersistentState<boolean>(SIDEBAR_OPEN_KEY, true);
  /**
   * Narrow: a separate, always-starts-closed drawer. Reusing the persisted
   * desktop boolean here would pop a drawer open on every cold start.
   */
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [canvasOrientation, setCanvasOrientation] = usePersistentState<"horizontal" | "vertical">(
    CANVAS_ORIENTATION_KEY,
    "horizontal",
  );

  // <768px: the sidebar is a Sheet, never a track. <1024px: so is the canvas.
  const isNarrow = useMediaQuery("(max-width: 767px)");
  const isCompact = useMediaQuery("(max-width: 1023px)");

  const streaming = status === "streaming";
  const busy = streaming || status === "loading-model";
  const modelKnown = activeModel !== null;
  const modelLabel = humanizeModel(activeModel ?? DEFAULT_GGUF_MODEL);
  const navOpen = isNarrow ? navDrawerOpen : sidebarOpen;
  const vertical = canvasOrientation === "vertical";

  // Leaving narrow width must not leave an orphaned drawer behind.
  useEffect(() => {
    if (!isNarrow && navDrawerOpen) setNavDrawerOpen(false);
  }, [isNarrow, navDrawerOpen]);

  // On a portrait display a right-hand canvas is the wrong split. Seed the
  // preference once from the window shape; the user's drag wins after that.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage?.getItem(CANVAS_ORIENTATION_KEY) !== null) return;
    if (window.innerHeight > window.innerWidth) setCanvasOrientation("vertical");
  }, [setCanvasOrientation]);

  // Remember the thread/canvas split across reloads. v4 dropped `autoSaveId`;
  // the supported path is useDefaultLayout + a storage impl (guarded so
  // prerender never reads localStorage). The sidebar is not part of this — it
  // persists as a single boolean instead.
  const layoutStorage = useMemo<LayoutStorage>(
    () =>
      typeof window !== "undefined" && window.localStorage ? window.localStorage : NOOP_STORAGE,
    [],
  );

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    // Orientation-scoped: a stored width must never be restored as a height.
    id: `${LAYOUT_ID}:${canvasOrientation}`,
    panelIds: PANEL_IDS,
    storage: layoutStorage,
  });

  // Load the conversation list and prime the system-prompt cache. DON'T
  // auto-open a conversation — the empty intro shows until the user acts.
  useEffect(() => {
    void refreshConversations();
    void loadMoudirSystemPrompt();
  }, [refreshConversations]);

  // Ask flow shared by the "moudir:ask" window event and the menu "ask" command:
  // create a conversation if none is active, then stream the turn scoped to the
  // active dataset. State is re-read after the await — the pre-await snapshot
  // predates the new conversation.
  const askFlow = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text) return;
      const current = useMoudirChatStore.getState().status;
      if (current === "streaming" || current === "loading-model") return;

      if (!useMoudirChatStore.getState().activeId) {
        await useMoudirChatStore.getState().newConversation(activeDatasetId ?? null, null);
      }
      await useMoudirChatStore.getState().send(text, { datasetId: activeDatasetId ?? null });
    },
    [activeDatasetId],
  );

  const startNewConversation = useCallback(() => {
    void newConversation(activeDatasetId ?? null, null);
  }, [activeDatasetId, newConversation]);

  const toggleNav = useCallback(() => {
    if (isNarrow) setNavDrawerOpen((open) => !open);
    else setSidebarOpen(!sidebarOpen);
  }, [isNarrow, setSidebarOpen, sidebarOpen]);

  // Cross-app handoff: other apps dispatch `moudir:ask` to delegate a question.
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt) void askFlow(prompt);
    };
    window.addEventListener("moudir:ask", handler as EventListener);
    return () => window.removeEventListener("moudir:ask", handler as EventListener);
  }, [askFlow]);

  // Search palette → open the conversation AND hand the target message to the
  // list, which consumes pendingScrollToMessageId and scrolls to it. If the
  // store refused (a turn is in flight) it sets lastNotice and activeId is
  // unchanged — don't stage a scroll target for a conversation we didn't open.
  useEffect(() => {
    const onJump = (event: Event) => {
      const detail = (event as CustomEvent<JumpToMessageDetail>).detail;
      if (!detail) return;
      void (async () => {
        await openConversation(detail.conversationId);
        if (useMoudirChatStore.getState().activeId !== detail.conversationId) return;
        useMoudirChatStore.setState({
          // DB ids are numeric; DOM scroll anchors are strings.
          pendingScrollToMessageId: detail.messageId == null ? null : String(detail.messageId),
        });
      })();
    };
    window.addEventListener(JUMP_TO_MESSAGE_EVENT, onJump as EventListener);
    return () => window.removeEventListener(JUMP_TO_MESSAGE_EVENT, onJump as EventListener);
  }, [openConversation]);

  /**
   * Latest render's values for the shortcut map. Without this the tinykeys
   * listeners would tear down and re-register every time the sidebar or palette
   * toggled, since those values would have to be effect dependencies.
   */
  const latest = useRef({ searchPaletteOpen, navDrawerOpen, toggleNav, startNewConversation });
  latest.current = { searchPaletteOpen, navDrawerOpen, toggleNav, startNewConversation };

  // One shortcut map for the whole screen, registered once. tinykeys normalizes
  // $mod across platforms; the editable guard keeps typing from firing commands.
  useEffect(() => {
    const guarded = (fn: () => void) => (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      fn();
    };

    return tinykeys(window, {
      "$mod+KeyK": (event) => {
        // Deliberately NOT guarded: the palette must open from the composer too.
        event.preventDefault();
        setSearchPaletteOpen((open) => !open);
      },
      "$mod+Backslash": guarded(() => latest.current.toggleNav()),
      "$mod+KeyN": guarded(() => latest.current.startNewConversation()),
      Escape: (event) => {
        // Overlays own their own Escape; don't cancel a turn from behind one.
        if (latest.current.searchPaletteOpen || latest.current.navDrawerOpen) return;
        const state = useMoudirChatStore.getState();
        if (state.status === "streaming" || state.status === "loading-model") {
          event.preventDefault();
          cancel();
        } else if (state.canvasArtifact) {
          event.preventDefault();
          closeCanvas();
        }
      },
    });
  }, [cancel, closeCanvas]);

  // Menu bar bridge — the desktop's app menu drives these over the command bus.
  useAppCommands(
    "moudir-chat",
    {
      reset: () => startNewConversation(),
      cancel: () => cancel(),
      ask: (payload) => {
        const prompt = (payload as { prompt?: string } | undefined)?.prompt;
        if (prompt) void askFlow(prompt);
      },
      "export-deck": async () => {
        const msgs = useMoudirChatStore.getState().messages;
        const activeId = useMoudirChatStore.getState().activeId;
        const conv = useMoudirChatStore.getState().conversations.find((c) => c.id === activeId);
        const dsId = useDataStore.getState().activeDatasetId;
        const ds = useDataStore.getState().datasets.find((d) => d.id === dsId);

        toast("Génération de la présentation en cours…", {
          description:
            "Deck exécutif 16:9 au standard McKinsey / BCG avec indicateurs et conclusions.",
        });
        try {
          await generateExecutivePresentation(msgs, {
            title: conv?.title || "Rapport Exécutif Moudir",
            datasetName: ds?.name || ds?.tableName,
            rowCount: ds?.rowCount,
          });
          toast.success("Présentation exportée avec succès (.html)");
        } catch (e) {
          console.error(e);
          toast.error("Échec de la génération de la présentation");
        }
      },
    },
    { windowId },
  );

  /* ── Pieces ─────────────────────────────────────────────────────────────── */

  const header = (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleNav}
        aria-label={navOpen ? "Masquer les conversations" : "Afficher les conversations"}
        aria-expanded={navOpen}
        title={`Conversations (${MOD_GLYPH}\\)`}
        className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <PanelLeft aria-hidden className="size-4" />
      </Button>

      <MoudirMark size={26} thinking={streaming} />
      <span className="shrink-0 text-sm font-semibold text-foreground">Moudir</span>
      <span aria-hidden className="shrink-0 text-muted-foreground/40">
        /
      </span>
      <ConversationTitle />

      <div className="ml-1 flex shrink-0 items-center gap-2">
        <DatasetChip datasetId={activeDatasetId ?? null} />

        <Badge variant="secondary" className="gap-1.5">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full bg-ai", streaming && "animate-pulse")}
          />
          IA locale
        </Badge>

        <span
          title={modelKnown ? undefined : "Modèle par défaut — aucune conversation active"}
          className={cn(
            "hidden rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] sm:inline",
            modelKnown ? "text-muted-foreground" : "italic text-muted-foreground/60",
          )}
        >
          {modelLabel}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSearchPaletteOpen(true)}
          aria-label="Rechercher dans les conversations"
          title={`Rechercher (${MOD_GLYPH}K)`}
          className="ml-1 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search aria-hidden className="size-3.5" />
          <span className="hidden sm:inline">Rechercher</span>
          <kbd className="hidden rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground sm:inline">
            {MOD_GLYPH}K
          </kbd>
        </Button>
      </div>
    </header>
  );

  /** Screen-reader + at-a-glance run state. The animated dot alone says nothing. */
  const statusLine = (
    <div aria-live="polite" className="sr-only">
      {status === "loading-model"
        ? "Chargement du modèle."
        : streaming
          ? "Moudir rédige une réponse."
          : null}
    </div>
  );

  /** Transient store notices (e.g. a blocked conversation switch mid-stream). */
  const notice = lastNotice ? (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
    >
      <span className="min-w-0 flex-1">{lastNotice}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => notify(null)}
        aria-label="Masquer le message"
        className="size-5"
      >
        <X aria-hidden className="size-3" />
      </Button>
    </div>
  ) : null;

  const interruption =
    status === "error" ? (
      <div
        role="alert"
        className="flex shrink-0 items-center gap-2 border-t border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
      >
        Réponse interrompue.
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          // retryLast() re-runs the same user turn and drops the stale KV
          // session; sending a "reprends" prompt would just be a new question.
          onClick={() => void retryLast()}
        >
          Reprendre
        </Button>
      </div>
    ) : status === "loading-model" ? (
      <div className="shrink-0 border-t border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        Chargement du modèle…
      </div>
    ) : null;

  const thread = (
    <div className="flex h-full min-h-0 flex-col">
      <ChatFilterBreadcrumbs />
      <div className="min-h-0 flex-1">
        <MoudirMessageList />
      </div>
      {interruption}
      <div className="shrink-0 border-t border-border bg-background px-3 py-3">
        <div className="mx-auto max-w-3xl">
          <ChatComposer />
        </div>
      </div>
    </div>
  );

  /**
   * The canvas earns a draggable separator: chart size vs reading width is a
   * real trade the user wants to make. Mounted only while an artifact is open,
   * so the common case has no separator and no layout math at all. Narrowed on
   * `canvasArtifact` directly rather than a derived boolean so the panel and the
   * Sheet both type-check.
   */
  const main =
    canvasArtifact !== null && !isCompact ? (
      <ResizablePanelGroup
        orientation={canvasOrientation}
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          id={CHAT_PANEL_ID}
          minSize={vertical ? "240px" : "360px"}
          className="min-w-0"
        >
          {thread}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          id={ARTIFACT_PANEL_ID}
          defaultSize="42%"
          minSize={vertical ? "200px" : "320px"}
          className="min-w-0"
        >
          <MoudirCanvas artifact={canvasArtifact} onClose={closeCanvas} />
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      <div className="min-h-0 flex-1">{thread}</div>
    );

  /* ── Shell ──────────────────────────────────────────────────────────────── */

  return (
    <div
      className="grid h-full overflow-hidden bg-background text-foreground transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none"
      style={
        {
          gridTemplateColumns: isNarrow ? "1fr" : `${sidebarOpen ? SIDEBAR_WIDTH : "0px"} 1fr`,
        } as CSSProperties
      }
    >
      {/* A fixed track, not a panel: it must stay 260px when the window resizes,
          and the reading column is capped anyway so widening it buys nothing.
          `inert` while collapsed keeps zero-width content out of the tab order —
          aria-hidden alone would still let you Tab into invisible buttons. */}
      {!isNarrow ? (
        <div
          className="min-w-0 overflow-hidden border-r border-border"
          {...(sidebarOpen ? {} : INERT_ATTR)}
        >
          <ConversationSidebar />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col overflow-hidden">
        {header}
        {notice}
        {statusLine}
        {main}
      </div>

      {/* Narrow: the conversation list is a drawer with its own state. */}
      {isNarrow ? (
        <Sheet open={navDrawerOpen} onOpenChange={setNavDrawerOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetTitle className="sr-only">Conversations</SheetTitle>
            <ConversationSidebar />
          </SheetContent>
        </Sheet>
      ) : null}

      {/* Compact: the canvas overlays instead of splitting — there isn't room
          for two readable columns. */}
      {canvasArtifact !== null && isCompact ? (
        <Sheet open onOpenChange={(open) => !open && closeCanvas()}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
            <SheetTitle className="sr-only">{canvasArtifact.title}</SheetTitle>
            <MoudirCanvas artifact={canvasArtifact} onClose={closeCanvas} />
          </SheetContent>
        </Sheet>
      ) : null}

      <ChatSearchPalette
        open={searchPaletteOpen}
        onOpenChange={setSearchPaletteOpen}
        conversations={conversations}
      />
    </div>
  );
}
