"use client";

import type { IconHandle } from "@animateicons/react";
import {
  ActivityIcon,
  AtomIcon,
  BrainIcon,
  ChartColumnIcon,
  CreditCardIcon,
  DashboardIcon,
  EyeIcon,
  FolderIcon,
  GitBranchIcon,
  LayoutGridIcon,
  MicIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  TrendingUpIcon,
  UploadIcon,
  UsersIcon,
} from "@animateicons/react/lucide";
import { AnimatePresence, motion } from "motion/react";
import { type ComponentType, type Ref, useEffect, useRef, useState } from "react";
import {
  DockJumpList,
  DockProgressRing,
  useDockMagnify,
} from "@/features/desktop/components/dock-extras";
import { DockWindowPreview } from "@/features/desktop/components/dock-window-preview";
import { type DesktopApp, getApp, PINNED_APPS } from "@/features/desktop/core/app-registry";
import type { DesktopWindow } from "@/features/desktop/core/types";
import {
  useDesktopActions,
  useDesktopWindows,
  useDockProgress,
  useRecycleBin,
} from "@/features/desktop/store/desktop-store";

/** An @animateicons icon: forwards an `IconHandle` ref + takes `size`. */
type AnimatedIcon = ComponentType<{
  size?: number;
  className?: string;
  ref?: Ref<IconHandle>;
}>;

/**
 * Per-app animated glyphs (MIT, offline, motion-based) keyed by app id. Apps
 * without a counterpart fall back to their static lucide icon — so the dock
 * stays correct for any running app while pinned/common apps animate on hover.
 */
const ANIMATED_ICONS: Record<string, AnimatedIcon> = {
  home: DashboardIcon,
  moudir: AtomIcon,
  commander: MicIcon,
  "eye-tracking": EyeIcon,
  telecom: CreditCardIcon,
  settings: SettingsIcon,
  "ai-briefing": SparklesIcon,
  "ai-analysis": BrainIcon,
  forecast: TrendingUpIcon,
  upload: UploadIcon,
  folders: FolderIcon,
  "data-browser": ChartColumnIcon,
  lineage: GitBranchIcon,
  collaboration: UsersIcon,
  "agent-canvas": ActivityIcon,
};

const ICON_PX = 24;

/**
 * How far (px) a fully-magnified tile pushes its neighbours apart on each side.
 * CSS `scale()` doesn't affect flex flow, so this margin is what actually opens
 * up the breathing room between dock items as the cursor magnifies them.
 */
const MAGNIFY_SPREAD = 38;

/** Hover-intent: wait this long on an icon before opening its preview (kills flicker on sweep). */
const PREVIEW_OPEN_DELAY = 130;
/** ...and keep the preview alive this long after the cursor leaves, for the icon → card handoff. */
const PREVIEW_CLOSE_GRACE = 260;

/**
 * One cohesive tile surface for every dock icon. No per-app hue and no
 * hand-picked hex: tiles are shadcn `card` surfaces with a `border`, lifting to
 * `accent` on hover, so the row reads as one neutral, professional family that
 * matches every other shadcn component in the app.
 */
const TILE_CLASS =
  "grid size-11 place-items-center rounded-[14px] border border-border bg-card text-muted-foreground shadow-sm transition-[background-color,color,transform,box-shadow] duration-200 group-hover:bg-accent group-hover:text-foreground group-hover:shadow-md group-active:scale-[0.96]";

/**
 * macOS-style dock — a floating, centered, frosted pill with magnify-on-hover.
 * Left: Launchpad. Middle: pinned + running apps (running shows a dot). Right:
 * the Trash (Recycle Bin), which also accepts dropped desktop items. The pill
 * and every tile use shadcn semantic tokens (`background`/`card`/`border`/
 * `accent`/`primary`/`ring`); glyphs animate on hover via `@animateicons`.
 */
