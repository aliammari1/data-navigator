"use client";

import {
  BarChart3,
  Image as ImageIcon,
  type LucideIcon,
  MessageSquareText,
  Table2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { type DesktopSnapshot, useDesktopActions } from "@/features/desktop/store/desktop-store";

/**
 * A single pinned snapshot tile living on the desktop canvas.
 *
 * Snapshots are "frozen" artifacts captured from a producing app (a chart, a
 * table, an AI answer or an image). They render as draggable macOS-glass cards
 * showing the captured title + payload, with a single action: remove it from
 * the canvas.
 *
 * Dragging uses pointer capture (same protocol as desktop icons) and persists
 * the new position through `moveSnapshot` only once the drag actually moved.
 */

const KIND_META: Record<DesktopSnapshot["kind"], { icon: LucideIcon; label: string }> = {
  chart: { icon: BarChart3, label: "Graphique" },
  table: { icon: Table2, label: "Tableau" },
  answer: { icon: MessageSquareText, label: "Réponse" },
  image: { icon: ImageIcon, label: "Image" },
};

export interface SnapshotArtifactProps {
  /** The pinned snapshot to render. */
  snapshot: DesktopSnapshot;
}

export function SnapshotArtifact({ snapshot }: SnapshotArtifactProps) {
  const { moveSnapshot, removeSnapshot } = useDesktopActions();

  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragInfo = useRef<{ offX: number; offY: number; moved: boolean } | null>(null);

  const meta = KIND_META[snapshot.kind];
  const Icon = meta.icon;

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only drag with the primary button from the title bar grip.
      if (e.button !== 0) return;
      e.stopPropagation();
      dragInfo.current = {
        offX: e.clientX - snapshot.x,
        offY: e.clientY - snapshot.y,
        moved: false,
      };
      setDrag({ x: snapshot.x, y: snapshot.y });
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [snapshot.x, snapshot.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const info = dragInfo.current;
    if (!info) return;
    info.moved = true;
    setDrag({ x: Math.max(0, e.clientX - info.offX), y: Math.max(0, e.clientY - info.offY) });
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const info = dragInfo.current;
      dragInfo.current = null;
      if (!info) return;
      const final = {
        x: Math.max(0, e.clientX - info.offX),
        y: Math.max(0, e.clientY - info.offY),
      };
      setDrag(null);
      if (info.moved) moveSnapshot(snapshot.id, final.x, final.y);
    },
    [moveSnapshot, snapshot.id],
  );

  const pos = drag ?? { x: snapshot.x, y: snapshot.y };
  const w = snapshot.w || 280;
  const h = snapshot.h || 220;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className="absolute flex select-none flex-col overflow-hidden rounded-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        background: "var(--glass-bg-strong)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--glass-shadow)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        color: "var(--glass-text)",
        zIndex: drag ? 60 : undefined,
      }}
    >
      {/* Drag handle / title bar */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: glass artifact title bar — pointer-drag repositions the pinned tile; it is a desktop affordance, not a keyboard control. */}
      <div
        className="flex cursor-grab items-center gap-2 px-3 py-2 active:cursor-grabbing"
        style={{ borderBottom: "1px solid var(--glass-hairline)" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-md"
          style={{ background: "hsl(var(--glass-accent) / 0.18)" }}
        >
          <Icon className="size-3.5" style={{ color: "hsl(var(--glass-accent))" }} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" title={snapshot.title}>
          {snapshot.title || meta.label}
        </span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
          style={{ background: "var(--glass-bg)", color: "var(--glass-text-dim)" }}
        >
          {meta.label}
        </span>
      </div>

      {/* Frozen payload */}
      <div className="relative min-h-0 flex-1 overflow-hidden p-3">
        {snapshot.kind === "image" && snapshot.image ? (
          // biome-ignore lint/performance/noImgElement: local/object-URL artifact preview; Next image optimizer is unavailable offline.
          // biome-ignore lint/a11y/useAltText: decorative frozen artifact thumbnail; the title bar carries the label.
          <img
            src={snapshot.image}
            alt={snapshot.title || meta.label}
            className="h-full w-full rounded-lg object-contain"
            draggable={false}
          />
        ) : snapshot.html ? (
          // biome-ignore lint/security/noDangerouslySetInnerHtml: frozen chart/table markup captured locally from a trusted in-app renderer; never network/user HTML.
          <div
            className="h-full w-full overflow-auto text-[12px] leading-snug [&_table]:w-full [&_td]:px-1.5 [&_th]:px-1.5 [&_th]:text-left"
            dangerouslySetInnerHTML={{ __html: snapshot.html }}
          />
        ) : (
          <p
            className="h-full w-full overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed"
            style={{ color: "var(--glass-text)" }}
          >
            {snapshot.text || "Aucun contenu."}
          </p>
        )}
        {/* Soft fade at the bottom so long content feels contained. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6"
          style={{ background: "linear-gradient(to top, var(--glass-bg-strong), transparent)" }}
        />
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-end gap-2 px-2.5 py-2"
        style={{ borderTop: "1px solid var(--glass-hairline)" }}
      >
        <button
          type="button"
          onClick={() => removeSnapshot(snapshot.id)}
          aria-label="Retirer l'instantané"
          title="Retirer"
          className="grid size-7 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--glass-bg)]"
          style={{ color: "var(--glass-text-dim)" }}
        >
          <X className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}
