"use client";

/**
 * Live multiplayer cursors + presence page sync.
 *
 * While a LAN session is connected this component:
 *  1. publishes the local pointer over awareness (`cursor` field, throttled in
 *     `@/platform/lan/lan-collab`) in CONTENT coordinates — x as a fraction of
 *     the `#main-content` width, y as px from the top of the scrollable
 *     content — so peers with different window sizes and scroll positions see
 *     the cursor anchored to the same content;
 *  2. publishes the current route into the durable `user.page` presence field
 *     on navigation, so "where is everyone" stays fresh app-wide;
 *  3. renders remote peers' cursors that are on the SAME page, with the peer's
 *     name and color, fading out after a few idle seconds.
 *  4. publishes the local text selection (trimmed) and renders each peer's
 *     current selection under their cursor flag.
 *
 * Security posture: awareness is client-asserted broadcast. Names are rendered
 * as text (never HTML) and colors are validated against a hex pattern before
 * being injected into styles. Roles shown elsewhere are server-stamped.
 */

import { MousePointer2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { readPeers, subscribePeers } from "@/platform/collab/awareness";
import type { CollabPeer } from "@/platform/collab/types";
import {
  clearPointer,
  getLANAwareness,
  getLANStatus,
  publishPointer,
  publishPresence,
  publishSelection,
  subscribeLAN,
} from "@/platform/lan/lan-collab";

const MAIN_CONTENT_SELECTOR = "#main-content";
/** Hide a remote cursor after this long without movement. */
const CURSOR_IDLE_MS = 6_000;
/** Untrusted awareness color — only plain hex may reach the style attribute. */
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
/** Delay before clearing a touch-based pointer so touches don't remain frozen. */
const TOUCH_CLEAR_DELAY_MS = 1_500;

function mainContent(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.querySelector<HTMLElement>(MAIN_CONTENT_SELECTOR) ??
    document.querySelector<HTMLElement>("main")
  );
}

// ─── Awareness peers (with cursors) as an external store ─────────────────────

let peersCache: CollabPeer[] = [];

function subscribeToPeers(onChange: () => void): () => void {
  const awareness = getLANAwareness();
  if (!awareness) return () => {};
  const update = () => {
    peersCache = readPeers(awareness).filter((p) => p.clientId !== awareness.clientID);
    onChange();
  };
  update();
  const unsubPeers = subscribePeers(awareness, update);
  const unsubLan = subscribeLAN(update);
  // Periodic pruner so idle remote cursors fade/unmount even without incoming network awareness packets
  const pruneTimer = setInterval(update, 1000);
  return () => {
    unsubPeers();
    unsubLan();
    clearInterval(pruneTimer);
  };
}

function peersSnapshot(): CollabPeer[] {
  return peersCache;
}

const EMPTY_PEERS: CollabPeer[] = [];

function emptyPeers(): CollabPeer[] {
  return EMPTY_PEERS;
}

// ─── Local pointer publishing ─────────────────────────────────────────────────

function usePointerPublisher(connected: boolean) {
  useEffect(() => {
    if (!connected) return;

    let touchClearTimer: ReturnType<typeof setTimeout> | null = null;
    let lastPointerType = "mouse";

    const clearTouchTimer = () => {
      if (touchClearTimer) {
        clearTimeout(touchClearTimer);
        touchClearTimer = null;
      }
    };

    const emitPointer = (event: PointerEvent) => {
      const container = mainContent();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      // Content coordinates: x scales with width, y rides the scroll offset —
      // a peer scrolled elsewhere still sees the cursor on the same content.
      const x = (event.clientX - rect.left) / rect.width;
      const y = event.clientY - rect.top + container.scrollTop;
      if (x < 0 || x > 1 || y < 0) return; // outside the shared surface (sidebar, panels, topbar)
      publishPointer(x, y);
    };

    const onPointerMove = (event: PointerEvent) => {
      clearTouchTimer();
      lastPointerType = event.pointerType;
      emitPointer(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      clearTouchTimer();
      lastPointerType = event.pointerType;
      emitPointer(event);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerType === "pen") {
        clearTouchTimer();
        touchClearTimer = setTimeout(() => {
          clearPointer();
          touchClearTimer = null;
        }, TOUCH_CLEAR_DELAY_MS);
      }
    };

    const onTouchEnd = () => {
      clearTouchTimer();
      touchClearTimer = setTimeout(() => {
        clearPointer();
        touchClearTimer = null;
      }, TOUCH_CLEAR_DELAY_MS);
    };

    const onScroll = () => {
      if (lastPointerType === "touch" || lastPointerType === "pen") {
        clearTouchTimer();
        touchClearTimer = setTimeout(() => {
          clearPointer();
          touchClearTimer = null;
        }, TOUCH_CLEAR_DELAY_MS);
      }
    };

    const onLeave = () => {
      clearTouchTimer();
      clearPointer();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });

    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      clearTouchTimer();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      clearPointer();
    };
  }, [connected]);
}

