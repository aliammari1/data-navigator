"use client";

import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

/**
 * Notifications Center — the desktop's alert hub.
 *
 * A glass flyout that drops from under the menu-bar bell (top-right) and lists
 * data alerts. Other features push into it through `pushNotification` so they
 * don't need to import the store directly.
 *
 * No fake seeds — the panel starts empty and shows a calm empty state.
 */

type NotificationKind = "threshold" | "anomaly" | "briefing" | "info";

interface DesktopNotification {
  id: string;
  /** Category drives the icon + accent tint. */
  kind: NotificationKind;
  title: string;
  /** Optional one-line body / detail. */
  body?: string;
  /** App that emitted the alert (used to focus / re-open on click). */
  appId?: string;
  /** Optional click handler (e.g. open the offending window, jump to a chart). */
  onOpen?: () => void;
  createdAt: number;
  read: boolean;
}

/** Input accepted by `push` / `pushNotification` (id, createdAt and read are auto-filled). */
type NotificationInput = Omit<DesktopNotification, "id" | "createdAt" | "read"> &
  Partial<Pick<DesktopNotification, "id" | "createdAt" | "read">>;

interface NotificationsState {
  items: DesktopNotification[];
  push: (n: NotificationInput) => string;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

let notifSeq = 0;
const nextNotifId = () => `ntf-${Date.now().toString(36)}-${(notifSeq++).toString(36)}`;

/** Ephemeral, in-memory only — alerts are session-scoped and never persisted. */
const useNotifications = create<NotificationsState>((set) => ({
  items: [],
  push: (n) => {
    const id = n.id ?? nextNotifId();
    const full: DesktopNotification = {
      ...n,
      id,
      createdAt: n.createdAt ?? Date.now(),
      read: n.read ?? false,
    };
    set((s) => ({ items: [full, ...s.items] }));
    return id;
  },
  markRead: (id) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
    })),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
}));

/**
 * Imperative helper for other features. Call from anywhere without wiring the hook:
 *   pushNotification({ kind: "threshold", title: "Canal USSD < 90 %", appId: "telecom" });
 * Returns the new notification id.
 */
function pushNotification(n: NotificationInput): string {
  return useNotifications.getState().push(n);
}

/** Stable count of unread alerts — drives the menu-bar bell badge. */
export const useUnreadCount = () =>
  useNotifications(useShallow((s) => s.items.reduce((acc, i) => acc + (i.read ? 0 : 1), 0)));

const KIND_META: Record<NotificationKind, { Icon: typeof Bell; label: string; hue: number }> = {
  threshold: { Icon: AlertTriangle, label: "Seuil", hue: 8 },
  anomaly: { Icon: TrendingUp, label: "Anomalie", hue: 38 },
  briefing: { Icon: Sparkles, label: "Briefing IA", hue: 268 },
  info: { Icon: Bell, label: "Info", hue: 210 },
};

/** Compact "il y a …" relative timestamp, French. */
function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

/**
 * The notifications flyout panel.
 *
 * Render it once in the desktop shell, anchored top-right under the menu bar.
 * Controlled: pass `open` and an `onClose` that flips your own state. Closes on
 * Escape and on an outside click (the backdrop).
 */
