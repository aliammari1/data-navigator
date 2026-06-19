/**
 * OS-level notification bridge (fully offline).
 *
 * A real monitor must alert the operator even when the app window is in the
 * background. The previous implementation only pushed into an in-app Zustand
 * array. Here we use the standard Web `Notification` API, which works in both
 * the Electron renderer and a plain browser build with no network.
 *
 * If an Electron main-process notification IPC channel is exposed in future
 * (see `electron/preload.ts`), prefer it via `window.electronNotify` — this
 * bridge auto-detects and uses it when present.
 */

import type { AlertSeverity } from "../store/monitor-store";

type ElectronNotifyApi = {
  notify: (title: string, body: string) => void;
};

type WindowWithElectronNotify = Window & {
  electronNotify?: ElectronNotifyApi;
};

function getElectronNotify(): ElectronNotifyApi | null {
  if (typeof window === "undefined") return null;
  return (window as WindowWithElectronNotify).electronNotify ?? null;
}

/** Whether the browser exposes the Notification API at all. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export function notificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

/** Request OS notification permission. Resolves with the resulting state. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return "denied";
  }
}

const SEVERITY_PREFIX: Record<AlertSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🔴",
};

/**
 * Surface an OS notification. Prefers an Electron main-process channel when
 * available, otherwise falls back to the Web Notification API. No-ops cleanly
 * when permission has not been granted.
 */
export function notify(title: string, body: string, severity: AlertSeverity = "info"): void {
  const prefixed = `${SEVERITY_PREFIX[severity]} ${title}`;

  const electron = getElectronNotify();
  if (electron) {
    electron.notify(prefixed, body);
    return;
  }

  if (!notificationsSupported() || Notification.permission !== "granted") {
    return;
  }

  try {
    new Notification(prefixed, {
      body,
      tag: "channel-monitor",
      silent: severity !== "critical",
    });
  } catch {
    // Notification construction can throw on some platforms — ignore.
  }
}