// ─── Presence page sync ───────────────────────────────────────────────────────

function usePresencePageSync(connected: boolean) {
  const pathname = usePathname();
  useEffect(() => {
    if (!connected || !pathname) return;
    publishPresence({ page: pathname });
  }, [connected, pathname]);
}

const SELECTION_MAX_CHARS = 140;

function useSelectionPublisher(connected: boolean) {
  useEffect(() => {
    if (!connected) return;
    const onChange = () => {
      const text = document.getSelection()?.toString().trim() ?? "";
      publishSelection(text.slice(0, SELECTION_MAX_CHARS));
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      publishSelection("");
    };
  }, [connected]);
}

// ─── Remote cursor rendering ──────────────────────────────────────────────────

function RemoteCursor({ peer, containerWidth }: { peer: CollabPeer; containerWidth: number }) {
  const cursor = peer.cursor;
  if (!cursor || typeof cursor.x !== "number" || typeof cursor.y !== "number") return null;
  if (containerWidth <= 0) return null;

  const now = Date.now();
  const age = now - cursor.at;
  if (age > CURSOR_IDLE_MS) return null;

  // Smoothly fade out during the final 1.5 seconds before idle timeout
  const FADE_WINDOW_MS = 1_500;
  const fadeStart = CURSOR_IDLE_MS - FADE_WINDOW_MS;
  const opacity = age > fadeStart ? Math.max(0, 1 - (age - fadeStart) / FADE_WINDOW_MS) : 1;

  const color = SAFE_COLOR.test(peer.color) ? peer.color : "#3b82f6";
  const selection = cursor.selection?.trim() ? cursor.selection.trim() : null;

  const clampedX = Math.max(0, Math.min(1, cursor.x));
  const posX = clampedX * containerWidth;
  const posY = cursor.y;

  // When cursor is near the right edge of viewport, align badge to the left to avoid screen overflow
  const isNearRightEdge = clampedX > 0.8;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-50 transition-[transform,opacity] duration-150 ease-out will-change-transform"
      style={{
        transform: `translate3d(${posX}px, ${posY}px, 0)`,
        opacity,
      }}
    >
      <div className="relative">
        <MousePointer2
          className="size-4.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] -translate-x-0.5 -translate-y-0.5"
          style={{ color }}
          fill={color}
          stroke="#ffffff"
          strokeWidth={1.5}
        />
        <div
          className={`absolute top-3 flex flex-col gap-0.5 ${
            isNearRightEdge ? "right-1 items-end" : "left-3 items-start"
          }`}
        >
          <span
            className="block w-max max-w-32 sm:max-w-44 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight text-white shadow-md ring-1 ring-black/10 select-none"
            style={{ backgroundColor: color }}
          >
            {peer.name || "Pair"}
          </span>
          {selection && (
            <span className="block w-max max-w-36 sm:max-w-56 truncate rounded-md bg-zinc-900/90 backdrop-blur-xs px-1.5 py-0.5 text-[10px] leading-tight text-zinc-100 shadow-sm border border-white/10 select-none">
              {selection}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CursorsOverlay({ peers }: { peers: CollabPeer[] }) {
  const pathname = usePathname();
  const [container, setContainer] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? mainContent() : null,
  );
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof document !== "undefined" ? (mainContent()?.clientWidth ?? 0) : 0,
  );

  useEffect(() => {
    const el = mainContent();
    setContainer(el);
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    };
    measure();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width || el.clientWidth;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });
    ro.observe(el);
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Only peers pointing at THIS page render; others appear via presence UI.
  const samePagePeers = peers.filter((p) => {
    const page = p.cursor?.page ?? "";
    return page === pathname || page.startsWith(`${pathname}?`);
  });
  if (!container || samePagePeers.length === 0 || containerWidth <= 0) return null;

  // Anchor the overlay to the scrollable content so cursors move with it.
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  return createPortal(
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {samePagePeers.map((peer) => (
        <RemoteCursor key={peer.clientId} peer={peer} containerWidth={containerWidth} />
      ))}
    </div>,
    container,
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function LiveCursors() {
  const connected =
    useSyncExternalStore(subscribeLAN, getLANStatus, () => "off" as const) === "connected";
  const peers = useSyncExternalStore(subscribeToPeers, peersSnapshot, emptyPeers);

  usePointerPublisher(connected);
  usePresencePageSync(connected);
  useSelectionPublisher(connected);

  if (!connected || peers.length === 0) return null;
  return <CursorsOverlay peers={peers} />;
}
