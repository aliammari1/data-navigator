"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  DATA NAVIGATOR — "THE DAILY EDITION"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The landing experience is composed as a living broadsheet newspaper.
 * The product turns a raw DailyTransactions.csv into a finished morning
 * report — so the page IS that report, being typeset, inked, proofed and
 * delivered in front of the reader as they scroll.
 *
 * Creative direction
 * ──────────────────
 * • Surfaces: warm paper (#f6f1e7), never white, never dark-SaaS navy.
 * • Type: Fraunces (serif, wonky editorial voice) for headlines and article
 *   body; Archivo (grotesk) for kickers, labels and UI copy; Fira Code for
 *   tabular data. Scale contrast is the design — 12px kickers under 9rem
 *   headline decks.
 * • Ink: near-black #1c1914. One editorial accent: vermilion #bf3415 — the
 *   editor's pen. Press blue #2b4a8b strictly for links and chart secondaries.
 * • Charts are drawn in ink: 2px strokes, halftone fills, no gradients-on-dark,
 *   no glassmorphism, no glow.
 * • Motion: parallax plates, sticky scrollytelling scenes, ink that draws
 *   itself, stamps that slam, type that sets. Every animation is transform /
 *   opacity / pathLength only — medium-end hardware is the floor. Everything
 *   honours prefers-reduced-motion.
 * • Copy: bilingual like the newsroom it serves — French data labels, English
 *   editorial voice. Organic numbers (2 147 380, 97,4 %), never 99.99%.
 *   Banned vocabulary: elevate, seamless, unleash, next-gen, game-changer,
 *   empower, revolutionize.
 *
 * Structure
 * ─────────
 * This file is assembled from a shared preamble (design constants, motion
 * primitives, print furniture, ink-chart library) followed by the page's
 * sections in reading order, each a self-contained component family.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Menu,
  Minus,
  Plus,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  type MotionValue,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import Link from "next/link";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

/* ════════════════════════════════════════════════════════════════════════════
 *  §0 — EDITION CONSTANTS · the shared design language
 * ════════════════════════════════════════════════════════════════════════════ */

/** Today's edition. One source of truth for every dateline, folio and stamp. */
export const EDITION = {
  paper: "Data Navigator",
  masthead: "The Daily Edition",
  motto: "All the data that's fit to print — none of it leaves the desk.",
  dateline: "Jeudi 12 juin 2026",
  datelineShort: "12.06.2026",
  volume: "Vol. III",
  issue: "№ 847",
  fileName: "DailyTransactions_2026-06-11.csv",
  rows: "2 147 380",
  rowsCompact: "2,1 M",
  successRate: "97,4 %",
  price: "0 € — vos données restent vôtres",
  city: "Édition du matin · Tunis",
} as const;

/** Ink + paper — the only colours on the page. Hex constants exist for SVG. */
export const INK = "#1c1914";
export const INK_SOFT = "#4a4438";
export const INK_FADED = "#857c69";
export const PAPER = "#f6f1e7";
export const PAPER_DEEP = "#eee6d6";
export const PAPER_SHADE = "#e4dac5";
export const RULE = "#d6ccb6";
export const VERMILION = "#bf3415";
export const PRESS_BLUE = "#2b4a8b";
export const STAMP_GREEN = "#2f6b3f";

/** Easing vocabulary. EASE_INK for reveals, EASE_PRESS for mechanical moves. */
export const EASE_INK = [0.22, 1, 0.36, 1] as const;
export const EASE_PRESS = [0.65, 0, 0.35, 1] as const;
export const SPRING_STAMP = { type: "spring", stiffness: 320, damping: 22 } as const;
export const SPRING_PLATE = { stiffness: 110, damping: 26 } as const;

/* Shared class recipes — full literal strings so Tailwind can see them. */
export const T = {
  /** 11px grotesk kicker, wide tracked, vermilion available via cls override */
  kicker:
    "font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]",
  /** dateline / folio metadata line */
  folio: "font-mono text-[10px] uppercase tracking-[0.14em] text-[#857c69]",
  /** serif article body */
  body: "font-serif text-[17px] leading-[1.65] text-[#1c1914]",
  /** grotesk UI copy */
  ui: "font-grotesk text-[15px] leading-relaxed text-[#4a4438]",
  /** tabular numerals */
  num: "font-mono tabular-nums",
} as const;

/* ════════════════════════════════════════════════════════════════════════════
 *  §1 — MOTION PRIMITIVES
 *  Rules: transform/opacity/pathLength only. Hooks never run inside render
 *  callbacks — StickyScene children receive the progress MotionValue as a prop
 *  on a real child component.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Scroll progress of an element through the viewport: 0 = entering, 1 = left. */
export function useDriftProgress(ref: RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  return scrollYProgress;
}

/**
 * Parallax plate: drifts (and optionally rotates/scales) against scroll at a
 * speed relative to the page. speed > 0 drifts up slower than the page (depth
 * behind), speed < 0 races ahead (depth in front). Pure transform.
 */
export function Parallax({
  children,
  speed = 40,
  rotate = 0,
  scale,
  className,
  style,
}: {
  children: ReactNode;
  /** px of vertical drift across the element's viewport transit */
  speed?: number;
  /** degrees of rotation across the transit */
  rotate?: number;
  /** [from, to] scale across the transit */
  scale?: [number, number];
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const progress = useDriftProgress(ref);
  const y = useTransform(progress, [0, 1], reduce ? [0, 0] : [speed, -speed]);
  const r = useTransform(progress, [0, 1], reduce ? [0, 0] : [-rotate, rotate]);
  const s = useTransform(progress, [0, 1], scale && !reduce ? scale : [1, 1]);
  return (
    <motion.div ref={ref} className={className} style={{ ...style, y, rotate: r, scale: s }}>
      {children}
    </motion.div>
  );
}

/**
 * Pinned scrollytelling scene. Renders `children(progress)` inside a sticky
 * viewport while the outer shell scrolls `pages` viewport-heights.
 * NEVER call hooks inside the children callback — pass progress down to real
 * components instead.
 */
export function StickyScene({
  pages = 3,
  className,
  children,
}: {
  pages?: number;
  className?: string;
  children: (progress: MotionValue<number>) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  return (
    <div ref={ref} className="relative" style={{ height: `${pages * 100}vh` }}>
      <div className={`sticky top-0 h-screen overflow-hidden ${className ?? ""}`}>
        {children(scrollYProgress)}
      </div>
    </div>
  );
}

/** Maps a 0–1 MotionValue segment to 0–1; clamps outside the window. */
export function useSegment(progress: MotionValue<number>, from: number, to: number) {
  return useTransform(progress, [from, to], [0, 1], { clamp: true });
}

/** Editorial entrance: content rises out of a clipped line, once, in view. */
export function RiseIn({
  children,
  delay = 0,
  className,
  amount = 0.4,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  amount?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <motion.div
        initial={reduce ? false : { y: "108%" }}
        whileInView={{ y: 0 }}
        viewport={{ once: true, amount }}
        transition={{ duration: 0.8, delay, ease: EASE_INK }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Fades + lifts a block into view once. The default reveal for furniture. */
export function SettleIn({
  children,
  delay = 0,
  y = 18,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, delay, ease: EASE_INK }}
    >
      {children}
    </motion.div>
  );
}

/** Multi-deck headline: each line rises from its own clip, staggered. */
export function DeckReveal({
  lines,
  className,
  lineClassName,
  stagger = 0.09,
}: {
  lines: ReadonlyArray<ReactNode>;
  className?: string;
  lineClassName?: string;
  stagger?: number;
}) {
  return (
    <div className={className}>
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static deck lines
        <RiseIn key={i} delay={i * stagger} className={lineClassName}>
          {line}
        </RiseIn>
      ))}
    </div>
  );
}

/** Ink counter — rAF count-up in tabular figures, fires once in view. */
export function CountUpInk({
  end,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 1.5,
  locale = "fr-FR",
  className,
}: {
  end: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  locale?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(end);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / (duration * 1000), 1);
      setVal(end * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration, reduce]);

  const text = useMemo(
    () =>
      val.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [val, decimals, locale],
  );

  return (
    <span ref={ref} className={`${T.num} ${className ?? ""}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/** Typewriter — sets type character by character once in view. */
export function TypeOn({
  text,
  speed = 28,
  startDelay = 0,
  className,
  caret = true,
}: {
  text: string;
  /** ms per character */
  speed?: number;
  startDelay?: number;
  className?: string;
  caret?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setN(text.length);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) clearInterval(timer);
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [inView, text, speed, startDelay, reduce]);

  const done = n >= text.length;
  return (
    <span ref={ref} className={className}>
      {text.slice(0, n)}
      {caret && !done && <span className="ed-caret -mb-0.5 ml-px inline-block h-[1em] w-[2px] bg-[#bf3415] align-baseline" />}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §2 — INK ON PAPER · SVG accents drawn by the editor's pen
 * ════════════════════════════════════════════════════════════════════════════ */

/** Draws any SVG path when scrolled into view. Wrap paths in <InkPath>. */
export function InkPath({
  d,
  stroke = INK,
  strokeWidth = 2,
  delay = 0,
  duration = 1.1,
  fill = "none",
  dashed = false,
  className,
}: {
  d: string;
  stroke?: string;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
  fill?: string;
  dashed?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.path
      d={d}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "6 7" : undefined}
      className={className}
      initial={reduce ? undefined : { pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration, delay, ease: "easeInOut" }}
    />
  );
}

/** Hand-drawn vermilion underline beneath a word the editor liked. */
export function PenUnderline({
  children,
  delay = 0.3,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-block whitespace-nowrap ${className ?? ""}`}>
      {children}
      <svg
        aria-hidden
        viewBox="0 0 120 10"
        preserveAspectRatio="none"
        className="absolute -bottom-[0.18em] left-0 h-[0.32em] w-full"
      >
        <InkPath
          d="M3 7 Q 28 3, 56 6 T 117 5"
          stroke={VERMILION}
          strokeWidth={3.2}
          delay={delay}
          duration={0.55}
        />
      </svg>
    </span>
  );
}