export function Dock() {
  const windows = useDesktopWindows();
  const recycleBin = useRecycleBin();
  const dockProgress = useDockProgress();
  const { openApp, focusWindow, restoreWindow, toggleLauncher } = useDesktopActions();

  // macOS fisheye magnify, keyed by the direct-child index of the pill row.
  const rowRef = useRef<HTMLDivElement>(null);
  const { scaleFor, onMouseMove, onMouseLeave } = useDockMagnify(rowRef);

  // Hover handles for the two fixed glyphs (apps own their own, see DockAppButton).
  const launchRef = useRef<IconHandle>(null);
  const trashRef = useRef<IconHandle>(null);

  // Right-click jump list anchored to a dock icon.
  const [jump, setJump] = useState<{
    app: { id: string; title: string };
    anchor: { x: number; y: number };
  } | null>(null);

  const openJump = (e: React.MouseEvent, app: { id: string; title: string }) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setJump({
      app,
      anchor: { x: rect.left + rect.width / 2, y: rect.top },
    });
  };

  // appId → top (highest-z) window id for click handling
  const topWinId = new Map<string, string>();
  // appId → all windows (for preview strip)
  const windowsByApp = new Map<string, DesktopWindow[]>();
  for (const w of windows) {
    const curId = topWinId.get(w.appId);
    const curZ = curId ? (windows.find((x) => x.id === curId)?.z ?? -1) : -1;
    if (w.z > curZ) topWinId.set(w.appId, w.id);
    const list = windowsByApp.get(w.appId);
    if (list) list.push(w);
    else windowsByApp.set(w.appId, [w]);
  }
  const pinnedIds = new Set(PINNED_APPS.map((a) => a.id));
  const extras = [...topWinId.keys()]
    .filter((id) => !pinnedIds.has(id) && id !== "recycle-bin")
    .map(getApp)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const items = [...PINNED_APPS, ...extras];

  const onClick = (appId: string) => {
    const winId = topWinId.get(appId);
    if (!winId) return void openApp(appId);
    restoreWindow(winId);
    focusWindow(winId);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-dock)] flex justify-center pb-3">
      <motion.div
        ref={rowRef}
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="pointer-events-auto flex items-end gap-1.5 rounded-[22px] border border-border bg-background/80 px-3 py-2 shadow-lg backdrop-blur-xl supports-[backdrop-filter]:bg-background/70"
      >
        {/* index 0 — Launchpad */}
        <DockItem
          label="Applications"
          scale={scaleFor(0)}
          onClick={toggleLauncher}
          onHoverStart={() => launchRef.current?.startAnimation()}
          onHoverEnd={() => launchRef.current?.stopAnimation()}
        >
          <span className={TILE_CLASS}>
            <LayoutGridIcon ref={launchRef} size={ICON_PX} />
          </span>
        </DockItem>

        {/* index 1 — divider */}
        <div className="mx-1 h-8 w-px self-center bg-border" />

        {/* indices 2 .. 2 + items.length - 1 — pinned + running apps */}
        {items.map((app, i) => (
          <DockAppButton
            key={app.id}
            app={app}
            scale={scaleFor(2 + i)}
            running={topWinId.has(app.id)}
            progress={dockProgress[app.id]}
            appWindows={windowsByApp.get(app.id) ?? []}
            onClick={() => onClick(app.id)}
            onContextMenu={(e) => openJump(e, { id: app.id, title: app.title })}
          />
        ))}

        {/* divider */}
        <div className="mx-1 h-8 w-px self-center bg-border" />

        {/* last index — Trash */}
        <DockItem
          label={recycleBin.length ? `Corbeille (${recycleBin.length})` : "Corbeille"}
          scale={scaleFor(items.length + 3)}
          onClick={() => openApp("recycle-bin")}
          onHoverStart={() => trashRef.current?.startAnimation()}
          onHoverEnd={() => trashRef.current?.stopAnimation()}
        >
          <span data-drop="recycle" className={TILE_CLASS}>
            <Trash2Icon ref={trashRef} size={ICON_PX} />
          </span>
          <Dot show={topWinId.has("recycle-bin")} />
        </DockItem>
      </motion.div>

      {jump && (
        <DockJumpList app={jump.app} open anchor={jump.anchor} onClose={() => setJump(null)} />
      )}
    </div>
  );
}

/**
 * A single pinned/running app tile. Owns its own animated-icon handle so the
 * glyph animates while the whole tile is hovered (not only the small icon).
 * Shows a Windows-11-style window preview strip while hovered + running.
 */
