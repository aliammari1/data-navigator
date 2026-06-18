"use client";

import { Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

/**
 * Desktop HUD — ephemeral, non-persisted feedback layer for the windowed shell.
 *
 * Three flavours of feedback flow through one tiny zustand store:
 *  - toasts: bottom-center glass cards (with optional inline action / Undo).
 *  - undo toasts: a toast whose primary action is "Annuler" (e.g. after a delete).
 *  - progress toasts: a card with a progress bar + optional Cancel (long tasks).
 *  - center HUD: a big fading glyph/label for instantaneous state changes
 *    (palette switch, theme toggle, volume…) — the macOS-style center overlay.
 *
 * Everything here is purely client-side and never persisted; it is meant to be
 * mounted once near the desktop root via <HudLayer />.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single inline action rendered as a button inside a toast. */
export interface ToastAction {
  /** Button label (French-first). */
  label: string;
  /** Invoked on click; the toast is dismissed afterwards unless `keepOpen`. */
  onClick: () => void;
  /** Keep the toast open after the action fires (default: dismiss). */
  keepOpen?: boolean;
}

export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  message: string;
  /** Optional secondary line under the message. */
  description?: string;
  variant: ToastVariant;
  /** Optional primary inline action. */
  action?: ToastAction;
  /**
   * Convenience Undo action. Sugar over `action`: rendered as "Annuler" with an
   * undo glyph. `withUndo(...)` / `showToast({ undo })` populate this.
   */
  undo?: () => void;
  /**
   * Progress 0..1, or -1 for an indeterminate bar. When set, the toast renders a
   * progress bar and does NOT auto-dismiss (the caller owns its lifetime).
   */
  progress?: number;
  /** Cancel handler for a progress toast — renders a Cancel (✕) control. */
  onCancel?: () => void;
  /** Auto-dismiss delay in ms. 0/undefined for progress toasts = sticky. */
  duration: number;
  createdAt: number;
}

/** Input accepted by `showToast` (id/duration/variant default if omitted). */
export interface ShowToastInput {
  message: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  undo?: () => void;
  progress?: number;
  onCancel?: () => void;
  /** Override auto-dismiss (ms). Default 4500; undo defaults to 6000; progress sticky. */
  duration?: number;
  /** Provide a stable id to update an existing toast in place (e.g. progress). */
  id?: string;
}

/** The center fade HUD (palette / theme / volume style quick state). */
export interface CenterHud {
  id: string;
  /** Big primary label, e.g. "Ambre" or "Mode clair". */
  label: string;
  /** Optional small caption under the label. */
  caption?: string;
  /** Optional emoji/glyph or short symbol shown above the label. */
  glyph?: string;
  /** Optional 0..1 meter (e.g. volume) shown as a slim bar. */
  meter?: number;
}

