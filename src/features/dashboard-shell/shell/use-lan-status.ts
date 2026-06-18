"use client";

import { useEffect, useState } from "react";
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
  const [model, setModel] = useState<LanStatusModel>(() => ({
    state: resolveState(getLANStatus(), readOnline()),
    peerCount: getLANPeers().length,
    raw: getLANStatus(),
  }));

  useEffect(() => {
    const recompute = () => {
      const raw = getLANStatus();
      setModel({
        state: resolveState(raw, readOnline()),
        peerCount: getLANPeers().length,
        raw,
      });
    };

    const unsubscribe = subscribeLAN(recompute);
    window.addEventListener("online", recompute);
    window.addEventListener("offline", recompute);
    // Resolve again on mount (navigator.onLine is client-only).
    recompute();

    return () => {
      unsubscribe();
      window.removeEventListener("online", recompute);
      window.removeEventListener("offline", recompute);
    };
  }, []);

  return model;
}