function DockAppButton({
  app,
  scale,
  running,
  progress,
  appWindows,
  onClick,
  onContextMenu,
}: Readonly<{
  app: DesktopApp;
  scale: number;
  running: boolean;
  progress: number | null | undefined;
  appWindows: DesktopWindow[];
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}>) {
  const iconRef = useRef<IconHandle>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  // Track icon hover and preview-card hover separately so moving the mouse
  // from the icon into the preview card keeps the preview visible.
  const [isDockHovered, setIsDockHovered] = useState(false);
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const { closeWindow, focusWindow, restoreWindow } = useDesktopActions();
  const Animated = ANIMATED_ICONS[app.id];
  const StaticIcon = app.icon;

  const wantPreview = (isDockHovered || isPreviewHovered) && appWindows.length > 0;
  const [previewVisible, setPreviewVisible] = useState(false);

  // Hover-intent: a short open delay kills preview flicker while sweeping across
  // the dock, and a close grace keeps the card alive during the icon → card
  // handoff (and brief grazes of a neighbouring icon) so it never vanishes mid-reach.
  useEffect(() => {
    if (wantPreview === previewVisible) return;
    const t = setTimeout(
      () => setPreviewVisible(wantPreview),
      wantPreview ? PREVIEW_OPEN_DELAY : PREVIEW_CLOSE_GRACE,
    );
    return () => clearTimeout(t);
  }, [wantPreview, previewVisible]);

  const handleFocusWindow = (winId: string) => {
    restoreWindow(winId);
    focusWindow(winId);
  };

  return (
    <span ref={spanRef}>
      <DockItem
        label={app.title}
        scale={scale}
        onClick={onClick}
        onContextMenu={onContextMenu}
        showLabel={appWindows.length === 0}
        onHoverStart={() => {
          iconRef.current?.startAnimation();
          setIsDockHovered(true);
        }}
        onHoverEnd={() => {
          iconRef.current?.stopAnimation();
          setIsDockHovered(false);
        }}
      >
        <span className="relative grid place-items-center">
          <span className={TILE_CLASS}>
            {Animated ? (
              <Animated ref={iconRef} size={ICON_PX} />
            ) : (
              <StaticIcon className="size-6" />
            )}
          </span>
          <DockProgressRing value={progress} />
        </span>
        <Dot show={running} />
      </DockItem>
      <AnimatePresence>
        {previewVisible && appWindows.length > 0 && (
          <DockWindowPreview
            app={app}
            windows={appWindows}
            anchorRef={spanRef}
            frozen={!isDockHovered}
            onPreviewEnter={() => setIsPreviewHovered(true)}
            onPreviewLeave={() => setIsPreviewHovered(false)}
            onCloseWindow={closeWindow}
            onFocusWindow={handleFocusWindow}
          />
        )}
      </AnimatePresence>
    </span>
  );
}

function DockItem({
  label,
  onClick,
  onContextMenu,
  onHoverStart,
  onHoverEnd,
  scale = 1,
  showLabel = true,
  children,
}: Readonly<{
  label: string;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  /** Magnify scale supplied by `useDockMagnify`; 1 at rest. */
  scale?: number;
  /** Set false to suppress the label tooltip (e.g. when a preview card is shown instead). */
  showLabel?: boolean;
  children: React.ReactNode;
}>) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      // Fisheye magnify: scale lifts the icon; horizontal margins push siblings
      // apart because CSS scale() doesn't affect flex layout flow.
      animate={{
        scale,
        y: -((scale - 1) * 26),
        marginLeft: (scale - 1) * MAGNIFY_SPREAD,
        marginRight: (scale - 1) * MAGNIFY_SPREAD,
      }}
      whileTap={{ scale: scale * 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="group relative flex flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{ transformOrigin: "bottom center" }}
      title={showLabel ? label : undefined}
    >
      {children}
      {showLabel && (
        <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-[11px] font-medium text-popover-foreground opacity-0 shadow-md backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
          {label}
        </span>
      )}
    </motion.button>
  );
}

function Dot({ show }: Readonly<{ show: boolean }>) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary"
        />
      )}
    </AnimatePresence>
  );
}
