"use client";

/**
 * Renderer-safe client for app-settings persistence.
 *
 * Settings, theme, dashboard access and persisted analytics snapshots live in
 * per-domain SQLite databases owned by the Electron MAIN process. This module
 * talks to them over the `window.electronSettings` IPC bridge (exposed by
 * electron/preload.ts, backed by electron/settings-storage.ts). The previous
 * `/api/settings` HTTP route — and its readiness-retry / WAF dance — is gone.
 *
 * Design notes:
 * - Every function no-ops / returns a null-ish default when the bridge is
 *   unavailable (SSR, `next build`, unit tests) so callers never guard themselves.
 * - Writes are fire-and-forget friendly via `void`; callers that need the
 *   persisted timestamp can await the returned promise.
 */

export type AppSettingRemote<T = unknown> = {
  value: T | null;
  updatedAt: string | null;
};

/** The shape exposed on `window.electronSettings` by the preload bridge. */
interface ElectronSettingsBridge {
  get(namespace: string, key: string): Promise<{ value: unknown; updatedAt: string | null }>;
  set(namespace: string, key: string, value: unknown): Promise<string>;
  delete(namespace: string, key: string): Promise<void>;
  export(namespace?: string): Promise<Record<string, Record<string, unknown>>>;
}

function bridge(): ElectronSettingsBridge | null {
  if (typeof window === "undefined") return null;
  return window.electronSettings ?? null;
}

/** True when the settings IPC bridge is reachable (renderer running in Electron). */
export function canUseSettingsApi(): boolean {
  return bridge() !== null;
}

/**
 * Read a single setting. Returns `{ value: null }` when the row is missing or the
 * bridge is unavailable.
 */
export async function getAppSettingRemote<T = unknown>(
  namespace: string,
  key: string,
): Promise<AppSettingRemote<T>> {
  const api = bridge();
  if (!api) return { value: null, updatedAt: null };

  const { value, updatedAt } = await api.get(namespace, key);
  return { value: (value as T | null) ?? null, updatedAt: updatedAt ?? null };
}

/**
 * Upsert a single setting. Resolves with the persisted `updatedAt`, or `null`
 * when the bridge is unavailable. Safe to `void` for fire-and-forget writes.
 */
export async function putAppSettingRemote<T = unknown>(
  namespace: string,
  key: string,
  value: T,
): Promise<string | null> {
  const api = bridge();
  if (!api) return null;
  return api.set(namespace, key, value);
}

/** Delete a single setting. No-op when the bridge is unavailable. */
export async function deleteAppSettingRemote(namespace: string, key: string): Promise<void> {
  const api = bridge();
  if (!api) return;
  await api.delete(namespace, key);
}

/**
 * Export all settings (optionally scoped to a namespace) as a nested
 * `{ [namespace]: { [key]: value } }` object. Returns `{}` when unavailable.
 */
export async function exportAppSettingsRemote(
  namespace?: string,
): Promise<Record<string, Record<string, unknown>>> {
  const api = bridge();
  if (!api) return {};
  return api.export(namespace);
}
