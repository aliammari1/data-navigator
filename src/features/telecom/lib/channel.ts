/**
 * F10 — BroadcastChannel State Sync
 * Native browser API — same user, multiple tabs.
 */

import type { ColumnMapping, FilterState } from "../types";

const CHANNEL_NAME = "telecom-report-v1";

export type BroadcastMsg =
  | { type: "FILTER_CHANGE"; filter: FilterState }
  | { type: "FILE_LOADED"; fileName: string; reportDate: string }
  | { type: "MAPPING_CHANGE"; mapping: ColumnMapping }
  | {
      type: "ANALYTICS_READY";
      fileName: string;
      successRate: number;
      totalTx: number;
    };

let _bc: BroadcastChannel | null = null;

function getBC(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!_bc) _bc = new BroadcastChannel(CHANNEL_NAME);
  return _bc;
}

export function broadcast(msg: BroadcastMsg): void {
  getBC()?.postMessage(msg);
}

export function onBroadcast(handler: (msg: BroadcastMsg) => void): () => void {
  const bc = getBC();
  if (!bc) return () => {};
  const listener = (e: MessageEvent) => handler(e.data as BroadcastMsg);
  bc.addEventListener("message", listener);
  return () => bc.removeEventListener("message", listener);
}
