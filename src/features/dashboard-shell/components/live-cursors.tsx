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
 *
 * Security posture: awareness is client-asserted broadcast. Names are rendered
 * as text (never HTML) and colors are validated against a hex pattern before
 * being injected into styles. Roles shown elsewhere are server-stamped.
 */

import { MousePointer2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { readPeers, subscribePeers } from "@/platform/collab/awareness";
import type { CollabPeer } from "@/platform/collab/types";
import {
  clearPointer,
  getLANAwareness,
  getLANStatus,
  publishPointer,
  publishPresence,
  subscribeLAN,
} from "@/platform/lan/lan-collab";

const MAIN_CONTENT_SELECTOR = "#main-content";
/** Hide a remote cursor after this long without movement. */
const CURSOR_IDLE_MS = 6_000;
/** Untrusted awareness color — only plain hex may reach the style attribute. */
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

function mainContent(): HTMLElement | null {
  return document.querySelector<HTMLElement>(MAIN_CONTENT_SELECTOR);
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
  return () => {
    unsubPeers();
    unsubLan();
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

    const onPointerMove = (event: PointerEvent) => {
      const container = mainContent();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      // Content coordinates: x scales with width, y rides the scroll offset —
      // a peer scrolled elsewhere still sees the cursor on the same content.
      const x = (event.clientX - rect.left) / rect.width;
      const y = event.clientY - rect.top + container.scrollTop;
      if (x < 0 || x > 1) return; // outside the shared surface (sidebar, panels)
      publishPointer(x, y);
    };

    const onLeave = () => clearPointer();

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
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
    // Durable identity write (low frequency — once per navigation).
    publishPresence({ page: pathname });
  }, [connected, pathname]);
}

// ─── Remote cursor rendering ──────────────────────────────────────────────────

function RemoteCursor({ peer, containerWidth }: { peer: CollabPeer; containerWidth: number }) {
  const cursor = peer.cursor;
  if (!cursor || typeof cursor.x !== "number" || typeof cursor.y !== "number") return null;
  if (Date.now() - cursor.at > CURSOR_IDLE_MS) return null;
  const color = SAFE_COLOR.test(peer.color) ? peer.color : "#3b82f6";

  return (
    <div
      className="pointer-events-none absolute z-50 transition-transform duration-100 ease-linear"
      style={{ transform: `translate(${cursor.x * containerWidth}px, ${cursor.y}px)` }}
    >
      <MousePointer2 className="size-4 drop-shadow" style={{ color }} fill={color} />
      <span
        className="ml-3 block w-max max-w-40 truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white shadow"
        style={{ backgroundColor: color }}
      >
        {peer.name}
      </span>
    </div>
  );
}

function CursorsOverlay({ peers }: { peers: CollabPeer[] }) {
  const pathname = usePathname();
  const container = mainContent();
  if (!container) return null;

  // Only peers pointing at THIS page render; others appear via presence UI.
  const samePagePeers = peers.filter((p) => {
    const page = p.cursor?.page ?? "";
    return page === pathname || page.startsWith(`${pathname}?`);
  });
  if (samePagePeers.length === 0) return null;

  // Anchor the overlay to the scrollable content so cursors move with it.
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }

  return createPortal(
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {samePagePeers.map((peer) => (
        <RemoteCursor key={peer.clientId} peer={peer} containerWidth={container.clientWidth} />
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

  if (!connected || peers.length === 0) return null;
  return <CursorsOverlay peers={peers} />;
}
