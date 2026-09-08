"use client";

import { useSyncExternalStore } from "react";
import {
  getActiveLANSettings,
  getLANPeers,
  getLANStatus,
  type LANStatus,
  readLANSettings,
  subscribeLAN,
} from "@/platform/lan/lan-collab";

export type LanRestingState =
  | "disabled" // no hub URL configured — resting, not an error
  | "offline" // navigator.onLine === false
  | "connecting"
  | "connected"
  | "unreachable"; // a hub is configured but the endpoint is not reachable

export interface LanStatusModel {
  state: LanRestingState;
  peerCount: number;
  /** Raw underlying status from the collab substrate. */
  raw: LANStatus;
}

function readOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function hasHubConfigured(): boolean {
  // A hub is "configured" if either an active session exists or a non-empty URL
  // is persisted in LAN settings. This distinguishes the resting "disabled"
  // state from "offline" / "unreachable" so the dock never spins against a dead
  // endpoint when no hub was ever set up.
  if (getActiveLANSettings()) return true;
  try {
    return Boolean(readLANSettings().url.trim());
  } catch {
    return false;
  }
}

function resolveState(raw: LANStatus, online: boolean): LanRestingState {
  if (!hasHubConfigured()) return "disabled";
  if (!online) return "offline";
  switch (raw) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "error":
      return "unreachable";
    default:
      // "off" with a hub configured but no live session = unreachable resting.
      return "unreachable";
  }
}

// The server can never see the client's localStorage-persisted hub config or
// `navigator.onLine`, so SSR always renders this deterministic resting state.
// `useSyncExternalStore`'s server snapshot must match that exactly, or React
// throws a hydration mismatch the moment a hub URL was saved from a prior
// session (client's first render would otherwise resolve straight to
// "unreachable" while the server rendered "disabled").
const SERVER_SNAPSHOT: LanStatusModel = { state: "disabled", peerCount: 0, raw: "off" };

// Module-level cache so `useSyncExternalStore` only re-renders on a real
// change — a freshly-allocated object on every call would make React think
// the snapshot changed on every render and loop.
let snapshotCache: LanStatusModel = SERVER_SNAPSHOT;

function computeSnapshot(): LanStatusModel {
  const raw = getLANStatus();
  return {
    state: resolveState(raw, readOnline()),
    peerCount: getLANPeers().length,
    raw,
  };
}

function getSnapshot(): LanStatusModel {
  return snapshotCache;
}

function getServerSnapshot(): LanStatusModel {
  return SERVER_SNAPSHOT;
}

function subscribe(onStoreChange: () => void): () => void {
  const recompute = () => {
    const next = computeSnapshot();
    const prev = snapshotCache;
    if (next.state !== prev.state || next.peerCount !== prev.peerCount || next.raw !== prev.raw) {
      snapshotCache = next;
      onStoreChange();
    }
  };

  const unsubscribe = subscribeLAN(recompute);
  window.addEventListener("online", recompute);
  window.addEventListener("offline", recompute);
  // Resolve immediately on subscribe: the localStorage-backed hub config and
  // `navigator.onLine` are client-only and weren't known when `snapshotCache`
  // was seeded with `SERVER_SNAPSHOT`, so this catches the real state up
  // right after hydration commits.
  recompute();

  return () => {
    unsubscribe();
    window.removeEventListener("online", recompute);
    window.removeEventListener("offline", recompute);
  };
}

/**
 * Tri-state (plus) LAN status for the dock chip.
 *
 * The raw collab status only knows off/connecting/connected/error and never
 * consults `navigator.onLine`, so the dock could spin against a dead endpoint
 * and could not tell "no hub configured" apart from "offline" or "hub
 * unreachable". This derives a resting model — `disabled` / `offline` /
 * `connecting` / `connected` / `unreachable` — and tracks the browser online
 * signal so the shell can back off when there is no network.
 */
export function useLanStatus(): LanStatusModel {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