export function NotificationsCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, markRead, markAllRead, remove, clear } = useNotifications(
    useShallow((s) => ({
      items: s.items,
      markRead: s.markRead,
      markAllRead: s.markAllRead,
      remove: s.remove,
      clear: s.clear,
    })),
  );

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const unread = items.reduce((acc, i) => acc + (i.read ? 0 : 1), 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Outside-click catcher (transparent, full-screen, below the panel). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[var(--z-modal)]"
            onPointerDown={onClose}
          />

          <motion.aside
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            role="dialog"
            aria-label="Centre de notifications"
            className="fixed right-2 top-9 z-[var(--z-modal)] flex max-h-[min(34rem,80vh)] w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border"
            style={{
              background: "var(--glass-bg-strong)",
              borderColor: "var(--glass-border)",
              color: "var(--glass-text)",
              boxShadow: "var(--glass-shadow)",
              backdropFilter: "blur(28px) saturate(1.5)",
              WebkitBackdropFilter: "blur(28px) saturate(1.5)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header
              className="flex items-center gap-2 border-b px-4 py-3"
              style={{ borderColor: "var(--glass-hairline)" }}
            >
              <Bell className="size-4" style={{ color: "hsl(var(--glass-accent))" }} />
              <h2 className="text-sm font-semibold">Notifications</h2>
              {unread > 0 && (
                <span
                  className="grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white tabular-nums"
                  style={{ background: "hsl(var(--glass-accent))" }}
                >
                  {unread}
                </span>
              )}

              <div className="flex-1" />

              {items.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={unread === 0}
                    title="Tout marquer comme lu"
                    aria-label="Tout marquer comme lu"
                    className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5 disabled:opacity-35"
                    style={{ color: "var(--glass-text)" }}
                  >
                    <CheckCheck className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={clear}
                    title="Tout effacer"
                    aria-label="Tout effacer"
                    className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5"
                    style={{ color: "var(--glass-text)" }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                title="Fermer"
                aria-label="Fermer"
                className="grid size-7 place-items-center rounded-lg transition hover:bg-black/5"
                style={{ color: "var(--glass-text)" }}
              >
                <X className="size-4" />
              </button>
            </header>

            {/* Body */}
            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                <div
                  className="grid size-14 place-items-center rounded-2xl"
                  style={{
                    background: "var(--glass-bg)",
                    border: "1px solid var(--glass-hairline)",
                  }}
                >
                  <BellOff className="size-6" style={{ color: "var(--glass-text-dim)" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--glass-text)" }}>
                  Aucune notification
                </p>
                <p
                  className="max-w-[15rem] text-xs leading-relaxed"
                  style={{ color: "var(--glass-text-dim)" }}
                >
                  Les alertes de seuil, les anomalies détectées et les briefings IA terminés
                  apparaîtront ici.
                </p>
              </div>
            ) : (
              <ul className="flex-1 overflow-y-auto p-2">
                {items.map((n) => {
                  const meta = KIND_META[n.kind];
                  const Icon = meta.Icon;
                  const interactive = Boolean(n.onOpen);
                  return (
                    <li key={n.id}>
                      <div
                        className="group relative flex gap-3 rounded-xl px-3 py-2.5 transition hover:bg-black/5"
                        style={
                          n.read
                            ? undefined
                            : {
                                background:
                                  "color-mix(in srgb, hsl(var(--glass-accent)) 8%, transparent)",
                              }
                        }
                      >
                        {/* Unread dot rail */}
                        {!n.read && (
                          <span
                            className="absolute left-1 top-1/2 size-1.5 -translate-y-1/2 rounded-full"
                            style={{ background: "hsl(var(--glass-accent))" }}
                          />
                        )}

                        <div
                          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                          style={{
                            background: `hsl(${meta.hue} 70% 50% / 0.14)`,
                            color: `hsl(${meta.hue} 65% 42%)`,
                          }}
                        >
                          <Icon className="size-4" />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            markRead(n.id);
                            n.onOpen?.();
                            if (n.onOpen) onClose();
                          }}
                          aria-label={n.title}
                          className={`min-w-0 flex-1 text-left ${interactive ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span
                              className="truncate text-[13px] font-semibold"
                              style={{ color: "var(--glass-text)" }}
                            >
                              {n.title}
                            </span>
                            <span
                              className="ml-auto shrink-0 text-[10px] uppercase tracking-wide"
                              style={{ color: `hsl(${meta.hue} 50% 45%)` }}
                            >
                              {meta.label}
                            </span>
                          </div>
                          {n.body && (
                            <p
                              className="mt-0.5 line-clamp-2 text-xs leading-snug"
                              style={{ color: "var(--glass-text-dim)" }}
                            >
                              {n.body}
                            </p>
                          )}
                          <p
                            className="mt-1 text-[10px] tabular-nums"
                            style={{ color: "var(--glass-text-dim)" }}
                          >
                            {relativeTime(n.createdAt)}
                          </p>
                        </button>

                        {/* Dismiss single */}
                        <button
                          type="button"
                          onClick={() => remove(n.id)}
                          title="Ignorer"
                          aria-label="Ignorer la notification"
                          className="grid size-6 shrink-0 place-items-center self-start rounded-md opacity-0 transition hover:bg-black/10 group-hover:opacity-100"
                          style={{ color: "var(--glass-text-dim)" }}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
