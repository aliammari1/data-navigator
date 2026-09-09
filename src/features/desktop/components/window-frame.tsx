"use client";

import { Camera, Pin, PinOff } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { SnapLayoutsMenu } from "@/features/desktop/components/snap-layouts-menu";
import { SnapOverlay } from "@/features/desktop/components/snap-overlay";
import { captureSnapshot } from "@/features/desktop/components/snapshots-layer";
import { WindowTabBar } from "@/features/desktop/components/window-tabs";
import { getApp } from "@/features/desktop/core/app-registry";
import { readDrag } from "@/features/desktop/core/dnd";
import { WindowProvider } from "@/features/desktop/core/menu/window-context";
import {
  rectForZone,
  type SnapViewport,
  type SnapZoneName,
  snapForPointer,
} from "@/features/desktop/core/snap";
import type { DesktopWindow, WindowRect } from "@/features/desktop/core/types";
import {
  useDesktopActions,
  useDesktopStore,
  useDesktopWindows,
  usePinnedOnTop,
} from "@/features/desktop/store/desktop-store";

/**
 * A single free-floating desktop window — Windows 11 / Fluent styled.
 *
 * Drag from the titlebar, resize from any edge/corner. Window controls
 * (minimize / maximize / close) sit on the RIGHT like Windows, with the red
 * close affordance. The hosted screen is a native feature component (shares live
 * stores) or a route iframe for multi-route apps.
 *
 * On top of the base chrome this frame integrates the desktop suite:
 *  - live edge/corner SNAP with a translucent <SnapOverlay/> preview while
 *    dragging, committing the snapped rect on drop;
 *  - a Windows-11 "Snap layouts" flyout on maximize-button hover;
 *  - an always-on-top pin toggle and a "snapshot" (camera) affordance;
 *  - a focus shadow that elevates the top-most window;
 *  - a browser-style <WindowTabBar/> when the window belongs to a tab group,
 *    with tear-off back into a standalone window;
 *  - drop acceptance for desktop drag payloads, forwarded to the hosted screen
 *    as a `desktop:window-drop` CustomEvent.
 */

/** Reserve under the dock so snap zones never tuck a window behind the dock. */
const DOCK_INSET = 96;

/** CustomEvent name a hosted screen can listen for to react to dropped items. */
const WINDOW_DROP_EVENT = "desktop:window-drop";

