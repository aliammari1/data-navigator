/**
 * Settings-gated notification sink.
 *
 * The `notifications.*` toggles in the Settings store were decorative — nothing
 * read them, so turning "File uploads" off still showed upload toasts. This
 * module is the single gate every notifiable event should route through: it
 * reads the live `notifications` slice imperatively (so non-React callers — the
 * upload pipeline, query runner, error boundary — can use it too) and only
 * surfaces a `sonner` toast when the matching category is enabled.
 *
 * Categories map 1:1 to `NotificationSettings`:
 *   uploads | queries | errors | collaboration | digest
 *
 * Zero network — pure in-memory store read + local toast.
 */

import { toast } from "sonner";
import { useSettingsStore } from "@/core/stores/settings-store";

export type NotificationCategory = "uploads" | "queries" | "errors" | "collaboration" | "digest";

type ToastKind = "success" | "error" | "info" | "warning";

interface NotifyOptions {
  description?: string;
  /** Force the toast even if the category is disabled (e.g. fatal errors). */
  force?: boolean;
  kind?: ToastKind;
}

/** True when the given notification category is currently enabled. */
export function isNotificationEnabled(category: NotificationCategory): boolean {
  return useSettingsStore.getState().notifications[category] === true;
}

/**
 * Emit a toast for `category` iff that category is enabled (or `force`d).
 * Returns whether the toast was actually shown so callers can branch (e.g. fall
 * back to a silent log).
 */
export function notify(
  category: NotificationCategory,
  message: string,
  options: NotifyOptions = {},
): boolean {
  const { description, force = false, kind = "info" } = options;
  if (!force && !isNotificationEnabled(category)) return false;

  const payload = description ? { description } : undefined;
  switch (kind) {
    case "success":
      toast.success(message, payload);
      break;
    case "error":
      toast.error(message, payload);
      break;
    case "warning":
      toast.warning(message, payload);
      break;
    default:
      toast.info(message, payload);
  }
  return true;
}

/** Convenience wrappers so call sites read cleanly at the point of use. */
export const notifyUpload = (msg: string, o?: NotifyOptions) => notify("uploads", msg, o);
export const notifyQuery = (msg: string, o?: NotifyOptions) => notify("queries", msg, o);
/** Errors default to `force: true` — a disabled toggle should not hide failures. */
export const notifyError = (msg: string, o?: NotifyOptions) =>
  notify("errors", msg, { kind: "error", force: true, ...o });
export const notifyCollaboration = (msg: string, o?: NotifyOptions) =>
  notify("collaboration", msg, o);