/** The editor circles a figure in red pen. */
export function PenCircle({
  children,
  delay = 0.4,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      {children}
      <svg
        aria-hidden
        viewBox="0 0 100 48"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-x-[14%] -inset-y-[22%] h-[144%] w-[128%]"
      >
        <InkPath
          d="M50 4 C 88 2, 99 12, 97 24 C 95 38, 70 45, 46 44 C 20 43, 2 36, 3 23 C 4 10, 26 4, 58 5"
          stroke={VERMILION}
          strokeWidth={2.6}
          delay={delay}
          duration={0.7}
        />
      </svg>
    </span>
  );
}

/** Proof-correction strike: the old figure crossed out in red. */
export function PenStrike({
  children,
  delay = 0.3,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      {children}
      <svg
        aria-hidden
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[0.5em] w-full -translate-y-1/2"
      >
        <InkPath d="M2 12 Q 30 7, 60 11 T 98 8" stroke={VERMILION} strokeWidth={2.8} delay={delay} duration={0.4} />
      </svg>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §3 — PRINT FURNITURE · rules, masts, stamps, marginalia, folios
 * ════════════════════════════════════════════════════════════════════════════ */

/** Single hairline rule. */
export function Rule({ className }: { className?: string }) {
  return <div className={`h-px w-full bg-[#d6ccb6] ${className ?? ""}`} />;
}

/** Classic double rule — heavy over hairline, the broadsheet's signature. */
export function DoubleRule({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="h-[3px] w-full bg-[#1c1914]" />
      <div className="mt-[3px] h-px w-full bg-[#1c1914]" />
    </div>
  );
}

/**
 * Section mast — "RUBRIQUE" header with rules either side, numbered like a
 * newspaper section. The standard way every section announces itself.
 */
export function SectionMast({
  rubrique,
  no,
  className,
}: {
  rubrique: string;
  no: string;
  className?: string;
}) {
  return (
    <SettleIn className={className}>
      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-[#1c1914]" />
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.1em] text-[#bf3415]">{no}</span>
          <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.3em] text-[#1c1914]">
            {rubrique}
          </span>
        </div>
        <div className="h-px flex-1 bg-[#1c1914]" />
      </div>
    </SettleIn>
  );
}

/** Folio line — the page-bottom metadata strip closing every section. */
export function FolioLine({ page, note, className }: { page: string; note?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${T.folio} ${className ?? ""}`}>
      <span>
        {EDITION.paper} · {EDITION.dateline}
      </span>
      {note && <span className="hidden sm:block">{note}</span>}
      <span>{page}</span>
    </div>
  );
}

/** Rubber stamp — slams once when scrolled into view. */
export function Stamp({
  children,
  color = VERMILION,
  tilt = -8,
  className,
}: {
  children: ReactNode;
  color?: string;
  tilt?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.7 });
  return (
    <span
      ref={ref}
      style={
        {
          "--ed-stamp-tilt": `${tilt}deg`,
          color,
          borderColor: "currentColor",
          opacity: inView ? undefined : 0,
        } as CSSProperties
      }
      className={`${inView ? "ed-stamp" : ""} inline-block select-none border-[2.5px] px-2.5 py-1 font-grotesk text-[11px] font-black uppercase tracking-[0.16em] [border-radius:3px] ${className ?? ""}`}
    >
      {children}
    </span>
  );
}

/** Marginalia — the editor's pencilled note hanging in the margin. */
export function MarginNote({
  children,
  side = "right",
  className,
}: {
  children: ReactNode;
  side?: "left" | "right";
  className?: string;
}) {
  return (
    <SettleIn
      y={10}
      className={`w-44 rotate-[-1.5deg] font-serif text-[13px] italic leading-snug text-[#bf3415] ${
        side === "right" ? "text-left" : "text-right"
      } ${className ?? ""}`}
    >
      {children}
    </SettleIn>
  );
}

/** Pull quote with hanging serif quotation mark. */
export function PullQuote({ children, cite, className }: { children: ReactNode; cite?: string; className?: string }) {
  return (
    <SettleIn className={`relative ${className ?? ""}`}>
      <span aria-hidden className="absolute -left-2 -top-7 font-serif text-[5.5rem] leading-none text-[#bf3415]/85">
        “
      </span>
      <blockquote className="border-l-[3px] border-[#1c1914] pl-6">
        <p className="font-serif text-[1.55rem] font-medium italic leading-[1.35] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'SOFT'_80,'WONK'_1]">
          {children}
        </p>
        {cite && <footer className={`mt-3 ${T.kicker}`}>— {cite}</footer>}
      </blockquote>
    </SettleIn>
  );
}

/** Byline — author + desk line under article heads. */
export function Byline({ name, desk, className }: { name: string; desk: string; className?: string }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${className ?? ""}`}>
      <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.12em] text-[#1c1914]">
        {name}
      </span>
      <span className={T.folio}>{desk}</span>
    </div>
  );
}

/** Article paragraph with a drop cap — first paragraph of any lead story. */
export function DropCapParagraph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={`${T.body} first-letter:float-left first-letter:mr-2.5 first-letter:mt-1 first-letter:font-serif first-letter:text-[3.6em] first-letter:font-bold first-letter:leading-[0.78] first-letter:text-[#1c1914] first-letter:[font-variation-settings:'WONK'_1] ${className ?? ""}`}
    >
      {children}
    </p>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §4 — THE INK CHART LIBRARY · data drawn like newspaper graphics
 *  All charts share the conventions: 2px ink strokes, vermilion for the story,
 *  press-blue secondaries, halftone fills, hairline axes, mono labels.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Normalises a series to SVG points within a width/height box. */
export function inkScale(data: ReadonlyArray<number>, w: number, h: number, pad = 6) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1 || 1);
  return data.map((v, i) => ({
    x: pad + i * step,
    y: h - pad - ((v - min) / span) * (h - pad * 2),
  }));
}

