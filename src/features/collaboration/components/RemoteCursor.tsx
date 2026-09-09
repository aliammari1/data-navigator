"use client";

import { motion } from "motion/react";
import * as React from "react";
import type { LANCursor, LANPeer } from "@/platform/lan/lan-collab";
import { cn } from "@/shared/utils";

/** Untrusted awareness color — only plain hex may reach the style attribute. */
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export interface RemoteCursorProps {
  peer: LANPeer;
  cursor: LANCursor;
  containerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * One peer's section-anchored cursor overlay. Positions itself within the
 * supplied `containerRef` using normalized `cursor.x`/`cursor.y` (0..1) and
 * spring-interpolates between updates so motion feels continuous rather than
 * stepped. `pointer-events: none` keeps it from intercepting local input.
 */
export function RemoteCursor({ peer, cursor, containerRef }: RemoteCursorProps) {
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const color = peer.color && SAFE_COLOR.test(peer.color) ? peer.color : "#3b82f6";
  const x = typeof cursor.x === "number" ? cursor.x : 0;
  const y = typeof cursor.y === "number" ? cursor.y : 0;
  const left = size ? x * size.width : 0;
  const top = size ? y * size.height : 0;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-40"
      initial={false}
      animate={{ left, top }}
      transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.6 }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        <span
          className="block size-2 rounded-full ring-2 ring-background shadow"
          style={{ backgroundColor: color }}
        />
        <span
          className={cn(
            "absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white shadow",
          )}
          style={{ backgroundColor: color }}
        >
          {initials(peer.name)}
        </span>
        {typeof cursor.row === "number" && (
          <span
            className="absolute -left-2 top-full mt-0.5 h-0.5 w-6 rounded-full"
            style={{ backgroundColor: color, opacity: 0.6 }}
          />
        )}
      </div>
    </motion.div>
  );
}