interface ToastStore {
  toasts: Toast[];
  center: CenterHud | null;
  /** Add or update (when an id is supplied) a toast. Returns the toast id. */
  showToast: (input: ShowToastInput) => string;
  /** Patch an existing toast in place (e.g. advance progress). No-op if absent. */
  updateToast: (id: string, patch: Partial<ShowToastInput>) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  /** Flash the center HUD; auto-clears after `ms` (default 1100). Returns id. */
  showCenter: (input: Omit<CenterHud, "id"> & { id?: string; durationMs?: number }) => string;
  clearCenter: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `hud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const MAX_TOASTS = 4;
let centerTimer: ReturnType<typeof setTimeout> | null = null;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  center: null,

  showToast: (input) => {
    const id = input.id ?? uid();
    const isProgress = typeof input.progress === "number";
    const duration = input.duration ?? (isProgress ? 0 : input.undo ? 6000 : 4500);
    const existing = get().toasts.find((t) => t.id === id);
    const next: Toast = {
      id,
      message: input.message,
      description: input.description,
      variant: input.variant ?? "info",
      action: input.action,
      undo: input.undo,
      progress: input.progress,
      onCancel: input.onCancel,
      duration,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    set((s) => {
      const without = s.toasts.filter((t) => t.id !== id);
      // Newest at the end of the array (rendered bottom-most), capped.
      const list = [...without, next].slice(-MAX_TOASTS);
      return { toasts: list };
    });
    return id;
  },

  updateToast: (id, patch) => {
    set((s) => ({
      toasts: s.toasts.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              variant: patch.variant ?? t.variant,
              duration: patch.duration ?? t.duration,
            }
          : t,
      ),
    }));
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),

  showCenter: (input) => {
    const id = input.id ?? uid();
    if (centerTimer) clearTimeout(centerTimer);
    set({
      center: {
        id,
        label: input.label,
        caption: input.caption,
        glyph: input.glyph,
        meter: input.meter,
      },
    });
    const ms = input.durationMs ?? 1100;
    centerTimer = setTimeout(() => {
      // Only clear if it is still the same HUD instance.
      if (get().center?.id === id) set({ center: null });
    }, ms);
    return id;
  },

  clearCenter: () => {
    if (centerTimer) clearTimeout(centerTimer);
    set({ center: null });
  },
}));

// ---------------------------------------------------------------------------
// Imperative helpers (callable from anywhere, no hook needed)
// ---------------------------------------------------------------------------

/** Fire a toast from outside React. Returns the toast id. */
export function showToast(input: ShowToastInput): string {
  return useToasts.getState().showToast(input);
}

/** Patch an existing toast (e.g. advance a progress bar). */
export function updateToast(id: string, patch: Partial<ShowToastInput>): void {
  useToasts.getState().updateToast(id, patch);
}

/** Dismiss a toast by id. */
export function dismissToast(id: string): void {
  useToasts.getState().dismissToast(id);
}

/**
 * Convenience: a toast that offers an Undo. Renders as "<message> — Annuler".
 * Example: withUndo("Dossier supprimé", () => restoreFolder(id)).
 */
export function withUndo(
  message: string,
  onUndo: () => void,
  options?: Omit<ShowToastInput, "message" | "undo">,
): string {
  return useToasts.getState().showToast({
    ...options,
    message,
    undo: onUndo,
  });
}

/** Flash the big center HUD (palette / theme / volume). Returns its id. */
export function showCenterHud(
  input: Omit<CenterHud, "id"> & { id?: string; durationMs?: number },
): string {
  return useToasts.getState().showCenter(input);
}

/**
 * Start a progress toast. Returns `{ id, set, done, fail }` controllers so a
 * long task can drive it without re-importing the store.
 *  - set(value)  → advance 0..1 (or -1 indeterminate)
 *  - done(msg?)  → flip to a success toast that auto-dismisses
 *  - fail(msg?)  → flip to a danger toast that auto-dismisses
 */
export function showProgress(
  message: string,
  options?: { description?: string; onCancel?: () => void; initial?: number },
): {
  id: string;
  set: (value: number, message?: string) => void;
  done: (message?: string) => void;
  fail: (message?: string) => void;
  dismiss: () => void;
} {
  const id = useToasts.getState().showToast({
    message,
    description: options?.description,
    progress: options?.initial ?? -1,
    onCancel: options?.onCancel,
  });
  return {
    id,
    set: (value, msg) =>
      useToasts.getState().updateToast(id, {
        progress: value,
        ...(msg ? { message: msg } : {}),
      }),
    done: (msg) =>
      useToasts.getState().updateToast(id, {
        message: msg ?? "Terminé",
        progress: undefined,
        onCancel: undefined,
        variant: "success",
        duration: 2600,
      }),
    fail: (msg) =>
      useToasts.getState().updateToast(id, {
        message: msg ?? "Échec",
        progress: undefined,
        onCancel: undefined,
        variant: "danger",
        duration: 4000,
      }),
    dismiss: () => useToasts.getState().dismissToast(id),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  info: "hsl(var(--glass-accent))",
  success: "hsl(150 55% 42%)",
  warning: "hsl(38 92% 50%)",
  danger: "hsl(0 72% 55%)",
};

function ToastCard({ toast }: { toast: Toast }) {
  const { dismissToast } = useToasts.getState();
  const accent = VARIANT_ACCENT[toast.variant];
  const isProgress = typeof toast.progress === "number";
  const indeterminate = toast.progress === -1;
  const pct = isProgress && !indeterminate ? Math.max(0, Math.min(1, toast.progress ?? 0)) : 0;

  // Auto-dismiss (skipped for sticky/progress toasts where duration <= 0).
  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const t = setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, dismissToast]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 480, damping: 34, mass: 0.7 }}
      className="pointer-events-auto w-[min(92vw,28rem)] overflow-hidden rounded-2xl border"
      style={{
        background: "var(--glass-bg-strong)",
        borderColor: "var(--glass-border)",
        color: "var(--glass-text)",
        boxShadow: "var(--glass-shadow)",
        backdropFilter: "blur(22px) saturate(160%)",
        WebkitBackdropFilter: "blur(22px) saturate(160%)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Accent dot / status pip */}
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: accent, boxShadow: `0 0 10px ${accent}` }}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-snug">{toast.message}</p>
          {toast.description && (
            <p
              className="mt-0.5 truncate text-[11px] leading-snug"
              style={{ color: "var(--glass-text-dim)" }}
            >
              {toast.description}
            </p>
          )}
        </div>

        {/* Undo (sugar) */}
        {toast.undo && (
          <button
            type="button"
            onClick={() => {
              toast.undo?.();
              dismissToast(toast.id);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/12"
            style={{ color: "hsl(var(--glass-accent))" }}
          >
            <Undo2 className="size-3.5" />
            Annuler
          </button>
        )}

        {/* Generic inline action */}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              if (!toast.action?.keepOpen) dismissToast(toast.id);
            }}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/12"
            style={{ color: "hsl(var(--glass-accent))" }}
          >
            {toast.action.label}
          </button>
        )}

        {/* Cancel (progress) or plain close */}
        {toast.onCancel ? (
          <button
            type="button"
            onClick={() => {
              toast.onCancel?.();
              dismissToast(toast.id);
            }}
            aria-label="Annuler la tâche"
            className="grid size-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-white/12"
            style={{ color: "var(--glass-text-dim)" }}
          >
            <X className="size-3.5" />
          </button>
        ) : (
          !toast.undo &&
          !toast.action && (
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Fermer"
              className="grid size-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-white/12"
              style={{ color: "var(--glass-text-dim)" }}
            >
              <X className="size-3.5" />
            </button>
          )
        )}
      </div>

      {/* Progress bar */}
      {isProgress && (
        <div
          className="relative h-1 w-full overflow-hidden"
          style={{ background: "var(--glass-hairline)" }}
        >
          {indeterminate ? (
            <motion.div
              className="absolute inset-y-0 w-1/3 rounded-full"
              style={{ background: accent }}
              animate={{ left: ["-33%", "100%"] }}
              transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
            />
          ) : (
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: accent }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            />
          )}
        </div>
      )}
    </motion.div>
  );
}

function CenterHudView({ hud }: { hud: CenterHud }) {
  const meter = typeof hud.meter === "number" ? Math.max(0, Math.min(1, hud.meter)) : null;
  return (
    <motion.div
      key={hud.id}
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className="pointer-events-none flex w-44 flex-col items-center gap-2 rounded-3xl border px-6 py-7"
      style={{
        background: "var(--glass-bg-strong)",
        borderColor: "var(--glass-border)",
        color: "var(--glass-text)",
        boxShadow: "var(--glass-shadow)",
        backdropFilter: "blur(30px) saturate(170%)",
        WebkitBackdropFilter: "blur(30px) saturate(170%)",
      }}
      role="status"
      aria-live="polite"
    >
      {hud.glyph && (
        <span className="text-4xl leading-none" aria-hidden>
          {hud.glyph}
        </span>
      )}
      <span className="text-center text-[15px] font-semibold leading-tight">{hud.label}</span>
      {hud.caption && (
        <span className="text-center text-[11px]" style={{ color: "var(--glass-text-dim)" }}>
          {hud.caption}
        </span>
      )}
      {meter !== null && (
        <div
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--glass-hairline)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "hsl(var(--glass-accent))" }}
            animate={{ width: `${meter * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          />
        </div>
      )}
    </motion.div>
  );
}

/**
 * <HudLayer /> — mount once at the desktop root. Renders the bottom-center toast
 * stack and the center fade HUD. Fixed-positioned, pointer-events scoped so it
 * never blocks the desktop underneath (only the toast cards are interactive).
 */
export function HudLayer({ className }: { className?: string }) {
  const toasts = useToasts((s) => s.toasts);
  const center = useToasts((s) => s.center);

  return (
    <>
      {/* Center fade HUD */}
      <div
        className="pointer-events-none fixed inset-0 z-[var(--z-toast)] flex items-center justify-center"
        aria-hidden={!center}
      >
        <AnimatePresence>{center && <CenterHudView hud={center} />}</AnimatePresence>
      </div>

      {/* Bottom-center toast stack */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-24 z-[var(--z-toast)] flex flex-col items-center gap-2 px-4",
          className,
        )}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

export default HudLayer;
