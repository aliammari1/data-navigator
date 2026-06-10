"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import CountUp from "react-countup";

/**
 * Spotlight card: a cursor-following radial highlight on hover (motion values,
 * no React state on mouse-move). Degrades to a plain panel under reduced motion.
 */
export function SpotlightCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const bg = useMotionTemplate`radial-gradient(300px circle at ${mx}px ${my}px, rgba(34,211,238,0.10), transparent 72%)`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative cursor-follow highlight, no semantic interaction or keyboard equivalent needed
    <div
      onMouseMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors duration-300 hover:border-cyan-400/30 ${className}`}
    >
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: bg }}
        />
      )}
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/**
 * Count-up metric, triggered when scrolled into view.
 */
export function CountStat({
  end,
  decimals = 0,
  prefix = "",
  suffix = "",
  label,
}: {
  end: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div>
      <div className="font-mono text-4xl font-semibold tracking-tight text-cyan-300">
        {reduce ? (
          <span>
            {prefix}
            {end.toFixed(decimals)}
            {suffix}
          </span>
        ) : (
          <CountUp
            end={end}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
            duration={2}
            enableScrollSpy
            scrollSpyOnce
          />
        )}
      </div>
      <div className="mt-2 text-sm text-slate-400">{label}</div>
    </div>
  );
}