export function WindowFrame({ win }: { win: DesktopWindow }) {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    toggleMaximize,
    setRect,
    togglePinOnTop,
    setWindowGroup,
  } = useDesktopActions();
  const app = getApp(win.appId);

  const pinnedOnTop = usePinnedOnTop();
  const windows = useDesktopWindows();
  const isPinned = pinnedOnTop.includes(win.id);

  // Top-most (focused) window among the visible set — drives the focus shadow.
  const topId = useMemo(() => {
    let id: string | null = null;
    let topZ = -1;
    for (const w of windows) {
      if (w.minimized) continue;
      const z = pinnedOnTop.includes(w.id) ? w.z + 100000 : w.z;
      if (z > topZ) {
        topZ = z;
        id = w.id;
      }
    }
    return id;
  }, [windows, pinnedOnTop]);
  const isTop = topId === win.id;

  // Sibling windows sharing this window's tab group, in stable open order.
  const groupTabs = useMemo(
    () => (win.groupId ? windows.filter((w) => w.groupId === win.groupId) : []),
    [windows, win.groupId],
  );

  // The Rnd DOM node — used to find the canvas (offsetParent) so we can convert
  // between viewport pixels (snap geometry / overlay) and parent-relative rects
  // (what the store stores, since Rnd bounds="parent").
  const rndRef = useRef<Rnd | null>(null);
  const [snapZone, setSnapZone] = useState<SnapZoneName | null>(null);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [isDropOver, setIsDropOver] = useState(false);
  const dropDepth = useRef(0);

  const onFocus = useCallback(() => focusWindow(win.id), [focusWindow, win.id]);

  /** Origin (top-left, viewport px) of the window canvas Rnd is bounded to. */
  const canvasOrigin = useCallback((): { left: number; top: number } => {
    // Rnd is rendered directly inside `.dn-desktop-canvas`, so its parent node is
    // the bounded canvas — exactly the coordinate space the store stores rects in.
    const parent = rndRef.current?.getParent?.() as HTMLElement | null | undefined;
    if (parent && typeof parent.getBoundingClientRect === "function") {
      const r = parent.getBoundingClientRect();
      return { left: r.left, top: r.top };
    }
    // Fallback: assume the canvas starts just below the 32px menu bar.
    return { left: 0, top: 32 };
  }, []);

  /** Live viewport box (insets reserve the menu bar + dock) for snap geometry. */
  const viewport = useCallback((): SnapViewport => {
    const origin = canvasOrigin();
    return {
      width: typeof window !== "undefined" ? window.innerWidth : 1280,
      height: typeof window !== "undefined" ? window.innerHeight : 800,
      top: origin.top,
      bottom: DOCK_INSET,
    };
  }, [canvasOrigin]);

  /** Desktop-canvas size (viewport minus the menu-bar + dock insets) — the box a
   * maximised window must fill. Passed to the store so toggleMaximize never falls
   * back to raw browser-window dimensions (which overshoot the canvas). */
  const canvasSize = useCallback(() => {
    const vp = viewport();
    const origin = canvasOrigin();
    return { w: vp.width - origin.left, h: vp.height - origin.top - (vp.bottom ?? 0) };
  }, [viewport, canvasOrigin]);

  /** Convert a viewport-space rect into the parent-relative rect Rnd/store use. */
  const toParentRect = useCallback(
    (rect: WindowRect): WindowRect => {
      const origin = canvasOrigin();
      return {
        x: rect.x - origin.left,
        y: rect.y - origin.top,
        w: rect.w,
        h: rect.h,
      };
    },
    [canvasOrigin],
  );

  /** Commit a viewport-space rect to the window (used by snap + layouts). */
  const applyViewportRect = useCallback(
    (rect: WindowRect) => {
      const parent = toParentRect(rect);
      setRect(win.id, parent);
      // Snapping means leaving the maximized state; clear any restore rect so the
      // maximize toggle starts fresh from the snapped geometry.
      if (win.maximized || win.restore) {
        useDesktopStore.setState((s) => ({
          windows: s.windows.map((w) =>
            w.id === win.id ? { ...w, maximized: false, restore: undefined } : w,
          ),
        }));
      }
    },
    [toParentRect, setRect, win.id, win.maximized, win.restore],
  );

  // --- Live snap during drag -------------------------------------------------
  const onDrag = useCallback(
    (e: unknown) => {
      // Rnd forwards the native pointer/drag event; read viewport coords from it.
      const ev = e as { clientX?: number; clientY?: number };
      if (typeof ev.clientX !== "number" || typeof ev.clientY !== "number") return;
      if (ev.clientX === 0 && ev.clientY === 0) return; // spurious final event
      setSnapZone(snapForPointer(ev.clientX, ev.clientY, viewport()));
    },
    [viewport],
  );

  const onDragStopSnap = useCallback(
    (_e: unknown, d: { x: number; y: number }) => {
      const zone = snapZone;
      setSnapZone(null);
      if (zone) {
        const rect = rectForZone(zone, viewport());
        if (rect) {
          applyViewportRect(rect);
          return;
        }
      }
      setRect(win.id, { x: d.x, y: d.y });
    },
    [snapZone, viewport, applyViewportRect, setRect, win.id],
  );

  // --- Drop acceptance (forwarded to the hosted screen) ----------------------
  const hasDesktopDrag = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "application/x-data-navigator") return true;
    }
    return false;
  }, []);

  const onContentDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!hasDesktopDrag(e)) return;
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "copy";
      } catch {
        // dropEffect may be read-only in some phases.
      }
    },
    [hasDesktopDrag],
  );

  const onContentDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!hasDesktopDrag(e)) return;
      e.preventDefault();
      dropDepth.current += 1;
      setIsDropOver(true);
    },
    [hasDesktopDrag],
  );

  const onContentDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!hasDesktopDrag(e)) return;
      dropDepth.current = Math.max(0, dropDepth.current - 1);
      if (dropDepth.current === 0) setIsDropOver(false);
    },
    [hasDesktopDrag],
  );

  const onContentDrop = useCallback(
    (e: React.DragEvent) => {
      dropDepth.current = 0;
      setIsDropOver(false);
      const payload = readDrag(e);
      if (!payload) return;
      e.preventDefault();
      focusWindow(win.id);
      // Forward to the hosted screen; it decides what a dropped dataset/column means.
      window.dispatchEvent(
        new CustomEvent(WINDOW_DROP_EVENT, {
          detail: { windowId: win.id, appId: win.appId, payload },
        }),
      );
    },
    [focusWindow, win.id, win.appId],
  );

  // --- Snapshot the window into a pinned artifact ----------------------------
  const onSnapshot = useCallback(() => {
    captureSnapshot({
      title: win.title,
      kind: "table",
      appId: win.appId,
      text: `Instantané — ${win.title}`,
      w: 300,
      h: 220,
    });
  }, [win.title, win.appId]);

  if (!app) return null;
  const Icon = app.icon;

  const showTabs = Boolean(win.groupId) && groupTabs.length > 1;

  return (
    <>
      <Rnd
        ref={rndRef}
        size={{ width: win.w, height: win.h }}
        position={{ x: win.x, y: win.y }}
        bounds="parent"
        dragHandleClassName="dn-win-titlebar"
        minWidth={420}
        minHeight={280}
        style={{ zIndex: win.z, display: win.minimized ? "none" : undefined }}
        disableDragging={win.maximized}
        enableResizing={!win.maximized}
        onMouseDown={onFocus}
        onDragStart={onFocus}
        onDrag={onDrag}
        onDragStop={onDragStopSnap}
        onResizeStop={(_e, _dir, ref, _delta, pos) =>
          setRect(win.id, {
            w: ref.offsetWidth,
            h: ref.offsetHeight,
            x: pos.x,
            y: pos.y,
          })
        }
        className="dn-window"
      >
        <div
          data-window-id={win.id}
          className={`flex h-full w-full flex-col overflow-hidden border bg-[var(--win-surface)] text-foreground transition-shadow duration-200 ${
            win.maximized ? "rounded-none" : "rounded-lg"
          }`}
          style={{
            borderColor: isTop ? "hsl(var(--win-accent) / 0.55)" : "var(--win-border)",
            boxShadow: isTop
              ? "0 32px 80px -20px rgba(20,20,40,0.62), 0 0 0 1px hsl(var(--win-accent) / 0.25)"
              : "0 14px 44px -22px rgba(20,20,40,0.4)",
          }}
        >
          {/* Windows-style titlebar: icon + title left, controls right */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: window drag handle; double-click maximises. Controls are real buttons. */}
          <div
            className="dn-win-titlebar flex h-8 shrink-0 cursor-default select-none items-center gap-2 border-b border-[var(--win-border)] bg-[var(--win-titlebar)] pl-2.5"
            onDoubleClick={() => toggleMaximize(win.id, canvasSize())}
          >
            <Icon className="size-3.5 shrink-0" style={{ color: `hsl(${app.hue} 55% 45%)` }} />
            <span className="truncate text-xs font-medium text-foreground/80">{win.title}</span>
            <div className="ml-auto flex h-full items-stretch">
              {/* Pin-on-top */}
              <button
                type="button"
                aria-label={isPinned ? "Détacher du premier plan" : "Garder au premier plan"}
                aria-pressed={isPinned}
                onClick={() => togglePinOnTop(win.id)}
                className={`grid w-9 place-items-center transition-colors hover:bg-foreground/10 ${
                  isPinned ? "text-[hsl(var(--win-accent))]" : "text-foreground/70"
                }`}
                title={isPinned ? "Détacher du premier plan" : "Garder au premier plan"}
              >
                {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
              {/* Snapshot to desktop */}
              <button
                type="button"
                aria-label="Capturer la fenêtre"
                onClick={onSnapshot}
                className="grid w-9 place-items-center text-foreground/70 transition-colors hover:bg-foreground/10"
                title="Épingler un instantané sur le bureau"
              >
                <Camera className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Réduire"
                onClick={() => minimizeWindow(win.id)}
                className="grid w-11 place-items-center text-foreground/70 transition-colors hover:bg-foreground/10"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: hover wrapper merely reveals the Snap-layouts flyout; the maximize button inside stays keyboard-operable. */}
              <div
                className="relative flex items-stretch"
                onMouseEnter={() => !win.maximized && setLayoutsOpen(true)}
                onMouseLeave={() => setLayoutsOpen(false)}
              >
                <button
                  type="button"
                  aria-label="Agrandir"
                  onClick={() => {
                    setLayoutsOpen(false);
                    toggleMaximize(win.id, canvasSize());
                  }}
                  className="grid w-11 place-items-center text-foreground/70 transition-colors hover:bg-foreground/10"
                >
                  {win.maximized ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                      <rect
                        x="2.5"
                        y="0.5"
                        width="7"
                        height="7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                      <rect
                        x="0.5"
                        y="2.5"
                        width="7"
                        height="7"
                        fill="var(--win-titlebar)"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                      <rect
                        x="1"
                        y="1"
                        width="8"
                        height="8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                    </svg>
                  )}
                </button>
                <AnimatePresence>
                  {layoutsOpen && !win.maximized ? (
                    <SnapLayoutsMenu
                      viewport={viewport()}
                      className="right-0 top-8"
                      onPick={(rect) => {
                        setLayoutsOpen(false);
                        focusWindow(win.id);
                        applyViewportRect(rect);
                      }}
                    />
                  ) : null}
                </AnimatePresence>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => closeWindow(win.id)}
                className="grid w-11 place-items-center text-foreground/70 transition-colors hover:bg-[#e81123] hover:text-white"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.1" />
                  <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.1" />
                </svg>
              </button>
            </div>
          </div>

          {/* Browser-style tab strip for grouped windows. */}
          {showTabs && win.groupId ? (
            <WindowTabBar
              groupId={win.groupId}
              activeId={win.id}
              tabs={groupTabs}
              onSelect={(id) => focusWindow(id)}
              onClose={(id) => closeWindow(id)}
              onTearOff={(id) => setWindowGroup(id, undefined)}
            />
          ) : null}

          {/* Content — reset to the app sans (desktop chrome uses the nerd font). */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone forwards desktop drags to the hosted screen; not a keyboard control. */}
          <div
            className="relative min-h-0 flex-1 overflow-auto bg-background"
            style={{
              fontFamily:
                "var(--font-sans), var(--font-data-navigator-sans), Outfit, Poppins, ui-sans-serif, system-ui, sans-serif",
            }}
            onDragOver={onContentDragOver}
            onDragEnter={onContentDragEnter}
            onDragLeave={onContentDragLeave}
            onDrop={onContentDrop}
          >
            {app.route ? (
              <iframe
                title={win.title}
                src={app.route}
                className="h-full w-full border-0"
                allow="camera; microphone; clipboard-read; clipboard-write"
              />
            ) : app.Component ? (
              <WindowProvider windowId={win.id} appId={win.appId}>
                <Suspense
                  fallback={<div className="p-6 text-sm text-muted-foreground">Chargement…</div>}
                >
                  <app.Component {...(win.props ?? {})} />
                </Suspense>
              </WindowProvider>
            ) : null}

            {/* Drop affordance overlay (non-interactive). */}
            {isDropOver ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 rounded-b-lg"
                style={{
                  background: "hsl(var(--win-accent) / 0.1)",
                  boxShadow: "inset 0 0 0 2px hsl(var(--win-accent) / 0.5)",
                }}
              />
            ) : null}
          </div>
        </div>
      </Rnd>

      {/* Live snap preview ghost while dragging this window. */}
      <SnapOverlay zone={snapZone} viewport={viewport()} />
    </>
  );
}
