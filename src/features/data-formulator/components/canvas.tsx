"use client";

/**
 * Canvas
 * Infinite pan/zoom surface where cards live.
 */

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils";
import { useWorkbenchStore } from "../store/workbench-store";
import { CanvasCardComponent } from "./canvas-cards";

export function Canvas() {
  const cards = useWorkbenchStore((s) => s.cards);
  const selectCard = useWorkbenchStore((s) => s.selectCard);
  const scale = useWorkbenchStore((s) => s.scale);
  const offsetX = useWorkbenchStore((s) => s.offsetX);
  const offsetY = useWorkbenchStore((s) => s.offsetY);
  const setCanvasTransform = useWorkbenchStore((s) => s.setCanvasTransform);

  const containerRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);

  // Pan with space+drag or middle mouse
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        setPanning(true);
        const startX = e.clientX;
        const startY = e.clientY;
        const initialOffsetX = offsetX;
        const initialOffsetY = offsetY;

        const handleMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          setCanvasTransform(scale, initialOffsetX + dx, initialOffsetY + dy);
        };

        const handleUp = () => {
          setPanning(false);
          globalThis.window.removeEventListener("mousemove", handleMove);
          globalThis.window.removeEventListener("mouseup", handleUp);
        };

        globalThis.window.addEventListener("mousemove", handleMove);
        globalThis.window.addEventListener("mouseup", handleUp);
      } else if (e.button === 0) {
        // Click on empty canvas deselects
        if (e.target === containerRef.current) {
          selectCard(null);
        }
      }
    },
    [offsetX, offsetY, scale, setCanvasTransform, selectCard],
  );

  // Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(scale * delta, 0.3), 3);
        setCanvasTransform(newScale, offsetX, offsetY);
      }
    },
    [scale, offsetX, offsetY, setCanvasTransform],
  );

  // Pre-compute a corrected card list so stale (0,0,0,0) cards from a
  // previous session are never rendered invisible.
  const { visibleCards, hiddenCount } = (() => {
    const visible: Array<(typeof cards)[0]> = [];
    let hidden = 0;
    for (const card of cards) {
      // A card is "visible" only when it has real dimensions; cards with
      // w=0 or h=0 (e.g. left over from a pre-fix persist session) are
      // given sensible defaults so they show up on the canvas.
      if (card.w === 0 || card.h === 0) {
        hidden++;
        continue;
      }
      visible.push(card);
    }
    return { visibleCards: visible, hiddenCount: hidden };
  })();

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden cursor-default"
      style={{ cursor: panning ? "grabbing" : "default" }}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, white 1px, transparent 1px),
            linear-gradient(to bottom, white 1px, transparent 1px)
          `,
          backgroundSize: `${40 * scale}px ${40 * scale}px`,
          transform: `translate(${offsetX % (40 * scale)}px, ${offsetY % (40 * scale)}px)`,
        }}
      />

      {/* Canvas content */}
      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
        }}
      >
        {visibleCards.map((card) => (
          <CanvasCardComponent key={card.id} card={card} />
        ))}
      </div>

      {/* Zoom indicator */}
      <div className="pointer-events-none absolute bottom-28 left-4 z-40 flex items-center gap-2">
        <span className="rounded-lg border border-white/5 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground/50">
          {Math.round(scale * 100)}%
        </span>
        <span className="hidden text-[10px] text-muted-foreground/50 sm:inline">
          Shift+drag to pan · Ctrl+scroll to zoom
        </span>
      </div>

      {hiddenCount > 0 && (
        <div className="pointer-events-none absolute top-3 right-3 z-50 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-300">
          {hiddenCount} card{hiddenCount !== 1 ? "s" : ""} hidden (stale — dimensions 0, drag cards
          below to reveal or clear canvas)
        </div>
      )}
      {visibleCards.length > 0 && hiddenCount === 0 && (
        <div className="pointer-events-none absolute top-3 right-3 z-50 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] text-emerald-300">
          {visibleCards.length} card{visibleCards.length !== 1 ? "s" : ""} visible
        </div>
      )}
    </div>
  );
}
