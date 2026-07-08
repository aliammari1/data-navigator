/**
 * OS/browser Notification permission — shared by every feature that wants to
 * alert the user outside the app window (telecom) and by
 * Settings > Notifications, which is the single place users enable it.
 *
 * Pure Web Notification API wrapper (works in both the Electron renderer and a
 * plain browser build, no network).
 */

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

/** Whether the browser exposes the Notification API at all. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

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