/** Builds a polyline path string from scaled points. */
export function inkPathFrom(pts: ReadonlyArray<{ x: number; y: number }>) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/**
 * Ink line chart — draws itself on scroll. Optionally marks one anomalous
 * point with a vermilion ring (the story the editor circled).
 */
export function InkLine({
  data,
  w = 320,
  h = 110,
  stroke = INK,
  markIndex,
  dashed = false,
  duration = 1.3,
  className,
}: {
  data: ReadonlyArray<number>;
  w?: number;
  h?: number;
  stroke?: string;
  /** index of the data point to circle in vermilion */
  markIndex?: number;
  dashed?: boolean;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pts = useMemo(() => inkScale(data, w, h), [data, w, h]);
  const d = useMemo(() => inkPathFrom(pts), [pts]);
  const mark = markIndex !== undefined ? pts[markIndex] : undefined;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-full w-full ${className ?? ""}`} preserveAspectRatio="none" aria-hidden>
      <line x1="0" y1={h - 1} x2={w} y2={h - 1} stroke={RULE} strokeWidth="1" />
      <InkPath d={d} stroke={stroke} strokeWidth={2.2} dashed={dashed} duration={duration} />
      {mark && (
        <g>
          <circle cx={mark.x} cy={mark.y} r="3.2" fill={VERMILION} />
          <motion.circle
            cx={mark.x}
            cy={mark.y}
            r="9"
            fill="none"
            stroke={VERMILION}
            strokeWidth="2"
            initial={reduce ? undefined : { opacity: 0, scale: 1.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: duration + 0.1, duration: 0.4, ease: EASE_INK }}
            style={{ transformOrigin: `${mark.x}px ${mark.y}px` }}
          />
        </g>
      )}
    </svg>
  );
}

/** Ink bars — grow from the baseline, staggered, with optional value labels. */
export function InkBars({
  data,
  labels,
  w = 320,
  h = 120,
  highlight,
  className,
}: {
  data: ReadonlyArray<number>;
  labels?: ReadonlyArray<string>;
  w?: number;
  h?: number;
  /** index drawn in vermilion */
  highlight?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(...data) || 1;
  const labelRoom = labels ? 16 : 4;
  const gap = 10;
  const bw = (w - gap * (data.length + 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-full w-full ${className ?? ""}`} aria-hidden>
      <line x1="0" y1={h - labelRoom} x2={w} y2={h - labelRoom} stroke={INK} strokeWidth="1.5" />
      {data.map((v, i) => {
        const bh = (v / max) * (h - labelRoom - 10);
        const x = gap + i * (bw + gap);
        const isHot = i === highlight;
        return (
          <g key={`${i}-${v}`}>
            <motion.rect
              x={x}
              y={h - labelRoom - bh}
              width={bw}
              height={bh}
              fill={isHot ? VERMILION : INK}
              fillOpacity={isHot ? 1 : 0.88}
              initial={reduce ? undefined : { scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.65, delay: i * 0.06, ease: EASE_INK }}
              style={{ transformOrigin: `${x + bw / 2}px ${h - labelRoom}px` }}
            />
            {labels?.[i] && (
              <text
                x={x + bw / 2}
                y={h - 3}
                textAnchor="middle"
                fontSize="8.5"
                fontFamily="var(--font-mono)"
                fill={INK_FADED}
              >
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Halftone area chart — line with a dot-screen fill, very "printed graphic". */
export function InkArea({
  data,
  w = 320,
  h = 110,
  stroke = INK,
  className,
}: {
  data: ReadonlyArray<number>;
  w?: number;
  h?: number;
  stroke?: string;
  className?: string;
}) {
  const id = useId().replace(/[:]/g, "");
  const pts = useMemo(() => inkScale(data, w, h), [data, w, h]);
  const line = useMemo(() => inkPathFrom(pts), [pts]);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-full w-full ${className ?? ""}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <pattern id={`ht-${id}`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill={stroke} fillOpacity="0.28" />
        </pattern>
      </defs>
      <motion.path
        d={area}
        fill={`url(#ht-${id})`}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.5 }}
      />
      <InkPath d={line} stroke={stroke} strokeWidth={2.2} />
      <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} stroke={RULE} strokeWidth="1" />
    </svg>
  );
}

/** Ink gauge — a half-dial drawn like an instrument plate. */
export function InkGauge({
  value,
  label,
  w = 180,
  className,
}: {
  /** 0–100 */
  value: number;
  label?: string;
  w?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const h = w * 0.62;
  const cx = w / 2;
  const cy = h * 0.92;
  const r = w * 0.4;
  const angle = Math.PI * (1 - value / 100);
  const nx = cx + r * 0.82 * Math.cos(angle);
  const ny = cy - r * 0.82 * Math.sin(angle);
  const arc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <InkPath d={arc} stroke={INK} strokeWidth={2.4} duration={0.9} />
      {Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI * (1 - i / 10);
        const x1 = cx + (r - 6) * Math.cos(a);
        const y1 = cy - (r - 6) * Math.sin(a);
        const x2 = cx + r * Math.cos(a);
        const y2 = cy - r * Math.sin(a);
        return <line key={`t${a.toFixed(4)}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK_SOFT} strokeWidth="1.4" />;
      })}
      <motion.line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke={VERMILION}
        strokeWidth="2.6"
        strokeLinecap="round"
        initial={reduce ? undefined : { rotate: -90 }}
        whileInView={{ rotate: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5, ease: EASE_INK, type: "tween" }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      <circle cx={cx} cy={cy} r="3.4" fill={INK} />
      {label && (
        <text x={cx} y={h - 2} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={INK_FADED}>
          {label}
        </text>
      )}
    </svg>
  );
}

/** Dot-matrix map plate with vermilion incident markers. */
export function InkDotMap({
  w = 320,
  h = 150,
  markers = [],
  className,
}: {
  w?: number;
  h?: number;
  /** relative coords 0–1 */
  markers?: ReadonlyArray<{ x: number; y: number; label?: string }>;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const dots = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    const cols = 26;
    const rows = 12;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // organic coastline mask — deterministic, no Math.random
        const edge =
          Math.sin(c * 0.55) * 1.6 + Math.cos(r * 0.8) * 1.4 + Math.sin((c + r) * 0.33) * 1.2;
        if (r > 0.5 + edge * 0.4 && r < rows - 1.2 + edge * 0.3 && c > 1.5 - edge && c < cols - 2 + edge * 0.5) {
          out.push({ x: (c / (cols - 1)) * (w - 16) + 8, y: (r / (rows - 1)) * (h - 16) + 8 });
        }
      }
    }
    return out;
  }, [w, h]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`h-full w-full ${className ?? ""}`} aria-hidden>
      {dots.map((d) => (
        <circle key={`${d.x.toFixed(1)}-${d.y.toFixed(1)}`} cx={d.x} cy={d.y} r="1.5" fill={INK} fillOpacity="0.3" />
      ))}
      {markers.map((m, i) => (
        <g key={`${m.x}-${m.y}`}>
          <motion.circle
            cx={m.x * w}
            cy={m.y * h}
            r="4"
            fill={VERMILION}
            initial={reduce ? undefined : { scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 + i * 0.18, ...SPRING_STAMP }}
            style={{ transformOrigin: `${m.x * w}px ${m.y * h}px` }}
          />
          <circle cx={m.x * w} cy={m.y * h} r="8.5" fill="none" stroke={VERMILION} strokeWidth="1.6" strokeOpacity="0.55" />
          {m.label && (
            <text
              x={m.x * w + 13}
              y={m.y * h + 3.5}
              fontSize="9"
              fontFamily="var(--font-mono)"
              fontWeight="600"
              fill={INK}
            >
              {m.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §5 — ACTIONS · ink buttons and crafted links
 * ════════════════════════════════════════════════════════════════════════════ */

/** Primary ink button — solid ink, paper text, mechanical press on tap. */
export function InkButton({
  href,
  children,
  tone = "ink",
  className,
}: {
  href: string;
  children: ReactNode;
  tone?: "ink" | "vermilion" | "outline";
  className?: string;
}) {
  const tones = {
    ink: "bg-[#1c1914] text-[#f6f1e7] hover:bg-[#33291c] border-[#1c1914]",
    vermilion: "bg-[#bf3415] text-[#f6f1e7] hover:bg-[#a52c10] border-[#bf3415]",
    outline: "bg-transparent text-[#1c1914] hover:bg-[#1c1914]/5 border-[#1c1914]",
  } as const;
  return (
    <motion.span whileTap={{ scale: 0.97, y: 1 }} className="inline-block">
      <Link
        href={href}
        className={`group inline-flex h-12 items-center justify-center gap-2 border-2 px-6 font-grotesk text-[13px] font-bold uppercase tracking-[0.14em] shadow-[3px_3px_0_#1c1914] transition-all hover:shadow-[1px_1px_0_#1c1914] hover:translate-x-[2px] hover:translate-y-[2px] ${tones[tone]} ${className ?? ""}`}
      >
        {children}
      </Link>
    </motion.span>
  );
}

/** Editorial link — ink underline that thickens on hover. */
export function InkLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const inner = (
    <span
      className={`font-grotesk text-[14px] font-semibold text-[#2b4a8b] underline decoration-[#2b4a8b]/40 decoration-2 underline-offset-[5px] transition-all hover:decoration-[#bf3415] hover:decoration-[3px] ${className ?? ""}`}
    >
      {children}
    </span>
  );
  return href.startsWith("#") ? <a href={href}>{inner}</a> : <Link href={href}>{inner}</Link>;
}
