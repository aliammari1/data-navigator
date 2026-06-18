"use client";

/**
 * OPFS draft autosave for the CSV parser.
 *
 * The legacy screen kept `rawText`, parse settings and column configs only in
 * React state, so a reload or crash lost everything. This persists a small
 * draft (the raw pasted text + settings + column configs) to the Origin Private
 * File System — fully local, zero network — and restores it on mount. Big
 * columnar parse output is intentionally NOT stored (it is cheap to re-derive in
 * the worker and would bloat the draft); we persist only the inputs.
 */

import { isOpfsAvailable } from "@/platform/storage";
import type { ColConfig } from "./types";

const DRAFT_FILE = "csv-parser-draft.json";
const DRAFT_VERSION = 1;

export interface CsvDraft {
  version: number;
  rawText: string;
  delimiter: string;
  hasHeader: boolean;
  skipEmpty: boolean;
  trimWS: boolean;
  colConfigs: ColConfig[];
  datasetName: string;
  savedAt: number;
}

function canUseOpfs(): boolean {
  return (
    isOpfsAvailable() &&
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

export async function saveDraft(draft: Omit<CsvDraft, "version" | "savedAt">): Promise<void> {
  if (!canUseOpfs()) return;
  // Never persist a multi-megabyte paste — keep the draft small and fast.
  if (draft.rawText.length > 4 * 1024 * 1024) return;

  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(DRAFT_FILE, { create: true });
    const writable = await handle.createWritable();
    const payload: CsvDraft = {
      ...draft,
      version: DRAFT_VERSION,
      savedAt: Date.now(),
    };
    await writable.write(new Blob([JSON.stringify(payload)]));
    await writable.close();
  } catch {
    // Best-effort autosave; a failure here must never break the UI.
  }
}

export async function loadDraft(): Promise<CsvDraft | null> {
  if (!canUseOpfs()) return null;

  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(DRAFT_FILE); // throws if absent
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text) as CsvDraft;
    if (parsed?.version !== DRAFT_VERSION || typeof parsed.rawText !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  if (!canUseOpfs()) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(DRAFT_FILE);
  } catch {
    // Nothing to clear.
  }
}
