/**
 * Offline backup / restore for app settings.
 *
 * The Zustand settings store persists through `createDrizzleStorage` into the
 * durable `app_setting` table (namespace `settings`) over the Electron settings
 * IPC bridge. There is an `exportAppSettingsRemote()` helper but no UI, so a
 * profile wipe loses every preference even though SQLite holds it.
 *
 * This module wires a genuine, fully-offline JSON backup/restore:
 *  - `exportSettings()` reads the real durable rows and serialises them.
 *  - `restoreSettings()` validates an uploaded file with zod (never trust the
 *    file), writes the rows back through the same bridge, and asks the store to
 *    rehydrate so the running UI reflects the restored values.
 *
 * The persist middleware stores its blob under the localStorage/drizzle key
 * `data-navigator-settings` as `{ state, version }`, so the backup operates at
 * that whole-blob granularity — exactly what the store reads back on rehydrate.
 */

import { useSettingsStore } from "@/core/stores/settings-store";
import { exportAppSettingsRemote, putAppSettingRemote } from "@/platform/settings/settings-client";
import { STORAGE_KEYS } from "@/platform/storage/storage-keys";
import { SettingsBackupSchema, SettingsExportEnvelopeSchema } from "./settings-schema";

const SETTINGS_NAMESPACE = "settings";
const PERSIST_KEY = STORAGE_KEYS.settings;

export interface SettingsBackupFile {
  /** Discriminator so a stray JSON file can be rejected early. */
  kind: "data-navigator-settings-backup";
  version: number;
  exportedAt: string;
  /** The full `settings` namespace as `{ [key]: value }`. */
  settings: Record<string, unknown>;
}

const BACKUP_VERSION = 1;

/**
 * Read all durable settings rows and return a self-describing backup object.
 * Falls back to the in-memory persist blob when the durable API is unavailable
 * (e.g. SSR / no network layer) so export still produces a usable file offline.
 */
export async function buildSettingsBackup(): Promise<SettingsBackupFile> {
  let settings: Record<string, unknown> = {};

  try {
    const exported = await exportAppSettingsRemote(SETTINGS_NAMESPACE);
    // Shape: { settings: { [key]: value } } — unwrap the namespace.
    const parsed = SettingsExportEnvelopeSchema.safeParse(exported);
    if (parsed.success && parsed.data.settings) {
      settings = parsed.data.settings;
    } else if (exported[SETTINGS_NAMESPACE]) {
      settings = exported[SETTINGS_NAMESPACE];
    }
  } catch {
    settings = {};
  }

  // Fallback / safety net: include the current in-memory blob if the durable
  // read returned nothing (first run before the one-time mirror, etc.).
  if (Object.keys(settings).length === 0) {
    settings = {
      [PERSIST_KEY]: {
        state: useSettingsStore.getState(),
        version: 0,
      },
    };
  }

  return {
    kind: "data-navigator-settings-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
  };
}

/** Trigger a browser download of the current settings as JSON. */
export async function downloadSettingsBackup(): Promise<void> {
  const backup = await buildSettingsBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `data-navigator-settings-${stamp}.json`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type RestoreResult = { ok: true; restoredKeys: number } | { ok: false; error: string };

/**
 * Validate + restore a settings backup file. Returns a structured result instead
 * of throwing so the caller can surface a toast cleanly.
 */
export async function restoreSettingsFromFile(file: File): Promise<RestoreResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }

  const fileShape = SettingsExportEnvelopeSchema.safeParse(raw);
  if (!fileShape.success || !fileShape.data.settings) {
    return { ok: false, error: "Not a recognised settings backup." };
  }

  const settings = fileShape.data.settings;
  let restoredKeys = 0;

  for (const [key, value] of Object.entries(settings)) {
    // Each key is one durable row. For the main persist blob, validate the
    // inner `state` against the backup schema before writing it back so a
    // tampered file cannot inject garbage into the store.
    if (key === PERSIST_KEY) {
      const blob = value as { state?: unknown; version?: unknown };
      const stateCheck = SettingsBackupSchema.safeParse(blob?.state ?? {});
      if (!stateCheck.success) {
        return { ok: false, error: "Settings payload failed validation." };
      }
    }

    try {
      await putAppSettingRemote(SETTINGS_NAMESPACE, key, value);
      restoredKeys += 1;
    } catch {
      return { ok: false, error: `Failed to write setting "${key}".` };
    }
  }

  if (restoredKeys === 0) {
    return { ok: false, error: "Backup contained no settings." };
  }

  // Pull the restored values into the running store.
  try {
    await useSettingsStore.persist.rehydrate();
  } catch {
    // Non-fatal: the durable rows are written; a reload will pick them up.
  }

  return { ok: true, restoredKeys };
}
