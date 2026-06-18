/**
 * Renderer-safe client for the app-settings persistence bridge.
 *
 * The Next.js route `/api/settings/[namespace]/[key]` (and `/api/settings/export`)
 * is the universal bridge between the renderer and the Node-side drizzle +
 * better-sqlite3 `app_setting` table. It works in both the web build and the
 * Electron renderer (which loads the same Next app), so structured client state
 * can be persisted durably without reaching for Electron-only IPC.
 *
 * This module centralises the fetch glue that previously lived inline in
 * voice-settings.ts so every persisted store talks to drizzle the same way.
 *
 * Design notes:
 * - All functions are no-ops / return null when `fetch` is unavailable (SSR,
 *   tests without a network layer) so callers never have to guard themselves.
 * - Writes are intentionally fire-and-forget friendly via `void`; callers that
 *   need confirmation can await the returned promise.
 */

const SETTINGS_API_BASE = "/api/settings";

export type AppSettingRemote<T = unknown> = {
  value: T | null;
  updatedAt: string | null;
};

/** True when we can reach the settings API (browser/renderer with fetch). */
export function canUseSettingsApi(): boolean {
  return typeof window !== "undefined" && typeof fetch !== "undefined";
}

function settingPath(namespace: string, key: string): string {
  return `${SETTINGS_API_BASE}/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
}

/** Cold-restore readiness retry: the durable read is the one path that needs the
 * local Next server already listening. On a fresh-profile / cold boot the server
 * may not be up the instant hydration fires, so a connection-refused `fetch` is
 * retried with bounded backoff instead of resolving to defaults. Only NETWORK
 * errors are retried — an HTTP response (incl. 404/5xx) is returned as-is. */
const READINESS_RETRIES = 4;
const READINESS_BACKOFF_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithReadinessRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= READINESS_RETRIES; attempt += 1) {
    try {
      return await fetch(url, { method: "GET" });
    } catch (error) {
      // TypeError === network/connection-refused (server not listening yet).
      lastError = error;
      if (attempt < READINESS_RETRIES) await delay(READINESS_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw lastError;
}

/**
 * Read a single setting from drizzle. Returns `{ value: null }` when the row is
 * missing (404) or the API is unavailable. Throws only on unexpected HTTP
 * errors so callers can distinguish "absent" from "broken".
 */
export async function getAppSettingRemote<T = unknown>(
  namespace: string,
  key: string,
): Promise<AppSettingRemote<T>> {
  if (!canUseSettingsApi()) return { value: null, updatedAt: null };

  const response = await fetchWithReadinessRetry(settingPath(namespace, key));

  if (response.status === 404) return { value: null, updatedAt: null };

  if (!response.ok) {
    throw new Error(`Failed to load setting ${namespace}/${key}: ${response.status}`);
  }

  const payload = (await response.json()) as { value?: T | null; updatedAt?: string };
  return { value: payload.value ?? null, updatedAt: payload.updatedAt ?? null };
}

/**
 * Upsert a single setting into drizzle. Resolves with the persisted record's
 * updatedAt, or null when the API is unavailable. Safe to `void` for
 * fire-and-forget writes.
 */
export async function putAppSettingRemote<T = unknown>(
  namespace: string,
  key: string,
  value: T,
): Promise<string | null> {
  if (!canUseSettingsApi()) return null;

  const response = await fetch(settingPath(namespace, key), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    throw new Error(`Failed to persist setting ${namespace}/${key}: ${response.status}`);
  }

  const payload = (await response.json()) as { updatedAt?: string };
  return payload.updatedAt ?? null;
}

/** Delete a single setting from drizzle. No-op when the API is unavailable. */
export async function deleteAppSettingRemote(namespace: string, key: string): Promise<void> {
  if (!canUseSettingsApi()) return;

  const response = await fetch(settingPath(namespace, key), { method: "DELETE" });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete setting ${namespace}/${key}: ${response.status}`);
  }
}

/**
 * Export all settings (optionally scoped to a namespace) as a nested
 * `{ [namespace]: { [key]: value } }` object. Returns `{}` when unavailable.
 */
export async function exportAppSettingsRemote(
  namespace?: string,
): Promise<Record<string, Record<string, unknown>>> {
  if (!canUseSettingsApi()) return {};

  const url = namespace
    ? `${SETTINGS_API_BASE}/export?namespace=${encodeURIComponent(namespace)}`
    : `${SETTINGS_API_BASE}/export`;

  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Failed to export settings: ${response.status}`);
  }

  const payload = (await response.json()) as {
    settings?: Record<string, Record<string, unknown>>;
  };
  return payload.settings ?? {};
}
