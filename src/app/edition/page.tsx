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
  Activity,
  AppWindow,
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  BadgeCheck,
  Ban,
  Bell,
  Binary,
  Blocks,
  Bookmark,
  Boxes,
  Brain,
  BrainCircuit,
  Bug,
  Cable,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircuitBoard,
  Clapperboard,
  Clock,
  CloudOff,
  CloudSun,
  Coffee,
  Columns,
  Columns3,
  Command,
  Compass,
  Construction,
  Copy,
  CornerDownRight,
  CornerRightDown,
  CornerUpLeft,
  Cpu,
  Crosshair,
  Database,
  DatabaseZap,
  EyeOff,
  FileCheck,
  FileClock,
  FileDown,
  FileInput,
  FileOutput,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Files,
  Fingerprint,
  Flag,
  FolderLock,
  FolderTree,
  Gauge,
  GitBranch,
  GitMerge,
  Globe,
  HardDrive,
  Hash,
  History,
  Icon,
  Import,
  Inbox,
  KeyRound,
  Landmark,
  Layers,
  Layout,
  ListChecks,
  Lock,
  Mail,
  MailCheck,
  MailOpen,
  MailQuestion,
  Mailbox,
  Map,
  MapPin,
  Medal,
  Megaphone,
  MemoryStick,
  Menu,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Mic,
  Microscope,
  Minus,
  Moon,
  MousePointer2,
  Network,
  Newspaper,
  NotebookPen,
  Palette,
  Paperclip,
  PenLine,
  PenTool,
  Percent,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Presentation,
  Printer,
  RadioTower,
  Rocket,
  RotateCcw,
  Route,
  Rows,
  Ruler,
  Scale,
  Scan,
  ScanLine,
  Scissors,
  ScrollText,
  Search,
  SearchX,
  Send,
  Share,
  ShieldCheck,
  ShieldOff,
  Sigma,
  Siren,
  Smartphone,
  Sparkles,
  Split,
  SquareTerminal,
  Store,
  SunMoon,
  Sunrise,
  Sunset,
  Tag,
  Target,
  Ticket,
  Timer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Truck,
  Volume,
  Watch,
  WifiOff,
  Workflow,
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
const EDITION = {
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
const INK = "#1c1914";
const INK_SOFT = "#4a4438";
const INK_FADED = "#857c69";
const PAPER = "#f6f1e7";
const PAPER_DEEP = "#eee6d6";
const PAPER_SHADE = "#e4dac5";
const RULE = "#d6ccb6";
const VERMILION = "#bf3415";
const PRESS_BLUE = "#2b4a8b";
const STAMP_GREEN = "#2f6b3f";

/** Easing vocabulary. EASE_INK for reveals, EASE_PRESS for mechanical moves. */
const EASE_INK = [0.22, 1, 0.36, 1] as const;
const EASE_PRESS = [0.65, 0, 0.35, 1] as const;
const SPRING_STAMP = { type: "spring", stiffness: 320, damping: 22 } as const;
const SPRING_PLATE = { stiffness: 110, damping: 26 } as const;

/* Shared class recipes — full literal strings so Tailwind can see them. */
const T = {
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
function useDriftProgress(ref: RefObject<HTMLElement | null>) {
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
function Parallax({
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
function StickyScene({
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
function useSegment(progress: MotionValue<number>, from: number, to: number) {
  return useTransform(progress, [from, to], [0, 1], { clamp: true });
}

/** Editorial entrance: content rises out of a clipped line, once, in view. */
function RiseIn({
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
function SettleIn({
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
function DeckReveal({
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
function CountUpInk({
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
function TypeOn({
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
function InkPath({
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
function PenUnderline({
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
function PenCircle({
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
function PenStrike({
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
function Rule({ className }: { className?: string }) {
  return <div className={`h-px w-full bg-[#d6ccb6] ${className ?? ""}`} />;
}

/** Classic double rule — heavy over hairline, the broadsheet's signature. */
function DoubleRule({ className }: { className?: string }) {
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
function SectionMast({
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
function FolioLine({ page, note, className }: { page: string; note?: string; className?: string }) {
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
function Stamp({
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
function MarginNote({
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
function PullQuote({ children, cite, className }: { children: ReactNode; cite?: string; className?: string }) {
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
function Byline({ name, desk, className }: { name: string; desk: string; className?: string }) {
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
function DropCapParagraph({ children, className }: { children: ReactNode; className?: string }) {
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
function inkScale(data: ReadonlyArray<number>, w: number, h: number, pad = 6) {
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
function inkPathFrom(pts: ReadonlyArray<{ x: number; y: number }>) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/**
 * Ink line chart — draws itself on scroll. Optionally marks one anomalous
 * point with a vermilion ring (the story the editor circled).
 */
function InkLine({
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
function InkBars({
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
function InkArea({
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
function InkGauge({
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
function InkDotMap({
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
function InkButton({
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
function InkLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const inner = (
    <span
      className={`font-grotesk text-[14px] font-semibold text-[#2b4a8b] underline decoration-[#2b4a8b]/40 decoration-2 underline-offset-[5px] transition-all hover:decoration-[#bf3415] hover:decoration-[3px] ${className ?? ""}`}
    >
      {children}
    </span>
  );
  return href.startsWith("#") ? <a href={href}>{inner}</a> : <Link href={href}>{inner}</Link>;
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 01 — SpineSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §SECTION 01 — SPINE · the reading apparatus
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The spine is the only piece of the broadsheet that never scrolls away: a
 *  slim newsroom bar pinned over the page, the vermilion reading-progress
 *  rule beneath it, the "EN KIOSQUE" folio strip hugging the right edge on
 *  wide presses, and — on small formats — a full-paper sommaire that drops
 *  over the page like tomorrow's front page being pulled down from the rack.
 *
 *  Editorial logic
 *  ───────────────
 *  • Over the masthead the bar is bare ink on the page itself — the big
 *    nameplate below it carries the identity, so the bar stays quiet.
 *    Past 60 px of scroll the bar "inks in": paper background, offset-print
 *    lift, and the broadsheet's signature DoubleRule along its bottom edge.
 *  • The 3 px vermilion rule under the bar is the editor's pen dragged across
 *    the whole edition — scaleX driven by page scroll through a plate spring,
 *    origin left, so it reads as ink being laid rather than a loading bar.
 *  • The dateline tag only appears once the bar has inked: while the masthead
 *    is on screen its own dateline does that job; the chrome never repeats
 *    what the page is already saying.
 *  • The mobile sommaire is typeset as a newspaper index: numbered rubriques
 *    in big wonky serif, hairline rules between entries, lettered "cahiers"
 *    for secondary destinations, the HORS LIGNE stamp slammed beside the
 *    nameplate, and the small print a security reviewer actually reads.
 *
 *  Structure (fixed chrome — deliberately NO contentVisibility on the root;
 *  the section renders as a height-0 shell whose children are all fixed):
 *    SpineSection
 *    ├─ SpineSkipLink        a11y: jump straight to the lead story
 *    ├─ SpineBar             fixed top bar (nameplate · rail · actions)
 *    │   └─ SpineProgressRule
 *    ├─ SpineKioskStrip      right-edge vertical folio, xl+ only
 *    └─ SpineMobileIndex     AnimatePresence full-paper sommaire, <md only
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §S1 — DATA · rubriques, cahiers, small print
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The four rubriques the bar points at. Page folios match the edition's real
 * section order (Press = p. 06, Classified = p. 07, Questions = p. 15,
 * Subscribe = p. 16) so the index reads like an honest table of contents.
 * Order matters: the scroll-spy walks this list top-to-bottom and keeps the
 * last anchor whose section has crossed the reading line.
 */
const SPINE_RUBRIQUES = [
  {
    no: "01",
    href: "#workflow",
    label: "Workflow",
    fr: "La chaîne de fabrication",
    page: "p. 06",
    blurb: "From raw CSV to a signed morning report — the golden path, press by press.",
  },
  {
    no: "02",
    href: "#capabilities",
    label: "Capabilities",
    fr: "Les petites annonces",
    page: "p. 07",
    blurb: "Thirty-odd tools in the classified index: forecasting, geo plates, exports, voice.",
  },
  {
    no: "03",
    href: "#faq",
    label: "FAQ",
    fr: "Questions au rédacteur",
    page: "p. 15",
    blurb: "Short answers on hardware, formats, licences — and what offline actually means.",
  },
  {
    no: "04",
    href: "#subscribe",
    label: "Subscribe",
    fr: "Le kiosque",
    page: "p. 16",
    blurb: "One desk licence, zero telemetry. The edition prints on your machine every morning.",
  },
] as const;

type SpineRubrique = (typeof SPINE_RUBRIQUES)[number];

/**
 * Secondary destinations in the mobile sommaire, lettered like newspaper
 * supplements (cahier A, B, C) rather than numbered with the rubriques —
 * they are services, not stories.
 */
const SPINE_INDEX_EXTRAS = [
  {
    cahier: "A",
    href: "#lead",
    label: "La une",
    note: "This morning's anomaly, investigated line by line.",
    Icon: Newspaper,
  },
  {
    cahier: "B",
    href: "/dashboard",
    label: "Ouvrir l'application",
    note: "Straight to the desk. The report is already waiting.",
    Icon: AppWindow,
  },
  {
    cahier: "C",
    href: "#top",
    label: "Revenir en tête",
    note: "Back to the nameplate and the front page.",
    Icon: ArrowUp,
  },
] as const;

type SpineExtraEntry = (typeof SPINE_INDEX_EXTRAS)[number];

/**
 * The small print at the foot of the sommaire — the three sentences the
 * security team that approves this tool will actually read. Icons are pulled
 * from the merged lucide import; the copy keeps the bilingual newsroom rule:
 * English editorial voice, French data labels.
 */
const SPINE_MENU_NOTES = [
  {
    Icon: WifiOff,
    text: "Fully offline. The press runs on your machine, not on somebody else's cloud.",
  },
  {
    Icon: Lock,
    text: "Nothing is uploaded, telemetered or quietly “anonymised”. Columns stay at the desk.",
  },
  {
    Icon: FileSpreadsheet,
    text: "One input — DailyTransactions.csv. One output — the finished morning report.",
  },
] as const;

type SpineMenuNote = (typeof SPINE_MENU_NOTES)[number];

/** French aria strings, grouped so the chrome speaks one consistent voice. */
const SPINE_A11Y = {
  nameplate: "Data Navigator — retour à la une",
  rail: "Rubriques de l'édition",
  openIndex: "Ouvrir le sommaire",
  closeIndex: "Fermer le sommaire",
  index: "Sommaire de l'édition",
  skip: "Skip to the lead story",
} as const;

/** Scroll depth (px) past which the bar inks in. The masthead owns the top. */
const SPINE_INK_THRESHOLD = 60;

/* ────────────────────────────────────────────────────────────────────────────
 *  §S2 — ATOMS · skip link, nameplate, rail links, menu button
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A11y skip link — invisible until keyboard focus, then it surfaces as a
 * proper ink button pinned top-left, above every other piece of chrome.
 * First tab stop of the entire page.
 */
function SpineSkipLink() {
  return (
    <a
      href="#lead"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:items-center focus:gap-2 focus:border-2 focus:border-[#1c1914] focus:bg-[#f6f1e7] focus:px-5 focus:py-3 focus:font-grotesk focus:text-[12px] focus:font-bold focus:uppercase focus:tracking-[0.16em] focus:text-[#1c1914] focus:shadow-[3px_3px_0_#1c1914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
    >
      {SPINE_A11Y.skip}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </a>
  );
}

/** Hairline interpunct used between metadata fragments in the bar. */
function SpineDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[3px] w-[3px] rounded-full bg-[#857c69] ${className ?? ""}`}
    />
  );
}

/** Vertical hairline separating clusters inside the bar. */
function SpineHairline({ className }: { className?: string }) {
  return <span aria-hidden className={`h-6 w-px bg-[#d6ccb6] ${className ?? ""}`} />;
}

/**
 * The nameplate monogram — "DN" set in wonky serif inside a 2 px ink box,
 * with a tiny vermilion registration mark pinned to the top-right corner
 * (the printer's mark that says this plate is aligned). Mechanical press
 * on tap, like every button on the page.
 */
function SpineMonogram() {
  return (
    <span className="relative grid h-9 w-9 shrink-0 place-items-center border-2 border-[#1c1914] font-serif text-[15px] font-black tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1] md:h-10 md:w-10 md:text-[16px]">
      DN
      <span aria-hidden className="absolute -right-[5px] -top-[5px] h-2 w-2 bg-[#bf3415]" />
    </span>
  );
}

/**
 * Monogram + wordmark, the whole cluster a single link back to the top.
 * The serif wordmark always renders; the folio sub-line only earns its
 * space on lg+ where the bar can breathe.
 */
function SpineNameplate() {
  return (
    <motion.span whileTap={{ scale: 0.97 }} className="inline-block">
      <a
        href="#top"
        aria-label={SPINE_A11Y.nameplate}
        className="group flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <SpineMonogram />
        <span className="flex flex-col">
          <span className="whitespace-nowrap font-serif text-[16px] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1] md:text-[17px]">
            The Daily Edition
          </span>
          <span className={`mt-1 hidden whitespace-nowrap lg:block ${T.folio}`}>
            par Data Navigator — édition du matin
          </span>
        </span>
      </a>
    </motion.span>
  );
}

/**
 * One rubrique link on the desktop rail. The vermilion underline is a pure
 * scaleX transform: drawn for the active section, drawn on hover/focus for
 * the rest. Numbers step back below lg so the rail fits a 768 px press.
 */
function SpineNavLink({ item, active }: { item: SpineRubrique; active: boolean }) {
  return (
    <a
      href={item.href}
      aria-current={active ? "true" : undefined}
      className="group relative flex items-baseline gap-1.5 whitespace-nowrap px-1 py-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] lg:text-[12px] lg:tracking-[0.18em]"
    >
      <span aria-hidden className="hidden font-mono text-[9px] font-normal text-[#bf3415] lg:inline">
        {item.no}
      </span>
      {item.label}
      <span
        aria-hidden
        className={`absolute inset-x-1 bottom-[3px] h-[2px] origin-left bg-[#bf3415] transition-transform duration-300 motion-reduce:transition-none ${
          active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100"
        }`}
      />
    </a>
  );
}

/**
 * Dateline tag — slides into the bar only once it has inked in, because the
 * masthead's own dateline is doing the job while it is on screen. Chrome
 * should never repeat what the page already says.
 */
function SpineEditionTag({ inked }: { inked: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="hidden xl:block">
      <AnimatePresence initial={false}>
        {inked && (
          <motion.span
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: EASE_INK }}
            className="flex items-center gap-2.5"
          >
            <span className={`whitespace-nowrap ${T.folio}`}>{EDITION.dateline}</span>
            <SpineDot />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-[#bf3415]">
              {EDITION.issue}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Hamburger — a bordered, offset-shadowed press button (the same mechanical
 * grammar as InkButton, scaled to chrome). The glyph swaps Menu ⇄ X with a
 * quarter-turn; reduced motion collapses that to a plain crossfade.
 */
function SpineMenuButton({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="spine-index"
      aria-label={open ? SPINE_A11Y.closeIndex : SPINE_A11Y.openIndex}
      className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[#1c1914] bg-transparent text-[#1c1914] shadow-[2px_2px_0_#1c1914] transition-transform active:translate-x-[1px] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] motion-reduce:transition-none md:hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.span
            key="spine-glyph-close"
            initial={reduce ? { opacity: 0 } : { rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_PRESS }}
            className="grid place-items-center"
          >
            <X aria-hidden className="h-5 w-5" />
          </motion.span>
        ) : (
          <motion.span
            key="spine-glyph-open"
            initial={reduce ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { rotate: -90, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_PRESS }}
            className="grid place-items-center"
          >
            <Menu aria-hidden className="h-5 w-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §S3 — APPARATUS · progress rule, kiosk strip, rail, the bar itself
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The reading-progress rule: 3 px of vermilion laid across the page width as
 * the reader works through the edition. Driven by page scrollYProgress
 * through the plate spring so the ink settles rather than snaps; reduced
 * motion gets the raw, un-sprung value (still accurate, never bouncy).
 * The faint ink bed underneath keeps the rule legible over the masthead.
 */
function SpineProgressRule() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const sprung = useSpring(scrollYProgress, SPRING_PLATE);
  const scaleX = reduce ? scrollYProgress : sprung;
  return (
    <div aria-hidden className="relative h-[3px] w-full bg-[#1c1914]/[0.07]">
      <motion.div
        className="absolute inset-0 bg-[#bf3415]"
        style={{ scaleX, transformOrigin: "left center" }}
      />
    </div>
  );
}

/**
 * Typographer's gauge — the little tick ruler punctuating the kiosk strip.
 * Static SVG, hairline strokes, every fourth tick heavier. Pure furniture.
 */
function SpineKioskRuler() {
  return (
    <svg aria-hidden viewBox="0 0 10 96" className="h-24 w-2.5 text-[#857c69]">
      {Array.from({ length: 13 }, (_, i) => (
        <line
          key={`tick-${i * 8}`}
          x1={i % 4 === 0 ? 1 : 4.5}
          y1={i * 8}
          x2={10}
          y2={i * 8}
          stroke="currentColor"
          strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
        />
      ))}
    </svg>
  );
}

/**
 * Right-edge folio strip — "EN KIOSQUE — ÉDITION № 847" set vertically along
 * the page edge on xl+ presses, like the spine label on a bound volume.
 *
 * It drifts a few pixels against the scroll. The preamble's <Parallax> can't
 * serve here: it measures an element's *document* offsets, and fixed chrome
 * never travels through the document — so we drive the same grammar by hand
 * from page scrollYProgress through the plate spring. Decorative, untabbable,
 * and invisible to readers below xl and to screen readers everywhere.
 */
function SpineKioskStrip() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const drift = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [26, -26]);
  const settled = useSpring(drift, SPRING_PLATE);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-0 top-1/2 z-[40] hidden -translate-y-1/2 xl:block"
    >
      <motion.div style={{ y: settled }} className="flex flex-col items-center gap-4 pr-3">
        <span className={`${reduce ? "" : "ed-caret"} h-1.5 w-1.5 bg-[#bf3415]`} />
        <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.32em] text-[#1c1914] [writing-mode:vertical-rl]">
          En kiosque
        </span>
        <SpineKioskRuler />
        <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#4a4438] [writing-mode:vertical-rl]">
          Édition {EDITION.issue}
        </span>
        <SpineKioskRuler />
        <span className="border-[1.5px] border-[#bf3415] px-[3px] py-2 font-grotesk text-[9px] font-black uppercase tracking-[0.22em] text-[#bf3415] [writing-mode:vertical-rl]">
          100 % hors ligne
        </span>
      </motion.div>
    </div>
  );
}

/**
 * Desktop rubrique rail with a hand-rolled scroll-spy: on every scroll frame
 * we walk the four anchor targets (they appear in page order) and keep the
 * last one whose top has crossed the reading line at 35 % of the viewport.
 * Rect reads on four cached elements are cheap — no observers to juggle when
 * downstream sections resize themselves under contentVisibility.
 */
function SpineRubriqueRail() {
  const { scrollY } = useScroll();
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);

  useMotionValueEvent(scrollY, "change", () => {
    let current: string | null = null;
    for (const r of SPINE_RUBRIQUES) {
      const el = document.getElementById(r.href.slice(1));
      if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) {
        current = r.href;
      }
    }
    if (current !== activeRef.current) {
      activeRef.current = current;
      setActive(current);
    }
  });

  return (
    <nav
      aria-label={SPINE_A11Y.rail}
      className="hidden min-w-0 flex-1 items-center justify-center gap-3 md:flex lg:gap-6"
    >
      {SPINE_RUBRIQUES.map((item) => (
        <SpineNavLink key={item.href} item={item} active={active === item.href} />
      ))}
    </nav>
  );
}

/**
 * The bar. A 56/64 px strip of fixed chrome:
 *   left   — nameplate (monogram + wordmark) and, once inked, the dateline;
 *   centre — the rubrique rail (md+);
 *   right  — "Se connecter" InkLink and a chrome-scale "S'abonner" InkButton
 *            (h-9 via Tailwind v4 important overrides — the preamble button
 *            is fixed at h-12, too tall for a slim newspaper bar);
 *   <md    — the hamburger that opens the sommaire.
 *
 * Ink-in behaviour: a paper layer + offset-print lift crossfades behind the
 * content, and the signature DoubleRule scales down along the bottom edge —
 * opacity and transform only, the bar's height never animates.
 */
function SpineBar({
  indexOpen,
  onToggleIndex,
  menuButtonRef,
}: {
  indexOpen: boolean;
  onToggleIndex: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const [inked, setInked] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => {
    setInked(v > SPINE_INK_THRESHOLD);
  });

  // Reloading mid-page must not leave the bar transparent over body copy —
  // motion only emits "change" events, so seed the state once on mount.
  useEffect(() => {
    setInked(window.scrollY > SPINE_INK_THRESHOLD);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-[60]">
      <div className="relative">
        {/* paper layer — fades in past the masthead; shadow rides the layer's
            opacity, so no box-shadow is ever animated directly */}
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]"
          initial={false}
          animate={{ opacity: inked ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE_INK }}
        />

        <div className="relative mx-auto flex h-14 max-w-[1560px] items-center justify-between gap-3 px-4 sm:px-6 md:h-16 md:gap-4 xl:px-10">
          {/* left — nameplate cluster */}
          <div className="flex min-w-0 items-center gap-4 xl:gap-5">
            <SpineNameplate />
            <SpineHairline className="hidden xl:block" />
            <SpineEditionTag inked={inked} />
          </div>

          {/* centre — rubrique rail, md+ */}
          <SpineRubriqueRail />

          {/* right — session actions + hamburger */}
          <div className="flex shrink-0 items-center gap-3 md:gap-4 xl:gap-5">
            <span className="hidden md:inline-block">
              <InkLink href="/login">Se connecter</InkLink>
            </span>
            <span className="hidden sm:inline-block">
              <InkButton
                href="/signup"
                tone="vermilion"
                className="h-9! px-4! text-[11px]! tracking-[0.12em]!"
              >
                S'abonner
                <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </InkButton>
            </span>
            <SpineMenuButton open={indexOpen} onToggle={onToggleIndex} buttonRef={menuButtonRef} />
          </div>
        </div>

        {/* the broadsheet's signature — scales down from the bar's bottom edge
            once inked; absolute so the bar's height never changes */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          initial={false}
          animate={{ opacity: inked ? 1 : 0, scaleY: inked ? 1 : 0 }}
          style={{ transformOrigin: "center bottom" }}
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE_INK }}
        >
          <DoubleRule />
        </motion.div>
      </div>

      <SpineProgressRule />
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §S4 — THE SOMMAIRE · full-paper mobile index, typeset like page two
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One numbered rubrique entry in the sommaire: vermilion folio number, a big
 * wonky serif headline, the French rubrique name and a one-line standfirst,
 * the page folio at the right edge, and a hairline rule below. The arrow
 * glyph sets itself only on hover/focus — quiet by default, like a proof.
 */
function SpineIndexEntry({
  item,
  order,
  onSelect,
}: {
  item: SpineRubrique;
  order: number;
  onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { y: 34, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.18 + order * 0.08, duration: 0.6, ease: EASE_INK }}
    >
      <a
        href={item.href}
        onClick={onSelect}
        className="group block py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <span className="flex items-baseline justify-between gap-4">
          <span className="flex min-w-0 items-baseline gap-4">
            <span aria-hidden className="font-mono text-[12px] text-[#bf3415]">
              {item.no}
            </span>
            <span className="font-serif text-[clamp(2.1rem,8.5vw,3rem)] font-semibold leading-[0.98] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              {item.label}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <ArrowUpRight
              aria-hidden
              className="h-5 w-5 -translate-x-1 translate-y-1 text-[#bf3415] opacity-0 transition-transform duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
            />
            <span className={T.folio}>{item.page}</span>
          </span>
        </span>
        <span className="mt-2 flex flex-col gap-1 pl-8">
          <span className={T.kicker}>{item.fr}</span>
          <span className="font-serif text-[14px] italic leading-snug text-[#4a4438]">
            {item.blurb}
          </span>
        </span>
      </a>
      <Rule />
    </motion.li>
  );
}

/**
 * Lettered cahier row — smaller than the rubriques, set with its icon in a
 * hairline box. Routes ("/dashboard") go through <Link>; anchors stay plain.
 */
function SpineIndexExtraRow({
  item,
  order,
  onSelect,
}: {
  item: SpineExtraEntry;
  order: number;
  onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const inner = (
    <span className="flex items-center gap-4 py-3.5">
      <span aria-hidden className="font-mono text-[11px] text-[#bf3415]">
        {item.cahier}.
      </span>
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438]"
      >
        <item.Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-serif text-[19px] font-semibold leading-tight text-[#1c1914]">
          {item.label}
        </span>
        <span className="font-grotesk text-[12px] leading-snug text-[#857c69]">{item.note}</span>
      </span>
      <ArrowRight aria-hidden className="ml-auto h-4 w-4 shrink-0 text-[#857c69]" />
    </span>
  );
  const linkClass =
    "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]";
  return (
    <motion.li
      initial={reduce ? false : { y: 22, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.52 + order * 0.06, duration: 0.5, ease: EASE_INK }}
    >
      {item.href.startsWith("#") ? (
        <a href={item.href} onClick={onSelect} className={linkClass}>
          {inner}
        </a>
      ) : (
        <Link href={item.href} onClick={onSelect} className={linkClass}>
          {inner}
        </Link>
      )}
      <Rule />
    </motion.li>
  );
}

/**
 * Sommaire masthead — repeats the nameplate at index scale, slams the
 * HORS LIGNE stamp beside the dateline, and carries the close button.
 */
function SpineIndexMasthead({
  onClose,
  closeRef,
}: {
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SpineMonogram />
          <span className="font-serif text-[22px] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            The Daily Edition
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={T.folio}>
            {EDITION.dateline} · {EDITION.issue}
          </span>
          <Stamp tilt={5} className="text-[10px]">
            Hors ligne
          </Stamp>
        </div>
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={SPINE_A11Y.closeIndex}
        className="grid h-11 w-11 shrink-0 place-items-center border-2 border-[#1c1914] text-[#1c1914] shadow-[2px_2px_0_#1c1914] transition-transform active:translate-x-[1px] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] motion-reduce:transition-none"
      >
        <X aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * Sommaire foot — the subscription block (the same two actions as the bar,
 * at full size now that there is room), the security small print, and the
 * closing folio line. The pen underlines "every morning" because that is
 * the promise the whole product keeps.
 */
function SpineIndexFooter({ onSelect }: { onSelect: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.72, duration: 0.55, ease: EASE_INK }}
      className="flex flex-col gap-7"
    >
      <div className="flex flex-col gap-4">
        <p className="font-serif text-[20px] font-medium leading-snug text-[#1c1914]">
          The edition prints on your desk <PenUnderline delay={1}>every morning</PenUnderline>.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <span onClickCapture={onSelect}>
            <InkButton href="/signup" tone="vermilion">
              S'abonner
              <ArrowUpRight aria-hidden className="h-4 w-4" />
            </InkButton>
          </span>
          <span onClickCapture={onSelect}>
            <InkLink href="/login">Se connecter</InkLink>
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {SPINE_MENU_NOTES.map((note) => (
          <SpineMenuNoteRow key={note.text} note={note} />
        ))}
      </ul>

      <div>
        <Rule className="mb-3" />
        <FolioLine page="Sommaire" note={EDITION.motto} />
      </div>
    </motion.div>
  );
}

/** One line of sommaire small print: hairline-boxed icon + a dry sentence. */
function SpineMenuNoteRow({ note }: { note: SpineMenuNote }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438]"
      >
        <note.Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-grotesk text-[12.5px] leading-snug text-[#4a4438]">{note.text}</span>
    </li>
  );
}

/**
 * The full-paper sommaire. Drops from the top edge like a sheet pulled off
 * the rack (EASE_PRESS — mechanical, not bouncy), scroll-locks the body
 * while open, closes on Escape, on any selection, and automatically if the
 * viewport grows past md (where the rail takes over). Minimal dialog
 * semantics: role, aria-modal, initial focus on the close button, focus
 * handed back to the hamburger by the parent on close.
 */
function SpineMobileIndex({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Scroll lock — restored on unmount, i.e. after the exit animation.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape closes, like any well-mannered dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // If the press widens past md while the sommaire is open, the rail takes
  // over — close rather than leaving an orphaned scroll lock behind.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onClose]);

  // First focus lands on the close button.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  // Release the scroll lock *before* the browser performs the anchor jump —
  // a locked body swallows same-page navigation on some engines. The
  // unmount cleanup re-clearing it afterwards is harmless.
  const handleSelect = useCallback(() => {
    document.body.style.overflow = "";
    onClose();
  }, [onClose]);

  return (
    <motion.div
      id="spine-index"
      role="dialog"
      aria-modal="true"
      aria-label={SPINE_A11Y.index}
      initial={reduce ? { opacity: 0 } : { y: "-100%" }}
      animate={reduce ? { opacity: 1 } : { y: 0 }}
      exit={reduce ? { opacity: 0 } : { y: "-102%" }}
      transition={{ duration: 0.55, ease: EASE_PRESS }}
      className="fixed inset-0 z-[80] overflow-y-auto bg-[#f6f1e7] md:hidden"
    >
      <div className="mx-auto flex min-h-full max-w-xl flex-col gap-8 px-5 pb-10 pt-5 sm:px-8">
        <div>
          <SpineIndexMasthead onClose={onClose} closeRef={closeRef} />
          <DoubleRule className="mt-5" />
        </div>

        <div>
          <p className={`${T.kicker} mb-1`}>Sommaire — édition {EDITION.issue}</p>
          <ul className="flex flex-col">
            {SPINE_RUBRIQUES.map((item, i) => (
              <SpineIndexEntry key={item.href} item={item} order={i} onSelect={handleSelect} />
            ))}
          </ul>
        </div>

        <div>
          <p className={`${T.kicker} mb-1`}>Cahiers & services</p>
          <ul className="flex flex-col">
            {SPINE_INDEX_EXTRAS.map((item, i) => (
              <SpineIndexExtraRow key={item.href} item={item} order={i} onSelect={handleSelect} />
            ))}
          </ul>
        </div>

        <div className="mt-auto">
          <SpineIndexFooter onSelect={handleSelect} />
        </div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §S5 — ROOT · height-0 shell, fixed children
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * SpineSection — the page's fixed chrome. Deliberately NOT given
 * contentVisibility (rule 10's exception applies twice over: it is fixed
 * chrome, and hiding it would unmount the very apparatus that tells the
 * reader where they are). The section itself is a height-0 shell; the bar,
 * the kiosk strip and the sommaire all live in fixed layers above the page.
 *
 * Z-order ledger (everything in one place, so later sections can stay out
 * of the chrome's way): kiosk strip 40 · bar 60 · sommaire 80 · skip link
 * 100 (focus only).
 */
function SpineSection() {
  const [indexOpen, setIndexOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const toggleIndex = useCallback(() => setIndexOpen((v) => !v), []);

  // Closing returns focus to the hamburger — without scrolling, since the
  // button lives in fixed chrome and is always on screen anyway.
  const closeIndex = useCallback(() => {
    setIndexOpen(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section id="spine" className="relative h-0">
      <SpineSkipLink />
      <SpineBar indexOpen={indexOpen} onToggleIndex={toggleIndex} menuButtonRef={menuButtonRef} />
      <SpineKioskStrip />
      <AnimatePresence>
        {indexOpen && <SpineMobileIndex onClose={closeIndex} />}
      </AnimatePresence>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 02 — MastheadSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §2 — THE MASTHEAD · the front page, set this morning
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This is the broadsheet's front page — the first impression and the whole
 *  argument in one fold. Data Navigator opens DailyTransactions.csv at dawn and
 *  hands back a finished morning report; the page itself plays the part of that
 *  report, freshly pressed. Nothing here is a SaaS hero: no glass, no glow, no
 *  centred-pill nameplate floating over a gradient. It is a nameplate, ears,
 *  rules, a towering headline, a standfirst, two front-page columns, a graphic
 *  cut into the page, and a "today's edition" box that counts up in ink.
 *
 *  Design intent
 *  ─────────────
 *  • The nameplate is the paper's true name set at display scale — "Data
 *    Navigator" in Fraunces — flanked by two "ears": the date/edition ear and
 *    the offline notice ear, the way a real broadsheet sells weather and price
 *    in the top corners. A double rule closes the plate.
 *  • The lead headline is sentence case, clamp-sized, and rises deck by deck;
 *    the editor's pen underlines the promise and rings the figure that matters.
 *  • The front-page graphic is ONE composed SVG (520×210): a day of hourly
 *    transactions inked as a line, the 16 h peak ringed, a halftone fill, mono
 *    axis ticks — a newspaper graphic, not a dashboard widget.
 *  • The "édition du jour" box stacks two live-feeling figures (97,4 % réussite,
 *    2 147 380 transactions) over a strip of offline stamps. The figures count
 *    up once in view; the stamps slam.
 *  • All entrance motion is transform/opacity/pathLength and honours
 *    prefers-reduced-motion. The caret blinks via the ed-caret utility only.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.0 — TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

type MastheadEarFact = {
  /** the lucide glyph printed beside the line, pencil-light */
  icon: typeof Clock;
  label: string;
  value: string;
};

type MastheadStamp = {
  text: string;
  /** vermilion is the editor's, green is the press-approval ink */
  tone: "ink" | "vermilion" | "green";
  tilt: number;
};

type MastheadProofLine = {
  /** the morning's run, logged like a press operator's checklist */
  step: string;
  detail: string;
  /** the figure or verdict struck at the end of the line */
  mark: string;
};

type MastheadColumn = {
  kicker: string;
  body: string;
};

type MastheadFootFact = {
  label: string;
  value: string;
};

type MastheadChannel = {
  /** French canal label as it prints on the ledger */
  name: string;
  /** transactions on the channel, ground truth for the bar height */
  count: number;
  countStr: string;
  /** the channel's own taux de réussite */
  rate: string;
  /** share of the day's total, rounded for print */
  share: string;
  /** the channel the editor circled — slowest réussite, his beat */
  flagged: boolean;
};

type MastheadIndexEntry = {
  /** the rubrique number and name, as the contents page sets it */
  no: string;
  title: string;
  blurb: string;
  href: string;
  page: string;
};

type MastheadGlossEntry = {
  /** the French data label as it prints across the report */
  term: string;
  gloss: string;
};

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.1 — DATA · the front page is composed from one CSV and a few facts
 *  Numbers are cross-checked against the masthead's own edition record:
 *  2 147 380 rows, 97,4 % réussite, the 16 h peak, five canaux. The hourly
 *  series sums to the day; its high point is the printed heure de pointe.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The two "ears" — date/edition on the left, offline notice on the right. */
const MASTHEAD_EAR_LEFT: ReadonlyArray<MastheadEarFact> = [
  { icon: Clock, label: "Édition du matin", value: "06 h 12" },
  { icon: FileText, label: "Pièce du jour", value: "DailyTransactions.csv" },
];

const MASTHEAD_EAR_RIGHT: ReadonlyArray<MastheadEarFact> = [
  { icon: WifiOff, label: "Imprimé localement", value: "aucune connexion" },
  { icon: Lock, label: "Bouclage", value: "sur l'appareil" },
];

/**
 * Twenty-four hourly transaction counts — Mercredi 11 juin, the day the
 * masthead's CSV records. The curve breathes with the city: a dead 4 h trough,
 * a morning climb, the long working plateau, and the printed 16 h heure de
 * pointe before the evening tail. The peak index (16) is ringed on the plate.
 */
const MASTHEAD_HOURLY: ReadonlyArray<number> = [
  38420, 26110, 18740, 14920, 13380, 21660, 47180, 88240, 121570, 138900, 142310, 149870,
  151240, 144980, 153620, 168410, 184360, 176540, 159870, 138420, 116330, 92180, 67540, 42910,
];

/** The hour the line peaks — printed as the heure de pointe, 16 h 04. */
const MASTHEAD_PEAK_INDEX = 16;

/** x-axis ticks for the hourly plate — quarter-day marks, mono. */
const MASTHEAD_HOUR_TICKS: ReadonlyArray<{ i: number; label: string }> = [
  { i: 0, label: "00 h" },
  { i: 6, label: "06 h" },
  { i: 12, label: "12 h" },
  { i: 16, label: "16 h" },
  { i: 21, label: "21 h" },
];

/** The proof slip — the morning run, logged like a press checklist. */
const MASTHEAD_PROOF: ReadonlyArray<MastheadProofLine> = [
  { step: "Lecture", detail: "DailyTransactions.csv · 2,1 M lignes", mark: "0,8 s" },
  { step: "Requêtes", detail: "DuckDB en mémoire · 17 vues", mark: "1,2 s" },
  { step: "Récit", detail: "briefing rédigé sur l'appareil", mark: "local" },
  { step: "Bouclage", detail: "PDF · DOCX · PPTX prêts", mark: "06 h 12" },
];

/** The approval stamps slammed across the corner of the plate. */
const MASTHEAD_STAMPS: ReadonlyArray<MastheadStamp> = [
  { text: "Hors ligne", tone: "vermilion", tilt: -7 },
  { text: "0 octet transmis", tone: "ink", tilt: 5 },
  { text: "Bon à tirer", tone: "green", tilt: -4 },
];

/** Two front-page columns that carry the lead past the headline. */
const MASTHEAD_COLUMNS: ReadonlyArray<MastheadColumn> = [
  {
    kicker: "Ce qui change",
    body: "Le rapport du matin se montait à la main : exports, tableurs croisés, copier-coller jusqu'au café froid. Data Navigator lit le CSV de la nuit, interroge DuckDB en mémoire et rend un bulletin fini — récit compris — avant que la salle ne soit pleine.",
  },
  {
    kicker: "Ce qui ne bouge pas",
    body: "Le fichier ne quitte pas le poste. Pas d'envoi vers un nuage, pas d'antenne consultée, pas de clé d'API en transit. Les équipes sécurité valident l'outil parce qu'il n'y a, justement, rien à valider côté réseau : tout se passe entre le disque et l'écran.",
  },
];

/** The folio facts struck along the foot of the front page. */
const MASTHEAD_FOOT: ReadonlyArray<MastheadFootFact> = [
  { label: "Transactions", value: "2 147 380" },
  { label: "Réussite", value: "97,4 %" },
  { label: "Canaux", value: "5" },
  { label: "Pic", value: "16 h 04" },
];

/**
 * The five canaux that make the day, ledgered like a front-page market table.
 * Counts sum to the masthead's 2 147 380; the slowest réussite (USSD) is the
 * one the editor flags, because failures are his beat. Shares are rounded for
 * print and need not total exactly 100 — the foot of the table says as much.
 */
const MASTHEAD_CHANNELS: ReadonlyArray<MastheadChannel> = [
  { name: "Mobile money", count: 812460, countStr: "812 460", rate: "98,1 %", share: "37,8 %", flagged: false },
  { name: "Guichet", count: 524910, countStr: "524 910", rate: "97,9 %", share: "24,4 %", flagged: false },
  { name: "Distributeur", count: 386220, countStr: "386 220", rate: "97,6 %", share: "18,0 %", flagged: false },
  { name: "SMS facturé", count: 281540, countStr: "281 540", rate: "97,2 %", share: "13,1 %", flagged: false },
  { name: "USSD", count: 142250, countStr: "142 250", rate: "94,8 %", share: "6,6 %", flagged: true },
];

/** The slowest channel's index, circled in the ledger bars. */
const MASTHEAD_CHANNEL_FLAG = 4;

/**
 * "In this edition" — the contents teaser a front page runs in a corner, each
 * line pointing deeper into the paper. Anchors are the real ones the assembled
 * page exposes; pages match the rubrique numbering.
 */
const MASTHEAD_INDEX: ReadonlyArray<MastheadIndexEntry> = [
  {
    no: "04",
    title: "Le fait du jour",
    blurb: "Une anomalie de 04 h 11, instruite ligne par ligne.",
    href: "#lead",
    page: "P. 3",
  },
  {
    no: "06",
    title: "Le chemin de presse",
    blurb: "Du CSV au rapport en quatre presses, à la chaîne.",
    href: "#workflow",
    page: "P. 5",
  },
  {
    no: "07",
    title: "Les petites annonces",
    blurb: "Trente et une capacités, classées comme au marché.",
    href: "#capabilities",
    page: "P. 6",
  },
  {
    no: "15",
    title: "Courrier des questions",
    blurb: "Ce que la sécurité demande, et les réponses brèves.",
    href: "#faq",
    page: "P. 13",
  },
];

/**
 * The day's lexicon — the French data labels the report speaks in, glossed once
 * on the front page the way a paper prints its key. These are the terms an
 * analyst reads every column over: réussite, canaux, abonnés, montant.
 */
const MASTHEAD_GLOSSARY: ReadonlyArray<MastheadGlossEntry> = [
  { term: "Taux de réussite", gloss: "transactions abouties sur le total tenté" },
  { term: "Canaux", gloss: "mobile, guichet, distributeur, SMS, USSD" },
  { term: "Abonnés actifs", gloss: "comptes ayant transigé dans la journée" },
  { term: "Montant (TND)", gloss: "valeur cumulée des transactions abouties" },
  { term: "Journalier", gloss: "une édition par CSV, une par matin" },
  { term: "Heure de pointe", gloss: "le créneau le plus chargé — ici 16 h 04" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.2 — NAMEPLATE GLYPH · the press device cut into the nameplate
 *  A hand-inked printing-press mark, drawn (not icon-font), parked in the
 *  nameplate's initial position the way old papers kept a woodcut device.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The colophon device — a small press, inked in two passes when in view. */
function MastheadDevice({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {/* the platen frame */}
      <InkPath
        d="M10 14 L54 14 L54 40 L10 40 Z"
        strokeWidth={2.2}
        duration={0.8}
      />
      {/* the bed and the impression line */}
      <InkPath
        d="M16 40 L16 50 L48 50 L48 40 M10 50 L54 50 M22 56 L42 56"
        strokeWidth={2}
        delay={0.4}
        duration={0.6}
      />
      {/* the sheet, half-printed, sliding out — vermilion ink on it */}
      <InkPath
        d="M24 21 L46 21 M24 27 L46 27 M24 33 L40 33"
        stroke={VERMILION}
        strokeWidth={2}
        delay={0.7}
        duration={0.55}
      />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.3 — THE EARS · date/edition and offline notice, top corners
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadEarRow({ fact }: { fact: MastheadEarFact }) {
  const Icon = fact.icon;
  return (
    <div className="flex items-baseline gap-2">
      <Icon aria-hidden className="h-3 w-3 shrink-0 translate-y-[2px] text-[#4a4438]" strokeWidth={1.8} />
      <span className="font-grotesk text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4a4438]">
        {fact.label}
      </span>
      <span aria-hidden className="mx-0.5 flex-1 border-b border-dotted border-[#a89e8a]" />
      <span className="font-mono text-[11px] font-bold tabular-nums text-[#1c1914]">{fact.value}</span>
    </div>
  );
}

/** One corner ear — a thin column of two leadered facts under a hairline. */
function MastheadEar({
  facts,
  align,
}: {
  facts: ReadonlyArray<MastheadEarFact>;
  align: "left" | "right";
}) {
  return (
    <SettleIn y={10} className={align === "left" ? "text-left" : "text-left"}>
      <div className="space-y-1.5">
        {facts.map((fact) => (
          <MastheadEarRow key={fact.label} fact={fact} />
        ))}
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.4 — THE NAMEPLATE · the paper's name at display scale
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The nameplate proper. "The Daily Edition" overline, "Data Navigator" set at
 * display scale with the device cut into the corner, the motto under it, double
 * rules above and below. The ears sit on either side at md+.
 */
function MastheadPlate() {
  return (
    <header className="relative">
      <DoubleRule className="mb-5" />

      <div className="grid items-end gap-x-6 gap-y-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        {/* left ear */}
        <div className="order-2 hidden md:order-1 md:block">
          <MastheadEar facts={MASTHEAD_EAR_LEFT} align="left" />
        </div>

        {/* the name */}
        <div className="order-1 text-center md:order-2">
          <SettleIn y={8}>
            <p className="font-grotesk text-[11px] font-bold uppercase tracking-[0.42em] text-[#bf3415]">
              The Daily Edition
            </p>
          </SettleIn>
          <div className="mt-2 flex items-center justify-center gap-3 sm:gap-4">
            <Parallax speed={10} className="hidden shrink-0 sm:block">
              <MastheadDevice className="h-12 w-12 lg:h-14 lg:w-14" />
            </Parallax>
            <RiseIn>
              <h1 className="font-serif text-[clamp(2.6rem,8vw,6rem)] font-black leading-[0.92] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
                Data Navigator
              </h1>
            </RiseIn>
          </div>
          <SettleIn delay={0.2} y={6}>
            <p className="mx-auto mt-2 max-w-md font-serif text-[13px] italic leading-snug text-[#4a4438]">
              {EDITION.motto}
            </p>
          </SettleIn>
        </div>

        {/* right ear */}
        <div className="order-3 hidden md:block">
          <MastheadEar facts={MASTHEAD_EAR_RIGHT} align="right" />
        </div>
      </div>

      {/* the edition record line — folio across the full plate */}
      <SettleIn delay={0.1} className="mt-5">
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 ${T.folio}`}>
          <span>
            {EDITION.dateline} · {EDITION.volume} · {EDITION.issue}
          </span>
          <span className="hidden sm:block">{EDITION.city}</span>
          <span>{EDITION.price}</span>
        </div>
      </SettleIn>

      <DoubleRule className="mt-3" />
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.5 — THE FRONT-PAGE GRAPHIC · a day of transactions, inked
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Twenty-four hours of transactions drawn as a single ink line with a halftone
 * fill, mono axis ticks, and the 16 h peak ringed in vermilion. One composed
 * SVG (520×210), self-drawing on scroll, fully decorative.
 */
function MastheadDayPlate() {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  const w = 520;
  const h = 210;
  const padL = 40;
  const padR = 16;
  const padT = 20;
  const padB = 26;

  const geom = useMemo(() => {
    const data = MASTHEAD_HOURLY;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const xAt = (i: number) => padL + (i * (w - padL - padR)) / (data.length - 1);
    const yAt = (v: number) => padT + (1 - (v - min) / span) * (h - padT - padB);
    const pts = data.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const line = inkPathFrom(pts);
    const last = pts[pts.length - 1];
    const first = pts[0];
    const area = `${line} L${last.x.toFixed(1)},${h - padB} L${first.x.toFixed(1)},${h - padB} Z`;
    const peak = pts[MASTHEAD_PEAK_INDEX];
    // horizontal gridlines at thirds of the range — honest, sparse
    const grid = [0.25, 0.5, 0.75].map((f) => padT + (1 - f) * (h - padT - padB));
    return { xAt, yAt, pts, line, area, peak, grid };
  }, []);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" aria-hidden>
      <defs>
        <pattern id={`mh-ht-${uid}`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill={INK} fillOpacity="0.22" />
        </pattern>
      </defs>

      {/* sparse horizontal gridlines */}
      {geom.grid.map((y) => (
        <line key={`g-${y.toFixed(1)}`} x1={padL} y1={y} x2={w - padR} y2={y} stroke={RULE} strokeWidth="1" />
      ))}

      {/* axes — heavy baseline, hairline left rule */}
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke={INK} strokeWidth="1.5" />
      <line x1={padL} y1={padT - 4} x2={padL} y2={h - padB} stroke={RULE} strokeWidth="1" />

      {/* x ticks — quarter-day marks */}
      {MASTHEAD_HOUR_TICKS.map((t) => (
        <g key={`xt-${t.i}`}>
          <line x1={geom.xAt(t.i)} y1={h - padB} x2={geom.xAt(t.i)} y2={h - padB + 4} stroke={INK_SOFT} strokeWidth="1.2" />
          <text
            x={geom.xAt(t.i)}
            y={h - padB + 15}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* y caption — the unit, set vertically as a print graphic would */}
      <text
        x={12}
        y={padT + (h - padT - padB) / 2}
        textAnchor="middle"
        fontSize="8.5"
        letterSpacing="1.2"
        fontFamily="var(--font-grotesk)"
        fill={INK_FADED}
        transform={`rotate(-90 12 ${padT + (h - padT - padB) / 2})`}
      >
        TRANSACTIONS / H
      </text>

      {/* halftone fill, settles after the line is drawn */}
      <motion.path
        d={geom.area}
        fill={`url(#mh-ht-${uid})`}
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.7, delay: 0.9 }}
      />

      {/* the day's line — solid ink, self-drawing */}
      <InkPath d={geom.line} strokeWidth={2.4} duration={1.3} />

      {/* the heure de pointe — ringed, with its time struck above */}
      <circle cx={geom.peak.x} cy={geom.peak.y} r="3.4" fill={VERMILION} />
      <motion.circle
        cx={geom.peak.x}
        cy={geom.peak.y}
        r="9.5"
        fill="none"
        stroke={VERMILION}
        strokeWidth="2"
        initial={reduce ? false : { opacity: 0, scale: 1.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ delay: 1.45, duration: 0.4, ease: EASE_INK }}
        style={{ transformOrigin: `${geom.peak.x}px ${geom.peak.y}px` }}
      />
      <line
        x1={geom.peak.x}
        y1={padT - 2}
        x2={geom.peak.x}
        y2={geom.peak.y - 13}
        stroke={VERMILION}
        strokeWidth="1"
        strokeDasharray="3 4"
        opacity="0.7"
      />
      <text
        x={geom.peak.x}
        y={padT - 6}
        textAnchor="middle"
        fontSize="9"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        fill={VERMILION}
      >
        pic 16 h 04
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.6 — THE FIGURES · two live-feeling KPIs that count up in ink
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadFigure({
  label,
  unit,
  children,
  note,
}: {
  label: string;
  unit: string;
  children: ReactNode;
  note: string;
}) {
  return (
    <div className="flex flex-col">
      <span className={`${T.kicker} text-[#857c69]`}>{label}</span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-[clamp(1.7rem,4.5vw,2.4rem)] font-bold leading-none tabular-nums text-[#1c1914]">
          {children}
        </span>
        <span className="font-grotesk text-[12px] font-semibold uppercase tracking-[0.12em] text-[#4a4438]">
          {unit}
        </span>
      </span>
      <span className={`mt-1.5 ${T.folio} normal-case tracking-normal`}>{note}</span>
    </div>
  );
}

/** Approval stamp slammed across the box corner — green, ink or vermilion. */
function MastheadStampMark({ stamp }: { stamp: MastheadStamp }) {
  const color = stamp.tone === "green" ? STAMP_GREEN : stamp.tone === "ink" ? INK : VERMILION;
  return (
    <Stamp color={color} tilt={stamp.tilt}>
      {stamp.text}
    </Stamp>
  );
}

/**
 * The "édition du jour" box — two figures over a strip of stamps, framed like a
 * boxed front-page sidebar with offset-print shadow. The figures count up once;
 * the stamps slam.
 */
function MastheadEditionBox() {
  return (
    <SettleIn delay={0.15}>
      <div className="border-2 border-[#1c1914] bg-[#eee6d6] shadow-[6px_6px_0_#1c1914]">
        <header className="flex items-center justify-between gap-3 border-b-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <h3 className="font-grotesk text-[11px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
            Édition du jour
          </h3>
          <span className={T.folio}>{EDITION.datelineShort}</span>
        </header>

        <div className="grid gap-5 px-4 py-5 sm:grid-cols-2 sm:px-5">
          <MastheadFigure label="Taux de réussite" unit="réussite" note="sur 24 h de transactions">
            <CountUpInk end={97.4} decimals={1} suffix=" %" />
          </MastheadFigure>
          <MastheadFigure label="Volume journalier" unit="tx" note="lignes lues ce matin">
            <CountUpInk end={2147380} />
          </MastheadFigure>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-[#d6ccb6] px-4 py-3 sm:px-5">
          {MASTHEAD_STAMPS.map((stamp) => (
            <MastheadStampMark key={stamp.text} stamp={stamp} />
          ))}
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.7 — THE PROOF SLIP · the morning run, logged like a press checklist
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadProofRow({ row, index }: { row: MastheadProofLine; index: number }) {
  return (
    <SettleIn delay={index * 0.06}>
      <div className="flex items-baseline gap-2.5 py-1.5">
        <span className="font-mono text-[10px] tabular-nums text-[#bf3415]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.1em] text-[#1c1914]">
          {row.step}
        </span>
        <span aria-hidden className="mx-1 flex-1 border-b border-dotted border-[#a89e8a]" />
        <span className="hidden font-serif text-[12px] italic text-[#857c69] sm:block">{row.detail}</span>
        <span className="font-mono text-[12px] font-bold tabular-nums text-[#1c1914]">{row.mark}</span>
      </div>
    </SettleIn>
  );
}

/** The proof slip — a boxed timing log the way a press room keeps its run. */
function MastheadProofSlip() {
  return (
    <SettleIn delay={0.2}>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Printer aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.8} />
          <h3 className={T.kicker}>Bon de tirage — ce matin</h3>
        </div>
        <div className="mt-1.5 divide-y divide-[#e4dac5]">
          {MASTHEAD_PROOF.map((row, i) => (
            <MastheadProofRow key={row.step} row={row} index={i} />
          ))}
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.8 — THE LEAD · headline, standfirst, actions
 * ──────────────────────────────────────────────────────────────────────────── */

/** The towering lead headline — sentence case, clamp-sized, rising deck by deck. */
function MastheadHeadline() {
  const reduce = useReducedMotion();
  return (
    <div>
      <SettleIn>
        <p className={`${T.kicker} flex items-center gap-2 text-[#bf3415]`}>
          <Newspaper aria-hidden className="h-4 w-4" strokeWidth={1.8} />À la une — rédaction télécom
        </p>
      </SettleIn>

      <DeckReveal
        className="mt-4"
        stagger={0.1}
        lineClassName=""
        lines={[
          <span
            key="l1"
            className="font-serif text-[clamp(2.2rem,6.2vw,5.2rem)] font-black leading-[0.96] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            A raw CSV at dawn,
          </span>,
          <span
            key="l2"
            className="font-serif text-[clamp(2.2rem,6.2vw,5.2rem)] font-black leading-[0.96] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            a finished report
          </span>,
          <span
            key="l3"
            className="font-serif text-[clamp(2.2rem,6.2vw,5.2rem)] font-black leading-[0.96] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            before the <PenUnderline delay={0.9}>coffee&rsquo;s cold</PenUnderline>.
          </span>,
        ]}
      />

      {/* the second deck — the security promise, typed like a wire bulletin */}
      <SettleIn delay={0.3}>
        <p className="mt-5 font-serif text-[clamp(1.05rem,1.6vw,1.35rem)] leading-[1.5] text-[#4a4438]">
          Data Navigator opens this morning&rsquo;s{" "}
          <span className="font-semibold text-[#1c1914]">DailyTransactions.csv</span>, runs the day
          through DuckDB on your own machine, writes the briefing in plain words, and exports it to
          PDF, DOCX or PPTX. The whole edition is set offline —{" "}
          <PenCircle delay={1.1}>
            <span className="whitespace-nowrap font-semibold text-[#1c1914]">nothing leaves the desk</span>
          </PenCircle>
          .
        </p>
      </SettleIn>

      {/* the dateline + caret line — a wire-service strap */}
      <SettleIn delay={0.45} className="mt-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#857c69]">
          {reduce ? (
            "Tunis — pressé sur le poste, livré au matin, sans antenne."
          ) : (
            <TypeOn text="Tunis — pressé sur le poste, livré au matin, sans antenne." speed={20} />
          )}
        </p>
      </SettleIn>

      {/* the actions — primary ink, secondary outline, plain link */}
      <SettleIn delay={0.5} className="mt-7">
        <div className="flex flex-wrap items-center gap-3 gap-y-4">
          <InkButton href="/signup" tone="vermilion" className="group">
            Get started
            <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
          </InkButton>
          <InkButton href="/dashboard" tone="outline">
            Open the app
            <CornerRightDown aria-hidden className="h-4 w-4" strokeWidth={2.4} />
          </InkButton>
          <span className="font-grotesk text-[13px] text-[#4a4438]">
            Déjà inscrit ? <InkLink href="/login">Sign in</InkLink>
          </span>
        </div>
      </SettleIn>

      {/* trust strap — the security teams read this line first */}
      <SettleIn delay={0.6} className="mt-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-[#2f6b3f]" strokeWidth={1.9} />
            <span className="font-grotesk text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4a4438]">
              Validé par la sécurité
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <CloudOff aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.9} />
            <span className="font-grotesk text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4a4438]">
              Aucun nuage
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.9} />
            <span className="font-grotesk text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4a4438]">
              Calculé sur l&rsquo;appareil
            </span>
          </span>
        </div>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.9 — THE FRONT-PAGE CUT · the graphic framed as a newspaper figure
 * ──────────────────────────────────────────────────────────────────────────── */

/** The day-plate, cut into the page with registration marks and a caption. */
function MastheadGraphicCut() {
  return (
    <SettleIn delay={0.1}>
      <figure className="relative border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        {/* registration marks — the cut was proofed before printing */}
        <span aria-hidden className="pointer-events-none absolute -left-2 -top-2 h-4 w-4 border-l-2 border-t-2 border-[#1c1914]" />
        <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 h-4 w-4 border-r-2 border-t-2 border-[#1c1914]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-2 -left-2 h-4 w-4 border-b-2 border-l-2 border-[#1c1914]" />
        <span aria-hidden className="pointer-events-none absolute -bottom-2 -right-2 h-4 w-4 border-b-2 border-r-2 border-[#1c1914]" />

        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
            Le jour, heure par heure
          </h3>
          <span className={T.folio}>Mer. 11 juin · 24 h</span>
        </header>

        <div className="px-3 pb-1 pt-4 sm:px-5">
          <MastheadDayPlate />
        </div>

        <figcaption className="border-t border-[#d6ccb6] px-4 py-3 sm:px-5">
          <span className="font-serif text-[13px] italic text-[#4a4438]">
            Fig. 1 — Transactions par heure, journée du 11 juin.
          </span>{" "}
          <span className="font-serif text-[13px] italic text-[#857c69]">
            Le pic de 16 h 04 est cerclé&nbsp;; le creux de 4 h est l&rsquo;heure où la ville dort
            et le poste compacte.
          </span>
        </figcaption>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.10 — THE COLUMNS · two front-page columns under the fold line
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadColumnBlock({ column, index }: { column: MastheadColumn; index: number }) {
  return (
    <SettleIn delay={index * 0.1}>
      <div className="border-t-2 border-[#1c1914] pt-3">
        <h3 className={`${T.kicker} text-[#bf3415]`}>{column.kicker}</h3>
        {index === 0 ? (
          <DropCapParagraph className="mt-2 text-[15px] leading-[1.6]">{column.body}</DropCapParagraph>
        ) : (
          <p className="mt-2 font-serif text-[15px] leading-[1.6] text-[#1c1914]">{column.body}</p>
        )}
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.11 — THE FOOT · folio facts struck across the bottom of page one
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadFootStrip() {
  return (
    <SettleIn>
      <div className="grid grid-cols-2 divide-x divide-y divide-[#d6ccb6] border-2 border-[#1c1914] bg-[#eee6d6] sm:grid-cols-4 sm:divide-y-0">
        {MASTHEAD_FOOT.map((fact) => (
          <div key={fact.label} className="px-4 py-3">
            <span className={`block ${T.folio}`}>{fact.label}</span>
            <span className="mt-0.5 block font-mono text-[18px] font-bold tabular-nums text-[#1c1914]">
              {fact.value}
            </span>
          </div>
        ))}
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.12 — THE CHANNEL LEDGER · les cinq canaux, set like a market table
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadChannelRow({ channel, index }: { channel: MastheadChannel; index: number }) {
  const max = MASTHEAD_CHANNELS[0].count;
  const width = `${Math.round((channel.count / max) * 100)}%`;
  return (
    <SettleIn delay={index * 0.07}>
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 border-b border-[#e4dac5] py-2.5 sm:grid-cols-[150px_1fr_auto]">
        <span className="flex items-baseline gap-1.5 font-grotesk text-[12.5px] font-bold text-[#1c1914]">
          {channel.name}
          {channel.flagged && (
            <span className="font-mono text-[10px] font-semibold text-[#bf3415]">surveillé</span>
          )}
        </span>

        {/* the bar — a printed measure, vermilion when the editor flagged it */}
        <span aria-hidden className="order-3 col-span-2 h-2 w-full bg-[#e4dac5] sm:order-none sm:col-span-1">
          <motion.span
            className={`block h-full ${channel.flagged ? "bg-[#bf3415]" : "bg-[#1c1914]"}`}
            style={{ transformOrigin: "left center" }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, delay: index * 0.07, ease: EASE_INK }}
          >
            <span className="block h-full" style={{ width }} />
          </motion.span>
        </span>

        <span className="flex items-baseline gap-3 justify-self-end font-mono text-[12px] tabular-nums">
          <span className="font-bold text-[#1c1914]">{channel.countStr}</span>
          <span className={channel.flagged ? "text-[#bf3415]" : "text-[#2f6b3f]"}>{channel.rate}</span>
          <span className="hidden w-12 text-right text-[#857c69] sm:inline">{channel.share}</span>
        </span>
      </div>
    </SettleIn>
  );
}

/**
 * The channel ledger — the day split across its five canaux, set like the
 * market table a front page runs in a lower corner. The bars are pure transform
 * (scaleX); the slowest réussite is inked vermilion and flagged "surveillé".
 */
function MastheadChannelLedger() {
  return (
    <SettleIn>
      <div className="border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914]">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-3 sm:px-6">
          <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
            Canaux du jour — relevé
          </h3>
          <span className={T.folio}>transactions · taux de réussite · part</span>
        </header>

        <div className="px-4 pb-1 pt-2 sm:px-6">
          {MASTHEAD_CHANNELS.map((channel, i) => (
            <MastheadChannelRow key={channel.name} channel={channel} index={i} />
          ))}
        </div>

        <footer className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#d6ccb6] px-4 py-3 sm:px-6">
          <p className={`${T.folio} normal-case tracking-normal`}>
            USSD traîne à 94,8 %&nbsp;: l&rsquo;USSD traîne toujours, c&rsquo;est sa nature.
          </p>
          <span className="font-mono text-[12px] font-bold tabular-nums text-[#1c1914]">
            Total 2 147 380 · 97,4 %
          </span>
        </footer>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.13 — IN THIS EDITION · the contents teaser, pointing deeper in
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadIndexRow({ entry, index }: { entry: MastheadIndexEntry; index: number }) {
  return (
    <SettleIn delay={index * 0.06}>
      <a
        href={entry.href}
        className="group flex items-baseline gap-3 border-b border-[#e4dac5] py-2.5 transition-colors hover:bg-[#1c1914]/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
      >
        <span className="font-mono text-[11px] font-bold tabular-nums text-[#bf3415]">{entry.no}</span>
        <span className="min-w-0 flex-1">
          <span className="font-grotesk text-[13px] font-bold text-[#1c1914] underline decoration-transparent decoration-2 underline-offset-[3px] transition-colors group-hover:decoration-[#bf3415]">
            {entry.title}
          </span>
          <span className="mt-0.5 block font-serif text-[12.5px] italic leading-snug text-[#857c69]">
            {entry.blurb}
          </span>
        </span>
        <span className={`shrink-0 ${T.folio}`}>{entry.page}</span>
      </a>
    </SettleIn>
  );
}

/** "In this edition" — a boxed contents teaser, the front page's table of contents. */
function MastheadIndexBox() {
  return (
    <SettleIn delay={0.1}>
      <div className="border border-[#d6ccb6] bg-[#eee6d6] px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-grotesk text-[11px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
            Dans cette édition
          </h3>
          <span className={T.folio}>suite en pages intérieures</span>
        </div>
        <div className="mt-2">
          {MASTHEAD_INDEX.map((entry, i) => (
            <MastheadIndexRow key={entry.href} entry={entry} index={i} />
          ))}
        </div>
        <div className="pt-3">
          <InkLink href="#subscribe">S&rsquo;abonner à l&rsquo;édition</InkLink>
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.14 — THE LEXICON · the day's vocabulary, glossed like a key
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadGlossItem({ entry, index }: { entry: MastheadGlossEntry; index: number }) {
  return (
    <SettleIn delay={index * 0.05} y={8}>
      <div className="border-l-2 border-[#d6ccb6] pl-3">
        <dt className="font-grotesk text-[11px] font-bold uppercase tracking-[0.1em] text-[#1c1914]">
          {entry.term}
        </dt>
        <dd className="mt-0.5 font-serif text-[12.5px] italic leading-snug text-[#857c69]">
          {entry.gloss}
        </dd>
      </div>
    </SettleIn>
  );
}

/**
 * The lexicon strip — the French data vocabulary an analyst lives in, glossed
 * once so the rest of the paper can speak it freely. Three-up at md, set under
 * a kicker rule like a newspaper's standing key.
 */
function MastheadLexicon() {
  return (
    <SettleIn>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className={`${T.kicker} flex items-center gap-2`}>
            <Newspaper aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={1.9} />
            Lexique du jour
          </h3>
          <span className={T.folio}>la langue du rapport, en six mots</span>
        </div>
        <Rule className="mt-2" />
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {MASTHEAD_GLOSSARY.map((entry, i) => (
            <MastheadGlossItem key={entry.term} entry={entry} index={i} />
          ))}
        </dl>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §2.15 — THE SECTION · page one of The Daily Edition
 * ──────────────────────────────────────────────────────────────────────────── */

function MastheadSection() {
  const reduce = useReducedMotion();
  return (
    <section
      id="masthead"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 1400px" }}
    >
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
        {/* ── the nameplate ─────────────────────────────────────────────────── */}
        <MastheadPlate />

        {/* ── the lead, two-up with the graphic + box ───────────────────────── */}
        <div className="mt-10 grid gap-10 sm:mt-14 lg:grid-cols-[1.15fr_minmax(0,460px)] lg:gap-14">
          {/* the lead column — headline, standfirst, actions */}
          <div className="min-w-0">
            <MastheadHeadline />
          </div>

          {/* the right rail — graphic, édition box, proof slip */}
          <div className="min-w-0 space-y-7">
            <MastheadGraphicCut />
            <MastheadEditionBox />
            <MastheadProofSlip />
          </div>
        </div>

        {/* ── the fold line — a hairline with a centred "scroll" cue ─────────── */}
        <div className="relative mt-12 sm:mt-16">
          <Rule />
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-[#f6f1e7] px-3">
            <a
              href="#lead"
              className="group inline-flex items-center gap-2 font-grotesk text-[10px] font-bold uppercase tracking-[0.2em] text-[#857c69] transition-colors hover:text-[#1c1914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
            >
              Lire la suite
              <ArrowDown
                aria-hidden
                className={`h-3.5 w-3.5 ${reduce ? "" : "ed-tape-hold"} transition-transform group-hover:translate-y-0.5`}
                strokeWidth={2}
              />
            </a>
          </div>
        </div>

        {/* ── the two front-page columns, with the contents teaser alongside ── */}
        <div className="mt-12 grid gap-10 sm:mt-14 lg:grid-cols-[1fr_minmax(0,300px)] lg:gap-14">
          <div className="grid gap-8 md:grid-cols-2 md:gap-10">
            {MASTHEAD_COLUMNS.map((column, i) => (
              <MastheadColumnBlock key={column.kicker} column={column} index={i} />
            ))}
          </div>
          <MastheadIndexBox />
        </div>

        {/* ── the channel ledger — the day across its five canaux ───────────── */}
        <div className="mt-12 sm:mt-14">
          <MastheadChannelLedger />
        </div>

        {/* ── pull quote — the soul of the product, in one line ─────────────── */}
        <div className="mt-12 sm:mt-14 lg:max-w-4xl">
          <PullQuote cite="Note de la rédaction — politique de la maison">
            Le matin appartient à l&rsquo;analyste, pas au réseau&nbsp;: le rapport se fait sur le
            poste, et ce qui s&rsquo;y trouve y reste.
          </PullQuote>
        </div>

        {/* ── the foot of page one ──────────────────────────────────────────── */}
        <div className="mt-12 sm:mt-14">
          <MastheadFootStrip />
        </div>

        {/* ── the lexicon — the report's vocabulary, glossed once ───────────── */}
        <div className="mt-12 sm:mt-14">
          <MastheadLexicon />
        </div>

        <Rule className="mt-12" />
        <FolioLine className="mt-4" page="P. 1" note="À la une — pressé sur le poste, aucune antenne consultée" />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 03 — TapeSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ────────────────────────────────────────────────────────────────────────────
 *  03 · TAPE — LA BOURSE DES CANAUX
 *
 *  The market-quotes band between the front page and the lead story. The
 *  conceit: the four delivery channels of a telecom operator (USSD, app,
 *  web, SMS) are listed equities on a tiny private exchange — the exchange
 *  floor being the reader's own machine. Two counter-scrolling ticker rows
 *  carry the day's quotes (business figures on the upper tape, machine-room
 *  figures on the lower), and beneath them the "cote officielle" is typeset
 *  like the stock listings page of a 1950s broadsheet: agate type, hairline
 *  rules, dotted leaders, right-aligned tabular figures.
 *
 *  Editorial through-line: USSD dipped at 16 h 04 during yesterday's
 *  session. The tape shows it, the listing circles it in the editor's pen,
 *  and a margin note hands the reader to the enquiry on page 3 (#lead).
 *
 *  Motion discipline:
 *  • The looping tapes are pure CSS (`ed-tape` / `ed-tape-reverse` inside an
 *    `ed-tape-hold` wrapper — hover pauses both rows). The animation is
 *    paused via `animation-play-state` whenever the band is off-screen, and
 *    under prefers-reduced-motion the rows render as static, hand-scrollable
 *    strips instead.
 *  • Everything else is the shared vocabulary: CountUpInk for the listed
 *    figures, InkLine sparklines that draw themselves, one PenCircle and one
 *    PenStrike — the red pen is rationed, as the contract demands.
 *
 *  Layout checkpoints: 360 px (3-column listing, sparkline drops below the
 *  figures), 768 px (volume column returns), 1280 px (sparkline takes its
 *  own column), 1536 px (the margin note hangs in the actual margin).
 * ──────────────────────────────────────────────────────────────────────── */

/* ═══ §A — VOCABULARY · direction glyphs of the exchange floor ═══════════ */

type TapeDirection = "up" | "down" | "flat";

/**
 * The three moods of a quote. ▲ prints in stamp green, ▼ in the editor's
 * vermilion (bad news is always the editor's business), = in faded ink —
 * a flat quote is barely worth the lead it's set in.
 */
const TAPE_DIR_META: Record<TapeDirection, { glyph: string; color: string; label: string }> = {
  up: { glyph: "▲", color: STAMP_GREEN, label: "en hausse" },
  down: { glyph: "▼", color: VERMILION, label: "en baisse" },
  flat: { glyph: "=", color: INK_FADED, label: "stable" },
};

type TapeQuoteDatum = {
  /** ticker symbol — French data label, set in agate caps */
  readonly sym: string;
  /** quoted value, units baked in (organic numbers: 41,2 % · 643 DT · 412 ms) */
  readonly val: string;
  /** movement vs the previous session, omitted when the glyph says enough */
  readonly delta?: string;
  readonly dir: TapeDirection;
};

/* ═══ §B — THE TAPES · two rows of quotes, counter-scrolling ═════════════ */

/**
 * Upper tape — LA COTE. Business figures a desk chief reads first:
 * channel shares, success rate, volumes, revenue, the shape of the day.
 */
const TAPE_QUOTES_COTE: ReadonlyArray<TapeQuoteDatum> = [
  { sym: "USSD", val: "41,2 %", delta: "0,8", dir: "up" },
  { sym: "App mobile", val: "27,9 %", delta: "1,2", dir: "up" },
  { sym: "Web", val: "18,4 %", delta: "0,3", dir: "down" },
  { sym: "SMS", val: "12,5 %", dir: "flat" },
  { sym: "Réussite", val: "97,4 %", delta: "0,2", dir: "up" },
  { sym: "Échecs", val: "2,6 %", delta: "0,2", dir: "down" },
  { sym: "Volume", val: "2 147 380", delta: "63 114", dir: "up" },
  { sym: "Panier moyen", val: "643 DT", delta: "4", dir: "up" },
  { sym: "Recette jour", val: "1,38 M DT", delta: "2,1 %", dir: "up" },
  { sym: "MSISDN actifs", val: "412 087", delta: "1 904", dir: "up" },
  { sym: "Heure de pointe", val: "20 h 15", dir: "flat" },
  { sym: "Ticket médian", val: "4,7 DT", dir: "flat" },
  { sym: "Recharges", val: "1 204 511", delta: "2,4 %", dir: "up" },
];

/**
 * Lower tape — LE MOTEUR. The machine-room quotes: what the engine did to
 * earn its column inches. "Paquets sortants 0" is the house's standing
 * boast — the only figure on this exchange guaranteed never to move.
 */
const TAPE_QUOTES_MOTEUR: ReadonlyArray<TapeQuoteDatum> = [
  { sym: "P95 latence", val: "412 ms", delta: "38", dir: "down" },
  { sym: "Lignes/sec", val: "1 204 992", dir: "up" },
  { sym: "Import CSV", val: "9,4 s", delta: "1,1", dir: "down" },
  { sym: "Requêtes DuckDB", val: "184", dir: "flat" },
  { sym: "Anomalies résolues", val: "11/12", delta: "3", dir: "up" },
  { sym: "RAM moteur", val: "612 Mo", delta: "48", dir: "down" },
  { sym: "Prévision J+7", val: "±2,1 %", dir: "flat" },
  { sym: "Exports PDF", val: "14", delta: "6", dir: "up" },
  { sym: "Paquets sortants", val: "0", dir: "flat" },
  { sym: "Modèle local", val: "3,8 Go", dir: "flat" },
  { sym: "Sessions LAN", val: "4", delta: "1", dir: "up" },
  { sym: "Dictées vocales", val: "27", delta: "9", dir: "up" },
  { sym: "Cartes géo", val: "6", delta: "2", dir: "up" },
];

/* ═══ §C — LA COTE OFFICIELLE · the four listed channels ═════════════════ */

type TapeListingDatum = {
  /** floor code, printed vermilion before the canal name — pure affectation */
  readonly code: string;
  readonly canal: string;
  /** lucide glyph, pre-rendered so the datum stays a plain object */
  readonly icon: ReactNode;
  /** part de marché, % — animated by CountUpInk (fr-FR ⇒ comma decimals) */
  readonly part: number;
  /** transactions de la séance — the four volumes reconcile, to the line,
   *  with the masthead's 2 147 380 (someone at the desk checked) */
  readonly volume: number;
  /** mouvement vs veille, pre-formatted */
  readonly delta: string;
  readonly dir: TapeDirection;
  /** volume horaire en milliers de tx, 17 points: 06 h → 22 h */
  readonly serie: ReadonlyArray<number>;
  /** session high / low, set as agate sub-lines under the volume */
  readonly pic: string;
  readonly creux: string;
  /** index of the sparkline point the editor circled (USSD only) */
  readonly markIndex?: number;
  /** circled low figure + the hand-off to page 3 */
  readonly enquete?: { creuxVal: string; heure: string };
};

const TAPE_LISTINGS: ReadonlyArray<TapeListingDatum> = [
  {
    code: "USS",
    canal: "USSD",
    icon: <Hash className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 41.2,
    volume: 884_721,
    delta: "0,8",
    dir: "up",
    // the 16 h dip (index 10) is the section's whole story — 71 → 22 → 58
    serie: [38, 41, 52, 61, 66, 64, 59, 63, 68, 71, 22, 58, 66, 72, 75, 69, 54],
    pic: "75 311 tx/h · 20 h",
    creux: "22 408 tx/h · 16 h",
    markIndex: 10,
    enquete: { creuxVal: "22 408", heure: "16 h 04" },
  },
  {
    code: "APM",
    canal: "App mobile",
    icon: <Smartphone className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 27.9,
    volume: 599_119,
    delta: "1,2",
    dir: "up",
    // evening-heavy: the app trades best after dinner
    serie: [22, 25, 31, 38, 42, 45, 43, 47, 52, 55, 57, 60, 66, 71, 74, 70, 61],
    pic: "74 022 tx/h · 20 h",
    creux: "21 940 tx/h · 06 h",
  },
  {
    code: "WEB",
    canal: "Web",
    icon: <Globe className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 18.4,
    volume: 395_118,
    delta: "0,3",
    dir: "down",
    // office-hours hump, asleep by midnight — a civil servant of a channel
    serie: [9, 14, 26, 38, 47, 52, 55, 53, 49, 44, 38, 30, 26, 22, 19, 15, 11],
    pic: "55 480 tx/h · 12 h",
    creux: "9 214 tx/h · 06 h",
  },
  {
    code: "SMS",
    canal: "SMS",
    icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 12.5,
    volume: 268_422,
    delta: "0,0",
    dir: "flat",
    // barely a pulse; SMS has traded sideways since 2019 and is proud of it
    serie: [18, 19, 21, 22, 23, 22, 22, 23, 24, 23, 22, 23, 24, 25, 24, 22, 20],
    pic: "25 130 tx/h · 19 h",
    creux: "17 902 tx/h · 06 h",
  },
];

/* ═══ §D — SECONDARY VALUES · the agate block + week of sessions ═════════ */

type TapeAgateDatum = {
  readonly sym: string;
  readonly val: string;
  readonly delta?: string;
  readonly dir: TapeDirection;
};

/**
 * Petites valeurs — the dense small-print listings that make a stock page
 * feel inhabited. Every figure is the kind the report actually carries.
 */
const TAPE_AGATE: ReadonlyArray<TapeAgateDatum> = [
  { sym: "Rejets réseau", val: "1,1 %", delta: "0,2", dir: "down" },
  { sym: "Doublons détectés", val: "1 312", delta: "118", dir: "up" },
  { sym: "3ᵉ essai", val: "0,4 %", dir: "flat" },
  { sym: "Transferts P2P", val: "221 904", delta: "0,6 %", dir: "down" },
  { sym: "Factures payées", val: "184 113", delta: "3,1 %", dir: "up" },
  { sym: "Forfaits data", val: "388 270", delta: "1,9 %", dir: "up" },
  { sym: "Roaming", val: "12 406", dir: "flat" },
  { sym: "Ticket min", val: "0,2 DT", dir: "flat" },
  { sym: "Ticket max", val: "1 980 DT", delta: "260", dir: "up" },
  { sym: "Écart-type", val: "18,3 DT", delta: "0,4", dir: "down" },
  { sym: "Kiosques actifs", val: "1 027", delta: "12", dir: "up" },
  { sym: "Codes erreur vus", val: "17", delta: "3", dir: "down" },
];

/** Five sessions of total volume, in thousands — the bar chart beside the
 *  session commentary. Wednesday's bar (the séance under review) is hot. */
const TAPE_WEEK_VOLUMES: ReadonlyArray<number> = [1_982, 1_871, 2_046, 2_084, 2_147];
const TAPE_WEEK_LABELS: ReadonlyArray<string> = ["sam 07", "dim 08", "lun 09", "mar 10", "mer 11"];

/**
 * Market-wide hourly volume, 06 h → 22 h, in thousands of transactions.
 * Each value is the COLUMN SUM of the four listings' series above — the
 * pulse chart and the per-canal sparklines tell one arithmetic truth.
 * Index 10 (16 h) is the hour the bell rang: 193 → 139, fifty-four
 * thousand transactions short of the previous hour.
 */
const TAPE_HOURLY: ReadonlyArray<number> = [
  87, 99, 130, 159, 178, 183, 179, 186, 193, 193, 139, 171, 182, 190, 192, 176, 146,
];

/** Hour labels, every other tick — agate type needs air at 360 px. */
const TAPE_HOURLY_LABELS: ReadonlyArray<string> = [
  "06", "", "08", "", "10", "", "12", "", "14", "", "16", "", "18", "", "20", "", "22",
];

/** Index of the 16 h bar — printed vermilion, ringed by the footnote. */
const TAPE_HOURLY_ALERT_INDEX = 10;

type TapeMoverDatum = {
  readonly name: string;
  readonly delta: string;
  readonly dir: TapeDirection;
};

/**
 * Palmarès de la séance — biggest movers among the sub-services, exactly
 * like the gainers/losers boards on a real listings page. The fall in
 * network rejections sits on the "losers" board on a technicality; nobody
 * at the desk is mourning it.
 */
const TAPE_MOVERS_UP: ReadonlyArray<TapeMoverDatum> = [
  { name: "Factures payées", delta: "3,1 %", dir: "up" },
  { name: "Recharges", delta: "2,4 %", dir: "up" },
  { name: "Forfaits data", delta: "1,9 %", dir: "up" },
  { name: "App mobile", delta: "1,2 %", dir: "up" },
  { name: "USSD", delta: "0,8 %", dir: "up" },
];

const TAPE_MOVERS_DOWN: ReadonlyArray<TapeMoverDatum> = [
  { name: "Roaming entrant", delta: "1,4 %", dir: "down" },
  { name: "Transferts P2P", delta: "0,6 %", dir: "down" },
  { name: "Web", delta: "0,3 %", dir: "down" },
  { name: "Rejets réseau", delta: "0,2 %", dir: "down" },
  { name: "Timeouts", delta: "0,1 %", dir: "down" },
];

type TapeIndexDatum = {
  /** instrument label, set under the dial */
  readonly label: string;
  /** needle position, 0–100 */
  readonly value: number;
  /** printed figure (organic, comma decimals) */
  readonly display: number;
  readonly decimals: number;
  /** one agate line of context under the figure */
  readonly note: string;
};

/**
 * Les trois indices de la place — instrument plates for the numbers the
 * desk glances at before reading anything else. Charge moteur is the only
 * dial that likes being low: 38 % at peak means the machine was reading
 * two million lines with one hand.
 */
const TAPE_INDICES: ReadonlyArray<TapeIndexDatum> = [
  { label: "indice de réussite", value: 97.4, display: 97.4, decimals: 1, note: "transactions abouties, séance entière" },
  { label: "charge moteur", value: 38, display: 38, decimals: 0, note: "pic pendant l'import — 9,4 s à froid" },
  { label: "confiance J+7", value: 94.2, display: 94.2, decimals: 1, note: "prévision tenue sous ±2,1 %" },
];

type TapeFicheDatum = {
  readonly label: string;
  readonly value: string;
};

/**
 * Fiche technique de la cote — how the listings page was actually made.
 * A listings page that shows its method is rarer than it should be.
 */
const TAPE_FICHE: ReadonlyArray<TapeFicheDatum> = [
  { label: "méthode", value: "SQL fenêtré · DuckDB embarqué" },
  { label: "temps de calcul", value: "9,4 s, à froid, fichier complet" },
  { label: "matériel", value: "poste de bureau ordinaire · 16 Go" },
  { label: "périmètre", value: "2 147 380 lignes · 31 colonnes" },
  { label: "révision", value: "seconde passe du moteur · 22 h 00" },
  { label: "diffusion", value: "aucune — la cote reste ici" },
];

/** Shared grid template for the listing table — head and rows must agree.
 *  360 px: canal · part · tendance (volume folds into the canal cell).
 *  640 px: + volume column.  1280 px: + the sparkline takes a column. */
const TAPE_GRID =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-x-3 " +
  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)] " +
  "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)] lg:gap-x-5";

/* ═══ §E — SMALL PARTS · glyphs, punch holes, quotes, cartouches ═════════ */

/**
 * Direction glyph + delta, in the right ink. The glyph is decorative —
 * a sr-only word carries the direction for screen readers.
 */
function TapeDelta({
  dir,
  delta,
  className,
}: {
  dir: TapeDirection;
  delta?: string;
  className?: string;
}) {
  const meta = TAPE_DIR_META[dir];
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-mono text-[11px] font-bold tabular-nums ${className ?? ""}`}
      style={{ color: meta.color }}
    >
      <span aria-hidden>{meta.glyph}</span>
      {delta && <span>{delta}</span>}
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/**
 * Telegraph-tape punch holes — a single repeated radial dot, drawn with a
 * background image so the whole strip costs one DOM node. Pure decoration.
 */
function TapePunchHoles({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-[5px] w-full ${className ?? ""}`}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(28,25,20,0.22) 1.1px, transparent 1.5px)",
        backgroundSize: "14px 5px",
        backgroundPosition: "center",
      }}
    />
  );
}

/** One quote on the tape. The left hairline doubles as the inter-quote rule
 *  and keeps the loop seam invisible (every item carries its own rule). */
function TapeQuoteItem({ quote }: { quote: TapeQuoteDatum }) {
  return (
    <li className="flex items-baseline gap-2 whitespace-nowrap border-l border-[#d6ccb6] px-4 py-2 sm:px-5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4a4438]">
        {quote.sym}
      </span>
      <span className="font-mono text-[13px] font-bold tabular-nums text-[#1c1914]">
        {quote.val}
      </span>
      <TapeDelta dir={quote.dir} delta={quote.delta} />
    </li>
  );
}

/** Floor cartouche — the hard-edged label the quotes slide beneath, like a
 *  station ident on a wire-service printer. */
function TapeCartouche({ label }: { label: string }) {
  return (
    <div className="absolute inset-y-0 left-0 z-10 flex items-center border-r-2 border-[#1c1914] bg-[#e4dac5] px-3 sm:px-4">
      <span className="font-grotesk text-[10px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
        {label}
      </span>
    </div>
  );
}

/**
 * One scrolling tape row. The track holds two copies of the quote list and
 * the `ed-tape*` keyframe translates it −50 % — a perfect loop. Rules:
 *  • off-screen ⇒ `animation-play-state: paused` (inline style wins only
 *    when set, so the CSS hover-pause from `ed-tape-hold` keeps working);
 *  • reduced motion ⇒ a static, hand-scrollable strip, one copy only.
 */
function TapeRow({
  quotes,
  cartouche,
  motionClass,
  playing,
  ariaLabel,
}: {
  quotes: ReadonlyArray<TapeQuoteDatum>;
  cartouche: string;
  motionClass: "ed-tape" | "ed-tape-reverse";
  playing: boolean;
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className="relative">
        <TapeCartouche label={cartouche} />
        <ul aria-label={ariaLabel} className="flex items-stretch overflow-x-auto pl-24 sm:pl-32">
          {quotes.map((q) => (
            <TapeQuoteItem key={q.sym} quote={q} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <TapeCartouche label={cartouche} />
      <div
        className={`flex w-max ${motionClass}`}
        style={{ animationPlayState: playing ? undefined : "paused" }}
      >
        <ul aria-label={ariaLabel} className="flex shrink-0 items-stretch">
          {quotes.map((q) => (
            <TapeQuoteItem key={q.sym} quote={q} />
          ))}
        </ul>
        {/* the loop copy — invisible to the accessibility tree */}
        <ul aria-hidden className="flex shrink-0 items-stretch">
          {quotes.map((q) => (
            <TapeQuoteItem key={q.sym} quote={q} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ═══ §F — THE BAND · bourse masthead + the two tapes ════════════════════ */

/** Slim institutional strip above the tapes: who quotes, from what, and the
 *  one bell that rang. Reads like the header of an exchange bulletin. */
function TapeBourseMast() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 bg-[#eee6d6] px-4 py-2.5 sm:px-8">
      <span className="flex items-center gap-2">
        <Landmark className="h-3.5 w-3.5 text-[#1c1914]" aria-hidden strokeWidth={2.2} />
        <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
          La bourse des canaux
        </span>
      </span>
      <span className={`hidden items-center gap-2 lg:flex ${T.folio}`}>
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        <span>
          cote établie sur {EDITION.fileName} · {EDITION.rows} lignes · sans quitter la machine
        </span>
      </span>
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#bf3415]">
        <Bell className="h-3.5 w-3.5" aria-hidden strokeWidth={2.2} />
        <span>cloche d'alerte · 16 h 04</span>
      </span>
    </div>
  );
}

/**
 * The tape band proper. One ref + useInView gates BOTH rows' play state so
 * the compositor does nothing while the band is off-screen; `ed-tape-hold`
 * on the wrapper lets a hover (or a long press on touch) freeze the quotes
 * long enough to actually read one.
 */
function TapeBand() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return (
    <div ref={ref} className="ed-tape-hold border-y border-[#1c1914] bg-[#f6f1e7]">
      <TapePunchHoles className="border-b border-[#d6ccb6]" />
      <TapeRow
        quotes={TAPE_QUOTES_COTE}
        cartouche="La cote"
        motionClass="ed-tape"
        playing={inView}
        ariaLabel="cours du jour — indicateurs métier"
      />
      <Rule />
      <TapeRow
        quotes={TAPE_QUOTES_MOTEUR}
        cartouche="Le moteur"
        motionClass="ed-tape-reverse"
        playing={inView}
        ariaLabel="cours du jour — indicateurs du moteur local"
      />
      <TapePunchHoles className="border-t border-[#d6ccb6]" />
    </div>
  );
}

/* ═══ §G — LA COTE OFFICIELLE · the listing table ════════════════════════ */

/** Column heads, stock-listing style: label over unit, numbers flush right.
 *  Hidden columns mirror the row cells exactly — the grid must agree. */
function TapeCoteHead() {
  return (
    <div role="row" className={`${TAPE_GRID} border-b-2 border-[#1c1914] pb-2`}>
      <div role="columnheader" className={T.kicker}>
        Canal
        <span className={`mt-0.5 block normal-case ${T.folio}`}>valeur cotée</span>
      </div>
      <div role="columnheader" className={`${T.kicker} text-right`}>
        Part
        <span className={`mt-0.5 block normal-case ${T.folio}`}>% du total</span>
      </div>
      <div role="columnheader" className={`hidden text-right sm:block ${T.kicker}`}>
        Volume
        <span className={`mt-0.5 block normal-case ${T.folio}`}>transactions</span>
      </div>
      <div role="columnheader" className={`${T.kicker} text-right`}>
        Tendance
        <span className={`mt-0.5 block normal-case ${T.folio}`}>vs veille</span>
      </div>
      <div role="columnheader" aria-hidden className={`hidden lg:block ${T.kicker}`}>
        Séance
        <span className={`mt-0.5 block normal-case ${T.folio}`}>06 h → 22 h</span>
      </div>
    </div>
  );
}

/** 32 px sparkline cell. preserveAspectRatio is off inside InkLine, so the
 *  44-unit viewBox stretches to whatever the column gives it. */
function TapeSparkCell({
  serie,
  markIndex,
  delay,
}: {
  serie: ReadonlyArray<number>;
  markIndex?: number;
  delay: number;
}) {
  return (
    <div className="h-8 w-full" aria-hidden>
      <InkLine data={serie} w={180} h={44} markIndex={markIndex} duration={1 + delay} />
    </div>
  );
}

/**
 * One listed channel. The USSD row is the special case the whole section
 * orbits: its session low is circled in the editor's pen, and a margin
 * note hands the reader to the enquiry on page 3. The note hangs in the
 * physical margin from 1536 px; below that it folds inline under the row
 * (margins are a luxury of wide paper).
 */
function TapeListingRow({ row, index }: { row: TapeListingDatum; index: number }) {
  const delay = index * 0.08;
  return (
    <SettleIn delay={delay} className="relative border-b border-[#d6ccb6]">
      <div role="row" className={`${TAPE_GRID} py-3.5 sm:py-4`}>
        {/* canal — code, glyph, name; volume folds in here below 640 px */}
        <div role="cell" className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[#bf3415]">
              {row.code}
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#1c1914] text-[#1c1914]">
              {row.icon}
            </span>
            <span className="truncate font-serif text-[17px] font-semibold text-[#1c1914] sm:text-[18px]">
              {row.canal}
            </span>
          </div>
          <div className={`mt-1 pl-[34px] sm:hidden ${T.folio}`}>
            <CountUpInk end={row.volume} className="text-[#4a4438]" /> tx
          </div>
        </div>

        {/* part de marché — the headline figure, counted up in fr-FR */}
        <div role="cell" className="text-right">
          <CountUpInk
            end={row.part}
            decimals={1}
            suffix=" %"
            duration={1.2}
            className="font-mono text-[15px] font-bold tabular-nums text-[#1c1914] sm:text-[16px]"
          />
        </div>

        {/* volume + session high/low agate sub-lines (sm and up) */}
        <div role="cell" className="hidden text-right sm:block">
          <CountUpInk
            end={row.volume}
            duration={1.4}
            className="font-mono text-[14px] font-semibold tabular-nums text-[#1c1914]"
          />
          <div className={`mt-0.5 hidden md:block ${T.folio}`}>
            pic {row.pic}
            <span className="mx-1 text-[#d6ccb6]">|</span>
            creux {row.creux}
          </div>
        </div>

        {/* tendance — and, for USSD, the circled low the pen flagged */}
        <div role="cell" className="text-right">
          <TapeDelta dir={row.dir} delta={row.delta} className="text-[13px]" />
          {row.enquete && (
            <div className="mt-1.5 whitespace-nowrap font-mono text-[10px] tabular-nums text-[#4a4438]">
              <span className="hidden min-[400px]:inline">creux </span>
              <PenCircle delay={1.3}>
                <span className="px-0.5 font-bold text-[#1c1914]">{row.enquete.creuxVal}</span>
              </PenCircle>
              <span> · {row.enquete.heure}</span>
            </div>
          )}
        </div>

        {/* séance sparkline — own column at lg, full-width strip below it */}
        <div role="cell" className="col-span-full mt-2 lg:col-span-1 lg:mt-0">
          <TapeSparkCell serie={row.serie} markIndex={row.markIndex} delay={delay} />
        </div>
      </div>

      {/* the hand-off to page 3 — pencilled in the margin on wide paper… */}
      {row.enquete && (
        <div className="absolute left-full top-1/2 ml-7 hidden -translate-y-1/2 2xl:block">
          <MarginNote>
            <a
              href="#lead"
              className="underline decoration-[#bf3415]/50 decoration-1 underline-offset-2 hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              voir l'enquête, p.3 ↓
            </a>
          </MarginNote>
        </div>
      )}
      {/* …and set inline, in the same hand, where the margin is too narrow */}
      {row.enquete && (
        <div className="pb-3 pl-[34px] 2xl:hidden">
          <a
            href="#lead"
            className="font-serif text-[13px] italic text-[#bf3415] underline decoration-[#bf3415]/50 decoration-1 underline-offset-2 hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
          >
            voir l'enquête, p.3 ↓
          </a>
        </div>
      )}
    </SettleIn>
  );
}

/** The table itself: heavy top rule, head, the four listings, a footnote
 *  explaining the sparklines and the one vermilion ring. */
function TapeCoteTable() {
  return (
    <div className="relative">
      <div role="table" aria-label="cote officielle des quatre canaux">
        <div className="h-[2px] w-full bg-[#1c1914]" />
        <div className="pt-2.5">
          <TapeCoteHead />
        </div>
        {TAPE_LISTINGS.map((row, i) => (
          <TapeListingRow key={row.code} row={row} index={i} />
        ))}
      </div>
      <p className={`mt-2.5 ${T.folio}`}>
        courbes : volume horaire en milliers de transactions, 06 h → 22 h · le point vermillon
        marque le creux sous enquête · valeurs en DT
      </p>
    </div>
  );
}

/**
 * Le pouls de la séance — the whole market's hourly volume as one bar
 * strip, the 16 h bar printed in the editor's vermilion. The figures are
 * the column sums of the four sparklines above; a reader with a pencil
 * can check the arithmetic, which is rather the point of this product.
 */
function TapeHourlyPulse() {
  return (
    <SettleIn>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
          <span className={T.kicker}>le pouls de la séance — volume horaire, tous canaux</span>
          <span className={T.folio}>milliers de transactions · 06 h → 22 h</span>
        </div>
        <div className="mt-4 h-28 sm:h-36">
          <InkBars
            data={TAPE_HOURLY}
            labels={TAPE_HOURLY_LABELS}
            w={680}
            h={150}
            highlight={TAPE_HOURLY_ALERT_INDEX}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1.5">
          <p className="font-mono text-[10px] tabular-nums tracking-[0.04em] text-[#bf3415]">
            16 h — quatre minutes perdues : −54 000 transactions sur l'heure
          </p>
          <p className={T.folio}>retour à la normale 16 h 08 · soirée au-dessus de la moyenne</p>
        </div>
      </div>
    </SettleIn>
  );
}

/* ═══ §H — COMMENTARY · the session, told straight ═══════════════════════ */

/**
 * Floor commentary beside a five-session volume chart. English editorial
 * voice over French figures, as the newsroom contract demands. The chart's
 * hot bar is Wednesday — the séance the rest of the page investigates.
 */
function TapeResume() {
  return (
    <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <Byline name="Le pupitre des cotations" desk="Salle des marchés · moteur DuckDB local" />
        <SettleIn delay={0.1}>
          <p className={`mt-4 ${T.body}`}>
            A quiet session on the floor, all told. Four channels opened at 06 h 00 and traded{" "}
            <span className={`${T.num} font-semibold`}>2 147 380</span> lines without drama —
            until <PenUnderline delay={0.6}>16 h 04</PenUnderline>, when USSD slipped off the
            board for four minutes and the engine rang the bell before anyone at the desk had
            looked up from their coffee. Volume recovered by 16 h 08; confidence took until the
            evening peak. The matter now belongs to the enquiry desk.
          </p>
        </SettleIn>
        <SettleIn delay={0.18}>
          <p className={`mt-4 ${T.body}`}>
            Elsewhere the book was orderly: the app gained ground after dinner, as it does; the
            web kept office hours, as it does; SMS traded sideways with the serenity of a channel
            that has nothing left to prove. Success closed at{" "}
            <span className={`${T.num} font-semibold`}>97,4 %</span> — two tenths better than
            Tuesday, and Tuesday was no embarrassment.
          </p>
        </SettleIn>
        <div className="mt-5">
          <InkLink href="#lead">Read the enquiry — page 3 →</InkLink>
        </div>
      </div>

      {/* five sessions of volume — the week, in ink bars */}
      <SettleIn delay={0.2} className="border border-[#d6ccb6] bg-[#eee6d6] p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={T.kicker}>volume — 5 séances</span>
          <span className={T.folio}>milliers de tx</span>
        </div>
        <div className="mt-3 h-32">
          <InkBars data={TAPE_WEEK_VOLUMES} labels={TAPE_WEEK_LABELS} w={300} h={130} highlight={4} />
        </div>
        <div className={`mt-2 flex items-baseline justify-between ${T.folio}`}>
          <span>mer 11 : 2 147 — plus forte séance du mois</span>
          <TapeDelta dir="up" delta="3,0 %" />
        </div>
      </SettleIn>
    </div>
  );
}

/* ═══ §H′ — PALMARÈS & INDICES · movers board and instrument plates ══════ */

/** One movers column: rank, name, dotted leader, delta. The rank numerals
 *  are old-style listing affectation — vermilion, small, indispensable. */
function TapeMoversColumn({
  title,
  movers,
}: {
  title: string;
  movers: ReadonlyArray<TapeMoverDatum>;
}) {
  return (
    <div className="min-w-0">
      <div className="border-b-2 border-[#1c1914] pb-1.5">
        <span className={T.kicker}>{title}</span>
      </div>
      <ol className="mt-2.5 space-y-2">
        {movers.map((m, i) => (
          <li key={m.name} className="flex items-baseline gap-2">
            <span className="w-4 shrink-0 font-mono text-[10px] font-bold text-[#bf3415]">
              {i + 1}.
            </span>
            <span className="shrink-0 font-grotesk text-[13px] font-semibold text-[#1c1914]">
              {m.name}
            </span>
            <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-[#857c69]/60" />
            <TapeDelta dir={m.dir} delta={m.delta} className="shrink-0 text-[12px]" />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Gainers and losers, two columns side by side from 480 px. One footnote
 *  of dry wit — newspapers are allowed exactly one per board. */
function TapePalmares() {
  return (
    <SettleIn className="min-w-0">
      <div className="flex items-center gap-4">
        <span className={`shrink-0 ${T.kicker}`}>palmarès de la séance</span>
        <Rule className="flex-1" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 min-[480px]:grid-cols-2">
        <TapeMoversColumn title="en hausse" movers={TAPE_MOVERS_UP} />
        <TapeMoversColumn title="en repli" movers={TAPE_MOVERS_DOWN} />
      </div>
      <p className={`mt-3 ${T.folio}`}>
        nb — les rejets réseau figurent « en repli » par convention typographique ; personne ne
        s'en plaint
      </p>
    </SettleIn>
  );
}

/** One instrument plate: dial, counted figure, agate context line. */
function TapeIndexPlate({ idx, delay }: { idx: TapeIndexDatum; delay: number }) {
  return (
    <SettleIn delay={delay} className="min-w-0 border border-[#d6ccb6] bg-[#eee6d6] px-3 py-3.5 text-center sm:px-4">
      <InkGauge value={idx.value} w={150} className="mx-auto w-full max-w-[150px]" />
      <div className="mt-2">
        <CountUpInk
          end={idx.display}
          decimals={idx.decimals}
          suffix=" %"
          duration={1.3}
          className="font-mono text-[17px] font-bold tabular-nums text-[#1c1914]"
        />
      </div>
      <div className={`mt-1 ${T.kicker} text-[10px] tracking-[0.18em]`}>{idx.label}</div>
      <p className={`mt-1.5 ${T.folio} normal-case tracking-normal`}>{idx.note}</p>
    </SettleIn>
  );
}

/** The three dials of the trading floor, drawn like pressure gauges on a
 *  press-room wall. Needles swing in once, on view, then hold. */
function TapeIndices() {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-4">
        <span className={`shrink-0 ${T.kicker}`}>les indices de la place</span>
        <Rule className="flex-1" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-4">
        {TAPE_INDICES.map((idx, i) => (
          <TapeIndexPlate key={idx.label} idx={idx} delay={i * 0.1} />
        ))}
      </div>
    </div>
  );
}

/* ═══ §I — AGATE · petites valeurs, dotted leaders, dense and proud ══════ */

/** One agate listing: symbol … dotted leader … value, delta. The leader is
 *  a flexed dotted border — the oldest trick in newspaper composition. */
function TapeAgateItem({ item }: { item: TapeAgateDatum }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#4a4438]">
        {item.sym}
      </span>
      <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-[#857c69]/60" />
      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-[#1c1914]">
        {item.val}
      </span>
      <TapeDelta dir={item.dir} delta={item.delta} className="shrink-0 text-[10px]" />
    </li>
  );
}

function TapeAgateBlock() {
  return (
    <SettleIn>
      <div className="flex items-center gap-4">
        <span className={`shrink-0 ${T.kicker}`}>petites valeurs — cote agate</span>
        <Rule className="flex-1" />
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {TAPE_AGATE.map((item) => (
          <TapeAgateItem key={item.sym} item={item} />
        ))}
      </ul>
    </SettleIn>
  );
}

/* ═══ §J — HOUSE NOTICES · the correction and the small print ════════════ */

/**
 * Rectificatif — yesterday's SMS share, struck through in the proofing pen.
 * A newspaper that corrects itself in public is a newspaper you can trust;
 * an engine that re-checks its own figures, likewise.
 */
function TapeRectificatif() {
  return (
    <SettleIn className="border-l-2 border-[#bf3415] pl-4 sm:pl-5">
      <p className={`${T.ui} max-w-2xl text-[14px]`}>
        <span className="font-bold uppercase tracking-[0.08em] text-[#bf3415]">
          Rectificatif —{" "}
        </span>
        in Wednesday's edition the SMS share was set at{" "}
        <PenStrike delay={0.5}>
          <span className={`${T.num} px-0.5`}>12,7 %</span>
        </PenStrike>{" "}
        ; after the engine's second pass, read <span className={`${T.num} font-semibold`}>12,5 %</span>.
        The compositor regrets nothing: the data changed, the type followed.
      </p>
    </SettleIn>
  );
}

/** The small-print folio: the only disclaimer on this exchange, and the only
 *  promise that matters. Stamped, padlocked, and entirely sincere. */
function TapeDisclaimer() {
  return (
    <SettleIn className="border border-[#1c1914] bg-[#eee6d6] px-4 py-4 shadow-[4px_4px_0_#1c1914] sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 max-w-2xl items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#1c1914]" aria-hidden strokeWidth={2.2} />
          <div>
            <p className="font-mono text-[11px] font-semibold leading-relaxed text-[#1c1914]">
              Cours illustratifs — vos chiffres réels ne quittent jamais la salle des marchés.
            </p>
            <p className={`mt-1.5 ${T.folio} normal-case tracking-normal`}>
              No quote on this page has ever touched a network. The exchange floor is your own
              machine; trading hours are whenever you open the app. Aucune télémétrie, aucun
              cloud, aucune agence extérieure — le moteur lit votre CSV sur place.
            </p>
          </div>
        </div>
        <Stamp color={STAMP_GREEN} tilt={-5} className="shrink-0">
          hors réseau
        </Stamp>
      </div>
    </SettleIn>
  );
}

/* ═══ §K — THE SECTION · band, listings, notices, folio ══════════════════ */

/**
 * TapeSection — page 2 of the Daily Edition. Reading order:
 *   DoubleRule → bourse masthead → two counter-scrolling tapes → DoubleRule
 *   → cote officielle (mast, headline, table) → session commentary + week
 *   chart → agate block → rectificatif → small-print disclaimer → folio.
 * Static section (no sticky scene), so contentVisibility can skip painting
 * it off-screen; 1640 px approximates the settled desktop height.
 */
function TapeSection() {
  return (
    <section
      id="tape"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 1640px" }}
    >
      {/* ── the bourse band, full bleed, double-ruled top and bottom ── */}
      <DoubleRule />
      <TapeBourseMast />
      <TapeBand />
      <DoubleRule />

      {/* ── the listings page beneath the tape ── */}
      <div className="mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pt-14">
        <SectionMast rubrique="Cote officielle" no="№ 03" />

        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 sm:mt-10">
          <RiseIn className="max-w-3xl">
            <h2 className="font-serif text-[clamp(1.75rem,3.4vw,2.7rem)] font-semibold leading-[1.04] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Four channels make a market — one of them misbehaved.
            </h2>
          </RiseIn>
          <p className={`${T.folio} shrink-0`}>
            séance du 11 juin · cote arrêtée à 22 h 00 · alerte 16 h 04
          </p>
        </div>

        <div className="mt-8 sm:mt-10">
          <TapeCoteTable />
        </div>

        <div className="mt-12 sm:mt-14">
          <TapeResume />
        </div>

        <div className="mt-12 sm:mt-14">
          <TapeAgateBlock />
        </div>

        <div className="mt-10 sm:mt-12">
          <TapeRectificatif />
        </div>

        <div className="mt-10 sm:mt-12">
          <TapeDisclaimer />
        </div>

        <Rule className="mt-12" />
        <FolioLine
          className="mt-3"
          page="Page 2 — la cote"
          note="cote arrêtée à 22 h 00 · séance du 11 juin 2026"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 04 — LeadSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §04 — THE LEAD STORY · "Le canal Recharge a flanché à l'heure de pointe" (p.1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The front-page lead, told as a newsroom investigation. The analyst opens the
 *  morning edition and the paper has already done the legwork: overnight, the
 *  app caught the Recharge channel's success rate slipping during the evening
 *  peak, traced it to a single error code, and set the story in type before
 *  anyone reached for coffee. We walk it the way a desk walks a story — lede,
 *  evidence drawn in ink, the source's plain-language finding in a pull quote,
 *  the verification stamps, then the hand-off to the presses.
 *
 *  Design intent
 *  ─────────────
 *  • Two evidence plates carry the proof, both drawn with the shared ink-chart
 *    library and inkScale/inkPathFrom — never hand-rolled math. Fig. 1 is the
 *    hourly réussite curve for Recharge (InkLine), with the 16 h dip ringed by
 *    InkLine's own markIndex and re-circled by the editor's PenCircle on the
 *    figure beside it. Fig. 2 ranks the error codes (InkBars), the culprit in
 *    vermilion. A halftone InkArea sits behind the read as the day's volume.
 *  • The finding is the source talking: Moudir, the on-board AI, in a PullQuote,
 *    flanked by MarginNote pencillings and two slammed stamps — VÉRIFIÉ in
 *    steward's green, HORS-LIGNE in ink. The accusation is specific and dry.
 *  • The proof reads like a wire dispatch: a fact box (the five W's), an
 *    error-code rap sheet that expands to the SQL the app actually ran, and a
 *    "la suite" beat that points the reader to the presses (#workflow).
 *  • One column of red ink, used like a pen: the dip, the verdict, the culprit
 *    bar. Everything else is ink on warm paper. Motion is transform/opacity/
 *    pathLength only and bows to prefers-reduced-motion.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Every lucide glyph shares a signature; one alias keeps the rap sheet tidy. */
type LeadIcon = typeof TriangleAlert;

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · the curve — Recharge success rate, hour by hour
 *  Taux de réussite (%) across the trading day, on the file named below. The
 *  channel holds in the high nineties until the evening peak, where it folds to
 *  91,2 % at 16 h and limps back after 19 h. Index 16 is the hour the pen rings.
 * ──────────────────────────────────────────────────────────────────────────── */

const LEAD_HOURLY: ReadonlyArray<number> = [
  97.4, 97.3, 97.6, 97.5, 97.2, 96.9, 97.1, 96.8, 96.6, 96.2, 95.7, 95.1, 94.6, 94.0, 93.1, 92.0,
  91.2, 91.9, 93.4, 95.2, 96.1, 96.7, 97.0, 97.2,
];

/** The hour the desk circled — 16 h, the trough. Index into LEAD_HOURLY. */
const LEAD_DIP_INDEX = 16;

/** Hour ticks printed under Fig. 1 — the working day, in round numbers. */
const LEAD_HOUR_TICKS = ["00 h", "06 h", "12 h", "16 h", "23 h"] as const;

/** The day's transaction volume, drawn as the halftone backdrop to the read.
 *  Same shape as a trading day: a morning shoulder, the long evening peak. */
const LEAD_VOLUME: ReadonlyArray<number> = [
  6, 5, 4, 4, 5, 9, 16, 24, 31, 35, 38, 41, 44, 49, 56, 63, 71, 66, 52, 40, 31, 22, 14, 9,
];

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · the rap sheet — top error codes during the 16 h window
 *  Counts are transactions échouées on the Recharge channel between 15 h and
 *  18 h. One code, E-217, accounts for the bulk; the rest are background noise.
 *  Sorted by count, the culprit first — the bar drawn in vermilion.
 * ──────────────────────────────────────────────────────────────────────────── */

type LeadCodeRow = {
  /** the error code, as the switch returns it */
  code: string;
  /** plain-language gloss — what it actually means at the till */
  libelle: string;
  icon: LeadIcon;
  /** échecs in the 15 h–18 h window, fr-formatted */
  echecs: string;
  /** numeric count, feeds the Fig. 2 bars */
  count: number;
  /** share of the window's failures, as the app computed it */
  part: string;
  /** the line the app ran to isolate this code — revealed on expand */
  sql: string;
  /** Moudir's one-line read on the code — dry, factual, on expand */
  note: string;
  /** the prime suspect — drawn in vermilion, stamped */
  prime?: boolean;
};

const LEAD_CODES: ReadonlyArray<LeadCodeRow> = [
  {
    code: "E-217",
    libelle: "Délai d'attente — passerelle opérateur",
    icon: TriangleAlert,
    echecs: "4 812",
    count: 4812,
    part: "73,1 %",
    sql:
      "SELECT count(*) FROM tx WHERE canal = 'Recharge' AND statut = 'echec' " +
      "AND code_erreur = 'E-217' AND heure BETWEEN 15 AND 18;",
    note:
      "Le coupable. La passerelle de l'opérateur expire avant de confirmer la recharge ; " +
      "l'argent n'a jamais bougé, mais le client, lui, a réessayé trois fois.",
    prime: true,
  },
  {
    code: "E-104",
    libelle: "Solde insuffisant — compte émetteur",
    icon: CircleAlert,
    echecs: "742",
    count: 742,
    part: "11,3 %",
    sql:
      "SELECT count(*) FROM tx WHERE canal = 'Recharge' AND code_erreur = 'E-104' " +
      "AND heure BETWEEN 15 AND 18;",
    note:
      "Bruit de fond. Un solde vide n'est pas une panne ; c'est la fin du mois. " +
      "La courbe le porte tous les jours sans broncher.",
  },
  {
    code: "E-330",
    libelle: "Référence en double — anti-rejeu",
    icon: FileWarning,
    echecs: "513",
    count: 513,
    part: "7,8 %",
    sql:
      "SELECT count(*) FROM tx WHERE canal = 'Recharge' AND code_erreur = 'E-330' " +
      "AND heure BETWEEN 15 AND 18;",
    note:
      "L'écho de E-217 : le client réessaie, l'anti-rejeu voit deux fois la même " +
      "référence et refuse poliment la seconde. Symptôme, pas cause.",
  },
  {
    code: "E-009",
    libelle: "Format invalide — numéro destinataire",
    icon: Bug,
    echecs: "511",
    count: 511,
    part: "7,8 %",
    sql:
      "SELECT count(*) FROM tx WHERE canal = 'Recharge' AND code_erreur = 'E-009' " +
      "AND heure BETWEEN 15 AND 18;",
    note:
      "Le doigt qui glisse sur le clavier. Constant d'une heure à l'autre ; " +
      "il n'a rien à voir avec le creux, et le moteur le sait.",
  },
];

/** Total failures in the window — the denominator behind every share above. */
const LEAD_WINDOW_TOTAL = "6 578";

const LEAD_CODE_COUNTS: ReadonlyArray<number> = LEAD_CODES.map((c) => c.count);
const LEAD_CODE_LABELS: ReadonlyArray<string> = LEAD_CODES.map((c) => c.code);

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · the fact box — the five W's, set like a wire dispatch
 * ──────────────────────────────────────────────────────────────────────────── */

type LeadFact = { term: string; value: string };

const LEAD_FACTS: ReadonlyArray<LeadFact> = [
  { term: "Quoi", value: "réussite Recharge — 97,4 % → 91,2 %" },
  { term: "Quand", value: "pic 16 h · fenêtre 15 h–18 h" },
  { term: "Où", value: "canal Recharge, tous guichets" },
  { term: "Combien", value: "6 578 échecs · 4 812 sur un code" },
  { term: "Pourquoi", value: "E-217 — passerelle expirée" },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · les autres canaux — the rest of the board held the line
 *  Day-over-day réussite for the other three channels, to show the dip was
 *  Recharge's alone. Drawn as a tight standings strip beside the lead chart.
 * ──────────────────────────────────────────────────────────────────────────── */

type LeadChannelRow = {
  nom: string;
  reussite: string;
  /** day-over-day movement, vermilion only where it matters */
  delta: string;
  steady: boolean;
};

const LEAD_CHANNELS: ReadonlyArray<LeadChannelRow> = [
  { nom: "Bill Payment", reussite: "98,1 %", delta: "+0,2", steady: true },
  { nom: "Recharge", reussite: "94,3 %", delta: "−3,1", steady: false },
  { nom: "Voucher", reussite: "97,8 %", delta: "−0,1", steady: true },
  { nom: "Credit Transfer", reussite: "97,5 %", delta: "+0,3", steady: true },
];

/* ════════════════════════════════════════════════════════════════════════════
 *  FLASH · the bulletin strip under the mast — a wire flash, set in ink
 * ════════════════════════════════════════════════════════════════════════════ */

function LeadFlash() {
  return (
    <SettleIn className="mt-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y-2 border-[#1c1914] px-1 py-2.5">
        <span className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.18em] text-[#bf3415]">
          <Siren aria-hidden className="h-3.5 w-3.5 ed-stamp" strokeWidth={2.2} />
          Flash · le moteur veille
        </span>
        <span className={`${T.num} text-[12px] font-bold text-[#1c1914]`}>
          RECHARGE 91,2 % — PIC 16 H — UN CODE EN CAUSE
        </span>
        <span aria-hidden className="hidden h-1 w-1 bg-[#bf3415] sm:block" />
        <span className={`${T.folio} normal-case`}>détecté pendant la nuit, avant le café</span>
        <span aria-hidden className="hidden h-1 w-1 bg-[#bf3415] md:block" />
        <span className={`${T.folio} hidden normal-case md:block`}>
          source : {EDITION.fileName} · 2 147 380 lignes
        </span>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  FACT BOX · "L'affaire en cinq mots" — the dispatch's standing summary
 * ──────────────────────────────────────────────────────────────────────────── */

function LeadFactBox() {
  return (
    <SettleIn delay={0.15}>
      <div className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[4px_4px_0_#1c1914]">
        <p className={`${T.kicker} text-[#bf3415]`}>L'affaire en cinq mots</p>
        <dl className="mt-3.5 space-y-2.5">
          {LEAD_FACTS.map((fact) => (
            <div key={fact.term} className="border-t border-[#d6ccb6] pt-2.5 first:border-t-0 first:pt-0">
              <dt className="font-grotesk text-[10px] font-bold uppercase tracking-[0.2em] text-[#857c69]">
                {fact.term}
              </dt>
              <dd className="mt-0.5 font-serif text-[15px] font-medium leading-snug text-[#1c1914]">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-[#1c1914] pt-3.5">
          <Stamp color={STAMP_GREEN} tilt={-7} className="text-[9px]">
            Vérifié
          </Stamp>
          <Stamp tilt={5} className="text-[9px]">
            Hors-ligne
          </Stamp>
          <span className={`${T.folio} normal-case`}>recompté deux fois · rien n'a quitté la machine</span>
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  FIG. 1 · the curve — hourly réussite, the 16 h dip ringed in red
 *  InkLine carries the day's success rate; its markIndex rings the trough, and
 *  the halftone InkArea behind it is the day's volume — so the eye reads the
 *  drop happening exactly where the traffic peaks. The big trough figure beside
 *  the plate is circled a second time by the editor's pen.
 * ──────────────────────────────────────────────────────────────────────────── */

function LeadCurvePlate() {
  return (
    <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
          <Activity aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
          Taux de réussite — canal Recharge
        </p>
        <span className={`${T.num} flex items-center gap-1.5 text-[11px] text-[#bf3415]`}>
          <TrendingDown aria-hidden className="h-3 w-3" strokeWidth={2.2} />
          creux 91,2 % à 16 h
        </span>
      </div>
      {/* y-scale in agate at left; the plate stacks the volume halftone behind
          the réussite line so the drop and the peak share one frame. */}
      <div className="mt-4 flex gap-3">
        <div aria-hidden className={`${T.folio} flex shrink-0 flex-col justify-between pb-4 text-right`}>
          <span>98 %</span>
          <span>94 %</span>
          <span>90 %</span>
        </div>
        <div className="relative h-44 min-w-0 flex-1">
          <div className="absolute inset-0 opacity-50">
            <InkArea data={LEAD_VOLUME} w={340} h={150} stroke={PRESS_BLUE} />
          </div>
          <div className="absolute inset-0">
            <InkLine data={LEAD_HOURLY} w={340} h={150} markIndex={LEAD_DIP_INDEX} duration={1.4} />
          </div>
        </div>
      </div>
      <div aria-hidden className="mt-2 flex justify-between pl-9">
        {LEAD_HOUR_TICKS.map((tick) => (
          <span key={tick} className={`${T.num} text-[9.5px] text-[#857c69]`}>
            {tick}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#d6ccb6] pt-3">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-[2px] w-5 bg-[#1c1914]" />
          <span className={`${T.folio} normal-case`}>réussite (%)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-[7px] w-5 bg-[#2b4a8b]/40" />
          <span className={`${T.folio} normal-case`}>volume horaire (trame)</span>
        </span>
      </div>
      <figcaption className="mt-3 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
        <span className="font-bold not-italic text-[#1c1914]">Fig. 1 — </span>
        Réussite Recharge sur les vingt-quatre heures, posée sur le volume du jour. La courbe tient
        jusqu'au pic du soir, plonge à 91,2 % à 16 h pile, puis remonte une fois la passerelle
        dégagée. Le cercle rouge est de la main du rédacteur ; le moteur, lui, avait déjà signalé.
      </figcaption>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  CHANNEL STRIP · les autres canaux held the line — the board, in agate
 * ──────────────────────────────────────────────────────────────────────────── */

function LeadChannelLine({ row, index }: { row: LeadChannelRow; index: number }) {
  return (
    <SettleIn delay={index * 0.05} y={8}>
      <div
        className={`flex items-baseline justify-between gap-3 border-t border-[#d6ccb6] py-2 ${
          row.steady ? "text-[#1c1914]" : "text-[#bf3415]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 font-serif text-[15px] font-semibold leading-tight">
          {!row.steady && <Crosshair aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
          <span className="truncate">{row.nom}</span>
        </span>
        <span className={`${T.num} shrink-0 text-[13px] font-bold`}>{row.reussite}</span>
        <span className={`${T.num} w-12 shrink-0 text-right text-[12px] ${row.steady ? "text-[#857c69]" : "text-[#bf3415]"}`}>
          {row.delta}
        </span>
      </div>
    </SettleIn>
  );
}

function LeadChannelBoard() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className={T.kicker}>Le reste du tableau</p>
          <span className={T.folio}>réussite · veille → ce matin</span>
        </div>
        <p className="mt-2 font-serif text-[14px] italic leading-relaxed text-[#4a4438]">
          Trois canaux sur quatre n'ont pas bronché. Le creux est l'affaire de Recharge, seul.
        </p>
      </SettleIn>
      <div className="mt-3">
        {LEAD_CHANNELS.map((row, i) => (
          <LeadChannelLine key={row.nom} row={row} index={i} />
        ))}
        <Rule />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  RAP SHEET · the error codes, ranked — the culprit in vermilion
 *  Fig. 2 ranks the window's failures by code; the standings table below it
 *  expands each code (a real <button>, aria-expanded) to the SQL the app ran
 *  and Moudir's one-line read. Reveal is opacity/translate; layout snaps.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Shared column template — header and rows must agree to the rem. */
const LEAD_GRID_COLS = "md:grid-cols-[5.5rem_minmax(0,1fr)_5.5rem_4.5rem_2.25rem]";

function LeadCodeRowLine({ row, index }: { row: LeadCodeRow; index: number }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelId = useId();
  const Icon = row.icon;
  return (
    <SettleIn delay={index * 0.05} y={12} className="border-t border-[#d6ccb6]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`grid w-full grid-cols-[5.5rem_minmax(0,1fr)_2.25rem] items-center gap-x-3 px-1 py-3.5 text-left transition-colors hover:bg-[#1c1914]/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#bf3415] ${LEAD_GRID_COLS}`}
      >
        <span
          className={`${T.num} text-[14px] font-bold ${row.prime ? "text-[#bf3415]" : "text-[#1c1914]"}`}
        >
          {row.code}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Icon
              aria-hidden
              className={`h-3.5 w-3.5 shrink-0 ${row.prime ? "text-[#bf3415]" : "text-[#4a4438]"}`}
              strokeWidth={2}
            />
            <span className="font-serif text-[16px] font-semibold leading-tight text-[#1c1914]">
              {row.libelle}
            </span>
            {row.prime && (
              <Stamp tilt={-6} className="text-[9px]">
                Suspect №1
              </Stamp>
            )}
          </span>
          {/* On small-mid widths the hidden columns fold into a meta line. */}
          <span className={`${T.folio} mt-1.5 block normal-case md:hidden`}>
            {row.echecs} échecs · {row.part} de la fenêtre
          </span>
        </span>
        <span className={`${T.num} hidden text-right text-[13px] text-[#4a4438] md:block`}>
          {row.echecs}
        </span>
        <span
          className={`${T.num} hidden text-right text-[14px] font-bold md:block ${
            row.prime ? "text-[#bf3415]" : "text-[#1c1914]"
          }`}
        >
          {row.part}
        </span>
        <motion.span
          aria-hidden
          className="justify-self-end text-[#857c69]"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE_INK }}
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE_INK }}
            className="px-1 pb-4 md:pl-[5.5rem]"
          >
            <code
              className={`${T.num} block overflow-x-auto border-l-2 border-[#bf3415] bg-[#eee6d6] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#1c1914]`}
            >
              {row.sql}
            </code>
            <p className="mt-2.5 max-w-[64ch] font-serif text-[14px] italic leading-relaxed text-[#4a4438]">
              <span className={`${T.kicker} mr-2 not-italic text-[#bf3415]`}>Lecture de Moudir</span>
              {row.note}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </SettleIn>
  );
}

function LeadRapSheet() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-2.5 font-serif text-[clamp(1.35rem,2.4vw,1.7rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <FileSearch aria-hidden className="h-5 w-5 text-[#bf3415]" strokeWidth={2} />
            Les codes mis en cause
          </h3>
          <span className={T.folio}>fenêtre 15 h–18 h · {EDITION.datelineShort}</span>
        </div>
      </SettleIn>
      <DoubleRule className="mt-3" />
      {/* Fig. 2 — the bars, culprit in vermilion, before the standings. */}
      <SettleIn delay={0.1}>
        <figure className="mt-4">
          <div className="h-32">
            <InkBars data={LEAD_CODE_COUNTS} labels={LEAD_CODE_LABELS} w={340} h={130} highlight={0} />
          </div>
          <figcaption className="mt-2 font-serif text-[12.5px] italic leading-relaxed text-[#4a4438]">
            <span className="font-bold not-italic text-[#1c1914]">Fig. 2 — </span>
            Échecs Recharge par code d'erreur sur la fenêtre du pic. Un seul barreau dépasse — E-217,
            en rouge — et le reste tient dans le bruit habituel.
          </figcaption>
        </figure>
      </SettleIn>
      {/* Column heads — only at md+, where the full grid is visible. */}
      <div className={`mt-6 hidden gap-x-3 px-1 pb-2 pt-3 md:grid ${LEAD_GRID_COLS}`} aria-hidden>
        <span className={T.folio}>Code</span>
        <span className={T.folio}>Cause</span>
        <span className={`${T.folio} text-right`}>Échecs</span>
        <span className={`${T.folio} text-right`}>Part</span>
        <span />
      </div>
      <div role="list" aria-label="Codes d'erreur classés par nombre d'échecs">
        {LEAD_CODES.map((row, i) => (
          <div role="listitem" key={row.code}>
            <LeadCodeRowLine row={row} index={i} />
          </div>
        ))}
      </div>
      <Rule />
      <SettleIn delay={0.2}>
        <p className={`${T.folio} mt-3 max-w-[78ch] normal-case leading-relaxed`}>
          Échecs — transactions Recharge en statut « echec » entre 15 h et 18 h, sur {LEAD_WINDOW_TOTAL}{" "}
          au total. Part — sur la fenêtre, calculée par le moteur. Cliquer une ligne ouvre la requête
          exécutée et la lecture de Moudir. Aucun appel réseau : la copie est sur le bureau.
        </p>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · la traque — how the engine caught it overnight, step by step
 *  Transcribed from the run log: the nightly pass that turned a flat file into
 *  a front-page lead. Durations are wall-clock on the bench machine. The column
 *  carries a vertical ink rail whose vermilion fill tracks scroll, and each
 *  step's dot inks itself in as the fill reaches it — pure transform/opacity.
 * ──────────────────────────────────────────────────────────────────────────── */

type LeadTraceStep = {
  /** the bench clock, mono — when the engine did this overnight */
  clock: string;
  phase: string;
  /** the step's cost, set in agate */
  dur: string;
  /** serif narration — the reporter walking the run log */
  text: string;
};

const LEAD_TRACE_STEPS: ReadonlyArray<LeadTraceStep> = [
  {
    clock: "05 h 38",
    phase: "Lecture — le fichier déposé",
    dur: "0,42 s",
    text:
      "The night's file lands and the engine reads it whole — 2 147 380 rows, fourteen columns, no " +
      "index asked for. Nothing is uploaded; the file is read where it sits.",
  },
  {
    clock: "05 h 38",
    phase: "Profil — réussite par heure",
    dur: "0,19 s",
    text:
      "It cuts the day into twenty-four hourly slices and computes réussite per channel for each. " +
      "Twenty-four numbers per channel, ninety-six in all, and one of them is wrong by three points.",
  },
  {
    clock: "05 h 39",
    phase: "Alerte — l'écart franchit le seuil",
    dur: "0,03 s",
    text:
      "Recharge at 16 h crosses the alert band — more than two points under its own seven-day floor. " +
      "The engine does not shrug it off as noise; it opens a file on the hour.",
  },
  {
    clock: "05 h 40",
    phase: "Instruction — ventilation par code",
    dur: "0,11 s",
    text:
      "It pulls every failed Recharge transaction in the 15 h–18 h window and groups them by error " +
      "code. One code stands a head taller than the rest, and the engine notes its name: E-217.",
  },
  {
    clock: "05 h 41",
    phase: "Rédaction — la note de Moudir",
    dur: "0,9 s",
    text:
      "The on-board model reads the grouped result and writes one plain sentence — what dropped, by " +
      "how much, and which code carries it. The verdict goes into the morning briefing, signed.",
  },
];

/** Where each step sits on the rail's progress window [0.22 → 0.74]. */
function LeadTraceAt(index: number) {
  return 0.22 + (index / (LEAD_TRACE_STEPS.length - 1)) * 0.52;
}

/** One trace entry. Receives the shared progress MotionValue as a prop — hooks
 *  live here, in a real component, never in the map callback. */
function LeadTraceStepLine({
  step,
  progress,
  at,
  index,
  last,
}: {
  step: LeadTraceStep;
  progress: MotionValue<number>;
  at: number;
  index: number;
  last: boolean;
}) {
  const reduce = useReducedMotion();
  const reached = useTransform(progress, [at - 0.025, at + 0.015], reduce ? [1, 1] : [0, 1], {
    clamp: true,
  });
  return (
    <div className={`relative pl-9 ${last ? "" : "pb-8"}`}>
      <span
        aria-hidden
        className="absolute left-0 top-[3px] h-[13px] w-[13px] rounded-full border-2 border-[#1c1914] bg-[#eee6d6]"
      />
      <motion.span
        aria-hidden
        className="absolute left-[3px] top-[6px] h-[7px] w-[7px] rounded-full bg-[#bf3415]"
        style={{ scale: reached, opacity: reached }}
      />
      <RiseIn delay={index * 0.04} amount={0.6}>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`${T.num} text-[13px] font-bold text-[#1c1914]`}>{step.clock}</span>
          <span className="font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a4438]">
            {step.phase}
          </span>
          <span className={`${T.num} border border-[#d6ccb6] px-1.5 py-px text-[10px] text-[#857c69]`}>
            {step.dur}
          </span>
        </p>
      </RiseIn>
      <SettleIn delay={index * 0.04 + 0.1} y={10}>
        <p className="mt-2 max-w-[46ch] font-serif text-[15px] leading-[1.6] text-[#1c1914]">
          {step.text}
        </p>
      </SettleIn>
    </div>
  );
}

/** The full traque column: header, scroll rail, steps, the signed-off plate. */
function LeadTrace() {
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const progress = useDriftProgress(railRef);
  const fill = useTransform(progress, [0.22, 0.74], reduce ? [1, 1] : [0, 1], { clamp: true });
  return (
    <aside aria-label="La traque — comment le moteur a trouvé le creux, pas à pas">
      <SettleIn>
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#bf3415]">
          <Search aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />
          La traque — du fichier au verdict, en trois minutes
        </p>
        <p className="mt-3 max-w-[46ch] font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          How a flat file became a lead while the desk slept — transcribed from the run log, no cuts.
          The whole pass took less time than a kettle.
        </p>
      </SettleIn>
      <div ref={railRef} className="relative mt-7">
        <span aria-hidden className="absolute bottom-1 left-[5.5px] top-1 w-px bg-[#1c1914]/25" />
        <motion.span
          aria-hidden
          className="absolute bottom-1 left-[4.5px] top-1 w-[3px] origin-top bg-[#bf3415]"
          style={{ scaleY: fill }}
        />
        {LEAD_TRACE_STEPS.map((step, i) => (
          <LeadTraceStepLine
            key={step.phase}
            step={step}
            progress={progress}
            at={LeadTraceAt(i)}
            index={i}
            last={i === LEAD_TRACE_STEPS.length - 1}
          />
        ))}
      </div>
      <SettleIn delay={0.15} className="mt-7">
        <div className="border-2 border-[#1c1914] bg-[#f6f1e7] px-4 py-3 shadow-[4px_4px_0_#1c1914]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className={`${T.kicker} text-[#1c1914]`}>Bouclé à</span>
            <span className={`${T.num} text-[1.35rem] font-bold text-[#1c1914]`}>05 h 41</span>
          </div>
          <p className={`${T.folio} mt-1 normal-case`}>
            réseau coupé du début à la fin — la traque n'a parlé à personne
          </p>
        </div>
      </SettleIn>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  SEVERITY PLATE · the instrument read — how far the channel fell
 *  An InkGauge set to the share of the day's Recharge failures that fall in the
 *  16 h window, drawn like a dial on an instrument panel, with the three figures
 *  the desk keeps repeating beside it.
 * ──────────────────────────────────────────────────────────────────────────── */

type LeadReadItem = { value: string; label: string; tone: "ink" | "vermilion" | "green" };

const LEAD_READS: ReadonlyArray<LeadReadItem> = [
  { value: "−6,2 pts", label: "chute de réussite au pic", tone: "vermilion" },
  { value: "4 812", label: "échecs sur le seul E-217", tone: "ink" },
  { value: "3 min", label: "du dépôt au verdict signé", tone: "green" },
];

function LeadSeverityPlate() {
  return (
    <SettleIn>
      <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[4px_4px_0_#1c1914] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Target aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Gravité — part du creux à 16 h
          </p>
          <span className={`${T.folio}`}>sur les échecs Recharge du jour</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-5">
          <div className="w-44 shrink-0">
            <InkGauge value={73} label="73 % concentrés sur une heure" w={176} />
          </div>
          <dl className="min-w-0 flex-1 space-y-2.5">
            {LEAD_READS.map((read) => (
              <div key={read.label} className="border-t border-[#d6ccb6] pt-2.5 first:border-t-0 first:pt-0">
                <dt
                  className={`${T.num} text-[1.5rem] font-bold leading-none ${
                    read.tone === "vermilion"
                      ? "text-[#bf3415]"
                      : read.tone === "green"
                        ? "text-[#2f6b3f]"
                        : "text-[#1c1914]"
                  }`}
                >
                  {read.value}
                </dt>
                <dd className="mt-1 font-serif text-[13px] italic leading-snug text-[#4a4438]">
                  {read.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <figcaption className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
          <span className="font-bold not-italic text-[#1c1914]">Fig. 3 — </span>
          Près des trois quarts des échecs Recharge du jour tombent dans une seule heure. Ce n'est pas
          une dérive lente ; c'est une porte qui claque, puis se rouvre.
        </figcaption>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  RECTIFICATIF · the precaution box — what the desk is careful not to claim
 * ──────────────────────────────────────────────────────────────────────────── */

function LeadPrecaution() {
  return (
    <SettleIn delay={0.1}>
      <div className="border border-[#1c1914] p-4">
        <p className={`${T.kicker} text-[#bf3415]`}>Précaution de rédaction</p>
        <p className="mt-2 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
          The desk reports the timeout, not the fault behind it — the gateway is the operator's, and
          the file cannot see the operator's side. E-217 says a confirmation never came back; whether
          the recharge actually went through is a question for the other end of the wire. We print
          what the file can prove, and flag the rest as the operator's to check.
        </p>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  LA SUITE · what the analyst does next — the hand-off to the presses
 * ──────────────────────────────────────────────────────────────────────────── */

type LeadNextStep = { no: string; icon: LeadIcon; action: string; detail: string };

const LEAD_NEXT_STEPS: ReadonlyArray<LeadNextStep> = [
  {
    no: "01",
    icon: PhoneIncoming,
    action: "Alerter la passerelle",
    detail:
      "Le code et la fenêtre partent à l'équipe opérateur, capture de Fig. 1 à l'appui — pas une " +
      "supposition, une heure et un numéro.",
  },
  {
    no: "02",
    icon: ListChecks,
    action: "Annoter le rapport",
    detail:
      "Le creux entre dans le briefing du matin avec la note de Moudir et les deux tampons. " +
      "Le lecteur de 8 h saura déjà ce qu'il regarde.",
  },
  {
    no: "03",
    icon: GitBranch,
    action: "Suivre jusqu'aux presses",
    detail:
      "Le même fichier descend la chaîne — enrichi, mis en page, exporté. L'enquête continue à " +
      "l'atelier, et c'est là qu'elle s'imprime.",
  },
];

function LeadNextStepLine({ step, index }: { step: LeadNextStep; index: number }) {
  const Icon = step.icon;
  return (
    <SettleIn delay={index * 0.07} y={12} className="border-t border-[#d6ccb6]">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-4 py-4">
        <span className="flex h-10 w-10 items-center justify-center border border-[#1c1914] bg-[#f6f1e7]">
          <Icon aria-hidden className="h-5 w-5 text-[#1c1914]" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="flex items-baseline gap-2.5">
            <span className={`${T.num} text-[12px] text-[#857c69]`}>{step.no}</span>
            <span className="font-serif text-[17px] font-bold leading-tight text-[#1c1914]">
              {step.action}
            </span>
          </p>
          <p className="mt-1 max-w-[56ch] font-serif text-[14px] leading-relaxed text-[#4a4438]">
            {step.detail}
          </p>
        </div>
      </div>
    </SettleIn>
  );
}

function LeadNextBeat() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-2.5 font-serif text-[clamp(1.35rem,2.4vw,1.7rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <ArrowDownRight aria-hidden className="h-5 w-5 text-[#bf3415]" strokeWidth={2} />
            Ce que fait l'analyste, maintenant
          </h3>
          <span className={T.folio}>la suite · de l'enquête à l'édition</span>
        </div>
        <p className="mt-3 max-w-[60ch] font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          Le moteur a trouvé le creux ; l'analyste décide quoi en faire. Trois gestes, puis le
          dossier descend vers les presses.
        </p>
      </SettleIn>
      <div className="mt-5">
        {LEAD_NEXT_STEPS.map((step, i) => (
          <LeadNextStepLine key={step.no} step={step} index={i} />
        ))}
        <Rule />
      </div>
      <SettleIn delay={0.2} className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <InkButton href="#workflow" tone="ink">
          Suivre l'enquête aux presses
          <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
        </InkButton>
        <InkLink href="/dashboard">Ouvrir l'application et rejouer la fenêtre</InkLink>
      </SettleIn>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE SECTION · composition in reading order
 *  Band 1 (paper): mast → flash → headline + byline + lede, fact box and the
 *  margin note hung off the right. Band 2 (deep paper): the evidence — Fig. 1
 *  curve + channel board, then the rap sheet with Fig. 2. Band 3 (paper):
 *  Moudir's finding as a pull quote, the next-step beat, the folio.
 * ──────────────────────────────────────────────────────────────────────────── */

function LeadSection() {
  return (
    <section
      id="lead"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 4200px" }}
    >
      {/* ── Band 1 · the front-page lede ──────────────────────────────────── */}
      <div className="mx-auto max-w-[1280px] px-5 pb-20 pt-24 sm:px-8 lg:px-12">
        <SectionMast rubrique="L'enquête du jour" no="p.1" />
        <LeadFlash />

        {/* headline + standfirst, the fact box and a margin note alongside */}
        <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div>
            <DeckReveal
              className="max-w-[20ch]"
              lineClassName="font-serif text-[clamp(2.3rem,5.4vw,4.6rem)] font-bold leading-[1.0] tracking-[-0.018em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              lines={[
                <span key="l1">Recharge flanche</span>,
                <span key="l2">
                  à <PenCircle delay={1}>l'heure de pointe</PenCircle>
                </span>,
                <span key="l3">— un seul code accuse</span>,
              ]}
            />
            <SettleIn delay={0.25} className="mt-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Byline name="Par le Bureau des données" desk="Pupitre d'enquête · édition du matin" />
                <span aria-hidden className="hidden h-3 w-px bg-[#d6ccb6] sm:block" />
                <span className={`${T.folio} flex items-center gap-1.5`}>
                  <Clock aria-hidden className="h-3 w-3" strokeWidth={2} />
                  bouclé 05 h 41 — {EDITION.city}
                </span>
              </div>
            </SettleIn>
            <div className="mt-7 max-w-[68ch] space-y-5">
              <DropCapParagraph>
                The analyst opened this morning's edition expecting the usual flat lines and got a
                headline instead. Overnight, while the desk slept, the engine had walked the day's
                two million transactions, noticed that the Recharge channel's success rate fell off
                a cliff at the evening peak, and set the story before anyone arrived. The figure it
                circled: réussite at <span className={`${T.num} font-semibold text-[#1c1914]`}>91,2 %</span>{" "}
                at 16 h, down from a steady{" "}
                <span className={`${T.num} font-semibold text-[#1c1914]`}>97,4 %</span> — three full
                points, gone in one hour.
              </DropCapParagraph>
              <p className={T.body}>
                A three-point drop is the kind of thing that hides in a daily average and surfaces a
                week later as an angry operator. Here it surfaced before breakfast. The engine did
                not stop at the curve; it sorted the failures in that window by error code and found
                that one of them —{" "}
                <PenUnderline delay={1.1}>
                  <span className={T.num}>E-217</span>
                </PenUnderline>{" "}
                — carried nearly three failures in four. The other channels held the line. This was
                Recharge's affair, and it had a name.
              </p>
            </div>
          </div>
          <div className="space-y-7 lg:pt-2">
            <LeadFactBox />
            <div className="hidden lg:block lg:pl-2">
              <MarginNote>
                aucune donnée n'a quitté le poste — l'enquête s'est faite à huis clos, sur place
              </MarginNote>
            </div>
          </div>
        </div>
      </div>

      {/* ── Band 2 · the evidence, on deeper paper ────────────────────────── */}
      <div className="border-y border-[#d6ccb6] bg-[#eee6d6]">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-8 lg:px-12">
          <SettleIn>
            <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#bf3415]">
              <Microscope aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />
              Les pièces — tirées du fichier, dessinées à l'encre
            </p>
          </SettleIn>
          {/* the curve carries the left; the channel board sits beside it */}
          <div className="mt-7 grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <LeadCurvePlate />
            <div className="lg:pt-1">
              <LeadChannelBoard />
              <SettleIn delay={0.25} className="mt-7">
                <Parallax speed={18}>
                  <div className="border-l-[3px] border-[#bf3415] bg-[#f6f1e7] px-4 py-3.5">
                    <p className="flex items-center gap-2 font-grotesk text-[10px] font-bold uppercase tracking-[0.2em] text-[#857c69]">
                      <Gauge aria-hidden className="h-3 w-3 text-[#bf3415]" strokeWidth={2.4} />
                      Pic du jour
                    </p>
                    <p className="mt-1.5 font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
                      The peak is real — 16 h is when the day's traffic is heaviest. The channel did
                      not buckle under load; it buckled because one gateway upstream chose that hour
                      to time out.
                    </p>
                  </div>
                </Parallax>
              </SettleIn>
            </div>
          </div>

          {/* the rap sheet — Fig. 2 and the standings of error codes */}
          <div className="mt-20">
            <LeadRapSheet />
          </div>

          {/* the traque column + severity plate — how the engine found it */}
          <div className="mt-20 grid gap-y-14 lg:grid-cols-12 lg:gap-x-0">
            <div className="lg:col-span-7 lg:pr-10">
              <LeadTrace />
            </div>
            <div className="lg:col-span-5 lg:border-l lg:border-[#d6ccb6] lg:pl-10">
              <LeadSeverityPlate />
              <div className="mt-8">
                <LeadPrecaution />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Band 3 · the finding, the next move, the folio ────────────────── */}
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-20 sm:px-8 lg:px-12">
        <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="max-w-[46rem]">
            <SettleIn>
              <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
                <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-[#2f6b3f]" strokeWidth={2.2} />
                Le verdict de la source — Moudir, IA embarquée
              </p>
            </SettleIn>
            <div className="mt-6">
              <PullQuote cite="Moudir · briefing du matin, rédigé hors-ligne">
                Recharge a perdu trois points à 16 h. Quatre échecs sur cinq portent le code E-217 —
                la passerelle de l'opérateur a expiré pendant le pic. Ce n'est pas votre fichier ;
                c'est l'autre bout du fil.
              </PullQuote>
            </div>
            <SettleIn delay={0.15} className="mt-7">
              <p className={T.body}>
                It is the kind of sentence a good editor waits all morning for: specific, sourced,
                and willing to say what it does not blame. Moudir wrote it on the machine, from the
                machine's own numbers, with the network unplugged — the verdict carries two stamps
                for a reason. The analyst does not have to trust a cloud they cannot see; the proof
                is on the desk, recounted twice.
              </p>
            </SettleIn>
          </div>
          <div className="lg:pt-12">
            <MarginNote side="left">
              « ce n'est pas votre fichier » — la phrase que tout analyste veut lire avant 8 h
            </MarginNote>
          </div>
        </div>

        <div className="mt-20">
          <LeadNextBeat />
        </div>

        <FolioLine
          className="mt-16 border-t border-[#d6ccb6] pt-4"
          page="p.1"
          note="L'enquête du jour · le canal Recharge à l'heure de pointe"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 05 — FoldSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ──────────────────────────────────────────────────────────────────────────────
 *  05 · FOLD — the fold moment
 *  ─────────────────────────────────────────────────────────────────────────────
 *  A short sticky interlude (StickyScene, 2 pages) staging the one physical
 *  gesture every broadsheet reader knows: the paper folds. Above the fold,
 *  the front page recaps the morning so far — the file, the figures, the
 *  anomaly chased down and corrected. Then the top half of the sheet rotates
 *  away (rotateX 0 → −68°, perspective 1200, hinged at the crease) and the
 *  second half of the edition rises from below: "how it's made", page 4.
 *
 *  Choreography (scene progress 0 → 1, segments via useSegment):
 *    0.00–0.10  dwell — the sheet sits flat, counters set the figures in type
 *    0.10–0.60  FOLD   — upper half hinges back; crease ink + shadow intensify;
 *                        the paper-back shade (#e4dac5) creeps over the verso
 *    0.45–0.90  REVEAL — front-page columns sink and fade; the below-the-fold
 *                        teaser rises through the crease into the lower half
 *    0.86–0.96  STAMP  — "à suivre — p.4" slams onto the teaser corner
 *
 *  Motion contract: 100 % transform/opacity. The hinge is a single rotateX on
 *  a composited layer; everything else is translate/scale/opacity driven off
 *  the same scroll value. prefers-reduced-motion collapses the whole scene to
 *  a static two-half sheet in normal document flow — no pinning, no jack.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Scene timing table — one source of truth for every segment in this act. */
const FOLD_SEGMENTS = {
  /** upper half hinges from 0° to −68° */
  fold: [0.1, 0.6],
  /** teaser rises while the front-page columns sink away */
  reveal: [0.45, 0.9],
  /** "à suivre" stamp slams near the end of the scene */
  stamp: [0.86, 0.96],
  /** scroll hint fades as soon as the reader commits */
  hint: [0.02, 0.14],
} as const;

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · DATA — the morning recap, set in type
 * ════════════════════════════════════════════════════════════════════════════ */

type FoldStat = {
  id: string;
  /** French data label, per the newsroom's house style */
  label: string;
  /** full sentence for assistive tech — the chip itself is typographic */
  srLabel?: string;
  icon: ReactNode;
  /** animated figure (CountUpInk) — omit when the value is a clock time */
  count?: { end: number; decimals?: number; suffix?: string };
  /** literal figure when counting makes no sense (16 h 04 is not a number) */
  staticValue?: string;
  unit?: string;
  /** provenance line — where the figure comes from, printed small */
  footnote: string;
  /** day-over-day movement, set in vermilion like a margin correction */
  delta: string;
  /** eight-point sparkline, deterministic, drawn in soft ink at ≥xl */
  spark: ReadonlyArray<number>;
};

/** The three figures the front page led with — repeated here as the recap. */
const FOLD_RECAP_STATS: ReadonlyArray<FoldStat> = [
  {
    id: "rows",
    label: "Lignes traitées",
    icon: <Database aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    count: { end: 2147380 },
    unit: "lignes",
    footnote: "DailyTransactions_2026-06-11.csv · 41 colonnes",
    delta: "+3,1 % vs mercredi",
    spark: [62, 70, 74, 81, 78, 84, 90, 96],
  },
  {
    id: "success",
    label: "Réussite",
    icon: <CircleCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    count: { end: 97.4, decimals: 1, suffix: " %" },
    footnote: "tous canaux · pondérée volume",
    delta: "+0,6 pt après correctif",
    spark: [96, 95, 31, 58, 84, 95, 97, 97],
  },
  {
    id: "anomaly",
    label: "Anomalie résolue",
    icon: <Flag aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    staticValue: "16 h 04",
    footnote: "USSD · creux détecté à 04 h 12",
    delta: "11 h 52 du creux au correctif",
    // minutes-to-resolution across the last eight incidents — trending down
    spark: [310, 240, 270, 190, 150, 120, 96, 71],
  },
];

/** Hourly success curve (%) — the dip at 04 h is the lead story's anomaly. */
const FOLD_HOURLY: ReadonlyArray<number> = [
  82, 84, 83, 80, 31, 46, 71, 83, 89, 92, 94, 95, 96, 95, 93, 94, 97, 97, 96, 94, 91, 89, 86, 84,
];
/** Index of the 04 h reading — circled in vermilion by the editor's pen. */
const FOLD_HOURLY_MARK = 4;

type FoldColumn = {
  id: string;
  title: string;
  paras: ReadonlyArray<string>;
  /** column 2 carries the hourly curve as a printed graphic */
  withChart?: boolean;
  /** column 4 carries the canal weather table */
  withTable?: boolean;
  /** classic newspaper jump line — "Suite page 4" */
  jump?: string;
};

/**
 * The front-page continuation that lives BELOW the crease before the teaser
 * rises over it. Four short columns, justified like real broadsheet body —
 * a faithful recap of sections 02–04 so the fold reads as a summary, not
 * decoration. Columns 2–4 collapse away on narrow paper.
 */
const FOLD_RECAP_COLUMNS: ReadonlyArray<FoldColumn> = [
  {
    id: "une",
    title: "Ce que la une racontait",
    paras: [
      "A single file arrived at 06 h 00 — DailyTransactions_2026-06-11.csv, 2 147 380 lignes, " +
        "41 colonnes — and never left the building. By 06 h 02 the desk had profiled every " +
        "canal and set the masthead figures in type.",
      "No upload, no sampling, no « send to the cloud for processing ». The whole front page " +
        "was composed on one machine; the network cable stayed coiled in the drawer.",
    ],
  },
  {
    id: "bandeau",
    title: "Ce que le bandeau chiffrait",
    paras: [
      "Réussite 97,4 % tous canaux ; USSD en tête à 41 % du volume ; montant journalier " +
        "4,2 M TND ; latence médiane des requêtes 0,8 s sur 2,1 M de lignes.",
    ],
    withChart: true,
  },
  {
    id: "enquete",
    title: "Ce que l'enquête a établi",
    paras: [
      "At 04 h 12 the success curve fell to 31 % on canal USSD — a gateway timeout, not " +
        "fraud. Twelve DuckDB queries traced it, the window was flagged in red pen, and the " +
        "correctif shipped at 16 h 04, before the evening run.",
    ],
    jump: "Suite et fabrication, page 4 — sous le pli.",
  },
  {
    id: "meteo",
    title: "La météo des canaux",
    paras: ["Part de volume et tendance par canal, relevées à l'heure du bouclage."],
    withTable: true,
  },
];

type FoldCanalRow = {
  canal: string;
  part: string;
  /** typographic trend glyph — set in mono like a weather table */
  tendance: "↗" | "→" | "↘";
  note: string;
};

/** Five canals, share of volume and tendency — the analyst's weather report. */
const FOLD_CANAL_WEATHER: ReadonlyArray<FoldCanalRow> = [
  { canal: "USSD", part: "41 %", tendance: "↗", note: "stable après correctif" },
  { canal: "SMS", part: "23 %", tendance: "→", note: "rien à signaler" },
  { canal: "APP", part: "19 %", tendance: "↗", note: "+1,8 pt sur la semaine" },
  { canal: "WEB", part: "11 %", tendance: "↘", note: "−0,4 pt, surveillé" },
  { canal: "AGENT", part: "6 %", tendance: "→", note: "saisonnier, normal" },
];

type FoldIndexItem = {
  page: string;
  title: string;
  note: string;
  /** only anchors that exist on this page — others stay plain print */
  href?: string;
};

/** "À l'intérieur" — the teaser's index of what waits below the fold. */
const FOLD_TEASER_INDEX: ReadonlyArray<FoldIndexItem> = [
  {
    page: "p.4",
    title: "Les sept presses",
    note: "la chaîne de fabrication, de l'ingestion à l'export",
    href: "#workflow",
  },
  {
    page: "p.5",
    title: "Petites annonces",
    note: "trente et quelques capacités, classées par rubrique",
    href: "#capabilities",
  },
  {
    page: "p.6",
    title: "L'entretien",
    note: "une IA de bureau qui répond, réseau débranché",
  },
];

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · PRINT FURNITURE — crop marks, sheet masthead, crease
 * ════════════════════════════════════════════════════════════════════════════ */

/** Printer's crop mark — hairline cross at each corner of the sheet. */
function FoldCropMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 ${className ?? ""}`}>
      <line x1="8" y1="0" x2="8" y2="5.5" stroke={INK_FADED} strokeWidth="1" />
      <line x1="8" y1="10.5" x2="8" y2="16" stroke={INK_FADED} strokeWidth="1" />
      <line x1="0" y1="8" x2="5.5" y2="8" stroke={INK_FADED} strokeWidth="1" />
      <line x1="10.5" y1="8" x2="16" y2="8" stroke={INK_FADED} strokeWidth="1" />
    </svg>
  );
}

/** The sheet's own miniature masthead — this is a page OF the paper, after all. */
function FoldSheetMastStrip() {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-3 sm:px-8">
      <span className="flex items-center gap-2 font-serif text-[13px] font-bold tracking-tight text-[#1c1914]">
        <Newspaper aria-hidden className="h-3.5 w-3.5 -translate-y-px" strokeWidth={2.2} />
        {EDITION.masthead}
        <span className="hidden font-grotesk text-[9px] font-semibold uppercase tracking-[0.24em] text-[#857c69] md:inline">
          · première partie
        </span>
      </span>
      <span className={`${T.folio} hidden sm:block`}>
        {EDITION.volume} · {EDITION.issue}
      </span>
      <span className={T.folio}>{EDITION.datelineShort}</span>
    </div>
  );
}

/**
 * The crease. A zero-height seam between the two halves of the sheet that
 * carries three layers: the ink line of the fold itself, the soft shadow the
 * hinged half throws onto the page below, and a bindery tag ("plier ici").
 * Both opacities are driven by the fold segment; static numbers serve the
 * reduced-motion variant. Opacity-only — the gradients never animate.
 */
function FoldCrease({
  line,
  shadow,
}: {
  line?: MotionValue<number> | number;
  shadow?: MotionValue<number> | number;
}) {
  return (
    <div className="relative z-30 h-0 w-full">
      {/* the fold's ink — a thin gradient so the crease dies out at the margins */}
      <motion.div
        aria-hidden
        style={{ opacity: line ?? 0.6 }}
        className="absolute inset-x-0 top-[-1.5px] h-[3px] bg-gradient-to-r from-transparent via-[#1c1914] to-transparent"
      />
      {/* shadow cast on the lower page as the upper half tilts away */}
      <motion.div
        aria-hidden
        style={{ opacity: shadow ?? 0.16 }}
        className="pointer-events-none absolute inset-x-0 top-[1px] h-12 bg-gradient-to-b from-[#1c1914]/30 to-transparent"
      />
      {/* bindery tag, riding the crease like a production note */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 -rotate-1">
        <span className="flex items-center gap-2 border border-dashed border-[#857c69] bg-[#eee6d6] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
          <Scissors aria-hidden className="h-3 w-3" />
          plier ici — ne pas couper
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · ABOVE THE FOLD — recap headline + the three figures
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * One recap figure, printed as a chip: label, animated value, provenance and
 * delta. A deterministic half-degree tilt (sin of the index) keeps the three
 * chips from looking machine-aligned — they were set by hand, after all.
 */
function FoldStatChip({ stat, index }: { stat: FoldStat; index: number }) {
  const tilt = Math.sin(index * 2.7) * 0.7;
  return (
    <SettleIn delay={index * 0.08} y={14}>
      <div
        style={{ transform: `rotate(${tilt}deg)` }}
        className="flex h-full flex-col border-2 border-[#1c1914] bg-[#f6f1e7] px-2.5 py-2 shadow-[3px_3px_0_#1c1914] sm:px-4 sm:py-3"
      >
        <div className="flex items-center gap-1.5 text-[#4a4438]">
          {stat.icon}
          <span className="font-grotesk text-[8.5px] font-bold uppercase tracking-[0.18em] sm:text-[10px]">
            {stat.label}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          {stat.count ? (
            <CountUpInk
              end={stat.count.end}
              decimals={stat.count.decimals ?? 0}
              suffix={stat.count.suffix ?? ""}
              duration={1.4}
              className="text-[clamp(0.95rem,2.6vw,1.65rem)] font-semibold tracking-tight text-[#1c1914]"
            />
          ) : (
            <span
              className={`${T.num} text-[clamp(0.95rem,2.6vw,1.65rem)] font-semibold tracking-tight text-[#1c1914]`}
            >
              {stat.staticValue}
            </span>
          )}
          {stat.unit && (
            <span className="hidden font-mono text-[10px] text-[#857c69] md:inline">
              {stat.unit}
            </span>
          )}
        </div>
        {/* eight readings, drawn small in soft ink — wide desks only */}
        <div className="mt-1.5 hidden h-6 xl:block">
          <InkLine data={stat.spark} w={140} h={24} stroke={INK_SOFT} duration={0.9} />
        </div>
        <p className="mt-1 hidden font-mono text-[9px] leading-snug text-[#857c69] lg:block">
          {stat.footnote}
        </p>
        <p className="mt-auto hidden pt-1 font-mono text-[9.5px] font-semibold text-[#bf3415] md:block">
          {stat.delta}
        </p>
      </div>
    </SettleIn>
  );
}

/**
 * The upper half of the sheet — everything the reader keeps when the paper
 * is folded. Mini masthead, oversized recap headline, the three figures, and
 * page furniture (folio, correction, sign-off stamp). Height-budgeted to fit
 * 44 % of the stage at every breakpoint; justify-center absorbs the slack.
 */
function FoldSheetUpper({ className }: { className?: string }) {
  return (
    <div className={`relative flex min-h-0 flex-col ${className ?? ""}`}>
      <FoldSheetMastStrip />
      <Rule className="mx-4 mt-2 w-auto sm:mx-8" />

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4 sm:gap-2.5 sm:px-8">
        <RiseIn amount={0.2}>
          <p className={`${T.kicker} text-[#bf3415]`}>Au-dessus du pli · le récapitulatif</p>
        </RiseIn>
        {/* DeckReveal lines force the same two-line break at every width */}
        <div role="heading" aria-level={2}>
          <DeckReveal
            stagger={0.1}
            className="font-serif text-[clamp(1.7rem,4.5vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
            lines={[
              <span key="l1">Above the fold —</span>,
              <span key="l2">
                the <PenUnderline delay={0.55}>story so far</PenUnderline>.
              </span>,
            ]}
          />
        </div>
        <SettleIn delay={0.15}>
          <p className={`${T.ui} hidden max-w-[62ch] md:block`}>
            One file arrived at 06 h 00. By press time it was a front page: every canal counted,
            one anomaly chased to its burrow, and the proof signed before the evening run.
          </p>
        </SettleIn>
      </div>

      {/* the desk's sign-off, stamped beside the headline on wide paper */}
      <div className="absolute right-8 top-14 hidden lg:block xl:right-12">
        <Stamp color={STAMP_GREEN} tilt={-7}>
          Bouclé 16 h 04
        </Stamp>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 sm:gap-3 sm:px-8 lg:gap-4">
        {FOLD_RECAP_STATS.map((stat, i) => (
          <FoldStatChip key={stat.id} stat={stat} index={i} />
        ))}
      </div>

      {/* page-foot furniture: folio left, correction centre, jump right */}
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-2 sm:px-8 sm:pb-3">
        <span className={T.folio}>la une · p.1</span>
        <span className="hidden font-serif text-[11px] italic text-[#857c69] xl:block">
          Correction — Wednesday's edition put réussite at 96,8 % ; the desk regrets the optimism.
        </span>
        <span className={`${T.folio} hidden sm:block`}>suite p.4, sous le pli ↓</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · BELOW THE CREASE, BEFORE THE TURN — front-page continuation
 * ════════════════════════════════════════════════════════════════════════════ */

/** The hourly curve as a printed graphic — anomaly circled at 04 h. */
function FoldHourlyChart() {
  return (
    <figure className="mt-2.5 border border-[#d6ccb6] bg-[#f6f1e7]/70 p-2">
      <div className="h-16">
        <InkLine data={FOLD_HOURLY} markIndex={FOLD_HOURLY_MARK} w={260} h={64} duration={1.1} />
      </div>
      <figcaption className="mt-1.5 font-mono text-[9px] leading-snug text-[#857c69]">
        Réussite horaire (%) — le creux de 04 h 12 sur USSD, corrigé à 16 h 04.
      </figcaption>
    </figure>
  );
}

/** The canal weather table — share, tendency, terse forecast per canal. */
function FoldCanalWeather() {
  return (
    <div className="mt-2.5 border-t border-[#d6ccb6]">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-[#d6ccb6] py-1 font-grotesk text-[8.5px] font-bold uppercase tracking-[0.18em] text-[#857c69]">
        <span>canal</span>
        <span className="text-right">part</span>
        <span className="text-right">tend.</span>
      </div>
      {FOLD_CANAL_WEATHER.map((row) => (
        <div
          key={row.canal}
          className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-[#d6ccb6]/60 py-[5px] font-mono text-[10px] text-[#1c1914]"
        >
          <span className="flex items-baseline gap-2">
            {row.canal}
            <span className="hidden truncate text-[8.5px] text-[#857c69] xl:inline">
              {row.note}
            </span>
          </span>
          <span className="text-right tabular-nums">{row.part}</span>
          <span
            className={`text-right ${row.tendance === "↘" ? "text-[#bf3415]" : "text-[#4a4438]"}`}
          >
            {row.tendance}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One justified broadsheet column: ordinal, title, body, optional graphic. */
function FoldRecapColumn({ col, index }: { col: FoldColumn; index: number }) {
  // column 1 always prints; 2–3 need md; the weather table needs lg
  const visibility =
    index === 0 ? "flex" : index < 3 ? "hidden md:flex" : "hidden lg:flex";
  const divider = index > 0 ? "md:border-l md:border-[#d6ccb6] md:pl-5 lg:pl-7" : "";
  return (
    <div className={`${visibility} min-h-0 flex-col ${divider}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-grotesk text-[10px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
          {col.title}
        </h3>
        <span className="font-mono text-[9px] text-[#857c69]">col. {index + 1}</span>
      </div>
      <Rule className="mt-1.5" />
      <div className="mt-2.5 min-h-0 space-y-2.5 overflow-hidden">
        {col.paras.map((p, pi) => (
          <p
            key={p.slice(0, 24)}
            className={`font-serif text-[13px] leading-[1.6] text-[#4a4438] [hyphens:auto] [text-align:justify] ${
              index === 0 && pi === 0
                ? "first-letter:float-left first-letter:mr-1.5 first-letter:font-serif first-letter:text-[2.1em] first-letter:font-bold first-letter:leading-[0.85] first-letter:text-[#1c1914]"
                : ""
            }`}
          >
            {p}
          </p>
        ))}
        {col.withChart && <FoldHourlyChart />}
        {col.withTable && <FoldCanalWeather />}
        {col.jump && (
          <p className="font-serif text-[12.5px] font-medium italic leading-snug text-[#bf3415]">
            → {col.jump}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The front-page continuation that occupies the lower half until the teaser
 * rises over it. In the sticky scene this layer sinks (y +36) and fades as
 * the reveal segment advances — old news literally giving way to the next page.
 */
function FoldRecapColumns({ className }: { className?: string }) {
  return (
    <div
      className={`grid h-full grid-cols-1 gap-x-6 gap-y-4 px-4 py-4 sm:px-8 sm:py-5 md:grid-cols-3 lg:grid-cols-[1.1fr_1fr_1.1fr_0.9fr] lg:gap-x-7 ${className ?? ""}`}
    >
      {FOLD_RECAP_COLUMNS.map((col, i) => (
        <FoldRecapColumn key={col.id} col={col} index={i} />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · BELOW THE FOLD — the teaser that rises through the crease
 * ════════════════════════════════════════════════════════════════════════════ */

/** One line of the "à l'intérieur" index; rows with anchors become links. */
function FoldTeaserIndexRow({ item }: { item: FoldIndexItem }) {
  const body = (
    <span className="flex flex-col items-center gap-0.5 text-center">
      <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-[#bf3415]">
        {item.page}
      </span>
      <span className="flex items-center gap-1 font-serif text-[15px] font-bold leading-tight text-[#1c1914]">
        {item.title}
        {item.href && (
          <ArrowUpRight
            aria-hidden
            className="h-3 w-3 text-[#2b4a8b] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        )}
      </span>
      <span className="font-grotesk text-[11px] leading-snug text-[#4a4438]">{item.note}</span>
    </span>
  );
  return item.href ? (
    <a
      href={item.href}
      className="group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
    >
      {body}
    </a>
  ) : (
    <div>{body}</div>
  );
}

/**
 * The teaser proper: "Below the fold — how it's made." A big ArrowDown in a
 * letterpress block, the LA FABRICATION kicker pointing at #workflow, and a
 * three-entry inside-index. The parent layer handles the rise; this component
 * only owns the arrow's idle bob (reduced-motion: none) and the "à suivre"
 * stamp, whose entrance is driven by the stamp segment passed from the stage.
 * In the static variant no MotionValue arrives, so a constant-1 fallback keeps
 * the stamp printed flat — hooks stay unconditional either way.
 */
function FoldTeaser({ stampProgress }: { stampProgress?: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const settled = useMotionValue(1);
  const sp = stampProgress ?? settled;
  const stampOpacity = useTransform(sp, [0, 1], [0, 1]);
  const stampScale = useTransform(sp, [0, 1], [1.6, 1]);
  const stampRotate = useTransform(sp, [0, 1], [4, -6]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2.5 px-4 py-5 text-center sm:gap-3.5 sm:px-8">
      <p className={`${T.kicker} text-[#bf3415]`}>Sous le pli · la suite</p>

      <div
        role="heading"
        aria-level={2}
        className="font-serif text-[clamp(1.6rem,4.3vw,4rem)] font-semibold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
      >
        Below the fold — how it's made.
      </div>

      <p className={`${T.ui} hidden max-w-[58ch] sm:block`}>
        Seven presses run in order — ingest, profile, analyse, interrogate, chart, compose,
        export — and not one of them touches a network. The making-of begins overleaf.
      </p>

      {/* the big arrow: a letterpress block the reader can actually push */}
      <a
        href="#workflow"
        aria-label="Continuer vers la fabrication, page 4"
        className="group mt-1 inline-block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <motion.span
          aria-hidden
          animate={reduce ? undefined : { y: [0, 7, 0] }}
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-14 w-14 items-center justify-center border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914] transition-all group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-[1px_1px_0_#1c1914] sm:h-16 sm:w-16"
        >
          <ArrowDown className="h-7 w-7 text-[#1c1914]" strokeWidth={2.4} />
        </motion.span>
      </a>

      <a
        href="#workflow"
        className="flex items-center gap-1.5 font-grotesk text-[12px] font-bold uppercase tracking-[0.2em] text-[#bf3415] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        La fabrication, p.4
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </a>

      {/* à l'intérieur — the inside index, wide paper only */}
      <div className="mt-1 hidden w-full max-w-3xl grid-cols-3 gap-5 border-t border-[#d6ccb6] pt-3 md:grid">
        {FOLD_TEASER_INDEX.map((item) => (
          <FoldTeaserIndexRow key={item.page} item={item} />
        ))}
      </div>

      {/* the end-of-scene stamp — slams during the final segment */}
      <motion.div
        aria-hidden
        style={{ opacity: stampOpacity, scale: stampScale, rotate: stampRotate }}
        className="absolute right-3 top-3 sm:right-8 sm:top-6"
      >
        <span className="inline-block border-[2.5px] border-[#bf3415] px-2.5 py-1 font-grotesk text-[10px] font-black uppercase tracking-[0.18em] text-[#bf3415] [border-radius:3px]">
          à suivre — p.4
        </span>
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · STAGE CHROME — fold meter and scroll hint
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A pressroom gauge for the fold itself: a vermilion bar (scaleX, hinged
 * left) plus a zero-padded percentage read off the MotionValue. The readout
 * is the one place this scene touches React state — a cheap integer that
 * changes at most 100 times across two viewport-heights of scroll.
 */
function FoldMeter({ fold }: { fold: MotionValue<number> }) {
  const [pct, setPct] = useState(0);
  useMotionValueEvent(fold, "change", (v) => setPct(Math.round(v * 100)));
  return (
    <div aria-hidden className="hidden items-center gap-2.5 md:flex">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#857c69]">pli</span>
      <div className="h-[3px] w-28 bg-[#d6ccb6]">
        <motion.div
          style={{ scaleX: fold, transformOrigin: "left center" }}
          className="h-full w-full bg-[#bf3415]"
        />
      </div>
      <span className="w-12 font-mono text-[10px] tabular-nums text-[#4a4438]">
        {String(pct).padStart(3, "0")} %
      </span>
    </div>
  );
}

/** Bottom-of-stage hint; gone by the time the fold is truly under way. */
function FoldHint({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [FOLD_SEGMENTS.hint[0], FOLD_SEGMENTS.hint[1]], [1, 0]);
  const y = useTransform(progress, [FOLD_SEGMENTS.hint[0], FOLD_SEGMENTS.hint[1]], [0, 8]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center"
    >
      <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[#857c69]">
        <ArrowDown aria-hidden className="h-3 w-3" />
        faites défiler — le journal se plie
        <ArrowDown aria-hidden className="h-3 w-3" />
      </span>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · THE STAGE — sticky scene wiring (all hooks live here, top level)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Receives the StickyScene progress as a prop — never created inside the
 * render callback — and derives every transform for the act:
 *
 *   rotateX      0 → −68°   the hinge (perspective 1200, origin bottom)
 *   backShade    0 → 0.85   #e4dac5 creeping over the verso as light leaves it
 *   creaseLine   peaks mid-fold, then relaxes — paper under tension
 *   creaseShadow 0.05 → 0.5 the fold's shadow on the page below
 *   columns      sink (+36px) and fade as the reveal claims the lower half
 *   teaser       rises 104 % → 0 through the crease, clipped by overflow
 *   sheetY       0 → −3 %   the whole sheet eases up to recentre on page 4
 */
function FoldStage({ progress }: { progress: MotionValue<number> }) {
  const fold = useSegment(progress, FOLD_SEGMENTS.fold[0], FOLD_SEGMENTS.fold[1]);
  const reveal = useSegment(progress, FOLD_SEGMENTS.reveal[0], FOLD_SEGMENTS.reveal[1]);
  const stampIn = useSegment(progress, FOLD_SEGMENTS.stamp[0], FOLD_SEGMENTS.stamp[1]);

  const rotateX = useTransform(fold, [0, 1], [0, -68]);
  const backShade = useTransform(fold, [0, 1], [0, 0.85]);
  const creaseLine = useTransform(fold, [0, 0.55, 1], [0.15, 1, 0.6]);
  const creaseShadow = useTransform(fold, [0, 1], [0.05, 0.5]);
  const columnsOpacity = useTransform(reveal, [0, 0.45], [1, 0]);
  const columnsY = useTransform(reveal, [0, 1], [0, 36]);
  const teaserY = useTransform(reveal, [0, 1], ["104%", "0%"]);
  const teaserOpacity = useTransform(reveal, [0, 0.3, 1], [0, 0.4, 1]);
  const sheetY = useTransform(fold, [0, 1], ["0%", "-3%"]);

  return (
    <div className="relative flex h-full flex-col">
      {/* stage chrome — rubrique slug, fold gauge, dateline */}
      <div className="relative z-40 flex items-center justify-between gap-4 px-4 pt-4 sm:px-8">
        <span className={T.folio}>Rubrique nº 05 — le pli</span>
        <FoldMeter fold={fold} />
        <span className={`${T.folio} hidden sm:block`}>
          Édition du matin · {EDITION.datelineShort}
        </span>
      </div>

      {/* the sheet — two halves hinged at the crease */}
      <motion.div
        style={{ y: sheetY }}
        className="relative z-10 mx-auto min-h-0 w-full max-w-[1680px] flex-1 px-3 pb-10 pt-3 sm:px-6 lg:px-10"
      >
        <div className="relative flex h-full min-h-0 flex-col">
          {/* printer's crop marks at the trim corners */}
          <FoldCropMark className="absolute -left-2 -top-2 hidden sm:block" />
          <FoldCropMark className="absolute -right-2 -top-2 hidden sm:block" />
          <FoldCropMark className="absolute -bottom-2 -left-2 hidden sm:block" />
          <FoldCropMark className="absolute -bottom-2 -right-2 hidden sm:block" />

          {/* UPPER HALF — hinges backward at the crease. One composited layer:
              rotateX + perspective on this element, nothing else animates. */}
          <motion.div
            style={{
              rotateX,
              transformPerspective: 1200,
              transformOrigin: "bottom center",
            }}
            className="ed-fiber relative z-20 flex min-h-0 basis-[44%] flex-col overflow-hidden bg-[#eee6d6] will-change-transform [backface-visibility:hidden]"
          >
            <DoubleRule />
            <FoldSheetUpper className="min-h-0 flex-1" />
            {/* the paper's back: light drains off the verso as it tilts away */}
            <motion.div
              aria-hidden
              style={{ opacity: backShade }}
              className="pointer-events-none absolute inset-0 bg-[#e4dac5]"
            />
          </motion.div>

          <FoldCrease line={creaseLine} shadow={creaseShadow} />

          {/* LOWER HALF — continuation columns beneath, teaser rising over */}
          <div className="ed-fiber relative min-h-0 flex-1 overflow-hidden bg-[#eee6d6] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
            <motion.div
              style={{ opacity: columnsOpacity, y: columnsY }}
              className="absolute inset-0"
            >
              <FoldRecapColumns />
            </motion.div>
            <motion.div style={{ y: teaserY, opacity: teaserOpacity }} className="absolute inset-0">
              <FoldTeaser stampProgress={stampIn} />
            </motion.div>
            {/* verso folios — the pages hiding under the fold */}
            <span className={`${T.folio} pointer-events-none absolute bottom-1.5 left-4 z-10`}>
              p.3
            </span>
            <span className={`${T.folio} pointer-events-none absolute bottom-1.5 right-4 z-10`}>
              p.4
            </span>
          </div>
        </div>
      </motion.div>

      <FoldHint progress={progress} />
    </div>
  );
}

/**
 * Reduced-motion variant: the same sheet, laid flat in normal flow. Upper
 * half, crease at rest, continuation columns, then the teaser printed in
 * full — two halves, no pinning, no hinge, nothing jumps. Every child
 * already short-circuits its own entrance animations via useReducedMotion.
 */
function FoldStaticStage() {
  return (
    <div className="mx-auto w-full max-w-[1680px] px-3 py-14 sm:px-6 lg:px-10">
      <div className="ed-fiber relative bg-[#eee6d6]">
        <DoubleRule />
        <FoldSheetUpper className="pb-1" />
      </div>
      <FoldCrease />
      <div className="ed-fiber relative bg-[#eee6d6] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        <FoldRecapColumns />
        <Rule className="mx-4 sm:mx-8" />
        <FoldTeaser />
        <span className={`${T.folio} pointer-events-none absolute bottom-1.5 left-4`}>p.3</span>
        <span className={`${T.folio} pointer-events-none absolute bottom-1.5 right-4`}>p.4</span>
      </div>
      <FolioLine page="p.3 — le pli" note="motion réduite — pli présenté à plat" className="mt-5" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · SECTION ROOT
 *  StickyScene-based ⇒ no contentVisibility (sticky needs real layout).
 *  The render callback only forwards the MotionValue to FoldStage — hooks
 *  never run inside it.
 * ════════════════════════════════════════════════════════════════════════════ */

function FoldSection() {
  const reduce = useReducedMotion();
  return (
    <section id="fold" aria-label="Le pli — la suite de l'édition" className="relative">
      {reduce ? (
        <FoldStaticStage />
      ) : (
        <StickyScene pages={2}>{(progress) => <FoldStage progress={progress} />}</StickyScene>
      )}
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 06 — PressSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §06 — PRESS · THE GOLDEN-PATH PRESSES                                   p. 3½
 *  ────────────────────────────────────────────────────────────────────────────
 *  The showpiece. A sticky scrollytelling scene that runs the product's whole
 *  promise as a printing press: seven presses fire in order, one per scroll
 *  beat, and a sheet of newsprint advances through each one until the finished
 *  edition drops into the tray. The seven presses ARE the seven keystrokes of
 *  Data Navigator's golden path:
 *
 *    1 · Lecture       ingest    — read DailyTransactions.csv off the disk
 *    2 · Profil        profile   — column types, nulls, ranges
 *    3 · Analyse       analyse   — DuckDB KPIs: réussite, canaux, montant
 *    4 · Interrogation interrogate — ask Moudir, the offline AI, in plain French
 *    5 · Graphiques    chart     — ink charts, drawn on the machine
 *    6 · Composition   compose   — assemble the morning report
 *    7 · Tirage        export    — PDF · DOCX · PPTX
 *
 *  Not one press touches a network. That is the recurring stamp: ENCRE LOCALE,
 *  slammed once per stage and once at the handoff. The whole act ends by handing
 *  the dried sheet to the reader: a link to #subscribe / /signup.
 *
 *  Choreography (scene progress 0 → 1, eight scroll-pages, segments via
 *  useSegment so every transform clamps cleanly at its window edges):
 *
 *    each press i owns a slice ≈ [i/8 .. (i+1)/8]; inside its slice it
 *    INKS UP (roller darkens 0 → full), the SHEET ADVANCES one station, the
 *    stage LABEL + CAPTION rise from a clip, the per-stage INK VISUAL draws
 *    itself via pathLength, and the side GAUGE lights the matching lamp.
 *    The final slice fades the carriage and lifts the finished edition into
 *    the delivery tray with its CTA.
 *
 *  Motion contract — transform / opacity / pathLength ONLY. The roller rumble,
 *  the caret and the stamp slam come from the ed-* loop utilities; everything
 *  else is a MotionValue derived from scene progress. Every primitive
 *  short-circuits under prefers-reduced-motion, and the whole scene has a
 *  flat, scrollable fallback (PressStaticStage) that prints all seven presses
 *  as a numbered broadsheet sequence — no pinning, no hinge, fully readable.
 *
 *  Hooks discipline: StickyScene's render callback only forwards the
 *  MotionValue to PressStage. Every hook lives at the top of a real component
 *  (PressStage, PressGauge, PressGaugeLamp, PressCarriage, PressStationPanel,
 *  PressHint, PressHandoff). Nothing calls a hook inside a .map() body.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
 *  Scene geometry. Eight scroll-pages: seven press beats plus a delivery beat.
 *  STAGE_SPAN is one beat in 0–1 scene space; PRESS_DWELL holds the ink at full
 *  for the back half of each beat so a stage reads as "running", not flickering.
 * ──────────────────────────────────────────────────────────────────────────── */

const PRESS_PAGES = 8;
const PRESS_COUNT = 7;
const PRESS_SPAN = 1 / PRESS_PAGES;

/** The scene window in which the finished edition is handed off (last beat). */
const PRESS_DELIVERY = [7 / PRESS_PAGES, 1] as const;

/** Kinds of tiny ink visual a station can print as it becomes active. */
type PressVisualKind = "bars" | "line" | "scan" | "ask" | "spark" | "compose" | "ship";

/**
 * One press in the line. Numbers are organic and reconcile with the edition:
 * EDITION.rows feeds the read, the profile counts the real column shape, the
 * analyse KPIs land on EDITION.successRate, and the export tally is the morning
 * deliverable. `mark` is the spark index the editor's pen will ring, where one
 * exists. Everything derives from index math — no random, no dates.
 */
type PressStation = {
  /** 1-based press number, printed on the cylinder and the gauge */
  no: number;
  /** the golden-path verb, English, for the spoken summary */
  verb: string;
  /** the press's French nameplate */
  plate: string;
  /** the keystroke's data-desk label */
  kicker: string;
  /** editorial caption — dry newsroom voice, one beat of the story */
  caption: string;
  /** the headline figure this press produces */
  figure: string;
  /** what that figure measures */
  figureLabel: string;
  /** which ink visual prints for this press */
  visual: PressVisualKind;
  /** the small data series the visual draws */
  series: ReadonlyArray<number>;
  /** axis tick labels for bar visuals */
  ticks?: ReadonlyArray<string>;
  /** spark index to ring in vermilion, where the story is */
  mark?: number;
  /** the offline guarantee restated in this press's terms */
  offline: string;
  /** the press's mechanical spec strip — engine, latency, what it touches */
  spec: PressSpec;
};

/**
 * The spec strip under each press — the small print a careful reader checks.
 * `engine` is what does the work, `clock` is the press's own beat in the
 * morning run (organic, derived to a sensible house pace), and `outbound` is
 * always zero: the line never reaches for the network, and the strip says so
 * in mono so it can't be missed.
 */
type PressSpec = {
  /** what does the work for this press */
  engine: string;
  /** when this press fires in the morning run */
  clock: string;
  /** what this press writes, and where */
  writes: string;
  /** outbound requests this press makes — the recurring zero */
  outbound: string;
};

const PRESS_STATIONS: ReadonlyArray<PressStation> = [
  {
    no: 1,
    verb: "ingest",
    plate: "Lecture",
    kicker: "Presse I · l'alimentation",
    caption:
      "The first press swallows the day whole — DailyTransactions.csv, read straight off " +
      "the disk into the engine, comma by comma, before the kettle boils.",
    figure: "2 147 380",
    figureLabel: "lignes lues · un seul fichier",
    visual: "scan",
    series: [12, 34, 58, 79, 96, 128, 161, 197, 231, 268, 301, 332],
    offline: "le fichier ne quitte jamais la machine — lecture locale, point.",
    spec: {
      engine: "lecteur CSV natif",
      clock: "06 h 02",
      writes: "table en mémoire",
      outbound: "0 requête",
    },
  },
  {
    no: 2,
    verb: "profile",
    plate: "Profil",
    kicker: "Presse II · le calibrage",
    caption:
      "Before a figure is trusted it is measured: every column typed, every null counted, " +
      "every range fenced. The press calibrates the paper before it prints on it.",
    figure: "23 colonnes",
    figureLabel: "typées · 0,3 % de valeurs nulles",
    visual: "bars",
    series: [97, 84, 100, 62, 91, 78, 99],
    ticks: ["txt", "num", "dat", "id", "tel", "geo", "ok"],
    offline: "profilage en mémoire — aucune sonde, aucun service distant.",
    spec: {
      engine: "profileur de schéma",
      clock: "06 h 03",
      writes: "fiche de calibrage",
      outbound: "0 requête",
    },
  },
  {
    no: 3,
    verb: "analyse",
    plate: "Analyse",
    kicker: "Presse III · le moteur DuckDB",
    caption:
      "Now the heavy cylinder turns. DuckDB runs the day's KPIs in-process — réussite par " +
      "canal, montant par heure — and prints the numbers that make the front page.",
    figure: "97,4 %",
    figureLabel: "réussite journalière · tous canaux",
    visual: "line",
    series: [96.9, 97.3, 97.6, 97.4, 97.8, 97.5, 71.2, 84.6, 93.8, 97.1, 97.4, 97.4],
    mark: 6,
    offline: "le moteur tourne sur le poste — pas d'entrepôt, pas de cloud.",
    spec: {
      engine: "DuckDB · en processus",
      clock: "06 h 05",
      writes: "agrégats KPI",
      outbound: "0 requête",
    },
  },
  {
    no: 4,
    verb: "interrogate",
    plate: "Interrogation",
    kicker: "Presse IV · Moudir, l'IA hors ligne",
    caption:
      "The fourth press takes a question in plain French and answers it. Moudir — the " +
      "embedded model — reads the same numbers and writes back, no prompt left the room.",
    figure: "« pourquoi l'Est ? »",
    figureLabel: "demandé en clair · répondu en clair",
    visual: "ask",
    series: [0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
    offline: "le modèle est embarqué — la question reste entre vous et le poste.",
    spec: {
      engine: "Moudir · modèle local",
      clock: "06 h 07",
      writes: "réponse en clair",
      outbound: "0 requête",
    },
  },
  {
    no: 5,
    verb: "chart",
    plate: "Graphiques",
    kicker: "Presse V · la gravure",
    caption:
      "Figures become plates. The charts are inked here — 2 px strokes, halftone fills, " +
      "drawn by the machine — and not a pixel was fetched from a tile server.",
    figure: "8 planches",
    figureLabel: "tracées à l'encre · zéro requête",
    visual: "spark",
    series: [44, 61, 52, 78, 69, 90, 83, 97],
    mark: 7,
    offline: "graphiques rendus localement — aucune police, aucun CDN appelé.",
    spec: {
      engine: "moteur de tracé encre",
      clock: "06 h 09",
      writes: "planches SVG",
      outbound: "0 requête",
    },
  },
  {
    no: 6,
    verb: "compose",
    plate: "Composition",
    kicker: "Presse VI · la mise en page",
    caption:
      "The sixth press sets the whole edition — heads, decks, tables, the anomaly chased " +
      "down on page 3 — into one report, justified and proofed against the data.",
    figure: "14 sections",
    figureLabel: "composées · 1 édition du matin",
    visual: "compose",
    series: [6, 10, 8, 12, 9, 13, 11, 14],
    offline: "composition sur place — la maquette vit dans l'application.",
    spec: {
      engine: "metteur en page",
      clock: "06 h 10",
      writes: "rapport assemblé",
      outbound: "0 requête",
    },
  },
  {
    no: 7,
    verb: "export",
    plate: "Tirage",
    kicker: "Presse VII · le tirage",
    caption:
      "The last press pulls the proof: PDF, DOCX, PPTX, ready before the morning meeting. " +
      "Seven presses, one keystroke each, and the edition is done.",
    figure: "PDF · DOCX · PPTX",
    figureLabel: "tiré sur le poste · prêt à 06 h 12",
    visual: "ship",
    series: [3, 1, 3, 2, 3, 3],
    offline: "le tirage s'écrit sur votre disque — rien ne part vers l'extérieur.",
    spec: {
      engine: "graveur PDF · DOCX · PPTX",
      clock: "06 h 12",
      writes: "fichiers sur disque",
      outbound: "0 requête",
    },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Per-press scene windows, precomputed once. Each press inks up over the first
 *  ~55 % of its beat (PRESS_IN), holds full ink to the end (PRESS_HOLD), and the
 *  sheet advances across the same beat. Derived, not magic: every window is a
 *  function of the press index, so the math stays auditable.
 * ──────────────────────────────────────────────────────────────────────────── */

type PressWindow = {
  start: number;
  end: number;
  /** ink-up window — roller darkens, label + visual arrive */
  inkUp: readonly [number, number];
};

const PRESS_WINDOWS: ReadonlyArray<PressWindow> = PRESS_STATIONS.map((s) => {
  const start = (s.no - 1) * PRESS_SPAN;
  const end = s.no * PRESS_SPAN;
  return { start, end, inkUp: [start, start + PRESS_SPAN * 0.55] as const };
});

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · INK VISUALS — one tiny graphic per station, drawn on activation
 *  Each takes a 0–1 `active` MotionValue and only its own data. They lean on the
 *  preamble ink-chart library (InkLine, InkBars) where it fits, and hand-draw
 *  the more bespoke ones (scan beam, question caret, ship arrows) with InkPath.
 * ════════════════════════════════════════════════════════════════════════════ */

/** The reader-scan beam — press I. A bracket sweeps a stack of "rows". */
function PressVisualScan({ station }: { station: PressStation }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden preserveAspectRatio="none">
      {Array.from({ length: 9 }, (_, i) => {
        const y = 14 + i * 11;
        const w = 70 + Math.abs(Math.sin(i * 1.7)) * 96;
        return (
          <line
            key={`row-${y}`}
            x1={14}
            y1={y}
            x2={14 + w}
            y2={y}
            stroke={INK}
            strokeOpacity={0.32}
            strokeWidth={2}
          />
        );
      })}
      <InkPath d="M10 8 L10 112" stroke={VERMILION} strokeWidth={2.4} duration={0.9} />
      <InkPath d="M10 8 L26 8" stroke={VERMILION} strokeWidth={2.4} delay={0.2} duration={0.3} />
      <InkPath d="M10 112 L26 112" stroke={VERMILION} strokeWidth={2.4} delay={0.3} duration={0.3} />
      <text x={188} y={114} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={INK_FADED}>
        {station.figure}
      </text>
    </svg>
  );
}

/** The calibration bars — press II. Column shape, ink with one vermilion. */
function PressVisualBars({ station }: { station: PressStation }) {
  return (
    <div className="h-full w-full">
      <InkBars data={station.series} labels={station.ticks} w={200} h={120} highlight={6} />
    </div>
  );
}

/** The KPI line — press III. The day's réussite, the 16 h dip ringed in red. */
function PressVisualLine({ station }: { station: PressStation }) {
  return (
    <div className="h-full w-full">
      <InkLine data={station.series} w={200} h={120} markIndex={station.mark} duration={1.1} />
    </div>
  );
}

/** The question — press IV. A chat caret and an answer line drawing in. */
function PressVisualAsk({ station }: { station: PressStation }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect x={10} y={16} width={120} height={26} fill="none" stroke={INK} strokeWidth={1.6} />
      <text x={20} y={33} fontSize="11" fontStyle="italic" fontFamily="var(--font-serif)" fill={INK}>
        {station.figure}
      </text>
      <InkPath d="M150 16 L150 42 L160 42" stroke={INK} strokeWidth={1.6} delay={0.2} duration={0.4} />
      <InkPath
        d="M14 70 Q 56 64, 100 70 T 188 66"
        stroke={VERMILION}
        strokeWidth={2.2}
        delay={0.4}
        duration={0.7}
      />
      <InkPath
        d="M14 92 Q 50 88, 92 92 T 172 89"
        stroke={INK}
        strokeWidth={1.8}
        delay={0.6}
        duration={0.6}
      />
      <text x={20} y={112} fontSize="9" fontFamily="var(--font-mono)" fill={INK_FADED}>
        moudir · hors ligne
      </text>
    </svg>
  );
}

/** The engraving spark — press V. A rising sparkline plus a halftone block. */
function PressVisualSpark({ station }: { station: PressStation }) {
  return (
    <div className="h-full w-full">
      <InkLine data={station.series} w={200} h={120} stroke={INK} markIndex={station.mark} duration={1} />
    </div>
  );
}

/** The composition stack — press VI. Sections stacking into one column. */
function PressVisualCompose({ station }: { station: PressStation }) {
  return (
    <div className="h-full w-full">
      <InkBars data={station.series} w={200} h={120} highlight={station.series.length - 1} />
    </div>
  );
}

/** The delivery arrows — press VII. Three formats shipped to the tray. */
function PressVisualShip({ station }: { station: PressStation }) {
  const labels = ["PDF", "DOCX", "PPTX"];
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {labels.map((lab, i) => {
        const y = 24 + i * 32;
        return (
          <g key={lab}>
            <rect x={12} y={y - 12} width={30} height={24} fill="none" stroke={INK} strokeWidth={1.6} />
            <text
              x={27}
              y={y + 4}
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fontWeight="700"
              fill={INK}
            >
              {lab}
            </text>
            <InkPath
              d={`M48 ${y} L168 ${y}`}
              stroke={i === 0 ? VERMILION : INK}
              strokeWidth={2}
              delay={0.2 + i * 0.18}
              duration={0.5}
            />
            <InkPath
              d={`M160 ${y - 6} L172 ${y} L160 ${y + 6}`}
              stroke={i === 0 ? VERMILION : INK}
              strokeWidth={2}
              delay={0.5 + i * 0.18}
              duration={0.25}
            />
          </g>
        );
      })}
      <text x={188} y={114} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={INK_FADED}>
        {station.figureLabel}
      </text>
    </svg>
  );
}

/** Dispatch table — picks the right ink visual for a station's kind. */
function PressInkVisual({ station }: { station: PressStation }) {
  switch (station.visual) {
    case "scan":
      return <PressVisualScan station={station} />;
    case "bars":
      return <PressVisualBars station={station} />;
    case "line":
      return <PressVisualLine station={station} />;
    case "ask":
      return <PressVisualAsk station={station} />;
    case "spark":
      return <PressVisualSpark station={station} />;
    case "compose":
      return <PressVisualCompose station={station} />;
    default:
      return <PressVisualShip station={station} />;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE SPEC STRIP — the small print under each press
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The mechanical spec strip — a four-cell mono ledger under a press: engine,
 * clock, what it writes, and the recurring "0 requête". The outbound cell is
 * rendered in vermilion so the zero is the loudest figure on the strip. Static
 * ink, no motion; it inherits the panel's own entrance.
 */
function PressSpecStrip({ spec }: { spec: PressSpec }) {
  const cells = [
    { k: "moteur", v: spec.engine, hot: false },
    { k: "horloge", v: spec.clock, hot: false },
    { k: "écrit", v: spec.writes, hot: false },
    { k: "sortant", v: spec.outbound, hot: true },
  ] as const;
  return (
    <dl className="mt-5 grid grid-cols-2 gap-px border border-[#d6ccb6] bg-[#d6ccb6] sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.k} className="bg-[#f6f1e7] px-2.5 py-2">
          <dt className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#857c69]">
            {cell.k}
          </dt>
          <dd
            className={`mt-0.5 font-mono text-[11px] tabular-nums ${
              cell.hot ? "font-bold text-[#bf3415]" : "text-[#1c1914]"
            }`}
          >
            {cell.v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE OFFLINE STAMP — the recurring guarantee, slammed in green
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The "ENCRE LOCALE" stamp. It re-prints on every active press and once at the
 * handoff, in stamp green, tilted from index math so no two land the same. Uses
 * the preamble Stamp (ed-stamp slam) and gates its presence on the active flag
 * the parent computes — the stamp itself never holds a hook beyond Stamp's own.
 */
function PressOfflineStamp({ tilt = -7, label = "Encre locale" }: { tilt?: number; label?: string }) {
  return (
    <Stamp color={STAMP_GREEN} tilt={tilt}>
      <span className="flex items-center gap-1.5">
        <WifiOff aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.4} />
        {label}
      </span>
    </Stamp>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE SIDE GAUGE — which of the seven presses is running
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * One lamp on the gauge. Receives the scene progress and its own window; lights
 * (fills + nudges) only while its press is the active beat, dims to a hairline
 * otherwise. All transform/opacity — the lamp body never resizes.
 */
function PressGaugeLamp({
  progress,
  station,
  window,
}: {
  progress: MotionValue<number>;
  station: PressStation;
  window: PressWindow;
}) {
  // a soft trapezoid: dark before fully lit at window start, bright through the
  // beat, easing back down just past the end so the next lamp can take over.
  const lit = useTransform(
    progress,
    [window.start - 0.02, window.start + 0.01, window.end - 0.01, window.end + 0.02],
    [0.18, 1, 1, 0.32],
    { clamp: true },
  );
  const dotScale = useTransform(lit, [0.18, 1], [0.7, 1]);
  const slideX = useTransform(lit, [0.18, 1], [0, 4]);
  return (
    <motion.li style={{ opacity: lit, x: slideX }} className="flex items-center gap-2.5">
      <motion.span
        aria-hidden
        style={{ scale: dotScale }}
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[#bf3415]"
      />
      <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
        {String(station.no).padStart(2, "0")}
      </span>
      <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
        {station.plate}
      </span>
    </motion.li>
  );
}

/**
 * The press gauge — a fixed rail down the side of the stage listing all seven
 * presses, with a vermilion fill bar tracking total scene progress and a live
 * "presse N / 7" readout. The readout uses useMotionValueEvent (a hook) at the
 * component top — never inside a map. Hidden below lg where it would crowd the
 * carriage; the stations carry their own numbers on small screens.
 */
function PressGauge({ progress }: { progress: MotionValue<number> }) {
  const [running, setRunning] = useState(1);
  useMotionValueEvent(progress, "change", (v) => {
    const idx = Math.min(PRESS_COUNT, Math.max(1, Math.floor(v / PRESS_SPAN) + 1));
    setRunning(idx);
  });
  const fill = useTransform(progress, [0, 1], [0, 1]);
  return (
    <aside
      aria-hidden
      className="pointer-events-none absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 lg:block xl:left-8"
    >
      <div className="flex items-stretch gap-3">
        <div className="relative w-[3px] bg-[#d6ccb6]">
          <motion.div
            style={{ scaleY: fill, transformOrigin: "top center" }}
            className="absolute inset-0 w-full bg-[#bf3415]"
          />
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#857c69]">
            chaîne d'impression
          </p>
          <p className="mt-1 font-mono text-[11px] tabular-nums text-[#1c1914]">
            presse {String(running).padStart(2, "0")} / 0{PRESS_COUNT}
          </p>
          <ul className="mt-3 space-y-2.5">
            {PRESS_STATIONS.map((station, i) => (
              <PressGaugeLamp
                key={station.no}
                progress={progress}
                station={station}
                window={PRESS_WINDOWS[i]}
              />
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE CYLINDER & ROLLER — the machine that inks each press
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The inking roller for one press. Receives an `inked` MotionValue (0 → 1 over
 * the press's ink-up window) and darkens a halftone drum from faint to solid,
 * adding the ed-rumble loop only while the press is running. The drum geometry
 * never changes — only opacity and a tiny rotation, both inside budget.
 */
function PressRoller({ inked, running }: { inked: MotionValue<number>; running: boolean }) {
  const drum = useTransform(inked, [0, 1], [0.12, 1]);
  const spin = useTransform(inked, [0, 1], [-8, 8]);
  return (
    <div className={`relative h-14 w-14 shrink-0 ${running ? "ed-rumble" : ""}`}>
      <svg viewBox="0 0 56 56" className="h-full w-full" aria-hidden>
        <defs>
          <pattern id="press-drum" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.5" fill={INK} />
          </pattern>
        </defs>
        <circle cx="28" cy="28" r="25" fill="none" stroke={INK} strokeWidth="2" />
        <motion.circle cx="28" cy="28" r="22" fill="url(#press-drum)" style={{ opacity: drum }} />
        <motion.line
          x1="28"
          y1="28"
          x2="28"
          y2="8"
          stroke={VERMILION}
          strokeWidth="2.2"
          strokeLinecap="round"
          style={{ rotate: spin, transformOrigin: "28px 28px" }}
        />
        <circle cx="28" cy="28" r="3" fill={INK} />
      </svg>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · ONE STATION PANEL — the printed result of a single press
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A single press's panel. Receives scene progress + its precomputed window and
 * derives, at the component top, every transform it needs: the panel slides in
 * from the right and fades as its beat opens, the ink-up MotionValue feeds the
 * roller, and a slim "running" boolean (kept in state via useMotionValueEvent)
 * decides whether the rumble loop and the offline stamp are present. The ink
 * visual draws once on mount (pathLength), which reads as the press striking
 * because the panel only becomes visible inside its own beat.
 */
function PressStationPanel({
  progress,
  station,
  window,
}: {
  progress: MotionValue<number>;
  station: PressStation;
  window: PressWindow;
}) {
  const reduce = useReducedMotion();
  const [running, setRunning] = useState(false);

  // visible window: rises in just before its beat, holds through it, falls out
  // just after — a single keyframed ramp, so the panel only shows in its slice.
  const opacity = useTransform(
    progress,
    [window.start - 0.03, window.start + 0.02, window.end - 0.02, window.end + 0.04],
    [0, 1, 1, 0],
    { clamp: true },
  );
  const x = useTransform(
    progress,
    [window.start - 0.03, window.start + 0.04, window.end - 0.02, window.end + 0.04],
    reduce ? [0, 0, 0, 0] : [44, 0, 0, -28],
    { clamp: true },
  );
  const inked = useTransform(progress, [window.inkUp[0], window.inkUp[1]], [0, 1], {
    clamp: true,
  });

  useMotionValueEvent(progress, "change", (v) => {
    setRunning(v >= window.start - 0.01 && v < window.end);
  });

  return (
    <motion.article
      style={{ opacity, x }}
      className="absolute inset-0 flex flex-col justify-center px-6 sm:px-10 lg:pl-44 xl:pl-52"
    >
      <div className="mx-auto w-full max-w-[680px]">
        {/* nameplate row — press number, plate, the running rumble roller */}
        <div className="flex items-center gap-4">
          <PressRoller inked={inked} running={running} />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#bf3415]">
              {station.kicker}
            </p>
            <h3 className="mt-1 flex items-baseline gap-3 font-serif text-[clamp(2rem,4.6vw,3.4rem)] font-medium leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              <span className="font-mono text-[0.42em] font-bold text-[#857c69]">
                {String(station.no).padStart(2, "0")}
              </span>
              {station.plate}
            </h3>
          </div>
        </div>

        <DoubleRule className="mt-4" />

        {/* the result: caption left, ink visual right, figure beneath the visual */}
        <div className="mt-5 grid gap-6 sm:grid-cols-[1.2fr_1fr] sm:gap-8">
          <div>
            <p className="font-serif text-[clamp(1rem,1.7vw,1.2rem)] leading-[1.5] text-[#1c1914]">
              {station.caption}
            </p>
            <div className="mt-5 flex items-end gap-3">
              <span className="font-mono text-[clamp(1.4rem,2.6vw,2rem)] font-semibold tabular-nums leading-none text-[#1c1914]">
                {station.figure}
              </span>
            </div>
            <p className={`mt-1.5 ${T.folio}`}>{station.figureLabel}</p>
          </div>

          <figure className="relative">
            <div className="h-[120px] w-full border-2 border-[#1c1914] bg-[#f6f1e7] p-2 shadow-[3px_3px_0_#1c1914]">
              <PressInkVisual station={station} />
            </div>
            <figcaption className={`mt-2 ${T.folio}`}>
              planche d'épreuve · presse {String(station.no).padStart(2, "0")}
            </figcaption>
          </figure>
        </div>

        {/* the mechanical small print — engine, clock, output, the zero */}
        <PressSpecStrip spec={station.spec} />

        {/* the recurring guarantee, restated in this press's terms */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          {running && <PressOfflineStamp tilt={Math.round(Math.sin(station.no * 2.7) * 9)} />}
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#4a4438]">
            <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            {station.offline}
          </span>
        </div>
      </div>
    </motion.article>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE SHEET — newsprint advancing along the line
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The travelling sheet. A strip of newsprint with seven station notches that
 * slides left across the whole scene (one beat per station), so the reader sees
 * the same physical page passing through every press. Pure x-translation tied
 * to scene progress; the notches are static ink. Drawn behind the panels, low
 * opacity, decorative — the panels carry the real content.
 */
function PressSheet({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const slide = useTransform(progress, [0, 1], reduce ? ["0%", "0%"] : ["6%", "-58%"]);
  return (
    <motion.div
      aria-hidden
      style={{ x: slide }}
      className="pointer-events-none absolute bottom-10 left-0 z-0 hidden h-20 w-[180%] sm:block"
    >
      <div className="ed-fiber relative h-full w-full border-y border-[#d6ccb6] bg-[#eee6d6]/70">
        <div className="flex h-full items-stretch">
          {PRESS_STATIONS.map((station) => (
            <div
              key={`sheet-${station.no}`}
              className="relative flex-1 border-r border-dashed border-[#d6ccb6] last:border-r-0"
            >
              <span className="absolute left-2 top-1.5 font-mono text-[8px] tracking-[0.1em] text-[#857c69]">
                {String(station.no).padStart(2, "0")} · {station.plate}
              </span>
              {/* sprocket holes top and bottom — it's a real web of paper */}
              <span className="absolute left-2 bottom-1.5 h-1.5 w-1.5 rounded-full border border-[#d6ccb6]" />
              <span className="absolute right-3 bottom-1.5 h-1.5 w-1.5 rounded-full border border-[#d6ccb6]" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE DELIVERY — the finished edition handed to the reader
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * The handoff. As the final beat opens, the seven panels are gone and this
 * panel rises into the tray: the finished edition, the offline guarantee
 * stamped one last time, and the two CTAs (#subscribe, /signup). Its enter
 * transforms are derived from the delivery window at the component top.
 */
function PressHandoff({ progress }: { progress: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const enter = useTransform(progress, [PRESS_DELIVERY[0], PRESS_DELIVERY[0] + 0.05], [0, 1], {
    clamp: true,
  });
  const y = useTransform(enter, [0, 1], reduce ? [0, 0] : [56, 0]);
  return (
    <motion.div
      style={{ opacity: enter, y }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center sm:px-10"
    >
      <div className="mx-auto w-full max-w-[640px]">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#bf3415]">
          Sept presses · une édition
        </p>
        <h3 className="mt-3 font-serif text-[clamp(2.2rem,5vw,4rem)] font-medium leading-[0.98] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
          L'édition est tirée.
        </h3>
        <p className="mx-auto mt-4 max-w-[46ch] font-serif text-[clamp(1rem,1.8vw,1.25rem)] leading-[1.5] text-[#1c1914]">
          From a raw CSV to a printed report in seven keystrokes — and not one of them reached for
          the network. Pull your own proof and read the morning by{" "}
          <span className="font-mono text-[0.85em]">06 h 12</span>.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
          <InkButton href="/signup" tone="vermilion">
            Lancer la première presse
            <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={2.4} />
          </InkButton>
          <InkLink href="#subscribe">Recevoir l'édition complète</InkLink>
        </div>
        <div className="mt-7 flex justify-center">
          <PressOfflineStamp tilt={-5} label="Tiré hors ligne" />
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · STAGE CHROME — the carriage frame, the run readout, the scroll hint
 * ════════════════════════════════════════════════════════════════════════════ */

/** Bottom hint, fades out once the first press is well under way. */
function PressHint({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 0.06], [1, 0]);
  const y = useTransform(progress, [0, 0.06], [0, 8]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center"
    >
      <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[#857c69]">
        <ArrowDown aria-hidden className="h-3 w-3" />
        faites défiler — la chaîne se met en marche
        <ArrowDown aria-hidden className="h-3 w-3" />
      </span>
    </motion.div>
  );
}

/**
 * A press carriage edge — the heavy ink frame the panels print inside. Two of
 * these (top and bottom) plus the registration ticks make the stage read as a
 * machine bed rather than a slideshow. Static ink, no motion.
 */
function PressCarriageEdge({ side }: { side: "top" | "bottom" }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-30 ${side === "top" ? "top-0" : "bottom-0"}`}>
      <div className="h-[3px] w-full bg-[#1c1914]" />
      <div
        className={`flex justify-between px-4 sm:px-8 ${side === "top" ? "" : "flex-col-reverse"}`}
      >
        <span className={`${T.folio} py-1`}>
          {side === "top" ? "Chaîne d'impression — le chemin doré" : "Données sur le poste · aucun réseau"}
        </span>
        <span className={`${T.folio} py-1`}>
          {side === "top" ? `${PRESS_COUNT} presses · 1 frappe chacune` : EDITION.datelineShort}
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE STAGE — sticky scene wiring (all hooks live at the top here)
 *  Receives the StickyScene progress as a prop — never created in the render
 *  callback. Lays the machine bed, the travelling sheet, the seven station
 *  panels (each a real child given progress + its window), the side gauge, the
 *  handoff, and the scroll hint. The stage itself derives a single carriage
 *  fade so the line dims as the edition is delivered.
 * ════════════════════════════════════════════════════════════════════════════ */

function PressStage({ progress }: { progress: MotionValue<number> }) {
  // the whole press line fades out as the delivery beat takes the stage.
  const carriageFade = useTransform(
    progress,
    [PRESS_DELIVERY[0] - 0.02, PRESS_DELIVERY[0] + 0.06],
    [1, 0],
    { clamp: true },
  );

  return (
    <div className="relative flex h-full flex-col bg-[#eee6d6]">
      <PressCarriageEdge side="top" />

      {/* the machine bed: sheet behind, panels over, gauge to the side */}
      <div className="relative z-10 min-h-0 flex-1">
        <motion.div style={{ opacity: carriageFade }} className="absolute inset-0">
          <PressSheet progress={progress} />
          {PRESS_STATIONS.map((station, i) => (
            <PressStationPanel
              key={station.no}
              progress={progress}
              station={station}
              window={PRESS_WINDOWS[i]}
            />
          ))}
        </motion.div>

        <PressGauge progress={progress} />
        <PressHandoff progress={progress} />
      </div>

      <PressCarriageEdge side="bottom" />
      <PressHint progress={progress} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · STATIC STAGE — the reduced-motion / fallback broadsheet sequence
 *  No pinning, no scene: all seven presses print top to bottom as a numbered
 *  editorial sequence, then the handoff. Every child already short-circuits its
 *  own entrance under prefers-reduced-motion, so this stays calm and readable
 *  and degrades the same way on small screens where the sticky bed is dropped.
 * ════════════════════════════════════════════════════════════════════════════ */

/** One press, printed flat — the static twin of PressStationPanel. */
function PressStaticStation({ station }: { station: PressStation }) {
  return (
    <SettleIn className="border-b border-[#d6ccb6] py-9 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#bf3415]">
          {station.kicker}
        </p>
        <span className="font-mono text-[10px] tabular-nums text-[#857c69]">
          presse {String(station.no).padStart(2, "0")} / 0{PRESS_COUNT}
        </span>
      </div>
      <h3 className="mt-2 flex items-baseline gap-3 font-serif text-[clamp(1.9rem,5vw,3rem)] font-medium leading-[1] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
        <span className="font-mono text-[0.4em] font-bold text-[#857c69]">
          {String(station.no).padStart(2, "0")}
        </span>
        {station.plate}
      </h3>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1.25fr_0.9fr] lg:gap-10">
        <div>
          <p className="font-serif text-[17px] leading-[1.55] text-[#1c1914]">{station.caption}</p>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-mono text-[1.6rem] font-semibold tabular-nums leading-none text-[#1c1914]">
              {station.figure}
            </span>
            <span className={T.folio}>{station.figureLabel}</span>
          </div>
          <PressSpecStrip spec={station.spec} />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <PressOfflineStamp tilt={Math.round(Math.sin(station.no * 2.7) * 9)} />
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#4a4438]">
              <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {station.offline}
            </span>
          </div>
        </div>
        <figure>
          <div className="h-[120px] w-full border-2 border-[#1c1914] bg-[#f6f1e7] p-2 shadow-[3px_3px_0_#1c1914]">
            <PressInkVisual station={station} />
          </div>
          <figcaption className={`mt-2 ${T.folio}`}>
            planche d'épreuve · presse {String(station.no).padStart(2, "0")}
          </figcaption>
        </figure>
      </div>
    </SettleIn>
  );
}

function PressStaticStage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
      <SectionMast rubrique="La chaîne du matin" no="p. 3½" />
      <div className="mt-10">
        <p className={T.kicker}>Le chemin doré — sept presses, une frappe chacune</p>
        <h2 className="mt-4 max-w-[18ch] font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-medium leading-[0.96] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
          Du CSV brut au rapport tiré, sans réseau.
        </h2>
        <p className="mt-5 max-w-[60ch] font-grotesk text-[17px] leading-relaxed text-[#4a4438]">
          The same seven presses the scrolling machine runs, printed here flat for a calmer read.
          Each press is one keystroke of Data Navigator, and every one of them stays on the
          desk.
        </p>
      </div>
      <div className="mt-8">
        {PRESS_STATIONS.map((station) => (
          <PressStaticStation key={station.no} station={station} />
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <InkButton href="/signup" tone="vermilion">
          Lancer la première presse
          <ArrowRight aria-hidden className="h-4 w-4" strokeWidth={2.4} />
        </InkButton>
        <InkLink href="#subscribe">Recevoir l'édition complète</InkLink>
      </div>
      <FolioLine
        page="p. 3½ — la chaîne"
        note="motion réduite — chaîne présentée à plat"
        className="mt-12"
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE SPOKEN VERSION — the whole golden path, for screen readers
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Screen-reader summary. The sticky machine is decorative end to end, so this
 * ordered list states the seven presses, their figures and the offline
 * guarantee — the same content the visual sequence prints, in reading order.
 */
function PressSrSummary() {
  return (
    <div className="sr-only">
      <h2>Le chemin doré — sept presses, de la lecture au tirage</h2>
      <p>
        Data Navigator transforme DailyTransactions.csv en rapport du matin en sept frappes,
        exécutées dans l'ordre, entièrement sur le poste et sans aucun réseau.
      </p>
      <ol>
        {PRESS_STATIONS.map((station) => (
          <li key={station.no}>
            Presse {station.no} — {station.plate} ({station.verb}) : {station.figure},{" "}
            {station.figureLabel}. {station.offline}
          </li>
        ))}
        <li>
          L'édition est tirée : PDF, DOCX et PPTX prêts à 06 h 12. Commencez sur la page
          d'inscription.
        </li>
      </ol>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PRESS · THE RUN SHEET — the order of operations, as a readable ledger
 *  A real <table> stating the seven presses in run order with their clock,
 *  engine and output, plus the recurring "0 requête" column the security desk
 *  reads down. It is the textual twin of the animated line: whatever the scene
 *  shows, this says, in order, before the machine even pins.
 * ════════════════════════════════════════════════════════════════════════════ */

/** One row of the run sheet — a real <th scope="row"> press, then its spec. */
function PressRunRow({ station }: { station: PressStation }) {
  return (
    <tr className="border-b border-[#d6ccb6] last:border-b-0">
      <th scope="row" className="py-2.5 pr-3 text-left align-top font-normal">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] tabular-nums text-[#bf3415]">
            {String(station.no).padStart(2, "0")}
          </span>
          <span className="font-grotesk text-[13px] font-bold uppercase tracking-[0.08em] text-[#1c1914]">
            {station.plate}
          </span>
        </span>
        <span className={`mt-0.5 block ${T.folio}`}>{station.verb}</span>
      </th>
      <td className="py-2.5 pr-3 text-right align-top font-mono text-[11px] tabular-nums text-[#4a4438]">
        {station.spec.clock}
      </td>
      <td className="hidden py-2.5 pr-3 text-left align-top font-mono text-[11px] text-[#4a4438] sm:table-cell">
        {station.spec.engine}
      </td>
      <td className="hidden py-2.5 pr-3 text-left align-top font-serif text-[12.5px] italic text-[#4a4438] md:table-cell">
        {station.spec.writes}
      </td>
      <td className="py-2.5 text-right align-top font-mono text-[11px] font-bold tabular-nums text-[#bf3415]">
        {station.spec.outbound}
      </td>
    </tr>
  );
}

/**
 * The run sheet table — the order of operations the operator presses, top to
 * bottom, with the morning clock and the zero-outbound column. Sits in the
 * announcement strip so the section reads completely even with motion off, and
 * gives the section a numeric spine the animation can only gesture at.
 */
function PressRunSheet() {
  return (
    <SettleIn delay={0.1} className="mt-10 border border-[#1c1914] bg-[#eee6d6] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
          <Printer aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
          Feuille de marche
        </h3>
        <span className={T.folio}>ordre des presses · 7 frappes</span>
      </div>
      <Rule className="mt-3 bg-[#1c1914]" />
      <table className="mt-1 w-full border-collapse">
        <caption className="sr-only">
          Ordre d'exécution des sept presses du chemin doré : numéro, presse, heure de
          passage, moteur, sortie produite et requêtes sortantes (zéro à chaque presse).
        </caption>
        <thead>
          <tr className="border-b-2 border-[#1c1914]">
            <th scope="col" className={`py-2 pr-3 text-left ${T.folio}`}>
              Presse
            </th>
            <th scope="col" className={`py-2 pr-3 text-right ${T.folio}`}>
              Heure
            </th>
            <th scope="col" className={`hidden py-2 pr-3 text-left sm:table-cell ${T.folio}`}>
              Moteur
            </th>
            <th scope="col" className={`hidden py-2 pr-3 text-left md:table-cell ${T.folio}`}>
              Écrit
            </th>
            <th scope="col" className={`py-2 text-right ${T.folio}`}>
              Sortant
            </th>
          </tr>
        </thead>
        <tbody>
          {PRESS_STATIONS.map((station) => (
            <PressRunRow key={station.no} station={station} />
          ))}
        </tbody>
      </table>
      <div
        className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-[#1c1914] pt-2.5 ${T.folio}`}
      >
        <span>7 presses · 1 frappe chacune</span>
        <span aria-hidden>·</span>
        <span>première frappe 06 h 02 · édition tirée 06 h 12</span>
        <span aria-hidden>·</span>
        <span className="font-bold text-[#bf3415]">total sortant : 0 requête</span>
      </div>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §06 ROOT — PressSection
 *  StickyScene-based ⇒ NO contentVisibility on the root (sticky needs layout).
 *  The render callback only forwards the MotionValue to PressStage; hooks never
 *  run inside it. Reduced motion (and, in effect, very small screens, where the
 *  static layout reads cleanly) gets the flat broadsheet sequence. This is the
 *  #workflow anchor the spine links to.
 * ════════════════════════════════════════════════════════════════════════════ */

function PressSection() {
  const reduce = useReducedMotion();
  return (
    <section id="workflow" className="relative">
      {/* a thin announcement strip sits above the scene so the rubrique reads
          before the machine pins — the sticky bed itself carries no mast. */}
      <div className="border-y border-[#d6ccb6] bg-[#f6f1e7]">
        <div className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
          <SectionMast rubrique="La chaîne du matin" no="p. 3½" />
          <PressSrSummary />
          <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <SettleIn>
                <p className={T.kicker}>Le chemin doré · sept presses, une frappe chacune</p>
              </SettleIn>
              <DeckReveal
                className="mt-4"
                lines={[
                  <span
                    key="l1"
                    className="font-serif text-[clamp(2.4rem,5.4vw,4.6rem)] font-medium leading-[0.97] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                  >
                    Seven presses turn a
                  </span>,
                  <span
                    key="l2"
                    className="font-serif text-[clamp(2.4rem,5.4vw,4.6rem)] font-medium leading-[0.97] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                  >
                    CSV into an{" "}
                    <PenUnderline delay={0.7}>edition</PenUnderline>.
                  </span>,
                ]}
              />
            </div>
            <div className="lg:col-span-5 lg:pt-6">
              <SettleIn delay={0.15}>
                <p className="font-grotesk text-[17px] leading-relaxed text-[#4a4438]">
                  Scroll, and the line runs. Each press fires one keystroke of the golden path —
                  lecture, profil, analyse, interrogation, graphiques, composition, tirage — and
                  the sheet advances one station at a time until the morning report drops into the
                  tray.
                </p>
              </SettleIn>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <PressOfflineStamp tilt={-6} />
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#4a4438]">
                  <Printer aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  {PRESS_COUNT} presses · 0 requête sortante
                </span>
              </div>
            </div>
          </div>

          {/* the run sheet — the order of operations as a readable ledger */}
          <PressRunSheet />
        </div>
      </div>

      {/* the machine itself — sticky on lg+, flat sequence on reduced motion */}
      {reduce ? (
        <PressStaticStage />
      ) : (
        <>
          {/* small screens get the readable flat sequence; the pinned bed,
              which needs viewport height and a side gauge, shows from lg up. */}
          <div className="lg:hidden">
            <PressStaticStage />
          </div>
          <div className="hidden lg:block">
            <StickyScene pages={PRESS_PAGES}>
              {(progress) => <PressStage progress={progress} />}
            </StickyScene>
          </div>
        </>
      )}

      {/* folio closes the rubrique on every breakpoint */}
      <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-10 sm:px-8">
        <Rule className="mb-4" />
        <FolioLine
          page="p. 3½"
          note="La chaîne du matin · sept presses · données sur le poste"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 07 — ClassifiedSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §7 — THE CLASSIFIEDS · "PETITES ANNONCES" · #capabilities
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Every feature in the box, typeset as a dense classified-ads spread — the
 *  page of the paper nobody admits to reading first. The conceit: capability
 *  is sold by the line, like agate-type notices in a provincial daily.
 *
 *  Construction notes
 *  ──────────────────
 *  • The lattice is a real ruled grid: `gap-px` over an ink-tinted backdrop
 *    (`bg-[#1c1914]/15`) so every hairline is a shared press rule, not a
 *    per-card border that doubles up at seams.
 *  • Dense flow (`grid-flow-dense`) lets wide/tall/display ads punch holes in
 *    the column rhythm the way real display ads interrupt agate columns; the
 *    browser re-packs small notices around them.
 *  • Hover is mechanical, never soft: the plate lifts 1px up-left and an
 *    offset-print shadow appears underneath. Transform-only transition; the
 *    shadow snaps, as a metal plate would.
 *  • Vermilion is rationed to exactly three NOUVEAU stamps plus the pen's own
 *    marks inside the ink charts. Everything else is ink on paper.
 *  • All reveal motion goes through SettleIn (reduced-motion aware); no hooks
 *    are called anywhere inside a .map() body — every cell is a real component.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Shared shape for every lucide glyph stored in ad data. */
type ClassifiedGlyph = typeof FileInput;

/** Lattice footprints. "banner" runs the full width of the spread. */
type ClassifiedSpan = "s" | "wide" | "tall" | "display" | "banner";

/** Bespoke content blocks some ads carry under their pitch line. */
type ClassifiedExtraKind =
  | "sql"
  | "nlq"
  | "formats"
  | "charter"
  | "keys"
  | "pmtiles"
  | "vad"
  | "briefing";

/** The four hand-set display ads with ink visuals. */
type ClassifiedDisplayKind = "report" | "gauge" | "forecast" | "geo";

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.0 — RUBRIQUES · the classified page's own taxonomy
 *  Five departments, numbered like a real petites-annonces page. The counts
 *  are real: 28 numbered feature notices file under exactly one rubrique each.
 * ──────────────────────────────────────────────────────────────────────────── */

const CLASSIFIED_RUBRIQUES = {
  donnees: {
    numeral: "I",
    label: "Données",
    count: 7,
    gloss: "intake, custody, lineage — the paper trail",
  },
  analyse: {
    numeral: "II",
    label: "Analyse",
    count: 8,
    gloss: "questions asked, answered, and shown working",
  },
  rapport: {
    numeral: "III",
    label: "Rapport",
    count: 5,
    gloss: "the morning's printed matter",
  },
  collaboration: {
    numeral: "IV",
    label: "Collaboration",
    count: 3,
    gloss: "the desk, multiplied across the office wire",
  },
  machine: {
    numeral: "V",
    label: "Machine",
    count: 5,
    gloss: "the press itself — local, silent, yours",
  },
} as const;

type ClassifiedRubriqueKey = keyof typeof CLASSIFIED_RUBRIQUES;

/** Reading order for the legend column. */
const CLASSIFIED_RUBRIQUE_ORDER: ReadonlyArray<ClassifiedRubriqueKey> = [
  "donnees",
  "analyse",
  "rapport",
  "collaboration",
  "machine",
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.1 — CELL DATA · the spread itself, in reading order
 *  One array, hand-ordered: small notices, display ads, house notices, one
 *  situation vacant and the tariff banner. grid-flow-dense re-packs around
 *  the spans, so the order here is rhythm, not strict geometry.
 * ──────────────────────────────────────────────────────────────────────────── */

type ClassifiedAdData = {
  kind: "ad";
  key: string;
  /** running agate index, typeset as № 01 … № 28 */
  no: string;
  rubrique: ClassifiedRubriqueKey;
  /** feature name — French, the product's own label */
  name: string;
  icon: ClassifiedGlyph;
  /** one-line serif pitch, dry newsroom voice */
  pitch: string;
  /** mono small-print contact line, as classifieds demand */
  smallPrint: string;
  span?: ClassifiedSpan;
  /** vermilion rubber stamp — rationed to three across the page */
  stamp?: string;
  /** bespoke content block rendered under the pitch */
  extra?: ClassifiedExtraKind;
  /** alternate paper tone for column rhythm */
  tone?: "paper" | "deep";
};

type ClassifiedNoticeData = {
  kind: "notice";
  key: string;
  /** AVIS / PERDU / À VENDRE — the immortal genres */
  genre: string;
  icon: ClassifiedGlyph;
  /** French lead phrase, set bold like a notice head */
  lead: string;
  /** English body, the joke delivered deadpan */
  body: string;
  smallPrint: string;
  span?: ClassifiedSpan;
};

type ClassifiedCellData =
  | ClassifiedAdData
  | ClassifiedNoticeData
  | { kind: "display"; key: string; display: ClassifiedDisplayKind; span: ClassifiedSpan }
  | { kind: "recruit"; key: string; span: ClassifiedSpan }
  | { kind: "tariff"; key: string; span: ClassifiedSpan };

const CLASSIFIED_CELLS: ReadonlyArray<ClassifiedCellData> = [
  {
    kind: "ad",
    key: "ad-01",
    no: "01",
    rubrique: "donnees",
    name: "Importation CSV · Parquet · JSON",
    icon: FileInput,
    pitch:
      "Drop the file at the gate. 2 147 380 rows are read, typed and seated before your coffee admits defeat.",
    smallPrint: "Réf. DN-01 · guichet des données, ouvert dès 5 h 58",
  },
  {
    kind: "ad",
    key: "ad-02",
    no: "02",
    rubrique: "donnees",
    name: "Profileur de colonnes",
    icon: Columns3,
    pitch:
      "Every column interrogated on arrival — types, nulls, cardinalités, outliers. None of them asked for a lawyer.",
    smallPrint: "Réf. DN-02 · procès-verbal fourni avec chaque fichier",
  },
  {
    kind: "ad",
    key: "ad-03",
    no: "03",
    rubrique: "analyse",
    name: "SQL DuckDB",
    icon: Database,
    pitch:
      "A full analytical engine lodged inside the application. Pays no rent, files no telemetry, answers in milliseconds.",
    smallPrint: "Réf. DN-03 · colonne vertébrale de la maison",
    span: "tall",
    extra: "sql",
  },
  {
    kind: "ad",
    key: "ad-04",
    no: "04",
    rubrique: "analyse",
    name: "Requêtes en français",
    icon: MessageSquareText,
    pitch:
      "Ask the question the way you would say it across the desk. The machine drafts the SQL — and shows its work.",
    smallPrint: "Réf. DN-04 · interprète assermenté, sans accent",
    span: "wide",
    extra: "nlq",
  },
  { kind: "display", key: "disp-report", display: "report", span: "display" },
  {
    kind: "ad",
    key: "ad-05",
    no: "05",
    rubrique: "analyse",
    name: "Constructeur visuel",
    icon: Blocks,
    pitch:
      "Queries assembled by hand, like type in a composing stick — no semicolon, no syntax sermon.",
    smallPrint: "Réf. DN-05 · recommandé aux mains prudentes",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-06",
    no: "06",
    rubrique: "donnees",
    name: "Pipelines de transformation",
    icon: Workflow,
    pitch:
      "Clean, join, derive, repeat. Every step is recorded like a press run and replayable to the letter.",
    smallPrint: "Réf. DN-06 · répétable à l'identique, sur demande",
  },
  {
    kind: "notice",
    key: "notice-perdu",
    genre: "Perdu",
    icon: SearchX,
    lead: "Une connexion internet,",
    body: "last seen loitering near the firewall. The machine has not noticed its absence. No reward is offered.",
    smallPrint: "S'abstenir de la rapporter.",
  },
  {
    kind: "ad",
    key: "ad-07",
    no: "07",
    rubrique: "donnees",
    name: "Lignée des données",
    icon: Network,
    pitch:
      "Every figure can name its parents, its grandparents and the file it was born in. Invaluable at audits.",
    smallPrint: "Réf. DN-07 · arbre généalogique sur demande",
  },
  {
    kind: "ad",
    key: "ad-08",
    no: "08",
    rubrique: "donnees",
    name: "Réconciliation",
    icon: Scale,
    pitch:
      "Two ledgers enter; one truth leaves. Discrepancies are printed in full, never quietly retired.",
    smallPrint: "Réf. DN-08 · litiges réglés au guichet n° 2",
  },
  { kind: "display", key: "disp-gauge", display: "gauge", span: "wide" },
  {
    kind: "ad",
    key: "ad-09",
    no: "09",
    rubrique: "donnees",
    name: "Historique des versions",
    icon: History,
    pitch:
      "Every edition kept on file. Yesterday's report cannot be rewritten — only consulted, as is proper.",
    smallPrint: "Réf. DN-09 · archives au sous-sol, classement sec",
  },
  {
    kind: "ad",
    key: "ad-10",
    no: "10",
    rubrique: "donnees",
    name: "Dossiers & tags",
    icon: FolderTree,
    pitch:
      "A filing system your future self will pretend was always this tidy. Labels in any language you keep.",
    smallPrint: "Réf. DN-10 · étiquettes à volonté",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-12",
    no: "12",
    rubrique: "rapport",
    name: "Briefing IA",
    icon: BrainCircuit,
    pitch:
      "The morning summary, drafted at your desk by a model that lives on your disk and has never been outside.",
    smallPrint: "Réf. DN-12 · rédigé sur place, chaque matin",
    extra: "briefing",
  },
  { kind: "display", key: "disp-forecast", display: "forecast", span: "wide" },
  {
    kind: "ad",
    key: "ad-16",
    no: "16",
    rubrique: "analyse",
    name: "Théâtre analytique",
    icon: Clapperboard,
    pitch:
      "Your investigation staged scene by scene, chart by chart. Applause optional; insight scheduled.",
    smallPrint: "Réf. DN-16 · séance privée, places illimitées",
    stamp: "Nouveau",
  },
  {
    kind: "ad",
    key: "ad-17",
    no: "17",
    rubrique: "rapport",
    name: "Studio de rapports",
    icon: Printer,
    pitch:
      "One report, four costumes. The committee receives PPTX; the archive keeps PDF; nobody retypes a line.",
    smallPrint: "Réf. DN-17 · presse à façon, tirage immédiat",
    span: "wide",
    extra: "formats",
  },
  {
    kind: "ad",
    key: "ad-18",
    no: "18",
    rubrique: "collaboration",
    name: "Collaboration LAN",
    icon: Cable,
    pitch:
      "Share the desk across the office wire — synchronised over the local network. The internet is not invited.",
    smallPrint: "Réf. DN-18 · le câble suffit",
  },
  {
    kind: "notice",
    key: "notice-avis",
    genre: "Avis",
    icon: Megaphone,
    lead: "À nos lecteurs —",
    body: "every figure on this page was computed on the premises. No byte crossed the property line during typesetting.",
    smallPrint: "Certifié par la rédaction.",
  },
  {
    kind: "ad",
    key: "ad-19",
    no: "19",
    rubrique: "collaboration",
    name: "Commentaires",
    icon: MessageCircle,
    pitch:
      "Margin notes for colleagues, threaded and filed with the data they question. The red pen, civilised.",
    smallPrint: "Réf. DN-19 · courrier interne uniquement",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-20",
    no: "20",
    rubrique: "collaboration",
    name: "Curseurs partagés",
    icon: MousePointer2,
    pitch: "Watch a colleague's cursor cross the same grid, live. Telepathy, by Ethernet.",
    smallPrint: "Réf. DN-20 · latence : celle du couloir",
    stamp: "Nouveau",
  },
  { kind: "display", key: "disp-geo", display: "geo", span: "wide" },
  {
    kind: "ad",
    key: "ad-21",
    no: "21",
    rubrique: "machine",
    name: "Palette de commandes",
    icon: Command,
    pitch:
      "Every command in the house, three keystrokes away. The mouse has filed a formal grievance.",
    smallPrint: "Réf. DN-21 · raccourci vers à peu près tout",
    extra: "keys",
  },
  {
    kind: "ad",
    key: "ad-22",
    no: "22",
    rubrique: "machine",
    name: "Mode hors ligne",
    icon: WifiOff,
    pitch:
      "Not a feature — a constitution. The application works precisely because nothing depends on a connection.",
    smallPrint: "Réf. DN-22 · en vigueur depuis la première édition",
    span: "tall",
    extra: "charter",
  },
  {
    kind: "ad",
    key: "ad-23",
    no: "23",
    rubrique: "rapport",
    name: "Voix — lecture du briefing",
    icon: AudioLines,
    pitch:
      "The morning briefing read aloud by a voice that occupies 82 Mo of disk and zero centimetres of cloud.",
    smallPrint: "Réf. DN-23 · diction locale garantie",
    stamp: "Nouveau",
  },
  {
    kind: "ad",
    key: "ad-24",
    no: "24",
    rubrique: "machine",
    name: "VAD — micro local",
    icon: Mic,
    pitch:
      "The microphone wakes only when addressed, and the audio never leaves the room it was spoken in.",
    smallPrint: "Réf. DN-24 · octets émis : 0, vérifié au compteur",
    extra: "vad",
    tone: "deep",
  },
  { kind: "recruit", key: "recruit", span: "tall" },
  {
    kind: "ad",
    key: "ad-25",
    no: "25",
    rubrique: "rapport",
    name: "Exports Excel",
    icon: FileSpreadsheet,
    pitch:
      "For the colleague who insists. Formatted .xlsx, formulas intact, dignity preserved on both sides.",
    smallPrint: "Réf. DN-25 · paix des ménages incluse",
  },
  {
    kind: "ad",
    key: "ad-26",
    no: "26",
    rubrique: "machine",
    name: "Cartes hors ligne PMTiles",
    icon: Layers,
    pitch:
      "The whole basemap in a single file on your disk. Geography, pre-delivered — zoom without asking anyone.",
    smallPrint: "Réf. DN-26 · le territoire livré en une pièce",
    extra: "pmtiles",
  },
  {
    kind: "ad",
    key: "ad-27",
    no: "27",
    rubrique: "analyse",
    name: "Moteur vecteurs LanceDB",
    icon: DatabaseZap,
    pitch:
      "Semantic search living beside your data — embeddings computed and kept on the premises, recall total.",
    smallPrint: "Réf. DN-27 · mémoire locale, rappel intégral",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-28",
    no: "28",
    rubrique: "machine",
    name: "Thème sombre & clair",
    icon: SunMoon,
    pitch:
      "A night-shift edition for the 23 h incident. The ink inverts; the principles do not.",
    smallPrint: "Réf. DN-28 · encre réversible, sans frais",
  },
  {
    kind: "notice",
    key: "notice-vendre",
    genre: "À vendre",
    icon: Tag,
    lead: "Rien.",
    body: "The software ships complete. There is no second counter, no premium edition, nothing kept behind the curtain.",
    smallPrint: "Prière de ne pas insister.",
  },
  { kind: "tariff", key: "tariff", span: "banner" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.2 — DISPLAY-AD DATA · the hand-set plates
 * ──────────────────────────────────────────────────────────────────────────── */

/** The eight tabs of the telecom report — the product's daily ritual. */
const CLASSIFIED_TABS = [
  { n: "1", fr: "vue d'ensemble", en: "the front page — totals, réussite, verdict" },
  { n: "2", fr: "canaux", en: "every channel weighed, ranked and judged" },
  { n: "3", fr: "analyse", en: "patterns, segments, and the reasons why" },
  { n: "4", fr: "données brutes", en: "the wire copy — every row, unedited" },
  { n: "5", fr: "période", en: "any date range, recomposed on demand" },
  { n: "6", fr: "journalier", en: "the day-by-day ledger, kept since day one" },
  { n: "7", fr: "historique", en: "past editions, filed and comparable" },
  { n: "8", fr: "configuration", en: "the typesetter's preferences, remembered" },
] as const;

/** Seven observed days, seven forecast days — drawn as one ink line. */
const CLASSIFIED_FORECAST_SERIES = [61, 63, 60, 66, 69, 65, 72, 70, 74, 78, 75, 81, 84, 88];

/** Where last night's failures kept their addresses. */
const CLASSIFIED_GEO_MARKERS = [
  { x: 0.3, y: 0.28, label: "TUN 41" },
  { x: 0.62, y: 0.6, label: "SFX 17" },
  { x: 0.45, y: 0.42, label: "SUS 9" },
] as const;

/** Report-studio output formats and who each one is really for. */
const CLASSIFIED_STUDIO_FORMATS = [
  { ext: "PDF", note: "pour les archives" },
  { ext: "DOCX", note: "pour la direction" },
  { ext: "PPTX", note: "pour le comité" },
  { ext: "XLSX", note: "pour la vérification" },
] as const;

/** Situations-vacant qualifications. The bar is precisely one installation. */
const CLASSIFIED_RECRUIT_QUALS = [
  "Curiosity, and availability at 6 h 12 — the report is ready before you are.",
  "French or SQL; the machine is fluent in both and patient in either.",
  "No cloud clearance required. There is no cloud.",
  "Must tolerate being right by breakfast.",
] as const;

/** The offline constitution, in three articles. Posted in the tall № 22 ad. */
const CLASSIFIED_CHARTER = [
  { art: "Art. 1", text: "Aucun octet sortant." },
  { art: "Art. 2", text: "Aucun octet entrant requis." },
  { art: "Art. 3", text: "En cas de doute, relire l'article premier." },
] as const;

/** Tariff banner columns — the page's standing terms of business. */
const CLASSIFIED_TARIFF_TERMS = [
  { term: "La ligne", value: "0 fr. 00" },
  { term: "Abonnement", value: "aucun" },
  { term: "Régie publicitaire", value: "non consultée" },
  { term: "Données personnelles", value: "non collectées" },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.3 — CARD CHROME · shared shell, header strip, small print
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lattice footprint → Tailwind span classes. Base grid is 2-col; md 3; xl 4. */
const CLASSIFIED_SPAN_CLASS: Record<ClassifiedSpan, string> = {
  s: "col-span-1",
  wide: "col-span-2",
  tall: "col-span-1 row-span-2",
  display: "col-span-2 row-span-2",
  banner: "col-span-2 md:col-span-3 xl:col-span-4",
};

/**
 * Every cell shares this plate behaviour: paper surface, mechanical 1px lift
 * with an offset-print shadow on hover. transition-transform only — the
 * shadow snaps into place like a plate dropping onto the bed.
 */
function ClassifiedCardShell({
  children,
  tone = "paper",
  frame = false,
  className,
}: {
  children: ReactNode;
  tone?: "paper" | "deep" | "shade";
  /** inner hairline frame, the classic display-ad border-within-a-border */
  frame?: boolean;
  className?: string;
}) {
  const tones = {
    paper: "bg-[#f6f1e7]",
    deep: "bg-[#eee6d6]",
    shade: "bg-[#e4dac5]",
  } as const;
  return (
    <article
      className={`group relative flex h-full flex-col ${tones[tone]} transition-transform duration-150 ease-out hover:z-10 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_#1c1914] ${className ?? ""}`}
    >
      {frame && (
        <div aria-hidden className="pointer-events-none absolute inset-[5px] border border-[#1c1914]/30" />
      )}
      {children}
    </article>
  );
}

/** Agate header strip: running № on the left, rubrique numeral on the right. */
function ClassifiedAdHeader({ no, rubrique }: { no: string; rubrique: ClassifiedRubriqueKey }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
        № {no}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
        rub. {CLASSIFIED_RUBRIQUES[rubrique].numeral}
      </span>
    </div>
  );
}

/** Bottom small-print row — every honest classified ends in a contact line. */
function ClassifiedSmallPrintRow({ text }: { text: string }) {
  return (
    <div className="mt-auto border-t border-[#d6ccb6] pt-2.5">
      <p className="font-mono text-[9px] leading-snug tracking-[0.04em] text-[#857c69]">{text}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.4 — BESPOKE EXTRAS · the blocks that make certain ads worth the column
 *  Each is a few square centimetres of product truth: a real query, a real
 *  file, a real article of the offline constitution.
 * ──────────────────────────────────────────────────────────────────────────── */

function ClassifiedAdExtra({ kind }: { kind: ClassifiedExtraKind }) {
  switch (kind) {
    case "sql":
      // The tall № 03 ad earns its second row with an actual query and timing.
      return (
        <div className="mt-3 border border-[#d6ccb6] bg-[#eee6d6]/60 p-2.5">
          <pre className="overflow-x-auto font-mono text-[9.5px] leading-[1.6] text-[#1c1914]">
            {"SELECT canal,\n       count(*) AS échecs\nFROM   tx\nWHERE  statut = 'échec'\nGROUP  BY canal\nORDER  BY 2 DESC;"}
          </pre>
          <p className="mt-1.5 font-mono text-[8.5px] tracking-[0.06em] text-[#857c69]">
            -- 38 ms · 2,1 M lignes · 0 octet émis
          </p>
        </div>
      );
    case "nlq":
      // Question in, SQL out — the translation shown like a wire dispatch.
      return (
        <div className="mt-3 space-y-1.5">
          <p className="font-serif text-[13px] italic leading-snug text-[#1c1914]">
            « combien d'échecs sur le canal ORANGE hier soir ? »
          </p>
          <p className="truncate font-mono text-[9.5px] tracking-[0.02em] text-[#2b4a8b]">
            → SELECT count(*) FROM tx WHERE canal = 'ORANGE' AND statut = 'échec' …
          </p>
        </div>
      );
    case "formats":
      // Four chips, four audiences. The note under each is the real politics.
      return (
        <div className="mt-3 grid grid-cols-2 gap-px border border-[#d6ccb6] bg-[#d6ccb6] sm:grid-cols-4">
          {CLASSIFIED_STUDIO_FORMATS.map((f) => (
            <div key={f.ext} className="bg-[#f6f1e7] px-2 py-1.5 text-center">
              <span className="block font-mono text-[10px] font-bold tracking-[0.1em] text-[#1c1914]">
                .{f.ext}
              </span>
              <span className="block font-serif text-[9.5px] italic text-[#857c69]">{f.note}</span>
            </div>
          ))}
        </div>
      );
    case "charter":
      // The offline constitution. Three articles; the third is load-bearing.
      return (
        <div className="mt-3 space-y-2 border-l-2 border-[#1c1914] pl-3">
          {CLASSIFIED_CHARTER.map((a) => (
            <p key={a.art} className="font-serif text-[12.5px] leading-snug text-[#1c1914]">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#857c69]">
                {a.art} —{" "}
              </span>
              {a.text}
            </p>
          ))}
        </div>
      );
    case "keys":
      // Two keycaps, set like type sorts.
      return (
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          <kbd className="inline-flex h-7 min-w-7 items-center justify-center border border-[#1c1914] bg-[#f6f1e7] px-1.5 font-mono text-[12px] text-[#1c1914] shadow-[2px_2px_0_#1c1914]">
            ⌘
          </kbd>
          <kbd className="inline-flex h-7 min-w-7 items-center justify-center border border-[#1c1914] bg-[#f6f1e7] px-1.5 font-mono text-[12px] text-[#1c1914] shadow-[2px_2px_0_#1c1914]">
            K
          </kbd>
          <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69]">
            et tout s'ouvre
          </span>
        </div>
      );
    case "pmtiles":
      // One file, one country. The whole point in a single mono line.
      return (
        <p className="mt-3 border border-dashed border-[#857c69]/50 px-2.5 py-1.5 font-mono text-[9.5px] tracking-[0.04em] text-[#4a4438]">
          tunisie.pmtiles · 412 Mo · zoom 0–14 · une seule pièce
        </p>
      );
    case "vad":
      // The audit line that matters. Zero is the feature.
      return (
        <p className="mt-3 font-mono text-[9.5px] tracking-[0.05em] text-[#4a4438]">
          trames analysées : <span className="text-[#1c1914]">sur place</span> · trames transmises :{" "}
          <span className="font-bold text-[#1c1914]">0</span>
        </p>
      );
    case "briefing":
      // A torn-off line of this morning's machine prose.
      return (
        <p className="mt-3 border-l-2 border-[#d6ccb6] pl-2.5 font-serif text-[12.5px] italic leading-snug text-[#4a4438]">
          « Trafic conforme à la moyenne du mois ; deux canaux méritent l'œil du rédacteur… »
        </p>
      );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.5 — THE STANDARD AD · agate index, glyph, grotesk head, serif pitch
 * ──────────────────────────────────────────────────────────────────────────── */

function ClassifiedAdCard({ ad }: { ad: ClassifiedAdData }) {
  const Glyph = ad.icon;
  // Deterministic stamp tilt — index math, never Math.random (contract §13).
  const tilt = Math.sin(Number(ad.no) * 2.7) * 8;
  return (
    <ClassifiedCardShell tone={ad.tone ?? "paper"} className="p-4 sm:p-5">
      <ClassifiedAdHeader no={ad.no} rubrique={ad.rubrique} />
      <Glyph aria-hidden className="mt-3 h-[18px] w-[18px] text-[#1c1914]" strokeWidth={1.75} />
      <h3
        className={`mt-2 font-grotesk text-[14px] font-extrabold uppercase leading-[1.18] tracking-[0.04em] text-[#1c1914] ${ad.stamp ? "pr-14" : ""}`}
      >
        {ad.name}
      </h3>
      <p className="mt-1.5 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
        {ad.pitch}
      </p>
      {ad.extra && <ClassifiedAdExtra kind={ad.extra} />}
      <div className="pt-3" />
      <ClassifiedSmallPrintRow text={ad.smallPrint} />
      {ad.stamp && (
        <span className="absolute right-2.5 top-2.5 origin-top-right scale-[0.72]">
          <Stamp tilt={tilt}>{ad.stamp}</Stamp>
        </span>
      )}
    </ClassifiedCardShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.6 — DISPLAY ADS · the four hand-set plates with ink visuals
 *  Bigger serif voice, inner hairline frame, one ink graphic apiece. These
 *  interrupt the agate columns the way paid display always has.
 * ──────────────────────────────────────────────────────────────────────────── */

/** № 11 — the telecom report, the product's reason to exist. 2×2 plate. */
function ClassifiedDisplayReport() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 11
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. III — rapport
          </span>
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <Newspaper aria-hidden className="h-5 w-5 text-[#1c1914]" strokeWidth={1.6} />
            <h3 className="mt-2 font-serif text-[clamp(1.45rem,2.6vw,2rem)] font-bold leading-[1.04] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Le rapport télécom
            </h3>
          </div>
          <span className="mt-1 shrink-0 origin-top-right scale-[0.85]">
            <Stamp color={STAMP_GREEN} tilt={5}>
              Édition du jour
            </Stamp>
          </span>
        </div>
        <p className="mt-2.5 max-w-prose font-serif text-[14.5px] italic leading-[1.55] text-[#4a4438]">
          The entire morning ritual in eight tabs — from raw rows at 6 h 02 to a verdict you can
          sign by 6 h 12. Composed daily from DailyTransactions.csv, witnessed by no server.
        </p>
        {/* The eight tabs, set as an agate index with hairline rules. */}
        <ul className="mt-4 divide-y divide-[#d6ccb6] border-y border-[#d6ccb6]">
          {CLASSIFIED_TABS.map((tab) => (
            <li key={tab.n} className="flex items-baseline gap-2.5 py-[5px]">
              <span className="w-3 shrink-0 font-mono text-[9.5px] font-semibold text-[#bf3415]">
                {tab.n}
              </span>
              <span className="shrink-0 font-grotesk text-[11px] font-bold uppercase tracking-[0.08em] text-[#1c1914]">
                {tab.fr}
              </span>
              <span aria-hidden className="hidden flex-1 border-b border-dotted border-[#857c69]/50 sm:block" />
              <span className="hidden truncate font-serif text-[11.5px] italic text-[#857c69] sm:block">
                {tab.en}
              </span>
            </li>
          ))}
        </ul>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Paraît chaque matin à 6 h 12 · tirage : un exemplaire — le vôtre" />
      </div>
    </ClassifiedCardShell>
  );
}

/** № 13 — anomaly detection, with the instrument that caught last night. */
function ClassifiedDisplayGauge() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 13
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. II — analyse
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <Siren aria-hidden className="h-5 w-5 text-[#1c1914]" strokeWidth={1.6} />
            <h3 className="mt-2 font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.05] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Détection d'anomalies
            </h3>
            <p className="mt-2 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
              When 97,4 % slips to 91,2 % at 23 h, the red pen finds it before you find your
              coffee.
            </p>
          </div>
          <div className="w-28 shrink-0 sm:w-32">
            <InkGauge value={91.2} label="réussite · 11 juin, 23 h" className="w-full" />
          </div>
        </div>
        <p className="mt-3 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          seuil d'alerte : 95,0 % · écart signalé : z = 3,4 · délai : 14 min après l'évènement
        </p>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Réf. DN-13 · veilleur de nuit, ne dort jamais" />
      </div>
    </ClassifiedCardShell>
  );
}

/** № 14 — forecasting; seven observed days, seven drawn in advance. */
function ClassifiedDisplayForecast() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 14
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. II — analyse
          </span>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <TrendingUp aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[#1c1914]" strokeWidth={1.6} />
          <div>
            <h3 className="font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.05] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Prévisions
            </h3>
            <p className="mt-1.5 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
              Tomorrow's traffic, drawn tonight. The crystal ball is a state-space model, and it
              keeps receipts.
            </p>
          </div>
        </div>
        <div className="mt-3 h-16">
          <InkLine data={CLASSIFIED_FORECAST_SERIES} markIndex={13} h={70} duration={1.5} />
        </div>
        <p className="mt-1.5 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          volumes J−7 … J+7 · intervalle de confiance 95 % · le point cerclé est demain
        </p>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Réf. DN-14 · l'avenir, sous presse dès ce soir" />
      </div>
    </ClassifiedCardShell>
  );
}

/** № 15 — geographic analysis; failures, mapped without leaving the desk. */
function ClassifiedDisplayGeo() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 15
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. II — analyse
          </span>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <Map aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[#1c1914]" strokeWidth={1.6} />
          <div>
            <h3 className="font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.05] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Analyse géographique
            </h3>
            <p className="mt-1.5 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
              Failures keep addresses. The map prints them — offline, naturally; the geography is
              already in the building.
            </p>
          </div>
        </div>
        <div className="mt-3 h-24 sm:h-28">
          <InkDotMap markers={CLASSIFIED_GEO_MARKERS} />
        </div>
        <p className="mt-1.5 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          échecs par gouvernorat · nuit du 11 juin · fond de carte : voir annonce № 26
        </p>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Réf. DN-15 · cartographe de service, sans réseau" />
      </div>
    </ClassifiedCardShell>
  );
}

/** Dispatch table for the display plates — keeps ClassifiedCell flat. */
function ClassifiedDisplayAd({ display }: { display: ClassifiedDisplayKind }) {
  switch (display) {
    case "report":
      return <ClassifiedDisplayReport />;
    case "gauge":
      return <ClassifiedDisplayGauge />;
    case "forecast":
      return <ClassifiedDisplayForecast />;
    case "geo":
      return <ClassifiedDisplayGeo />;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.7 — HOUSE NOTICES, THE VACANCY, THE TARIFF
 *  The furniture that makes a classified page a classified page: small
 *  notices in the old genres, one situation vacant, and the standing terms.
 * ──────────────────────────────────────────────────────────────────────────── */

/** PERDU / AVIS / À VENDRE — deadpan house notices on deeper paper. */
function ClassifiedNoticeCard({ notice }: { notice: ClassifiedNoticeData }) {
  const Glyph = notice.icon;
  return (
    <ClassifiedCardShell tone="deep" className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Glyph aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={1.75} />
        <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
          {notice.genre}
        </span>
        <span aria-hidden className="flex-1 border-b border-dotted border-[#857c69]/50" />
      </div>
      <p className="mt-3 font-serif text-[14px] leading-[1.5] text-[#1c1914]">
        <strong className="font-bold">{notice.lead}</strong>{" "}
        <span className="italic text-[#4a4438]">{notice.body}</span>
      </p>
      <div className="pt-3" />
      <ClassifiedSmallPrintRow text={notice.smallPrint} />
    </ClassifiedCardShell>
  );
}

/** № 29 — the only ad on the page that leads anywhere: to /signup. */
function ClassifiedRecruitCard() {
  return (
    <ClassifiedCardShell frame className="p-4 sm:p-5">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 29
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            offres d'emploi
          </span>
        </div>
        <PenLine aria-hidden className="mt-3 h-[18px] w-[18px] text-[#1c1914]" strokeWidth={1.75} />
        <h3 className="mt-2 pr-12 font-serif text-[clamp(1.15rem,2vw,1.45rem)] font-bold leading-[1.08] text-[#1c1914] [font-variation-settings:'WONK'_1]">
          Recherche : votre prochain analyste
        </h3>
        <p className="mt-2 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
          The position opens the moment the software is installed. Prior clairvoyance is not
          required; the forecasts are handled in-house.
        </p>
        <ul className="mt-3 space-y-1.5">
          {CLASSIFIED_RECRUIT_QUALS.map((q) => (
            <li key={q} className="flex gap-2 font-serif text-[12px] leading-snug text-[#4a4438]">
              <span aria-hidden className="mt-[7px] h-px w-3 shrink-0 bg-[#1c1914]" />
              {q}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-4">
          <Link
            href="/signup"
            className="group/cta inline-flex items-center gap-2 border-2 border-[#1c1914] bg-[#1c1914] px-4 py-2.5 font-grotesk text-[11px] font-bold uppercase tracking-[0.16em] text-[#f6f1e7] shadow-[3px_3px_0_#bf3415] transition-transform hover:-translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
          >
            S'adresser au bureau
            <ArrowUpRight
              aria-hidden
              className="h-3.5 w-3.5 transition-transform group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5"
            />
          </Link>
          <p className="mt-2.5 font-mono text-[9px] tracking-[0.04em] text-[#857c69]">
            Réf. DN-29 · poste pourvu en 4 min, papiers compris
          </p>
        </div>
        <span className="absolute right-0 top-7 origin-top-right scale-[0.72]">
          <Stamp color={STAMP_GREEN} tilt={-7}>
            Poste ouvert
          </Stamp>
        </span>
      </div>
    </ClassifiedCardShell>
  );
}

/** The standing terms of business — a full-width banner closing the spread. */
function ClassifiedTariffCard() {
  return (
    <ClassifiedCardShell tone="shade" className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="shrink-0">
          <span className="font-grotesk text-[12px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
            Tarif des annonces
          </span>
          <p className="mt-1 font-serif text-[12.5px] italic leading-snug text-[#4a4438]">
            Composed locally by the press in your machine, for an audience of exactly one.
          </p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-px border border-[#1c1914]/25 bg-[#1c1914]/20 lg:grid-cols-4">
          {CLASSIFIED_TARIFF_TERMS.map((t) => (
            <div key={t.term} className="bg-[#e4dac5] px-3 py-2.5">
              <span className="block font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#857c69]">
                {t.term}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] font-bold tabular-nums text-[#1c1914]">
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ClassifiedCardShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.8 — THE LATTICE · cell dispatcher + ruled grid + crop marks
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One grid cell. A real component (never a bare .map() closure) so SettleIn's
 * hooks run legally. The stagger delay is derived from the cell's index in
 * reading order — rows of the lattice surface in small typeset waves.
 */
function ClassifiedCell({ cell, index }: { cell: ClassifiedCellData; index: number }) {
  const span = CLASSIFIED_SPAN_CLASS[("span" in cell && cell.span) || "s"];
  const delay = (index % 4) * 0.05;
  let face: ReactNode;
  switch (cell.kind) {
    case "ad":
      face = <ClassifiedAdCard ad={cell} />;
      break;
    case "display":
      face = <ClassifiedDisplayAd display={cell.display} />;
      break;
    case "notice":
      face = <ClassifiedNoticeCard notice={cell} />;
      break;
    case "recruit":
      face = <ClassifiedRecruitCard />;
      break;
    case "tariff":
      face = <ClassifiedTariffCard />;
      break;
  }
  return (
    <SettleIn delay={delay} y={14} className={`${span} h-full`}>
      {face}
    </SettleIn>
  );
}

/** Printer's crop marks at the corners of the classified forme. */
function ClassifiedCropMarks() {
  const corner = "absolute block h-4 w-4 border-[#1c1914]/40";
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-[14px] hidden lg:block">
      <span className={`${corner} left-0 top-0 border-l border-t`} />
      <span className={`${corner} right-0 top-0 border-r border-t`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

/**
 * The ruled lattice. `gap-px` over an ink-tinted ground draws every interior
 * hairline exactly once; the outer border closes the forme. Dense flow packs
 * agate notices around the display plates.
 */
function ClassifiedGrid() {
  return (
    <div className="relative">
      <ClassifiedCropMarks />
      {/* Compositor's running label in the far margin — wide presses only. */}
      <div aria-hidden className="absolute -left-12 top-1/2 hidden -translate-y-1/2 2xl:block">
        <span className="rotate-180 font-mono text-[10px] uppercase tracking-[0.3em] text-[#857c69] [writing-mode:vertical-rl]">
          Petites annonces · p. 5 · {EDITION.datelineShort}
        </span>
      </div>
      <div className="grid auto-rows-[minmax(8.5rem,auto)] grid-cols-2 grid-flow-dense gap-px border border-[#1c1914]/25 bg-[#1c1914]/15 md:grid-cols-3 xl:grid-cols-4">
        {CLASSIFIED_CELLS.map((cell, i) => (
          <ClassifiedCell key={cell.key} cell={cell} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.9 — PAGE FURNITURE · mast, deck, legend, tariff strip, small print
 * ──────────────────────────────────────────────────────────────────────────── */

/** The page's standing header strip — terms posted above the columns. */
function ClassifiedTariffStrip() {
  return (
    <SettleIn delay={0.15}>
      <div className="flex divide-x divide-[#d6ccb6] border-y-2 border-[#1c1914]">
        <div className="flex-1 px-3 py-2 text-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Tarif — la ligne : <strong className="text-[#1c1914]">0 fr. 00</strong>
          </span>
        </div>
        <div className="hidden flex-1 px-3 py-2 text-center sm:block">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Abonnement — <strong className="text-[#1c1914]">aucun</strong>
          </span>
        </div>
        <div className="hidden flex-1 px-3 py-2 text-center md:block">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Pistage — <strong className="text-[#1c1914]">non pratiqué</strong>
          </span>
        </div>
        <div className="flex-1 px-3 py-2 text-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Renseignements — <strong className="text-[#1c1914]">guichet ⌘K</strong>
          </span>
        </div>
      </div>
    </SettleIn>
  );
}

/** Index of rubriques with dotted leaders — the page's own table of contents. */
function ClassifiedLegend() {
  return (
    <SettleIn delay={0.2}>
      <div className="border border-[#1c1914]/30 bg-[#eee6d6] p-4 sm:p-5">
        <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
          Index des rubriques
        </p>
        <Rule className="mt-2.5" />
        <ul className="mt-3 space-y-3">
          {CLASSIFIED_RUBRIQUE_ORDER.map((key) => (
            <li key={key}>
              <div className="flex items-baseline gap-2">
                <span className="w-4 shrink-0 font-mono text-[10px] font-semibold text-[#bf3415]">
                  {CLASSIFIED_RUBRIQUES[key].numeral}.
                </span>
                <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.08em] text-[#1c1914]">
                  {CLASSIFIED_RUBRIQUES[key].label}
                </span>
                <span aria-hidden className="mx-1 flex-1 border-b border-dotted border-[#857c69]/60" />
                <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                  {CLASSIFIED_RUBRIQUES[key].count} annonces
                </span>
              </div>
              <p className="ml-6 mt-0.5 font-serif text-[11.5px] italic leading-snug text-[#857c69]">
                {CLASSIFIED_RUBRIQUES[key].gloss}
              </p>
            </li>
          ))}
        </ul>
        <Rule className="mt-4" />
        <p className="mt-2.5 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          29 annonces numérotées · 3 avis · 1 poste à pourvoir
        </p>
      </div>
    </SettleIn>
  );
}

/** Mast, deck headline, standfirst and the legend column. */
function ClassifiedHeader() {
  return (
    <div>
      <SectionMast rubrique="Petites annonces — tout ce que la machine sait faire" no="P. 5" />
      <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <DeckReveal
            lines={[
              <span key="l1">Everything the machine does,</span>,
              <span key="l2">
                sold <PenUnderline delay={0.55}>by the line</PenUnderline>.
              </span>,
            ]}
            className="font-serif text-[clamp(2.1rem,4.8vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          />
          <SettleIn delay={0.25} className="mt-6 max-w-2xl">
            <p className="font-serif text-[16.5px] leading-[1.62] text-[#4a4438]">
              Twenty-eight numbered features, three house notices and one situation vacant — the
              complete inventory of the box, set in agate type. No agency took a commission, no
              pixel took a note. The classifieds, like the rest of the paper, keep their distance.
            </p>
          </SettleIn>
          <SettleIn delay={0.35} className="mt-5">
            <p className={T.folio}>
              Paru le {EDITION.dateline} · composition locale · {EDITION.rows} lignes au marbre
            </p>
          </SettleIn>
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <ClassifiedLegend />
          <MarginNote className="mt-5 w-full max-w-[15rem]">
            le lecteur notera qu'aucune de ces annonces ne mène hors de la machine. — l'éd.
          </MarginNote>
        </div>
      </div>
      <div className="mt-10 md:mt-12">
        <ClassifiedTariffStrip />
      </div>
    </div>
  );
}

/**
 * Closing small print — set in two newspaper columns on wider presses, signed
 * by the desk. Doubles as the section's plain-language privacy statement.
 */
function ClassifiedSmallPrint() {
  return (
    <SettleIn className="mt-10 md:mt-12">
      <div className="border-t border-[#d6ccb6] pt-5">
        <p className="gap-8 text-justify font-serif text-[11.5px] leading-[1.7] text-[#857c69] md:columns-2">
          The management reminds readers that every notice on this page describes equipment
          already in the box — nothing is sold separately, nothing expires, and no salesman will
          call, principally because the software has no way of telling anyone you exist. Notices
          are composed by the press in your machine, for an audience of exactly one. Claims of
          speed refer to a mid-range desk machine on an ordinary Tuesday; your Tuesday may vary.
          The classifieds department accepts corrections in the margin, in pencil, as is proper.
          Complaints may be addressed to the editor, who is also the only person able to read
          them — the page does not phone home, and the post-box is yours.
        </p>
        <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#857c69]">
          — Le bureau des petites annonces, {EDITION.city}
        </p>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.10 — SECTION ROOT
 * ──────────────────────────────────────────────────────────────────────────── */

function ClassifiedSection() {
  return (
    <section
      id="capabilities"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 4400px" }}
    >
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-10">
        <ClassifiedHeader />
        <div className="mt-12 md:mt-16">
          <ClassifiedGrid />
        </div>
        <ClassifiedSmallPrint />
        <SettleIn className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className={T.folio}>
              Suite des rubriques en page 6 — le moteur · réclamations :{" "}
              <InkLink href="#faq">courrier des lecteurs, p. 15</InkLink>
            </p>
            <Stamp color={STAMP_GREEN} tilt={4} className="hidden sm:inline-block">
              Lu et approuvé
            </Stamp>
          </div>
          <Rule className="mt-6" />
          <FolioLine
            page="P. 5"
            note="Aucune annonce ne vous suit à la trace."
            className="mt-3"
          />
        </SettleIn>
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 08 — DeskSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §08 — THE DATA DESK · "Le pupitre des données" (p.6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The sports page of The Daily Edition. The DuckDB engine is covered the way
 *  a provincial paper covers an athletics meeting: a giant scoreline, a
 *  box-score table set like league standings, a play-by-play column
 *  transcribed from the engine's own log, the week's results in agate type,
 *  and an equipment list declared to the stewards.
 *
 *  Design intent
 *  ─────────────
 *  • The number IS the headline. "0,18 s" runs at clamp(...,8rem), counted up
 *    in fr-FR figures and circled by the editor's vermilion pen — the one
 *    moment of red ink in the lead.
 *  • The box score reads like standings: hairline rules, mono numerals,
 *    a pace bar per row (time relative to the slowest event), and the record
 *    row stamped RECORD in steward's green. Rows expand — a real <button>
 *    with aria-expanded — to reveal the SQL actually run and a steward note.
 *  • The play-by-play column carries a vertical ink rail whose vermilion fill
 *    tracks scroll (scaleY on a drift progress — pure transform). Each step's
 *    dot inks itself in as the fill passes it.
 *  • Band two sits on deeper paper: the Fig. 2 throughput plate (halftone
 *    InkArea) parallaxes gently; the kit table draws its own tiny glyphs.
 *  • Everything is wall-clock honesty: worst of two passes, witnessed,
 *    machine described in the bench conditions. Auditable speed is the story.
 * ════════════════════════════════════════════════════════════════════════════ */

/** All lucide glyphs share a signature; one alias keeps the data tables tidy. */
type DeskIcon = typeof Timer;

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · the morning card — six events, one stopwatch
 *  Times are wall-clock, worst of two passes, on the bench machine described
 *  in DESK_BENCH below. Sorted like standings: fastest first.
 * ──────────────────────────────────────────────────────────────────────────── */

type DeskScoreRowData = {
  /** lane number, printed as a dossard */
  pos: string;
  /** the event, as announced */
  event: string;
  icon: DeskIcon;
  /** the exact line run on the bench — revealed on expand */
  sql: string;
  /** rows touched by the event, fr-formatted */
  lignes: string;
  /** official wall-clock result */
  temps: string;
  /** milliseconds, for the pace bar (relative to the slowest event) */
  tempsMs: number;
  /** the engine's declared method, checked against the execution plan */
  methode: string;
  /** steward's note — dry, factual, revealed on expand */
  note: string;
  record?: boolean;
};

const DESK_SCORE_ROWS: ReadonlyArray<DeskScoreRowData> = [
  {
    pos: "01",
    event: "Agrégat par canal",
    icon: Sigma,
    sql: "SELECT canal, count(*) AS n, sum(montant) AS total FROM tx GROUP BY canal;",
    lignes: "2 147 380",
    temps: "0,18 s",
    tempsMs: 178,
    methode: "hash agrégé · 8 fils",
    note:
      "Le record du matin. Vérifié deux fois par le chronométreur ; la seconde passe a rendu " +
      "0,179 s — on imprime le pire des deux, par principe de rédaction.",
    record: true,
  },
  {
    pos: "02",
    event: "Percentile p95",
    icon: Percent,
    sql: "SELECT canal, quantile_cont(duree_ms, 0.95) AS p95 FROM tx GROUP BY canal;",
    lignes: "2 147 380",
    temps: "0,31 s",
    tempsMs: 312,
    methode: "tri partiel vectorisé",
    note:
      "Un p95 demande un tri ; le moteur n'en trie qu'un morceau. Le commissaire a inspecté " +
      "la copie au plan d'exécution : rien à signaler.",
  },
  {
    pos: "03",
    event: "Scan complet",
    icon: ScanLine,
    sql: "SELECT min(horodatage), max(horodatage), count(*) FROM tx;",
    lignes: "2 147 380",
    temps: "0,42 s",
    tempsMs: 419,
    methode: "scan vectorisé · zéro index",
    note:
      "Toute la table, sans index, sans excuse. 2 048 valeurs par foulée, huit couloirs, " +
      "et pas une ligne sautée — le greffe a recompté.",
  },
  {
    pos: "04",
    event: "Jointure statuts",
    icon: GitMerge,
    sql: "SELECT s.libelle, count(*) FROM tx t JOIN statuts s USING (code_statut) GROUP BY s.libelle;",
    lignes: "2 147 380 + 42",
    temps: "0,57 s",
    tempsMs: 566,
    methode: "hash join · table compacte",
    note:
      "La table des statuts compte 42 lignes ; elle tient dans une poche de cache. " +
      "Le hash join ne transpire pas, et le commissaire non plus.",
  },
  {
    pos: "05",
    event: "Fenêtre 7 j",
    icon: CalendarRange,
    sql: "SELECT jour, sum(montant) OVER (ORDER BY jour ROWS 6 PRECEDING) FROM tx_jour;",
    lignes: "14 891 224",
    temps: "0,73 s",
    tempsMs: 731,
    methode: "fenêtre glissante",
    note:
      "Sept jours d'historique pris dans une seule fenêtre glissante ; le moteur lit la " +
      "semaine comme une ligne droite. L'épreuve d'endurance du programme.",
  },
  {
    pos: "06",
    event: "Export Excel",
    icon: FileSpreadsheet,
    sql: "COPY (SELECT * FROM rapport_final) TO 'rapport.xlsx' (FORMAT xlsx);",
    lignes: "11 248",
    temps: "1,84 s",
    tempsMs: 1842,
    methode: "copie Arrow → feuille",
    note:
      "L'épreuve la plus lente — il faut bien écrire le fichier. Excel n'a jamais couru " +
      "aussi bien accompagné ; la feuille sort signée et datée.",
  },
];

/** Slowest event on the card — the pace bars are scaled against it. */
const DESK_MAX_MS = 1842;

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · play-by-play — the life of the record query, from the engine's log
 *  Durations sum to 178 ms: parse 2 + plan 1 + scan 161 + agrégation 14.
 * ──────────────────────────────────────────────────────────────────────────── */

type DeskPlayStepData = {
  /** elapsed chrono, mono — the broadcast clock */
  clock: string;
  /** wall time on the bench, for the sticklers */
  wall: string;
  phase: string;
  dur: string;
  /** serif narration — the commentator at the rail */
  text: string;
};

const DESK_PLAY_STEPS: ReadonlyArray<DeskPlayStepData> = [
  {
    clock: "T+0 ms",
    wall: "16:04:07,000",
    phase: "Coup d'envoi — parse",
    dur: "2 ms",
    text:
      "The query files its paperwork at the front desk. Two milliseconds to read the SQL and " +
      "stand the syntax tree at attention — GROUP BY canal, nothing exotic declared.",
  },
  {
    clock: "T+2 ms",
    wall: "16:04:07,002",
    phase: "Tactique — plan",
    dur: "1 ms",
    text:
      "The optimiser reads the field and calls a hash aggregate: six groups expected, no joins, " +
      "no detours. One millisecond to pick the play. It will not be reviewed.",
  },
  {
    clock: "T+3 ms",
    wall: "16:04:07,003",
    phase: "L'épreuve — scan vectorisé",
    dur: "161 ms",
    text:
      "The main event. Eight threads take the column in strides of 2 048 values and " +
      "2 147 380 rows go by without a single index being consulted. The crowd holds its coffee.",
  },
  {
    clock: "T+164 ms",
    wall: "16:04:07,164",
    phase: "Dernière ligne — agrégation",
    dur: "14 ms",
    text:
      "Hash tables merge at the finish line — fourteen milliseconds to settle six channels' " +
      "worth of sums, counts and averages into one small, certain table.",
  },
  {
    clock: "T+178 ms",
    wall: "16:04:07,178",
    phase: "Résultat",
    dur: "—",
    text:
      "Full time. Six rows on the board, 0,178 s on the clock — rounded up to 0,18 against us. " +
      "The analyst sips. The engine, characteristically, says nothing.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · l'équipement — the kit, as declared to the stewards
 * ──────────────────────────────────────────────────────────────────────────── */

type DeskKitGlyphKind = "columns" | "ledger" | "vectors" | "arrow";

type DeskKitItem = {
  /** squad number, printed agate-style */
  dossard: string;
  nom: string;
  /** the speciality, mono — what the piece actually does */
  specialite: string;
  /** the position on the team sheet, sports-page voice */
  poste: string;
  glyph: DeskKitGlyphKind;
  /** one serif line for the programme notes */
  detail: string;
};

const DESK_KIT: ReadonlyArray<DeskKitItem> = [
  {
    dossard: "01",
    nom: "DuckDB",
    specialite: "colonne, vectorisé",
    poste: "titulaire — moteur d'analyse",
    glyph: "columns",
    detail:
      "Runs every event on this page. Embedded in the app's own process — no server was hired, " +
      "consulted, or even told about the meeting.",
  },
  {
    dossard: "02",
    nom: "SQLite",
    specialite: "métadonnées",
    poste: "greffier — registres du club",
    glyph: "ledger",
    detail:
      "Keeps the books: archived reports, signatures, preferences, who-changed-what. " +
      "Reliable the way a registry office is reliable.",
  },
  {
    dossard: "03",
    nom: "LanceDB",
    specialite: "vecteurs",
    poste: "ailier sémantique",
    glyph: "vectors",
    detail:
      "Files the on-board AI's embeddings and finds one sentence among thousands — " +
      "without a network and without an apology.",
  },
  {
    dossard: "04",
    nom: "Arrow",
    specialite: "zéro-copie",
    poste: "passeur — mémoire partagée",
    glyph: "arrow",
    detail:
      "Moves the columns between engine, charts and export without ever touching the ball. " +
      "The assist statistic of the whole operation.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · figures and agate matter
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fig. 2 — read throughput across twelve consecutive passes, M lignes/s.
 *  The dip at passe 8 is real and the caption owns up to it. */
const DESK_THROUGHPUT: ReadonlyArray<number> = [
  3.8, 6.4, 8.9, 10.6, 11.8, 12.7, 13.2, 11.9, 13.8, 14.0, 13.6, 14.2,
];

const DESK_THROUGHPUT_TICKS = ["passe 1", "passe 4", "passe 8", "passe 12"] as const;

type DeskSeasonRow = {
  jour: string;
  lignes: string;
  temps: string;
  /** numeric seconds, feeds the Fig. 3 sparkline */
  spark: number;
  note?: string;
  record?: boolean;
};

/** The week's results — same event, eight mornings, same machine. */
const DESK_SEASON: ReadonlyArray<DeskSeasonRow> = [
  { jour: "jeu 04", lignes: "2 081 112", temps: "0,21 s", spark: 0.21, note: "premier chrono" },
  { jour: "ven 05", lignes: "2 094 561", temps: "0,20 s", spark: 0.2 },
  { jour: "sam 06", lignes: "1 412 008", temps: "0,14 s", spark: 0.14, note: "samedi creux" },
  { jour: "dim 07", lignes: "1 287 441", temps: "0,13 s", spark: 0.13 },
  { jour: "lun 08", lignes: "2 156 902", temps: "0,21 s", spark: 0.21, note: "retour du volume" },
  { jour: "mar 09", lignes: "2 188 437", temps: "0,20 s", spark: 0.2 },
  { jour: "mer 10", lignes: "2 132 859", temps: "0,19 s", spark: 0.19 },
  {
    jour: "jeu 11",
    lignes: "2 147 380",
    temps: "0,18 s",
    spark: 0.18,
    note: "record à volume plein",
    record: true,
  },
];

const DESK_SEASON_SPARK: ReadonlyArray<number> = DESK_SEASON.map((d) => d.spark);

type DeskBenchItem = { icon: DeskIcon; label: string; detail: string };

/** Conditions du banc — homologated. The machine is the point: it is ordinary. */
const DESK_BENCH: ReadonlyArray<DeskBenchItem> = [
  {
    icon: Cpu,
    label: "8 cœurs",
    detail: "un portable de bureau de série, trois ans d'âge, rien d'exotique",
  },
  {
    icon: MemoryStick,
    label: "16 Go",
    detail: "dont quatre réservés au moteur, le reste à l'édition du matin",
  },
  {
    icon: HardDrive,
    label: "SSD NVMe",
    detail: "le fichier est lu sur place — jamais déplacé, jamais téléversé",
  },
  {
    icon: WifiOff,
    label: "réseau coupé",
    detail: "le banc tourne câble débranché, par principe et par contrat",
  },
];

type DeskStatItem = { end: number; unit?: string; label: string; note: string };

/** The three numbers the desk keeps repeating at dinner parties. */
const DESK_STATS: ReadonlyArray<DeskStatItem> = [
  { end: 2048, label: "valeurs par vecteur", note: "la foulée standard du moteur" },
  { end: 8, label: "fils en course", note: "un par cœur — pas un de plus" },
  { end: 0, label: "copie mémoire", note: "Arrow passe la colonne sans la toucher" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  GLYPHS · tiny self-drawing ink marks for the kit table
 *  Each is a 28×28 plate drawn with InkPath so the kit inks itself in on
 *  scroll — the same pen that circles the scoreline, at jeweller's scale.
 * ──────────────────────────────────────────────────────────────────────────── */

/** DuckDB — four columns of unequal height on a baseline: columnar storage. */
function DeskGlyphColumns({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M3 24.5 H25" strokeWidth={1.6} duration={0.4} />
      <InkPath d="M6.5 24 V11" strokeWidth={2.4} delay={0.15} duration={0.35} />
      <InkPath d="M12 24 V5.5" strokeWidth={2.4} delay={0.25} duration={0.35} />
      <InkPath d="M17.5 24 V14" strokeWidth={2.4} delay={0.35} duration={0.35} />
      <InkPath d="M23 24 V8.5" strokeWidth={2.4} delay={0.45} duration={0.35} />
    </svg>
  );
}

/** SQLite — the greffier's ledger: a bound book with ruled entries. */
function DeskGlyphLedger({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M8 4.5 H21.5 V23.5 H8" strokeWidth={1.8} duration={0.5} />
      <InkPath d="M8 4.5 C 5.8 6, 5.8 22, 8 23.5" strokeWidth={1.8} delay={0.2} duration={0.4} />
      <InkPath d="M11.5 10 H18.5" strokeWidth={1.5} delay={0.45} duration={0.25} />
      <InkPath d="M11.5 14 H18.5" strokeWidth={1.5} delay={0.55} duration={0.25} />
      <InkPath d="M11.5 18 H15.5" strokeWidth={1.5} delay={0.65} duration={0.25} />
    </svg>
  );
}

/** LanceDB — three vectors fanning from one origin, heads inked last. */
function DeskGlyphVectors({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M5 23 L19 7 M19 7 l-5.2 0.8 M19 7 l-0.8 5.2" strokeWidth={1.7} duration={0.5} />
      <InkPath
        d="M5 23 L23 14.5 M23 14.5 l-5 -1 M23 14.5 l-2.6 4.4"
        strokeWidth={1.7}
        delay={0.25}
        duration={0.5}
      />
      <InkPath
        d="M5 23 L24 21.5 M24 21.5 l-4.4 -2.6 M24 21.5 l-3.8 3"
        strokeWidth={1.7}
        delay={0.5}
        duration={0.5}
      />
    </svg>
  );
}

/** Arrow — one pass straight through two memory frames; nothing is copied. */
function DeskGlyphArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M9 7.5 H4.5 V20.5 H9" strokeWidth={1.7} duration={0.4} />
      <InkPath d="M19 7.5 H23.5 V20.5 H19" strokeWidth={1.7} delay={0.15} duration={0.4} />
      <InkPath
        d="M2.5 14 H25 M25 14 l-5 -3.6 M25 14 l-5 3.6"
        strokeWidth={1.8}
        delay={0.4}
        duration={0.55}
      />
    </svg>
  );
}

/** Routes a kit row to its glyph — keeps the data table free of JSX. */
function DeskKitGlyph({ kind, className }: { kind: DeskKitGlyphKind; className?: string }) {
  if (kind === "columns") return <DeskGlyphColumns className={className} />;
  if (kind === "ledger") return <DeskGlyphLedger className={className} />;
  if (kind === "vectors") return <DeskGlyphVectors className={className} />;
  return <DeskGlyphArrow className={className} />;
}

/* ────────────────────────────────────────────────────────────────────────────
 *  SCORE BUG · the final-result strip under the mast — TV ticker, set in ink
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskScoreBug() {
  return (
    <SettleIn className="mt-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y-2 border-[#1c1914] px-1 py-2.5">
        <span className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.18em] text-[#1c1914]">
          <Trophy aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
          Résultat final
        </span>
        <span className={`${T.num} text-[12px] font-bold text-[#1c1914]`}>
          MOTEUR COLONNE 6 — FICHIER PLAT 0
        </span>
        <span aria-hidden className="hidden h-1 w-1 bg-[#bf3415] sm:block" />
        <span className={`${T.folio} normal-case`}>six épreuves, six victoires</span>
        <span aria-hidden className="hidden h-1 w-1 bg-[#bf3415] md:block" />
        <span className={`${T.folio} hidden normal-case md:block`}>
          2 147 380 lignes jouées · arbitre : le chronomètre
        </span>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  MATCHUP CARD · "L'affiche du jour" — the fixture box beside the scoreline
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskMatchupCard() {
  return (
    <SettleIn delay={0.15}>
      <div className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[4px_4px_0_#1c1914]">
        <p className={`${T.kicker} text-[#bf3415]`}>L'affiche du jour</p>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="font-serif text-[1.3rem] font-bold leading-none text-[#1c1914]">
            Moteur colonne
          </span>
          <span className={`${T.folio} shrink-0`}>contre</span>
          <span className="text-right font-serif text-[1.3rem] font-bold leading-none text-[#1c1914]">
            Fichier plat
          </span>
        </div>
        <Rule className="my-3.5" />
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>terrain</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>{EDITION.fileName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>effectif</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>2 147 380 lignes · 14 colonnes</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>coup d'envoi</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>16 h 04 — heure du pupitre</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>affluence</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>guichets fermés (un analyste)</dd>
          </div>
        </dl>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  SCORELINE · the lead — 0,18 s in eight-rem serif, circled in red pen
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskScoreline() {
  return (
    <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(260px,330px)]">
      <div>
        <SettleIn>
          <p className="flex flex-wrap items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Timer aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Temps de réponse — 2,1 M de lignes, GROUP BY canal
          </p>
        </SettleIn>
        {/* The scoreline itself. The count-up runs in fr-FR so the decimal
            arrives as a comma; the pen circles it once the figure has landed. */}
        <RiseIn className="mt-2" amount={0.6}>
          <span className="block font-serif text-[clamp(4.2rem,11vw,8rem)] font-bold leading-[0.95] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <PenCircle delay={1.5}>
              <CountUpInk end={0.18} decimals={2} suffix=" s" duration={1.4} />
            </PenCircle>
          </span>
        </RiseIn>
        <SettleIn delay={0.3} className="mt-4 max-w-[52ch]">
          <p className="font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
            — officiel, pire de deux passes. La moyenne fait 0,17 s, mais le pupitre n'imprime pas
            les moyennes : il imprime ce qu'il peut prouver.
          </p>
        </SettleIn>
      </div>
      <DeskMatchupCard />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  BOX SCORE · league standings for six queries
 * ──────────────────────────────────────────────────────────────────────────── */

/** Shared column template — header and rows must agree to the rem. */
const DESK_GRID_COLS =
  "md:grid-cols-[2.5rem_minmax(0,1fr)_7.25rem_5.5rem_11.5rem_2.25rem]";

/** Pace bar — the event's time against the slowest on the card. Width is set
 *  statically (% of track); only scaleX animates, from the start line out. */
function DeskPaceBar({ pct, record }: { pct: number; record?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className="mt-1.5 block h-[3px] w-full max-w-[190px] bg-[#1c1914]/10">
      <motion.span
        className={`block h-full origin-left ${record ? "bg-[#2f6b3f]" : "bg-[#1c1914]/60"}`}
        style={{ width: `${pct}%` }}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.7, ease: EASE_INK }}
      />
    </span>
  );
}

/** One standings row (md and up). A real button toggles the steward's note —
 *  the reveal animates opacity/translate only; layout snaps, as print does. */
function DeskScoreRow({ row, index }: { row: DeskScoreRowData; index: number }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelId = useId();
  const Icon = row.icon;
  const pct = Math.round((row.tempsMs / DESK_MAX_MS) * 100);
  return (
    <SettleIn delay={index * 0.05} y={12} className="border-t border-[#d6ccb6]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.25rem] items-center gap-x-3 px-1 py-3.5 text-left transition-colors hover:bg-[#1c1914]/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#bf3415] ${DESK_GRID_COLS}`}
      >
        <span className={`${T.num} text-[12px] text-[#857c69]`}>{row.pos}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#4a4438]" strokeWidth={2} />
            <span className="font-serif text-[17px] font-semibold leading-tight text-[#1c1914]">
              {row.event}
            </span>
            {row.record && (
              <Stamp color={STAMP_GREEN} tilt={-6} className="text-[9px]">
                Record
              </Stamp>
            )}
          </span>
          <DeskPaceBar pct={pct} record={row.record} />
          {/* On small-mid widths the hidden columns fold into a meta line. */}
          <span className={`${T.folio} mt-1.5 block normal-case md:hidden`}>
            {row.lignes} lignes · {row.methode}
          </span>
        </span>
        <span className={`${T.num} hidden text-right text-[13px] text-[#4a4438] md:block`}>
          {row.lignes}
        </span>
        <span
          className={`${T.num} text-right text-[15px] font-bold ${
            row.record ? "text-[#2f6b3f]" : "text-[#1c1914]"
          }`}
        >
          {row.temps}
        </span>
        <span className="hidden font-grotesk text-[12px] leading-snug text-[#4a4438] md:block">
          {row.methode}
        </span>
        <motion.span
          aria-hidden
          className="justify-self-end text-[#857c69]"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE_INK }}
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE_INK }}
            className="px-1 pb-4 md:pl-[2.5rem]"
          >
            <code
              className={`${T.num} block overflow-x-auto border-l-2 border-[#bf3415] bg-[#eee6d6] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#1c1914]`}
            >
              {row.sql}
            </code>
            <p className="mt-2.5 max-w-[64ch] font-serif text-[14px] italic leading-relaxed text-[#4a4438]">
              <span className={`${T.kicker} mr-2 not-italic text-[#bf3415]`}>
                Note du commissaire
              </span>
              {row.note}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </SettleIn>
  );
}

/** The standings table proper — header rule, six rows, agate legend. */
function DeskBoxScore() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-2.5 font-serif text-[clamp(1.35rem,2.4vw,1.7rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <Trophy aria-hidden className="h-4.5 w-4.5 text-[#bf3415]" strokeWidth={2} />
            Le classement du matin
          </h3>
          <span className={T.folio}>banc d'essai · {EDITION.datelineShort}</span>
        </div>
      </SettleIn>
      <DoubleRule className="mt-3" />
      {/* Column heads — only at md+, where the full grid is visible. */}
      <div
        className={`hidden gap-x-3 px-1 pb-2 pt-3 md:grid ${DESK_GRID_COLS}`}
        aria-hidden
      >
        <span className={T.folio}>№</span>
        <span className={T.folio}>Épreuve</span>
        <span className={`${T.folio} text-right`}>Lignes</span>
        <span className={`${T.folio} text-right`}>Temps</span>
        <span className={T.folio}>Méthode</span>
        <span />
      </div>
      <div role="list" aria-label="Classement des six requêtes du banc d'essai">
        {DESK_SCORE_ROWS.map((row, i) => (
          <div role="listitem" key={row.pos}>
            <DeskScoreRow row={row} index={i} />
          </div>
        ))}
      </div>
      <Rule />
      {/* Agate legend — the small print every honest results page carries. */}
      <SettleIn delay={0.2}>
        <p className={`${T.folio} mt-3 max-w-[78ch] normal-case leading-relaxed`}>
          Lignes — lignes touchées par l'épreuve. Temps — mur, pire de deux passes. Méthode —
          déclaration du moteur, contrôlée au plan d'exécution (EXPLAIN ANALYZE). Record homologué
          par le pupitre. Cliquer une ligne ouvre la copie et la note du commissaire.
        </p>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  PLAY-BY-PLAY · the record query, millisecond by millisecond
 *  A vertical ink rail runs the column; its vermilion fill is a scaleY
 *  transform driven by drift progress, and each step's dot inks itself in
 *  as the fill reaches it. Pure transform/opacity throughout.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where each step sits on the rail's progress window [0.22 → 0.72]. */
function DeskPlayAt(index: number) {
  return 0.22 + (index / (DESK_PLAY_STEPS.length - 1)) * 0.5;
}

/** One commentary entry. Receives the shared progress MotionValue as a prop —
 *  hooks live here, in a real component, never in the map callback. */
function DeskPlayStep({
  step,
  progress,
  at,
  index,
  last,
}: {
  step: DeskPlayStepData;
  progress: MotionValue<number>;
  at: number;
  index: number;
  last: boolean;
}) {
  const reduce = useReducedMotion();
  const reached = useTransform(progress, [at - 0.025, at + 0.015], reduce ? [1, 1] : [0, 1], {
    clamp: true,
  });
  return (
    <div className={`relative pl-9 ${last ? "" : "pb-9"}`}>
      {/* hollow ink dot, then the vermilion fill scales in as the rail passes */}
      <span
        aria-hidden
        className="absolute left-0 top-[3px] h-[13px] w-[13px] rounded-full border-2 border-[#1c1914] bg-[#f6f1e7]"
      />
      <motion.span
        aria-hidden
        className="absolute left-[3px] top-[6px] h-[7px] w-[7px] rounded-full bg-[#bf3415]"
        style={{ scale: reached, opacity: reached }}
      />
      <RiseIn delay={index * 0.05} amount={0.6}>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`${T.num} text-[13px] font-bold text-[#1c1914]`}>{step.clock}</span>
          <span className="font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a4438]">
            {step.phase}
          </span>
          <span
            className={`${T.num} border border-[#d6ccb6] px-1.5 py-px text-[10px] text-[#857c69]`}
          >
            {step.dur}
          </span>
        </p>
      </RiseIn>
      <SettleIn delay={index * 0.05 + 0.1} y={10}>
        <p className="mt-2 max-w-[44ch] font-serif text-[15px] leading-[1.6] text-[#1c1914]">
          {step.text}
        </p>
        <p className={`${T.folio} mt-1.5`}>horloge du banc · {step.wall}</p>
      </SettleIn>
    </div>
  );
}

/** The full column: header, rail, steps, final-time plate, referee note. */
function DeskPlayByPlay() {
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const progress = useDriftProgress(railRef);
  // The fill covers the same window the step thresholds live in, so the last
  // dot inks exactly when the rail completes. Reduced motion: fill stays full.
  const fill = useTransform(progress, [0.22, 0.72], reduce ? [1, 1] : [0, 1], { clamp: true });
  return (
    <aside aria-label="Jeu par jeu — la vie de la requête record">
      <SettleIn>
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#bf3415]">
          <Flag aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />
          Jeu par jeu — épreuve № 01 · agrégat par canal
        </p>
        <p className="mt-3 font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          How a record actually happens, millisecond by millisecond — transcribed from the
          engine's own log, no cuts, no slow motion.
        </p>
      </SettleIn>
      <div ref={railRef} className="relative mt-7">
        {/* the rail: faint ink track behind, vermilion progress in front */}
        <span aria-hidden className="absolute bottom-1 left-[5.5px] top-1 w-px bg-[#1c1914]/25" />
        <motion.span
          aria-hidden
          className="absolute bottom-1 left-[4.5px] top-1 w-[3px] origin-top bg-[#bf3415]"
          style={{ scaleY: fill }}
        />
        {DESK_PLAY_STEPS.map((step, i) => (
          <DeskPlayStep
            key={step.clock}
            step={step}
            progress={progress}
            at={DeskPlayAt(i)}
            index={i}
            last={i === DESK_PLAY_STEPS.length - 1}
          />
        ))}
      </div>
      <SettleIn delay={0.15} className="mt-8">
        <div className="border-2 border-[#1c1914] bg-[#eee6d6] px-4 py-3 shadow-[4px_4px_0_#1c1914]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className={`${T.kicker} text-[#1c1914]`}>Temps final</span>
            <span className={`${T.num} text-[1.35rem] font-bold text-[#1c1914]`}>0,178 s</span>
          </div>
          <p className={`${T.folio} mt-1 normal-case`}>
            homologué — pire de deux passes, arrondi à 0,18 contre nous
          </p>
        </div>
      </SettleIn>
      <SettleIn delay={0.25}>
        <p className={`${T.folio} mt-4 normal-case leading-relaxed`}>
          Transcription du journal du moteur (EXPLAIN ANALYZE), sans coupes ni ralenti. Les
          millisecondes sont celles du banc, pas celles du service marketing.
        </p>
      </SettleIn>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  MI-TEMPS · the half-time rule between the match report and the kit pages
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskMiTemps() {
  return (
    <SettleIn>
      <div className="flex items-center gap-5">
        <Rule className="flex-1" />
        <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#bf3415]" />
        <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.34em] text-[#1c1914]">
          Mi-temps
        </span>
        <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#bf3415]" />
        <Rule className="flex-1" />
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  FIG. 2 · the throughput plate — halftone area chart, gently parallaxed
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskThroughputPlate() {
  return (
    <Parallax speed={26}>
      <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Gauge aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Débit en lecture
          </p>
          <span className={`${T.num} flex items-center gap-1.5 text-[11px] text-[#2f6b3f]`}>
            <Activity aria-hidden className="h-3 w-3" strokeWidth={2.2} />
            pic 14,2 M lignes/s
          </span>
        </div>
        {/* y-scale in agate at left; the plate area takes the rest */}
        <div className="mt-4 flex gap-3">
          <div
            aria-hidden
            className={`${T.folio} flex shrink-0 flex-col justify-between pb-1 text-right`}
          >
            <span>14</span>
            <span>7</span>
            <span>0</span>
          </div>
          <div className="h-44 min-w-0 flex-1">
            <InkArea data={DESK_THROUGHPUT} w={340} h={150} />
          </div>
        </div>
        <div aria-hidden className="mt-2 flex justify-between pl-7">
          {DESK_THROUGHPUT_TICKS.map((tick) => (
            <span key={tick} className={`${T.num} text-[9.5px] text-[#857c69]`}>
              {tick}
            </span>
          ))}
        </div>
        <figcaption className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
          <span className="font-bold not-italic text-[#1c1914]">Fig. 2 — </span>
          Débit en lecture pendant le scan, en millions de lignes par seconde. Douze passes
          consécutives, fichier froid puis chaud ; le creux de la passe 8, c'est l'antivirus qui
          passait dire bonjour.
        </figcaption>
      </figure>
    </Parallax>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  FIG. 3 · le tableau noir — the scan, drawn as a tactics board
 *  The coach's diagram: the column at left is taken in strides of 2 048
 *  values; eight threads run their lanes and converge on one hash aggregate.
 *  The vermilion lane is the one the play-by-play column follows. Every line
 *  draws itself with InkPath — chalk, but in ink.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lane geometry for the tactics board — index math only, fully deterministic. */
const DESK_TACTIC_LANES: ReadonlyArray<{ id: string; y: number; hot: boolean }> = Array.from(
  { length: 8 },
  (_, i) => ({
    id: `fil-${i + 1}`,
    y: 24 + i * 20,
    /** the narrated thread — the same one the play-by-play column follows */
    hot: i === 2,
  }),
);

function DeskTacticsBoard() {
  return (
    <SettleIn>
      <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[4px_4px_0_#1c1914] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <ScanLine aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Le tableau noir
          </p>
          <span className={T.folio}>la tactique du scan vectorisé</span>
        </div>
        <div className="mt-4">
          <svg viewBox="0 0 340 196" className="h-auto w-full" aria-hidden>
            {/* the column itself — one tall block, ruled into 8 strides */}
            <InkPath d="M14 14 H56 V182 H14 Z" strokeWidth={1.8} duration={0.7} />
            {DESK_TACTIC_LANES.map((lane, i) => (
              <InkPath
                key={`chunk-${lane.id}`}
                d={`M14 ${14 + (i + 1) * 21} H56`}
                strokeWidth={0.8}
                stroke={INK_FADED}
                delay={0.3 + i * 0.04}
                duration={0.25}
              />
            ))}
            <text
              x="35"
              y="10"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fill={INK_SOFT}
            >
              la colonne
            </text>
            <text
              x="35"
              y="192"
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill={INK_FADED}
            >
              2 048 / foulée
            </text>
            {/* eight lanes: out of the column, down the straight, into the hash */}
            {DESK_TACTIC_LANES.map((lane, i) => (
              <InkPath
                key={lane.id}
                d={`M58 ${lane.y} H200 L284 98`}
                stroke={lane.hot ? VERMILION : INK}
                strokeWidth={lane.hot ? 2.2 : 1.4}
                delay={0.5 + i * 0.07}
                duration={0.6}
              />
            ))}
            {DESK_TACTIC_LANES.map((lane) => (
              <text
                key={`label-${lane.id}`}
                x="64"
                y={lane.y - 4}
                fontSize="7.5"
                fontFamily="var(--font-mono)"
                fill={lane.hot ? VERMILION : INK_FADED}
              >
                {lane.id.replace("-", " ")}
              </text>
            ))}
            {/* the hash aggregate — where all eight lanes finish */}
            <InkPath d="M286 76 H330 V120 H286 Z" strokeWidth={1.8} delay={1.1} duration={0.5} />
            <text
              x="308"
              y="94"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fontWeight="600"
              fill={INK}
            >
              hash
            </text>
            <text
              x="308"
              y="106"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fill={INK_SOFT}
            >
              agrégé
            </text>
            {/* the result drops out of the bottom of the box: six groups */}
            <InkPath
              d="M308 122 V146 M308 146 l-4 -5 M308 146 l4 -5"
              stroke={VERMILION}
              strokeWidth={1.8}
              delay={1.5}
              duration={0.4}
            />
            <text
              x="308"
              y="160"
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fontWeight="700"
              fill={VERMILION}
            >
              6 groupes
            </text>
          </svg>
        </div>
        <figcaption className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
          <span className="font-bold not-italic text-[#1c1914]">Fig. 3 — </span>
          La tactique au tableau noir : la colonne est prise par foulées de 2 048 valeurs, huit
          fils courent leur couloir et convergent vers le même agrégat de hachage. Le fil en
          rouge est celui que la chronique suit au jeu par jeu.
        </figcaption>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  PRESS BOX · rumours and tomorrow's programme — the sports page's small talk
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskPressBox() {
  return (
    <div className="space-y-6">
      <SettleIn>
        <div className="border border-[#1c1914] p-4">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Megaphone aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Rumeurs de mercato
          </p>
          <p className="mt-2.5 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
            On prête au pupitre l'envie d'un moteur GPU pour la saison prochaine. Le banc dément :
            pas de mercato. La machine de série tient le chrono, et le contrat interdit les
            transferts de données — dans les deux sens.
          </p>
        </div>
      </SettleIn>
      <SettleIn delay={0.12}>
        <div className="border border-[#1c1914] p-4">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <CalendarClock aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Le programme de demain
          </p>
          <p className="mt-2.5 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
            Mêmes six épreuves, nouveau fichier au guichet. DailyTransactions_2026-06-12.csv est
            attendu autour de 2,2 M de lignes. Le moteur est déjà échauffé ; à vrai dire, il n'a
            jamais cessé de l'être.
          </p>
          <div className="mt-3 border-t border-[#d6ccb6] pt-2.5">
            <p className={`${T.num} text-[11px] leading-relaxed text-[#4a4438]`}>
              06 h 00 — dépôt du CSV au greffe
              <br />
              06 h 01 — six épreuves, rapport pressé
              <br />
              06 h 02 — le chronométreur retourne à son café
            </p>
          </div>
        </div>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  L'ÉQUIPEMENT · the kit table — four pieces, four self-drawing glyphs
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskKitRow({ item, index }: { item: DeskKitItem; index: number }) {
  return (
    <SettleIn delay={index * 0.07} y={12} className="border-t border-[#d6ccb6]">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-4 py-4">
        <span className="flex h-11 w-11 items-center justify-center border border-[#1c1914] bg-[#f6f1e7]">
          <DeskKitGlyph kind={item.glyph} className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-serif text-[17px] font-bold leading-tight text-[#1c1914]">
              {item.nom}
            </span>
            <span
              className={`${T.num} border border-[#d6ccb6] bg-[#f6f1e7] px-1.5 py-px text-[10px] text-[#4a4438]`}
            >
              {item.specialite}
            </span>
          </p>
          <p className="mt-0.5 font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#857c69]">
            {item.poste}
          </p>
          <p className="mt-1.5 max-w-[58ch] font-serif text-[14px] leading-relaxed text-[#4a4438]">
            {item.detail}
          </p>
        </div>
        <span
          aria-hidden
          className={`${T.num} pt-1 text-[1.6rem] font-bold leading-none text-[#1c1914]/15`}
        >
          {item.dossard}
        </span>
      </div>
    </SettleIn>
  );
}

function DeskKitTable() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-2.5 font-serif text-[clamp(1.35rem,2.4vw,1.7rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <Database aria-hidden className="h-4.5 w-4.5 text-[#bf3415]" strokeWidth={2} />
            L'équipement
          </h3>
          <span className={T.folio}>feuille de match · 4 pièces</span>
        </div>
        <p className="mt-3 max-w-[60ch] font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          The kit, as declared to the stewards. Everything embedded in the app's own process;
          nothing dials out, nothing phones home, nothing needs installing twice.
        </p>
      </SettleIn>
      <div className="mt-5">
        {DESK_KIT.map((item, i) => (
          <DeskKitRow key={item.dossard} item={item} index={i} />
        ))}
      </div>
      <Rule />
      <SettleIn delay={0.2} className="mt-4">
        <InkLink href="#capabilities">La feuille de match complète — l'index des capacités</InkLink>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  STAT TRIO · three figures the desk repeats at dinner parties
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskStatTrio() {
  return (
    <div className="grid gap-px bg-[#d6ccb6] border border-[#d6ccb6] sm:grid-cols-3">
      {DESK_STATS.map((stat, i) => (
        <SettleIn key={stat.label} delay={i * 0.08} className="bg-[#eee6d6] px-5 py-5">
          <span className="block text-[2.4rem] font-bold leading-none text-[#1c1914]">
            <CountUpInk end={stat.end} duration={1.1 + i * 0.2} />
          </span>
          <span className={`${T.kicker} mt-2 block`}>{stat.label}</span>
          <span className="mt-1 block font-serif text-[13px] italic leading-snug text-[#4a4438]">
            {stat.note}
          </span>
        </SettleIn>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  LA SAISON · the week's results in agate, with the Fig. 3 sparkline
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskSeasonRowLine({ row, index }: { row: DeskSeasonRow; index: number }) {
  return (
    <SettleIn delay={index * 0.04} y={8}>
      <div
        className={`flex items-baseline justify-between gap-3 border-t border-[#d6ccb6] py-2 ${
          row.record ? "text-[#2f6b3f]" : "text-[#1c1914]"
        }`}
      >
        <span className={`${T.num} w-14 shrink-0 text-[12px] font-semibold`}>{row.jour}</span>
        <span className={`${T.num} hidden text-[12px] text-[#4a4438] sm:block`}>
          {row.lignes} lignes
        </span>
        <span className={`${T.folio} hidden min-w-0 flex-1 truncate text-right normal-case lg:block`}>
          {row.note ?? "—"}
        </span>
        <span className={`${T.num} flex w-20 shrink-0 items-center justify-end gap-1.5 text-[13px] font-bold`}>
          {row.record && <Medal aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />}
          {row.temps}
        </span>
      </div>
    </SettleIn>
  );
}

function DeskSeasonAgate() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <SettleIn>
          <p className={T.kicker}>Les résultats de la semaine</p>
          <p className="mt-2 font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
            Même épreuve, huit matins, même machine. Le chrono ne s'entraîne pas ; le cache, si.
          </p>
        </SettleIn>
        <div className="mt-4">
          {DESK_SEASON.map((row, i) => (
            <DeskSeasonRowLine key={row.jour} row={row} index={i} />
          ))}
          <Rule />
        </div>
      </div>
      <SettleIn delay={0.15}>
        <figure className="border border-[#1c1914] bg-[#f6f1e7] p-5">
          <div className="h-28">
            <InkLine
              data={DESK_SEASON_SPARK}
              w={300}
              h={96}
              markIndex={DESK_SEASON.length - 1}
            />
          </div>
          <div aria-hidden className="mt-1.5 flex justify-between">
            <span className={`${T.num} text-[9.5px] text-[#857c69]`}>jeu 04</span>
            <span className={`${T.num} text-[9.5px] text-[#857c69]`}>dim 07</span>
            <span className={`${T.num} text-[9.5px] text-[#857c69]`}>jeu 11</span>
          </div>
          <figcaption className="mt-3 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
            <span className="font-bold not-italic text-[#1c1914]">Fig. 3 — </span>
            Le chrono de la semaine. La courbe plonge le week-end parce que le trafic dort aussi ;
            le point cerclé est le record du jeudi, à volume plein.
          </figcaption>
        </figure>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  CONDITIONS DU BANC · the homologated machine — ordinary on purpose
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskBenchNotes() {
  return (
    <div>
      <SettleIn>
        <p className={T.kicker}>Conditions du banc — homologuées</p>
        <p className="mt-2 max-w-[58ch] font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          The machine is the point: it is ordinary. Any desk in the building could have run this
          meeting, and tomorrow one of them will.
        </p>
      </SettleIn>
      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {DESK_BENCH.map((item, i) => (
          <SettleIn key={item.label} delay={i * 0.06} y={10}>
            <DeskBenchItemLine item={item} />
          </SettleIn>
        ))}
      </div>
    </div>
  );
}

/** One bench line — icon plate, mono label, serif detail. Split out so the
 *  map body stays hook-free and the markup stays in one place. */
function DeskBenchItemLine({ item }: { item: DeskBenchItem }) {
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3.5 border-t border-[#d6ccb6] pt-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#1c1914]">
        <Icon aria-hidden className="h-4 w-4 text-[#1c1914]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className={`${T.num} block text-[13px] font-bold text-[#1c1914]`}>{item.label}</span>
        <span className="mt-0.5 block font-serif text-[13.5px] leading-snug text-[#4a4438]">
          {item.detail}
        </span>
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  RECTIFICATIF · the corrections box every honest sports page owes its readers
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskCorrections() {
  return (
    <SettleIn delay={0.1}>
      <div className="border border-[#1c1914] p-4">
        <p className={`${T.kicker} text-[#bf3415]`}>Rectificatif</p>
        <p className="mt-2 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
          Une lectrice nous écrit que 0,18 s est « trop rapide pour être honnête ». Le banc a
          rejoué l'épreuve devant témoin : 0,179 s. Nous présentons nos excuses pour le millième —
          et au chronométreur, qui avait raison, comme toujours.
        </p>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  THE SECTION · composition in reading order
 *  Band 1 (paper): mast → score bug → headline → scoreline → standings +
 *  play-by-play. Band 2 (deep paper): Fig. 2 + kit + stat trio. Band 3
 *  (paper): season agate + bench + rectificatif → pull quote → folio.
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskSection() {
  return (
    <section
      id="desk"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 5600px" }}
    >
      {/* ── Band 1 · the match report ─────────────────────────────────────── */}
      <div className="mx-auto max-w-[1280px] px-5 pb-20 pt-24 sm:px-8 lg:px-12">
        <SectionMast rubrique="Le pupitre des données" no="p.6" />
        <DeskScoreBug />

        {/* headline + standfirst, with the margin note hung off the right */}
        <div className="mt-12 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_11rem]">
          <div>
            <DeckReveal
              className="max-w-[22ch]"
              lineClassName="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              lines={[
                <span key="l1">Six events, one stopwatch —</span>,
                <span key="l2">
                  the column engine <PenUnderline delay={0.8}>sweeps the card</PenUnderline>
                </span>,
              ]}
            />
            <SettleIn delay={0.25} className="mt-6">
              <Byline
                name="Par le chronométreur du pupitre"
                desk="Banc d'essai · rubrique moteurs"
              />
            </SettleIn>
            <div className="mt-7 max-w-[68ch] space-y-5">
              <DropCapParagraph>
                Every morning, before the edition goes to press, the desk runs the same six events
                on the same unremarkable laptop: one full scan, one aggregate, one join, one
                window, one percentile, one export. No warm-up laps on a server farm, no
                qualifying heats in a cloud region — the file stays on the desk and the engine
                comes to it. The times printed below are wall-clock, worst of two passes,
                witnessed.
              </DropCapParagraph>
              <p className={T.body}>
                The engine is DuckDB, set in a column and run in-process — the same binary that
                ships inside Data Navigator. The stopwatch is the operating system's. The crowd is
                one analyst with coffee. Nobody has ever asked the data to travel for this, and
                the data has never been faster for staying home.
              </p>
            </div>
          </div>
          <div className="hidden lg:block lg:pt-24">
            <MarginNote>
              même machine que la comptabilité — aucun serveur n'a été dérangé
            </MarginNote>
          </div>
        </div>

        {/* the scoreline lead — the page's one big red-pen moment */}
        <div className="mt-16">
          <DeskScoreline />
        </div>

        {/* standings + play-by-play, separated by a newspaper column rule */}
        <div className="mt-20 grid gap-y-16 lg:grid-cols-12 lg:gap-x-0">
          <div className="lg:col-span-7 lg:pr-10">
            <DeskBoxScore />
          </div>
          <div className="lg:col-span-5 lg:border-l lg:border-[#d6ccb6] lg:pl-10">
            <DeskPlayByPlay />
          </div>
        </div>

        <div className="mt-20">
          <DeskMiTemps />
        </div>
      </div>

      {/* ── Band 2 · the technical pages, on deeper paper ─────────────────── */}
      <div className="border-y border-[#d6ccb6] bg-[#eee6d6]">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-8 lg:px-12">
          <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-14">
            <div className="lg:col-span-5">
              <DeskThroughputPlate />
            </div>
            <div className="lg:col-span-7">
              <DeskKitTable />
            </div>
          </div>
          <div className="mt-16">
            <DeskStatTrio />
          </div>
        </div>
      </div>

      {/* ── Band 3 · agate matter, bench conditions, the closing word ─────── */}
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-20 sm:px-8 lg:px-12">
        <DeskSeasonAgate />
        <div className="mt-16 grid gap-y-10 lg:grid-cols-12 lg:gap-x-14">
          <div className="lg:col-span-7">
            <DeskBenchNotes />
          </div>
          <div className="lg:col-span-5 lg:pt-9">
            <DeskCorrections />
          </div>
        </div>

        <div className="mt-20 max-w-[46rem]">
          <PullQuote cite="le chef du banc d'essai, carnet de juin">
            Desktop speed is a feature you can audit.
          </PullQuote>
        </div>

        <FolioLine
          className="mt-16 border-t border-[#d6ccb6] pt-4"
          page="p.6"
          note="Pupitre des données · banc d'essai du matin"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 09 — BureauSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §9 — BUREAU · L'ENTRETIEN — NOTRE CORRESPONDANT LOCAL                  p. 7
 *  ────────────────────────────────────────────────────────────────────────────
 *  The embedded offline AI, covered the only way a newspaper knows how: with
 *  an interview. The subject is "le correspondant local" — a language model
 *  that lives in a worker process next to DuckDB, reads the day's two million
 *  transactions, and writes the morning briefing without ever touching a wire.
 *
 *  Design intent
 *  ─────────────
 *  • Print grammar of the interview page: bold grotesk "Q —" questions, serif
 *    answers behind a hairline gutter rule, a halftone portrait plate where
 *    the photograph would be (the subject refused — no camera, no network),
 *    a "FICHE TECHNIQUE" sidebar interrupting the transcript exactly the way
 *    a broadsheet drops a spec box mid-article.
 *  • Motion: TypeOn sets the first answer like hot type; later answers rise
 *    from their clip lines; the press badge parallax-rotates over the
 *    portrait; timing bars and matrix cells grow with transform-only scales.
 *    Everything respects prefers-reduced-motion.
 *  • Vermilion is the editor's pen, spent only where it earns its keep: the
 *    press badge, two stamps, one anomalous matrix cell, one struck-out
 *    "API key", and the correspondent's own 2,4 s of writing time.
 *  • Copy: English editorial voice asking, the subject answering in the
 *    bilingual shorthand of the newsroom it serves. Organic numbers
 *    throughout (2 147 380 · 91,2 % · 9,4 s · 16 h 04).
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.1 — COPY & DATA · the transcript, the morning matrix, the spec sheet
 *  All values are deterministic editorial data — no Math.random, no Date.
 * ──────────────────────────────────────────────────────────────────────────── */

type BureauQAFigure = "matrix" | "timing" | "findings";

type BureauQAItem = {
  /** running number printed in the question gutter — "01 / 05" */
  no: string;
  /** bold grotesk question, FR/EN mixed exactly as asked in the room */
  question: string;
  /** quoted opening of the answer; the first one is set by TypeOn */
  lead: string;
  /** follow-up paragraphs, serif, each with a stable key for React */
  rest: ReadonlyArray<{ id: string; body: ReactNode }>;
  /** optional figure plate printed under the answer */
  figure?: BureauQAFigure;
  /** optional rubber stamp slammed under the lead quote */
  stamp?: string;
  /** optional pencilled note floated into the outer margin on large screens */
  margin?: ReactNode;
};

/** The transcript. Five questions; the subject never left its post. */
const BUREAU_INTERVIEW: ReadonlyArray<BureauQAItem> = [
  {
    no: "01 / 05",
    question: "Where do you live, exactly?",
    lead: "Dans le processus de travail, à côté de DuckDB. Pas de datacenter.",
    margin: "Il a prononcé « datacenter » comme on parle d'un lointain cousin, jamais rencontré.",
    rest: [
      {
        id: "voisinage",
        body: (
          <>
            A worker process, third door on the left. DuckDB keeps the ledgers next door — we share
            a wall and a memory budget, and neither of us has ever seen a datacenter from the
            inside. The rent is a few gigaoctets; the landlord is your task manager.{" "}
            <em>Il peut me mettre dehors d'un clic. Je pars sans faire d'histoires</em> — and I am
            back at the next démarrage, coat still on the hook.
          </>
        ),
      },
      {
        id: "adresse",
        body: (
          <>
            No street address beyond that. There is no region to select, no availability zone,{" "}
            <em>aucun contrat de niveau de service</em>. The availability zone is your desk, and it
            is remarkably available.
          </>
        ),
      },
    ],
  },
  {
    no: "02 / 05",
    question: "Que lisez-vous le matin ?",
    lead: "Les KPI du jour, avant le café. La matrice canal × région, en entier.",
    figure: "matrix",
    rest: [
      {
        id: "journal",
        body: (
          <>
            Two million rows is a normal morning paper here —{" "}
            <span className="font-mono text-[0.92em] tabular-nums">2 147 380</span> hier, pour être
            exact. DuckDB hands me the agrégats the way one hands over a revue de presse: réussite
            par canal, volumes par région, latences qui s'égarent. I read for the line that does not
            sit straight.
          </>
        ),
      },
      {
        id: "matrice",
        body: (
          <>
            The matrix below is this morning's reading, printed as received. One cell refused to sit
            straight. <em>J'y reviendrai.</em>
          </>
        ),
      },
    ],
  },
  {
    no: "03 / 05",
    question: "What is it you never do?",
    lead: "Téléphoner. Le réseau, ce n'est pas mon rayon.",
    stamp: "0 octet sortant",
    rest: [
      {
        id: "rayon",
        body: (
          <>
            No calls out, no callbacks, no quiet little sync with a server at{" "}
            <span className="font-mono text-[0.92em] tabular-nums">3 h</span> du matin. My beat is
            the desk: I read what is on it and I say what it means. Anything that needs a wire is
            someone else's rubrique — and <em>entre nous</em>, ce bureau se porte très bien sans
            téléphone.
          </>
        ),
      },
    ],
  },
  {
    no: "04 / 05",
    question: "How fast are you, honestly?",
    lead: "Le briefing du matin sort en 9,4 secondes. Chronométré par des gens méfiants, deux fois.",
    figure: "timing",
    margin:
      "Les 6 s de démarrage ? « Le temps d'accrocher mon manteau. » Nous n'avons pas vu de manteau.",
    rest: [
      {
        id: "chrono",
        body: (
          <>
            The cold start costs <span className="font-mono text-[0.92em] tabular-nums">6 s</span> —
            the time it takes to hang up my coat. After that I am at my desk, and the chronometer
            below is public. La rédaction proprement dite — ma part — tient en{" "}
            <span className="font-mono text-[0.92em] tabular-nums">2,4 s</span>. Le reste, c'est la
            mécanique du journal.
          </>
        ),
      },
    ],
  },
  {
    no: "05 / 05",
    question: "Et qu'avez-vous trouvé aujourd'hui ?",
    lead: "Trois choses. Une seule mérite la une.",
    figure: "findings",
    rest: [
      {
        id: "carnet",
        body: (
          <>
            Le carnet du jour, tel quel. The first entry went to the front page before this
            interview was over — <em>un correspondant n'attend pas qu'on le félicite.</em>
          </>
        ),
      },
    ],
  },
];

/** Column heads of the morning matrix — French region codes, newsroom style. */
const BUREAU_MATRIX_REGIONS = ["TUN", "SFX", "SOU", "BIZ", "GAB", "KAI"] as const;

type BureauMatrixRow = {
  canal: string;
  /** réussite (%) per region, in BUREAU_MATRIX_REGIONS order */
  cells: ReadonlyArray<number>;
  /** row mean, pre-typeset with the French comma */
  moy: string;
  /** index of the cell the editor circled — the day's anomaly */
  hot?: number;
};

/**
 * Réussite (%) par canal × région — the correspondent's morning reading.
 * SMS × SFX is the story: 91,2 % against a 97,4 % day average (− 6,2 pts),
 * which is exactly the investigation running in the Lead section (#lead).
 */
const BUREAU_MATRIX_ROWS: ReadonlyArray<BureauMatrixRow> = [
  { canal: "Voix", cells: [97.8, 96.9, 97.2, 96.4, 95.8, 96.1], moy: "96,7" },
  { canal: "SMS", cells: [98.1, 91.2, 97.6, 97.0, 96.3, 96.8], moy: "96,2", hot: 1 },
  { canal: "Données", cells: [96.2, 95.7, 96.0, 94.9, 94.1, 95.3], moy: "95,4" },
  { canal: "USSD", cells: [99.0, 98.4, 98.7, 97.9, 98.1, 98.5], moy: "98,4" },
  { canal: "Recharge", cells: [97.5, 96.8, 97.1, 96.2, 95.9, 96.6], moy: "96,7" },
];

type BureauTimingRowData = {
  id: string;
  label: string;
  /** seconds, summing to 9,4 */
  s: number;
  note: string;
  /** the correspondent's own share — printed in vermilion */
  hot?: boolean;
};

/** The public chronometer: from CSV on the desk to a finished briefing. */
const BUREAU_TIMING: ReadonlyArray<BureauTimingRowData> = [
  { id: "lecture", label: "lecture du CSV", s: 1.8, note: "2,1 M de lignes, flux direct" },
  { id: "agregats", label: "agrégats DuckDB", s: 2.6, note: "matrices canal × région" },
  { id: "anomalies", label: "détection d'anomalies", s: 1.7, note: "seuils + saisonnalité" },
  {
    id: "redaction",
    label: "rédaction du briefing",
    s: 2.4,
    note: "inférence locale, Q4",
    hot: true,
  },
  { id: "mise-en-page", label: "mise en page", s: 0.9, note: "gabarit du matin" },
];

/** Total of the chronometer, kept as one constant so copy and figure agree. */
const BUREAU_TIMING_TOTAL = 9.4;

type BureauSpecRow = { k: string; v: string; mark?: string };
type BureauSpecGroup = {
  id: string;
  group: string;
  icon: ReactNode;
  rows: ReadonlyArray<BureauSpecRow>;
};

/**
 * FICHE TECHNIQUE — the spec box a broadsheet would drop mid-interview.
 * Grouped the way the production desk thinks: engine, model, machine, network.
 */
const BUREAU_FICHE: ReadonlyArray<BureauSpecGroup> = [
  {
    id: "moteur",
    group: "Moteur",
    icon: <Cpu aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Inférence navigateur", v: "WebLLM · WASM" },
      { k: "Inférence bureau", v: "llama.cpp natif, via Node" },
      { k: "Accélération", v: "WebGPU, sinon CPU", mark: "‡" },
    ],
  },
  {
    id: "modele",
    group: "Modèle",
    icon: <Binary aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Quantisation", v: "Q4_K_M" },
      { k: "Contexte", v: "8 192 jetons" },
      { k: "Poids", v: "embarqués à l'installation" },
    ],
  },
  {
    id: "machine",
    group: "Machine",
    icon: <MemoryStick aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Mémoire", v: "4–8 Go de RAM" },
      { k: "Démarrage à froid", v: "6 s", mark: "†" },
      { k: "Processeur", v: "4 cœurs suffisent" },
    ],
  },
  {
    id: "reseau",
    group: "Réseau",
    icon: <WifiOff aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Connexion requise", v: "aucune" },
      { k: "Télémétrie", v: "aucune" },
      { k: "Clé d'API", v: "aucune — voir rectificatif" },
    ],
  },
];

type BureauFinding = {
  id: string;
  /** dateline-style place: canal × région */
  place: string;
  /** the measured fact, with figures kept in mono */
  fact: ReactNode;
  /** the correspondent's one-line verdict */
  verdict: string;
  /** the entry that became the front page */
  toLead?: boolean;
};

/** Le carnet du jour — three entries, one of them already on page one. */
const BUREAU_FINDINGS: ReadonlyArray<BureauFinding> = [
  {
    id: "sms-sfax",
    place: "SMS × Sfax",
    fact: (
      <>
        réussite <span className="font-mono tabular-nums">91,2 %</span>, soit{" "}
        <span className="font-mono tabular-nums">− 6,2</span> points sous la moyenne du jour
      </>
    ),
    verdict: "C'est la une. L'enquête complète est en première page.",
    toLead: true,
  },
  {
    id: "recharge-pic",
    place: "Recharge",
    fact: (
      <>
        pic à <span className="font-mono tabular-nums">16 h 04</span>,{" "}
        <span className="font-mono tabular-nums">+ 38 %</span> sur une heure
      </>
    ),
    verdict:
      "Une promotion, pas une panne. J'ai vérifié les deux hypothèses avant d'écrire la phrase.",
  },
  {
    id: "ussd-bizerte",
    place: "USSD × Bizerte",
    fact: (
      <>
        latence médiane <span className="font-mono tabular-nums">2,1 s</span>, en hausse pour le
        troisième jour
      </>
    ),
    verdict: "Pas encore un article. Une fiche à suivre, datée pour demain matin.",
  },
];

type BureauCardRow = { id: string; k: string; v: string; icon?: ReactNode };

/** The press credential pinned under the portrait — every field verifiable. */
const BUREAU_PRESS_ROWS: ReadonlyArray<BureauCardRow> = [
  { id: "nom", k: "Nom", v: "Le correspondant local" },
  { id: "employeur", k: "Employeur", v: "Data Navigator" },
  { id: "desk", k: "Desk", v: "Bureau de l'intelligence" },
  { id: "rayon", k: "Rayon", v: "vos données, rien d'autre" },
  {
    id: "telephone",
    k: "Téléphone",
    v: "aucun",
    icon: <PhoneOff aria-hidden className="h-3 w-3 text-[#bf3415]" strokeWidth={2.4} />,
  },
  { id: "adresse", k: "Adresse", v: "processus local, à côté de DuckDB" },
  { id: "validite", k: "Validité", v: "tant que le processus tourne" },
];

/** "Le sujet en bref" — the little biography box every interview page runs. */
const BUREAU_BIO: ReadonlyArray<BureauCardRow> = [
  { id: "ne", k: "Né", v: "à l'installation, sur votre machine" },
  { id: "domicile", k: "Domicile", v: "un processus de travail, porte 7" },
  { id: "voisin", k: "Voisin de palier", v: "DuckDB, mur mitoyen" },
  { id: "specialite", k: "Spécialité", v: "le briefing du matin, 9,4 s" },
  { id: "langues", k: "Langues", v: "SQL courant · français des données" },
  { id: "signe", k: "Signe particulier", v: "ne décroche jamais" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.2 — THE PORTRAIT PLATE · halftone where the photograph would be
 *  The subject refused to be photographed ("pas d'appareil, pas de réseau,
 *  pas de portrait"), so the art desk screened one in ink: a deterministic
 *  halftone of a figure in a press fedora, dot by dot, no negative involved.
 * ──────────────────────────────────────────────────────────────────────────── */

const BUREAU_PORTRAIT_W = 220;
const BUREAU_PORTRAIT_H = 264;

type BureauDot = { x: number; y: number; r: number; hot: boolean };

/**
 * Generates the halftone screen. Brightness is composed from a handful of
 * ellipses (fedora crown and brim, head, collar knot, overcoat shoulders, the
 * lighter press card on the lapel) plus a sin-based paper grain — entirely
 * deterministic, per contract rule 13. One dot near the lapel goes vermilion:
 * the badge pin.
 */
function BureauHalftone(): ReadonlyArray<BureauDot> {
  const cols = 24;
  const rows = 29;
  const within = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const out: Array<BureauDot> = [];
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = 12 + (ix / (cols - 1)) * (BUREAU_PORTRAIT_W - 24);
      const y = 12 + (iy / (rows - 1)) * (BUREAU_PORTRAIT_H - 24);
      let v = 0.1; // bare paper
      if (within(x, y, 110, 106, 40, 46)) v = 0.55; // head
      if (within(x, y, 110, 64, 36, 18)) v = 0.85; // fedora crown
      if (within(x, y, 110, 82, 58, 8)) v = 0.92; // fedora brim
      if (within(x, y, 110, 238, 74, 58)) v = Math.max(v, 0.62); // overcoat
      if (within(x, y, 110, 168, 12, 16)) v = Math.max(v, 0.82); // collar knot
      if (within(x, y, 140, 212, 13, 15)) v = 0.24; // press card on the lapel
      const grain = Math.sin(ix * 2.7 + iy * 1.3) * 0.06 + Math.sin((ix + iy) * 0.9) * 0.04;
      v = Math.min(1, Math.max(0, v + grain));
      // open the screen on bare paper — every other dot drops out
      if (v < 0.14 && (ix + iy) % 2 === 1) continue;
      const hot = Math.abs(x - 140) < 5 && Math.abs(y - 199) < 6; // the badge pin
      out.push({ x, y, r: 0.7 + v * 2.9, hot });
    }
  }
  return out;
}

/** The vermilion credential clipped over the portrait's corner. */
function BureauPressBadge() {
  return (
    <div className="relative rotate-2">
      <Paperclip
        aria-hidden
        className="absolute -top-4 left-1/2 h-7 w-7 -translate-x-1/2 rotate-[14deg] text-[#1c1914]"
        strokeWidth={2.1}
      />
      <div className="border-2 border-[#1c1914] bg-[#bf3415] px-3 pb-1.5 pt-2 text-center shadow-[3px_3px_0_#1c1914]">
        <div className="font-grotesk text-[17px] font-black uppercase leading-none tracking-[0.2em] text-[#f6f1e7]">
          Presse
        </div>
        <div className="mt-1 border-t border-[#f6f1e7]/40 pt-1 font-mono text-[8.5px] uppercase tracking-[0.34em] text-[#f6f1e7]">
          Local
        </div>
      </div>
    </div>
  );
}

/**
 * The full portrait plate: halftone figure, hairline frame, screen-ruling
 * caption inside the plate, press badge parallax-clipped over the corner
 * (rotate 3 across the scroll transit), and the art desk's apology below.
 */
function BureauPortrait() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // The ~600-circle screen mounts only once the plate approaches the viewport.
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const dots = useMemo(() => BureauHalftone(), []);
  return (
    <figure>
      <div
        ref={ref}
        className="relative border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]"
      >
        <svg
          viewBox={`0 0 ${BUREAU_PORTRAIT_W} ${BUREAU_PORTRAIT_H}`}
          className="block h-auto w-full"
          aria-hidden
        >
          <rect
            x="6"
            y="6"
            width={BUREAU_PORTRAIT_W - 12}
            height={BUREAU_PORTRAIT_H - 12}
            fill="none"
            stroke={RULE}
            strokeWidth="1"
          />
          {inView && (
            <motion.g
              initial={reduce ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              {dots.map((d) => (
                <circle
                  key={`${d.x.toFixed(1)}-${d.y.toFixed(1)}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.hot ? 2.7 : d.r}
                  fill={d.hot ? VERMILION : INK}
                  fillOpacity={d.hot ? 1 : 0.9}
                />
              ))}
            </motion.g>
          )}
          {/* screen-ruling note, set inside the plate like a process mark */}
          <text
            x={BUREAU_PORTRAIT_W - 12}
            y={BUREAU_PORTRAIT_H - 12}
            textAnchor="end"
            fontSize="6.5"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            TRAME 65 LPI — ENCRE LOCALE
          </text>
        </svg>
        {/* the credential, clipped on and drifting 3° across the transit */}
        <Parallax speed={9} rotate={3} className="absolute -right-3 top-6 z-10 w-[6.8rem]">
          <BureauPressBadge />
        </Parallax>
      </div>
      <figcaption className="mt-3 space-y-1.5">
        <p className="font-serif text-[13.5px] italic leading-snug text-[#4a4438]">
          Le correspondant, à son poste. Il a refusé la photographie — « pas d'appareil, pas de
          réseau, pas de portrait ». La rédaction a donc composé cette trame, point par point, à
          l'encre locale.
        </p>
        <p className={T.folio}>Planche n° 7 · trame d'imprimerie · négatif : aucun</p>
      </figcaption>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.3 — RAIL PLATES · press credential, rectificatif, marginalia
 *  The left rail carries the page furniture an interview spread would run
 *  beside the photograph: the card, the correction box, the pull quote.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The press card — newsroom paperwork for a reporter without a phone. */
function BureauPressCard({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="relative border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#1c1914] bg-[#1c1914] px-4 py-2">
          <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.28em] text-[#f6f1e7]">
            Carte de presse
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[#f6f1e7]/70">№ 000 001</span>
        </div>
        {/* lanyard punch — the one legitimate rounded-full on this card */}
        <span
          aria-hidden
          className="absolute left-1/2 top-[42px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[#857c69] bg-[#f6f1e7]"
        />
        <dl className="divide-y divide-[#d6ccb6] px-4 pb-3 pt-5">
          {BUREAU_PRESS_ROWS.map((row) => (
            <div key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#857c69]">
                {row.k}
              </dt>
              <dd className="flex items-center gap-1.5 text-right font-grotesk text-[12px] font-semibold leading-snug text-[#1c1914]">
                {row.icon}
                {row.v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-3 border-t-2 border-[#1c1914] px-4 py-3">
          <Stamp color={STAMP_GREEN} tilt={-5}>
            Accrédité
          </Stamp>
          {/* the managing editor signs in ink, illegibly, as is traditional */}
          <svg viewBox="0 0 96 28" className="h-6 w-24" aria-hidden>
            <InkPath
              d="M5 19 C 14 4, 21 25, 31 13 S 50 5, 57 16 S 77 22, 90 8"
              stroke={INK}
              strokeWidth={1.8}
              duration={0.8}
              delay={0.35}
            />
          </svg>
        </div>
      </div>
    </SettleIn>
  );
}

/**
 * RECTIFICATIF — the marginal correction joke, run exactly like a real
 * correction box: yesterday's edition asked readers for an "API key";
 * the verification desk struck the phrase and stamped its finding.
 */
function BureauRectificatif({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside aria-label="Rectificatif" className="border border-[#1c1914] bg-[#f6f1e7] px-5 py-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#bf3415]" />
          <span className="font-grotesk text-[10px] font-black uppercase tracking-[0.3em] text-[#bf3415]">
            Rectificatif
          </span>
        </div>
        <p className="mt-3 font-serif text-[15px] leading-[1.6] text-[#1c1914]">
          Dans l'édition du 11 juin, un encadré invitait le lecteur à renseigner sa{" "}
          <PenStrike delay={0.45}>« API key »</PenStrike>. Le service de vérification a rendu son
          avis :
        </p>
        <div className="mt-3">
          <Stamp tilt={-7}>Aucune</Stamp>
        </div>
        <p className="mt-3 font-serif text-[13px] italic leading-snug text-[#4a4438]">
          Le correspondant ne possède pas de clés. Pas même celles du bureau.
        </p>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.4 — TRANSCRIPT FURNITURE · the recorder strip above the interview
 *  A border-y strip stating how the transcript was taken: locally, at
 *  16 h 04, behind a closed door. The red dot blinks with ed-caret — the
 *  only looping animation in this section, gated for reduced motion.
 * ──────────────────────────────────────────────────────────────────────────── */

function BureauRecorderStrip({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <SettleIn className={className}>
      <div className="border-y border-[#1c1914]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 py-2.5">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={`${reduce ? "" : "ed-caret"} h-2 w-2 rounded-full bg-[#bf3415]`}
            />
            <Mic aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1c1914]">
              Transcription intégrale
            </span>
          </span>
          <span className={T.folio}>enregistrée sur place · 16 h 04 · durée 9 min 12 s</span>
          <span className="flex items-center gap-1.5 sm:ml-auto">
            <EyeOff aria-hidden className="h-3.5 w-3.5 text-[#857c69]" strokeWidth={2} />
            <span className={T.folio}>fichier local — jamais téléversé</span>
          </span>
        </div>
        <div className="border-t border-[#d6ccb6] px-1 py-1.5">
          <p className={T.folio}>
            Conditions acceptées : pas de wi-fi dans la pièce · aucune copie vers un nuage ·
            relecture sur place, porte fermée
          </p>
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.5 — THE FIGURES · morning matrix, public chronometer, day's notebook
 *  Each figure is a bordered plate with a band header and a mono footnote,
 *  so the transcript reads like an article with its graphics set in.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One cell of the morning matrix. The under-bar maps 90–99 % to 0–1 so the
 * eye can read the anomaly without doing arithmetic; the hot cell gets the
 * editor's vermilion frame and a dagger pointing at the footnote.
 */
function BureauMatrixCell({ v, hot, delay }: { v: number; hot?: boolean; delay: number }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0.06, Math.min(1, (v - 90) / 9));
  return (
    <td className="relative border-t border-[#d6ccb6] px-2.5 py-2 sm:px-3">
      {hot && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0.5 border-2 border-[#bf3415]"
        />
      )}
      <span
        className={`${T.num} block text-right text-[12px] leading-none ${
          hot ? "font-bold text-[#bf3415]" : "text-[#1c1914]"
        }`}
      >
        {v.toFixed(1).replace(".", ",")}
        {hot && <sup className="font-serif"> †</sup>}
      </span>
      <span className="mt-1.5 block h-[3px] w-full bg-[#1c1914]/10">
        <motion.span
          className={`block h-full ${hot ? "bg-[#bf3415]" : "bg-[#1c1914]"}`}
          style={{ width: `${(pct * 100).toFixed(0)}%`, transformOrigin: "left" }}
          initial={reduce ? undefined : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.55, delay, ease: EASE_INK }}
        />
      </span>
    </td>
  );
}

/** A full matrix row — real <tr>, so the table stays a table for readers. */
function BureauMatrixRowEl({ row, ri }: { row: BureauMatrixRow; ri: number }) {
  return (
    <tr>
      <th
        scope="row"
        className="border-t border-[#d6ccb6] px-2.5 py-2 text-left font-grotesk text-[11px] font-bold uppercase tracking-[0.1em] text-[#1c1914] sm:px-3"
      >
        {row.canal}
      </th>
      {row.cells.map((v, ci) => (
        <BureauMatrixCell
          key={BUREAU_MATRIX_REGIONS[ci]}
          v={v}
          hot={ci === row.hot}
          delay={0.08 + (ri * BUREAU_MATRIX_REGIONS.length + ci) * 0.018}
        />
      ))}
      <td className="border-t border-[#d6ccb6] px-2.5 py-2 text-right sm:px-3">
        <span className={`${T.num} text-[12px] font-bold leading-none text-[#4a4438]`}>
          {row.moy}
        </span>
      </td>
    </tr>
  );
}

/** LECTURE DU MATIN — réussite (%) par canal × région, printed as received. */
function BureauMatrixPlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border border-[#1c1914] bg-[#f6f1e7]">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
            Lecture du matin — réussite (%) par canal × région
          </span>
          <span className={T.folio}>{EDITION.fileName}</span>
        </figcaption>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="sr-only">
              Taux de réussite des transactions par canal et par région, édition du matin
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-2.5 py-2 text-left font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-3"
                >
                  Canal
                </th>
                {BUREAU_MATRIX_REGIONS.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    className="px-2.5 py-2 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-3"
                  >
                    {r}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-2.5 py-2 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-3"
                >
                  Moy.
                </th>
              </tr>
            </thead>
            <tbody>
              {BUREAU_MATRIX_ROWS.map((row, ri) => (
                <BureauMatrixRowEl key={row.canal} row={row} ri={ri} />
              ))}
            </tbody>
          </table>
        </div>
        <footer className="space-y-1 border-t border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <p className={T.folio}>
            † SMS × Sfax : 91,2 % contre 97,4 % de moyenne du jour. Le correspondant en a fait la
            une — <InkLink href="#lead">lire l'enquête</InkLink>
          </p>
          <p className={T.folio}>
            Aucune dépêche d'agence reçue : le correspondant ne lit que votre CSV.
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69] sm:hidden">
            faire défiler le tableau →
          </p>
        </footer>
      </figure>
    </SettleIn>
  );
}

/** One stage of the chronometer — track width is the share of 9,4 s. */
function BureauTimingRowEl({ row, index }: { row: BureauTimingRowData; index: number }) {
  const reduce = useReducedMotion();
  const pct = (row.s / BUREAU_TIMING_TOTAL) * 100;
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[11.5rem_1fr_auto]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#1c1914]">
        {row.label}
      </span>
      <span className="col-span-2 sm:col-span-1 sm:order-none order-last">
        <span className="block h-2.5 w-full">
          <span className="block h-full w-full bg-[#1c1914]/8">
            <span className="block h-full" style={{ width: `${pct.toFixed(1)}%` }}>
              <motion.span
                className={`block h-full ${row.hot ? "bg-[#bf3415]" : "bg-[#1c1914]"}`}
                style={{ transformOrigin: "left" }}
                initial={reduce ? undefined : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.7 }}
                transition={{ duration: 0.7, delay: 0.15 + index * 0.12, ease: EASE_INK }}
              />
            </span>
          </span>
        </span>
        <span className="mt-1 block font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          {row.note}
        </span>
      </span>
      <span
        className={`${T.num} text-right text-[12px] font-bold ${
          row.hot ? "text-[#bf3415]" : "text-[#1c1914]"
        }`}
      >
        {row.s.toFixed(1).replace(".", ",")} s
      </span>
    </div>
  );
}

/**
 * CHRONOMÉTRAGE — the public stopwatch from CSV to briefing. The headline
 * figure counts up to 9,4 s in tabular ink; the stages below grow as
 * transform-only bars. The correspondent's own 2,4 s is the vermilion one.
 */
function BureauTimingPlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border border-[#1c1914] bg-[#eee6d6]">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="flex items-center gap-2">
            <Timer aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
              Chronométrage — du fichier au briefing
            </span>
          </span>
          <span className={T.folio}>toutes portes fermées</span>
        </figcaption>
        <div className="px-3.5 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <CountUpInk
              end={9.4}
              decimals={1}
              suffix=" s"
              duration={1.8}
              className="text-[clamp(2.8rem,6.5vw,4.4rem)] font-bold leading-[0.9] tracking-tight text-[#1c1914]"
            />
            <div className="pb-1">
              <p className="font-grotesk text-[12px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
                le briefing du matin, complet
              </p>
              <p className={T.folio}>mesuré deux fois, par des gens méfiants †</p>
            </div>
          </div>
          <div className="mt-5 space-y-3.5">
            {BUREAU_TIMING.map((row, i) => (
              <BureauTimingRowEl key={row.id} row={row} index={i} />
            ))}
          </div>
        </div>
        <footer className="border-t border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <p className={T.folio}>
            † poste de bureau ordinaire, 4 cœurs, sans carte graphique. La part du correspondant —
            la rédaction — est en vermillon : 2,4 s pour écrire.
          </p>
        </footer>
      </figure>
    </SettleIn>
  );
}

/** LE CARNET DU JOUR — three entries; the first already runs on page one. */
function BureauFindings({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border border-[#1c1914] bg-[#f6f1e7]">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="flex items-center gap-2">
            <NotebookPen aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
              Carnet du jour — trois entrées
            </span>
          </span>
          <span className={T.folio}>relevé à 06 h 12 · une seule en une</span>
        </figcaption>
        <ol className="divide-y divide-[#d6ccb6]">
          {BUREAU_FINDINGS.map((f, i) => (
            <li
              key={f.id}
              className="grid gap-x-4 gap-y-1.5 px-3.5 py-3.5 sm:grid-cols-[2.6rem_1fr] sm:px-4"
            >
              <span
                aria-hidden
                className={`${T.num} text-[15px] font-bold leading-none ${
                  f.toLead ? "text-[#bf3415]" : "text-[#857c69]"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-serif text-[16px] leading-[1.55] text-[#1c1914]">
                  <strong className="font-grotesk text-[13px] font-bold uppercase tracking-[0.08em]">
                    {f.place}
                  </strong>{" "}
                  — {f.fact}.
                </p>
                <p className="mt-1 font-serif text-[14px] italic leading-snug text-[#4a4438]">
                  {f.verdict}
                </p>
                {f.toLead && (
                  <p className="mt-2">
                    <InkLink href="#lead">
                      Lire la une — l'enquête sur le canal SMS{" "}
                      <ArrowUpRight aria-hidden className="inline h-3.5 w-3.5 align-[-2px]" />
                    </InkLink>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.6 — FICHE TECHNIQUE · the spec box dropped between two questions
 *  A 2px-bordered plate, mono spec rows grouped the way the production desk
 *  thinks. It interrupts the transcript after Q.03 — exactly where a print
 *  editor would slot the sidebar so the reader gets the machinery before
 *  the speed question.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One group of the spec table: a labelled cluster of key→value lines. */
function BureauFicheGroup({ group }: { group: BureauSpecGroup }) {
  return (
    <div className="border-t border-[#d6ccb6] px-4 py-3.5 first:border-t-0 sm:border-t-0 sm:px-5 sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-[#d6ccb6]">
      <div className="flex items-center gap-2 text-[#1c1914]">
        {group.icon}
        <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.26em]">
          {group.group}
        </span>
      </div>
      <dl className="mt-2.5 space-y-1.5">
        {group.rows.map((row) => (
          <div key={row.k} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-[#857c69]">
              {row.k}
            </dt>
            <span
              aria-hidden
              className="mb-[3px] hidden h-px min-w-3 flex-1 self-end bg-[#d6ccb6] sm:block"
            />
            <dd className={`${T.num} text-right text-[11.5px] font-semibold text-[#1c1914]`}>
              {row.v}
              {row.mark && <sup className="font-serif"> {row.mark}</sup>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The full plate, with its band header, 2×2 group grid and footnotes. */
function BureauFichePlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside
        aria-label="Fiche technique du correspondant"
        className="border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <span className="font-grotesk text-[12px] font-black uppercase tracking-[0.28em] text-[#1c1914]">
            Fiche technique
          </span>
          <span className={T.folio}>réf. DN-IA-07 · vérifiée par le service</span>
        </header>
        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-[#d6ccb6]">
          {BUREAU_FICHE.map((g) => (
            <BureauFicheGroup key={g.id} group={g} />
          ))}
        </div>
        <footer className="space-y-1 border-t-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <p className={T.folio}>† démarrage à froid, poste de bureau ordinaire, sans GPU dédié</p>
          <p className={T.folio}>
            ‡ repli automatique vers le CPU — le correspondant ne se plaint pas du matériel
          </p>
        </footer>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.7 — THE INTERVIEW ENGINE · one Q&A, typeset like print
 *  Big vermilion Q in the gutter, bold grotesk question on the baseline,
 *  serif answer behind a hairline rule. The first answer is set by TypeOn —
 *  hot type, character by character; the rest rise from their clip lines.
 * ──────────────────────────────────────────────────────────────────────────── */

function BureauQA({ item, index }: { item: BureauQAItem; index: number }) {
  const first = index === 0;
  const leadText = `« ${item.lead} »`;
  return (
    <article className="relative">
      <div className="grid gap-3 sm:grid-cols-[3.4rem_1fr] sm:gap-6">
        {/* the question gutter: Q in the editor's pen, folio number beneath */}
        <div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-1.5 sm:pt-1">
          <span
            aria-hidden
            className="font-grotesk text-[1.7rem] font-black leading-none text-[#bf3415]"
          >
            Q
          </span>
          <span className={T.folio}>{item.no}</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-grotesk text-[clamp(1.05rem,1.9vw,1.3rem)] font-bold leading-snug text-[#1c1914]">
            <span aria-hidden className="mr-2 text-[#bf3415]">
              —
            </span>
            {item.question}
          </h3>
          <div className="mt-4 border-l-2 border-[#d6ccb6] pl-4 sm:pl-6">
            {item.margin && (
              <div className="float-right ml-5 hidden w-44 sm:block lg:-mr-2">
                <MarginNote>{item.margin}</MarginNote>
              </div>
            )}
            {first ? (
              /* hot type: the very first words of the interview set themselves */
              <p className="font-serif text-[clamp(1.2rem,2.2vw,1.45rem)] font-medium leading-[1.45] text-[#1c1914] [font-variation-settings:'SOFT'_60,'WONK'_1]">
                <TypeOn text={leadText} speed={26} startDelay={250} />
              </p>
            ) : (
              <RiseIn amount={0.5}>
                <p className="font-serif text-[clamp(1.2rem,2.2vw,1.45rem)] font-medium leading-[1.45] text-[#1c1914] [font-variation-settings:'SOFT'_60,'WONK'_1]">
                  {leadText}
                </p>
              </RiseIn>
            )}
            {item.stamp && (
              <div className="mt-4">
                <Stamp tilt={-6}>{item.stamp}</Stamp>
              </div>
            )}
            {item.rest.map((para, i) => (
              <SettleIn key={para.id} delay={0.12 + i * 0.08}>
                <p className={`${T.body} mt-4`}>{para.body}</p>
              </SettleIn>
            ))}
            {item.figure === "matrix" && <BureauMatrixPlate className="mt-6" />}
            {item.figure === "timing" && <BureauTimingPlate className="mt-6" />}
            {item.figure === "findings" && <BureauFindings className="mt-6" />}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.8 — PAGE FURNITURE · header, the subject-in-brief box, the last word,
 *  the closing plate with the sample-briefing call.
 * ──────────────────────────────────────────────────────────────────────────── */

/** "LE SUJET EN BREF" — the little biography box every interview page runs. */
function BureauBioBox({ className }: { className?: string }) {
  return (
    <SettleIn delay={0.15} className={className}>
      <aside aria-label="Le sujet en bref" className="border border-[#1c1914] bg-[#eee6d6]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#1c1914] px-4 py-2">
          <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
            Le sujet en bref
          </span>
          <span className={T.folio}>fiche d'identité</span>
        </header>
        <dl className="divide-y divide-[#d6ccb6] px-4 py-1">
          {BUREAU_BIO.map((row) => (
            <div key={row.id} className="grid grid-cols-[7.2rem_1fr] items-baseline gap-3 py-2">
              <dt className="font-mono text-[9.5px] uppercase leading-snug tracking-[0.14em] text-[#857c69]">
                {row.k}
              </dt>
              <dd className="font-serif text-[13.5px] leading-snug text-[#1c1914]">{row.v}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </SettleIn>
  );
}

/** Masthead, headline deck, standfirst and byline for the interview page. */
function BureauHeader() {
  return (
    <header>
      <SectionMast rubrique="L'entretien — notre correspondant local" no="p. 7" />
      <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-8">
          <SettleIn>
            <p className={T.kicker}>L'entretien · cinq questions · zéro octet sortant</p>
          </SettleIn>
          <DeckReveal
            className="mt-4"
            lines={[
              <span
                key="l1"
                className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              >
                The correspondent who
              </span>,
              <span
                key="l2"
                className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              >
                never <PenUnderline delay={0.9}>files by wire</PenUnderline>
              </span>,
            ]}
          />
          <SettleIn delay={0.2} className="mt-6 max-w-[58ch]">
            <DropCapParagraph>
              Each copy of Data Navigator ships with a resident reporter: a language model that
              lives on the machine, reads the day's{" "}
              <span className="font-mono text-[0.92em] tabular-nums">2 147 380</span> transactions
              and writes the morning briefing before anyone asks. It granted us five questions, on
              one condition — that the interview never leave the room. Granted. Here is the
              transcript, printed in full.
            </DropCapParagraph>
          </SettleIn>
          <SettleIn delay={0.3} className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Byline
              name="Propos recueillis par la rédaction"
              desk="Bureau de l'intelligence · sur place"
            />
            <Stamp tilt={4}>Entretien exclusif</Stamp>
          </SettleIn>
        </div>
        <div className="lg:col-span-4">
          <BureauBioBox />
        </div>
      </div>
    </header>
  );
}

/**
 * The traditional closer no interviewer can resist — and the only answer
 * the subject gave in under a second. Unnumbered, as a courtesy.
 */
function BureauLastWord({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="mx-auto max-w-[46ch] text-center">
        <p className="font-grotesk text-[13px] font-bold text-[#1c1914]">
          <span aria-hidden className="mr-2 text-[#bf3415]">
            Q —
          </span>
          Un dernier mot ?
        </p>
        <p className="mt-2 font-serif text-[1.2rem] italic leading-[1.45] text-[#1c1914]">
          « Fermez la porte en sortant. Moi, je reste. »
        </p>
      </div>
      <div className="mt-8 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-[#d6ccb6]" />
        <span className={T.folio}>— fin de l'entretien —</span>
        <span className="h-px flex-1 bg-[#d6ccb6]" />
      </div>
    </SettleIn>
  );
}

/** The closing plate: read a sample briefing, composed where else but here. */
function BureauClosing({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="flex flex-col items-start justify-between gap-6 border-2 border-[#1c1914] bg-[#eee6d6] px-6 py-7 shadow-[4px_4px_0_#1c1914] sm:px-8 md:flex-row md:items-center">
        <div className="max-w-[46ch]">
          <p className={T.kicker}>Édition de démonstration</p>
          <p className="mt-2 font-serif text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold leading-[1.2] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            Le correspondant peut écrire le prochain briefing chez vous.
          </p>
          <p className={`${T.ui} mt-2 text-[14px]`}>
            Un exemple complet, composé sur votre machine — il ne saurait en être autrement.
          </p>
        </div>
        <InkButton tone="outline" href="/signup" className="shrink-0">
          Lire un briefing d'exemple
          <ArrowRight
            aria-hidden
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
          />
        </InkButton>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.9 — THE SECTION · assembly of the interview spread
 *  Print layout: header across the page; then a classic interview spread —
 *  portrait rail on the left (plate, credential, correction, pull quote),
 *  transcript on the right with the FICHE TECHNIQUE dropped in after Q.03.
 *  On small screens the rail folds above the transcript, photograph first,
 *  exactly as the page would stack on a narrow press run.
 * ──────────────────────────────────────────────────────────────────────────── */

function BureauSection() {
  return (
    <section
      id="bureau"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 5400px" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10 lg:pb-24 lg:pt-24">
        <BureauHeader />

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-12">
          {/* ── the portrait rail — photograph, paperwork, correction, quote ── */}
          <aside className="space-y-10 lg:col-span-4">
            <SettleIn>
              <BureauPortrait />
            </SettleIn>
            <BureauPressCard />
            <BureauRectificatif />
            <PullQuote cite="Le correspondant local" className="hidden lg:block">
              Je lis deux millions de lignes avant l'aube. Personne ne lit par-dessus mon épaule.
            </PullQuote>
            <div className="hidden lg:block">
              <MarginNote side="right">
                Notre photographe attend toujours son rendez-vous. Il attendra.
              </MarginNote>
            </div>
          </aside>

          {/* ── the transcript column ── */}
          <div className="min-w-0 lg:col-span-8">
            <BureauRecorderStrip />

            <div className="mt-12 space-y-14 sm:space-y-16">
              {/* Q.01 – Q.03 : domicile, lecture, interdits */}
              {BUREAU_INTERVIEW.slice(0, 3).map((item, i) => (
                <BureauQA key={item.no} item={item} index={i} />
              ))}

              {/* the sidebar lands here, between the interdictions and the
                  speed question — machinery first, performance second */}
              <BureauFichePlate />

              {/* Q.04 – Q.05 : chronométrage, carnet du jour */}
              {BUREAU_INTERVIEW.slice(3).map((item, i) => (
                <BureauQA key={item.no} item={item} index={i + 3} />
              ))}
            </div>

            {/* the pull quote surfaces in-flow on smaller presses */}
            <PullQuote cite="Le correspondant local" className="mt-14 lg:hidden">
              Je lis deux millions de lignes avant l'aube. Personne ne lit par-dessus mon épaule.
            </PullQuote>

            <BureauLastWord className="mt-14 sm:mt-16" />
            <BureauClosing className="mt-12" />
          </div>
        </div>

        <DoubleRule className="mt-16 lg:mt-20" />
        <FolioLine
          page="p. 7"
          note="L'entretien — il n'a pas raccroché : il n'a jamais décroché"
          className="mt-4"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 10 — CartoSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §10 — CARTO · THE CARTOGRAPHY PLATE                                     p. 8
 *  ────────────────────────────────────────────────────────────────────────────
 *  Geographic analysis presented as a printed map plate — a "planche" filed by
 *  the paper's map desk. The conceit: Data Navigator joins every row of
 *  DailyTransactions.csv to its région and prints availability as an engraved
 *  dot-screen map, entirely offline (PMTiles base map shipped inside the
 *  installer, MapLibre rendering from disk). The plate is the hero image; the
 *  legend table is the real, readable equivalent of the decorative map; three
 *  regional dispatches carry the newsroom voice; and a technical footnote says
 *  the thing the security team actually came to read.
 *
 *  Motion inventory (transform / opacity / pathLength only, all primitives
 *  gate behind prefers-reduced-motion):
 *  · Parallax 45 on the plate + Parallax 20 on a backing offset frame — two
 *    drift speeds read as two physical plates stacked on the light table.
 *  · InkPath draws the compass rose and the incident annotation; the
 *    graticule is static hairline ink.
 *  · The editor's vermilion pen is spent exactly once on the map: a dashed
 *    halo around the EST marker with a hand underline beneath its label.
 *  · Legend réussite figures count up in tabular numerals; aria-hidden wraps
 *    the live counter and an sr-only span keeps the static value.
 *
 *  Data discipline: region volumes sum to exactly 2 147 380 (EDITION.rows),
 *  sites sum to exactly 1 904 (the layer inventory's point count), and the
 *  part-weighted réussite lands on 97,4 % (EDITION.successRate). The page
 *  reconciles like a real ledger — readers who check should be rewarded.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
 *  Plate geometry + markers — the three story points called out on the map.
 *  Coordinates are relative (0–1) per InkDotMap's contract.
 * ──────────────────────────────────────────────────────────────────────────── */

const CARTO_MAP_W = 680;
const CARTO_MAP_H = 300;

const CARTO_MARKERS = [
  { x: 0.72, y: 0.38, label: "EST — incident passerelle" },
  { x: 0.45, y: 0.18, label: "NORD 99,2 %" },
  { x: 0.5, y: 0.55, label: "CENTRE 98,9 %" },
] as const;

/** Inset enlargement — the Sfax corridor, where the evening's story happened. */
const CARTO_INSET_MARKERS = [
  { x: 0.36, y: 0.4, label: "SFX-1" },
  { x: 0.66, y: 0.52, label: "SFX-2" },
] as const;

/**
 * Toponyms — faint italic place names printed on the plate, the way an
 * engraved map names its towns. Coordinates in plate space (680 × 300),
 * positioned clear of the three markers, the incident halo and the inset.
 * `anchor` keeps each name on the open side of its town dot.
 */
const CARTO_TOWNS = [
  { x: 296, y: 44, name: "Tunis", anchor: "end" },
  { x: 252, y: 22, name: "Bizerte", anchor: "end" },
  { x: 182, y: 72, name: "Béja", anchor: "end" },
  { x: 330, y: 186, name: "Kairouan", anchor: "end" },
  { x: 458, y: 88, name: "Sfax", anchor: "end" },
  { x: 522, y: 232, name: "Gabès", anchor: "start" },
  { x: 152, y: 246, name: "Tozeur", anchor: "start" },
] as const;

/** Graticule — printed lat/long hairlines. Tunisia sits ~33–37°N, 8–11°E. */
const CARTO_GRATICULE = {
  verticals: [
    { x: 170, label: "9°E" },
    { x: 340, label: "10°E" },
    { x: 510, label: "11°E" },
  ],
  horizontals: [
    { y: 100, label: "36°N" },
    { y: 200, label: "35°N" },
  ],
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
 *  The legend ledger — six régions, reconciled to the edition's totals.
 *  lignes sum:  742 911 + 489 603 + 395 118 + 195 411 + 191 067 + 133 270
 *             = 2 147 380  ✓ (EDITION.rows)
 *  sites sum:   612 + 418 + 366 + 201 + 188 + 119 = 1 904  ✓ (layer inventory)
 *  réussite, part-weighted: 97,4 %  ✓ (EDITION.successRate)
 *  spark = hourly réussite, 08 h → 19 h, twelve readings per région.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoRegionRow = {
  region: string;
  /** chef-lieu — anchors each row to a real place name */
  chef: string;
  /** share of the day's traffic */
  part: string;
  /** réussite as a number, for the count-up; formatted fr-FR at render */
  reussiteNum: number;
  /** static string twin of reussiteNum — sr-only + footer reconciliation */
  reussite: string;
  lignes: string;
  sites: number;
  /** delta vs. J-1, signed, French decimal comma */
  delta: string;
  spark: ReadonlyArray<number>;
  /** index in spark to ring in vermilion (the 16 h reading for EST) */
  markIndex?: number;
  incident?: boolean;
  /** the desk's one-line margin verdict — read out in the sr summary */
  note: string;
};

const CARTO_REGIONS: ReadonlyArray<CartoRegionRow> = [
  {
    region: "Nord",
    chef: "Tunis",
    part: "34,6 %",
    reussiteNum: 99.2,
    reussite: "99,2 %",
    lignes: "742 911",
    sites: 612,
    delta: "+0,1",
    spark: [99.1, 99.3, 99.2, 99.4, 99.2, 99.1, 99.3, 99.2, 99.0, 99.2, 99.3, 99.2],
    note: "pointe du matin absorbée sans commentaire du bureau",
  },
  {
    region: "Centre",
    chef: "Kairouan",
    part: "22,8 %",
    reussiteNum: 98.9,
    reussite: "98,9 %",
    lignes: "489 603",
    sites: 418,
    delta: "−0,2",
    spark: [98.7, 98.8, 99.0, 98.9, 98.8, 99.1, 98.9, 98.7, 98.8, 99.0, 98.9, 98.9],
    note: "rien à signaler — la meilleure phrase du métier",
  },
  {
    region: "Est",
    chef: "Sfax",
    part: "18,4 %",
    reussiteNum: 91.4,
    reussite: "91,4 %",
    lignes: "395 118",
    sites: 366,
    delta: "−6,1",
    spark: [97.3, 97.5, 97.4, 97.2, 97.6, 97.4, 97.1, 97.3, 71.2, 84.6, 93.8, 96.9],
    markIndex: 8,
    incident: true,
    note: "chute de la passerelle SFX-2 à 16 h 04 — enquête p. 3",
  },
  {
    region: "Sud-Est",
    chef: "Gabès",
    part: "9,1 %",
    reussiteNum: 97.8,
    reussite: "97,8 %",
    lignes: "195 411",
    sites: 201,
    delta: "+0,4",
    spark: [97.6, 97.9, 97.7, 98.0, 97.8, 97.6, 97.9, 98.1, 97.7, 97.8, 97.6, 97.9],
    note: "meilleure journée du mois pour le littoral sud",
  },
  {
    region: "Nord-Ouest",
    chef: "Béja",
    part: "8,9 %",
    reussiteNum: 98.4,
    reussite: "98,4 %",
    lignes: "191 067",
    sites: 188,
    delta: "0,0",
    spark: [98.2, 98.5, 98.3, 98.6, 98.4, 98.2, 98.5, 98.3, 98.4, 98.6, 98.3, 98.4],
    note: "plat comme une plaine céréalière — exactement comme hier",
  },
  {
    region: "Sud-Ouest",
    chef: "Tozeur",
    part: "6,2 %",
    reussiteNum: 98.1,
    reussite: "98,1 %",
    lignes: "133 270",
    sites: 119,
    delta: "−0,3",
    spark: [98.0, 98.2, 97.9, 98.3, 98.1, 98.0, 98.2, 98.4, 97.9, 98.1, 98.0, 98.2],
    note: "faible volume, forte fiabilité — le désert ne se plaint pas",
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Feuille de relevés — the surveyor's hourly log, folded under the legend.
 *  Tells the incident as a timeline: nominal, drop, failover, recovery, close.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoReading = {
  heure: string;
  region: string;
  valeur: string;
  note: string;
  /** vermilion row — the reading that became page 3 */
  alarm?: boolean;
};

const CARTO_READINGS: ReadonlyArray<CartoReading> = [
  { heure: "06 h 00", region: "Toutes", valeur: "97,9 %", note: "ouverture du relevé" },
  { heure: "09 h 15", region: "Nord", valeur: "99,3 %", note: "pointe du matin absorbée" },
  { heure: "11 h 40", region: "Centre", valeur: "98,9 %", note: "RAS" },
  { heure: "14 h 30", region: "Est", valeur: "97,3 %", note: "dernière mesure nominale" },
  { heure: "16 h 04", region: "Est", valeur: "71,2 %", note: "chute passerelle SFX-2", alarm: true },
  { heure: "16 h 31", region: "Est", valeur: "78,9 %", note: "bascule sur SFX-1 engagée" },
  { heure: "17 h 12", region: "Est", valeur: "84,6 %", note: "38 412 transactions réacheminées" },
  { heure: "19 h 02", region: "Est", valeur: "96,9 %", note: "retour quasi nominal" },
  { heure: "23 h 59", region: "Toutes", valeur: "97,4 %", note: "clôture de l'édition" },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Dépêches régionales — three datelined briefs in the paper's dry voice.
 *  English editorial, French figures: the newsroom's house bilingualism.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoDispatchItem = {
  dateline: string;
  heure: string;
  canal: string;
  body: string;
  figure: string;
  figureLabel: string;
};

const CARTO_DISPATCHES: ReadonlyArray<CartoDispatchItem> = [
  {
    dateline: "SFAX",
    heure: "16 h 41",
    canal: "tous canaux",
    body:
      "The eastern gateway went quiet at 16 h 04; 38 412 transactions took the long way " +
      "round through SFX-1 before the evening close, and the plate shows exactly where.",
    figure: "38 412",
    figureLabel: "transactions réacheminées",
  },
  {
    dateline: "TUNIS",
    heure: "09 h 30",
    canal: "USSD · agence",
    body:
      "The north absorbed the morning rush at 99,2 % and filed nothing else — which, at " +
      "this desk, is the highest compliment a région can earn.",
    figure: "742 911",
    figureLabel: "lignes au nord, réussite 99,2 %",
  },
  {
    dateline: "BIZERTE",
    heure: "12 h 05",
    canal: "agence",
    body:
      "A quiet corner of the plate: 64 118 lignes, zero alerts, and the cartographer left " +
      "for lunch on schedule.",
    figure: "0",
    figureLabel: "alerte · 64 118 lignes",
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Layer inventory — what actually ships on disk. Weighs 29,0 Mo all in:
 *  28,4 + 0,412 + 0,096 + 0,038 + 0,064 = 29,01 Mo. The security reviewer's
 *  favourite table on the whole page.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoLayerRow = {
  couche: string;
  detail: string;
  poids: string;
  note: string;
};

const CARTO_LAYERS: ReadonlyArray<CartoLayerRow> = [
  {
    couche: "Fond de carte",
    detail: "PMTiles · z0 – z14",
    poids: "28,4 Mo",
    note: "livré dans l'installateur, jamais téléchargé",
  },
  {
    couche: "Limites régionales",
    detail: "GeoJSON · 6 entités",
    poids: "412 Ko",
    note: "jointure « region » directe sur le CSV",
  },
  {
    couche: "Sites & passerelles",
    detail: "1 904 points",
    poids: "96 Ko",
    note: "index spatial tenu par le moteur DuckDB",
  },
  {
    couche: "Styles de planche",
    detail: "encre · nuit · relief",
    poids: "38 Ko",
    note: "hérités de la maquette de l'édition",
  },
  {
    couche: "Glossaire toponymique",
    detail: "fr-TN",
    poids: "64 Ko",
    note: "recherche de lieux, résolue localement",
  },
];

/* ═════════════════════════════════════════════════════════════════════════════
 *  CARTOGRAPHIC FURNITURE — compass, registration marks, graticule, scale bar
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Compass rose, drawn stroke by stroke like an engraver finishing the corner
 * of the plate. North needle takes the only vermilion on the instrument; the
 * paper disc beneath occludes the dot-screen so the rose reads cleanly.
 */
function CartoCompassRose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" fill={PAPER} fillOpacity="0.92" />
      {/* outer ring, then a dashed inner ring — bezel and dial */}
      <InkPath
        d="M50 10 A40 40 0 0 1 90 50 A40 40 0 0 1 50 90 A40 40 0 0 1 10 50 A40 40 0 0 1 50 10"
        strokeWidth={1.8}
        duration={1.2}
      />
      <InkPath
        d="M50 22 A28 28 0 0 1 78 50 A28 28 0 0 1 50 78 A28 28 0 0 1 22 50 A28 28 0 0 1 50 22"
        strokeWidth={1}
        duration={1}
        delay={0.2}
        dashed
      />
      {/* cardinal cross with a hub gap — four strokes, drawn in sequence */}
      <InkPath d="M50 14 L50 43" strokeWidth={1.4} delay={0.4} duration={0.35} />
      <InkPath d="M50 57 L50 86" strokeWidth={1.4} delay={0.45} duration={0.35} />
      <InkPath d="M14 50 L43 50" strokeWidth={1.4} delay={0.5} duration={0.35} />
      <InkPath d="M57 50 L86 50" strokeWidth={1.4} delay={0.55} duration={0.35} />
      {/* intercardinals, lighter and dashed — secondary information */}
      <InkPath d="M28 28 L41 41" strokeWidth={1} delay={0.6} duration={0.3} dashed />
      <InkPath d="M72 28 L59 41" strokeWidth={1} delay={0.65} duration={0.3} dashed />
      <InkPath d="M72 72 L59 59" strokeWidth={1} delay={0.7} duration={0.3} dashed />
      <InkPath d="M28 72 L41 59" strokeWidth={1} delay={0.75} duration={0.3} dashed />
      {/* the needle: vermilion north, paper south, ink hub */}
      <InkPath
        d="M50 24 L55 50 L45 50 Z"
        stroke={VERMILION}
        strokeWidth={1.2}
        fill={VERMILION}
        delay={0.9}
        duration={0.35}
      />
      <InkPath d="M50 76 L55 50 L45 50 Z" strokeWidth={1.2} fill={PAPER} delay={0.95} duration={0.35} />
      <circle cx="50" cy="50" r="2.4" fill={INK} />
      <text x="50" y="9" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)" fill={INK}>
        N
      </text>
      <text x="95" y="53.5" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill={INK_SOFT}>
        E
      </text>
      <text x="50" y="99" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill={INK_SOFT}>
        S
      </text>
      <text x="5" y="53.5" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill={INK_SOFT}>
        O
      </text>
    </svg>
  );
}

/**
 * Pre-press registration mark — the little cross-in-circle printers use to
 * align colour passes. Four of them sit just outside the plate corners; they
 * say "this page went through a press" louder than any texture could.
 */
function CartoRegMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${className ?? ""}`} aria-hidden>
      <line x1="8" y1="0.5" x2="8" y2="15.5" stroke={INK_SOFT} strokeWidth="1" />
      <line x1="0.5" y1="8" x2="15.5" y2="8" stroke={INK_SOFT} strokeWidth="1" />
      <circle cx="8" cy="8" r="4.2" fill="none" stroke={INK_SOFT} strokeWidth="1" />
    </svg>
  );
}

/**
 * Graticule overlay — static dashed meridians/parallels with mono degree
 * labels and tick marks along the frame. No animation: survey lines are the
 * quiet, permanent layer beneath the day's news.
 */
function CartoGraticule() {
  return (
    <svg
      viewBox={`0 0 ${CARTO_MAP_W} ${CARTO_MAP_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {CARTO_GRATICULE.verticals.map((v) => (
        <g key={v.label}>
          <line x1={v.x} y1={0} x2={v.x} y2={CARTO_MAP_H} stroke={RULE} strokeWidth="1" strokeDasharray="2 7" />
          <text x={v.x + 5} y={CARTO_MAP_H - 7} fontSize="8.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
            {v.label}
          </text>
        </g>
      ))}
      {CARTO_GRATICULE.horizontals.map((hz) => (
        <g key={hz.label}>
          <line x1={0} y1={hz.y} x2={CARTO_MAP_W} y2={hz.y} stroke={RULE} strokeWidth="1" strokeDasharray="2 7" />
          <text x={6} y={hz.y - 5} fontSize="8.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
            {hz.label}
          </text>
        </g>
      ))}
      {/* frame ticks — every 68 viewBox-px along top and bottom edges */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = 68 * (i + 1);
        return (
          <g key={`vt-${x}`}>
            <line x1={x} y1={0} x2={x} y2={5} stroke={INK_SOFT} strokeWidth="1" />
            <line x1={x} y1={CARTO_MAP_H - 5} x2={x} y2={CARTO_MAP_H} stroke={INK_SOFT} strokeWidth="1" />
          </g>
        );
      })}
      {/* and every 50 along the sides */}
      {Array.from({ length: 5 }, (_, i) => {
        const y = 50 * (i + 1);
        return (
          <g key={`ht-${y}`}>
            <line x1={0} y1={y} x2={5} y2={y} stroke={INK_SOFT} strokeWidth="1" />
            <line x1={CARTO_MAP_W - 5} y1={y} x2={CARTO_MAP_W} y2={y} stroke={INK_SOFT} strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Toponym layer — town dots and italic serif names, printed at the same
 * faint weight as the dot-screen so they sit *in* the map rather than on it.
 * Static like the graticule: place names are not news.
 */
function CartoToponyms() {
  return (
    <svg
      viewBox={`0 0 ${CARTO_MAP_W} ${CARTO_MAP_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {CARTO_TOWNS.map((t) => (
        <g key={t.name}>
          <circle
            cx={t.anchor === "end" ? t.x + 5 : t.x - 5}
            cy={t.y - 3}
            r="1.8"
            fill={INK}
            fillOpacity="0.55"
          />
          <text
            x={t.x}
            y={t.y}
            textAnchor={t.anchor}
            fontSize="10"
            fontStyle="italic"
            fontFamily="var(--font-serif)"
            fill={INK_SOFT}
            fillOpacity="0.8"
          >
            {t.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * The editor's pen on the map — used once, at the EST marker (489.6, 114 in
 * plate coordinates): a dashed halo around the point, a hand underline under
 * its printed label, and a serif aside giving the hour. Draw order is halo →
 * underline → caption, like a hand actually annotating the proof.
 */
function CartoIncidentAnnotation() {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox={`0 0 ${CARTO_MAP_W} ${CARTO_MAP_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <InkPath
        d="M467.6 114 A22 22 0 1 1 511.6 114 A22 22 0 1 1 467.6 114"
        stroke={VERMILION}
        strokeWidth={1.8}
        delay={0.9}
        duration={0.6}
        dashed
      />
      <InkPath
        d="M503 124 Q 540 120.5, 575 123 T 641 121.5"
        stroke={VERMILION}
        strokeWidth={1.6}
        delay={1.25}
        duration={0.45}
      />
      <motion.g
        initial={reduce ? undefined : { opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: 1.55, duration: 0.5, ease: EASE_INK }}
      >
        <text
          x={489.6}
          y={152}
          textAnchor="middle"
          fontSize="11.5"
          fontStyle="italic"
          fontFamily="var(--font-serif)"
          fill={VERMILION}
        >
          tombée à 16 h 04 — voir p. 3
        </text>
      </motion.g>
    </svg>
  );
}

/**
 * Printed scale bar — alternating ink/paper segments with the ratio in mono.
 * Pure ink-and-border construction; nothing here animates.
 */
function CartoScaleBar() {
  return (
    <div className="flex items-center gap-3">
      <Ruler aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#4a4438]" strokeWidth={1.8} />
      <div>
        <div className="flex h-[7px] w-36 border border-[#1c1914] sm:w-40">
          <div className="flex-1 bg-[#1c1914]" />
          <div className="flex-1 bg-transparent" />
          <div className="flex-1 bg-[#1c1914]" />
          <div className="flex-1 bg-transparent" />
        </div>
        <div className="mt-0.5 flex justify-between font-mono text-[8px] tracking-tight text-[#857c69]">
          <span>0</span>
          <span>50</span>
          <span>100 km</span>
        </div>
      </div>
      <span className="hidden font-mono text-[9px] tracking-[0.08em] text-[#857c69] sm:block">
        1 : 1 850 000
      </span>
    </div>
  );
}

/**
 * Inset enlargement — printed maps put their drama in a boxed "encart".
 * Ours zooms the Sfax corridor where SFX-2 fell over; the two gateway points
 * carry their own labels. Hidden below lg: the corner is too crowded on
 * small plates, and the dispatches tell the same story in text.
 */
function CartoInset({ className }: { className?: string }) {
  return (
    <div
      className={`w-[196px] border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[3px_3px_0_#1c1914] ${className ?? ""}`}
    >
      <div className="border-b border-[#1c1914] px-2 py-1">
        <span className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#1c1914]">
          ENCART — CORRIDOR DE SFAX
        </span>
      </div>
      <div className="relative aspect-[200/96]">
        <InkDotMap w={200} h={96} markers={CARTO_INSET_MARKERS} className="absolute inset-0" />
      </div>
      <div className="flex justify-between border-t border-[#d6ccb6] px-2 py-0.5 font-mono text-[7.5px] text-[#857c69]">
        <span>1 : 420 000</span>
        <span>SFX-1 · SFX-2</span>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  THE PLATE — frame, header strip, map stack, footer strip
 * ═════════════════════════════════════════════════════════════════════════════ */

/** Header strip riveted to the top of the frame — title left, plate no. right. */
function CartoPlateHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b-[3px] border-[#1c1914] px-3 py-2.5 sm:px-4">
      <h3 className="font-grotesk text-[10px] font-bold uppercase tracking-[0.16em] text-[#1c1914] sm:text-[12px] sm:tracking-[0.18em]">
        Carte des régions — <span className="whitespace-nowrap">disponibilité du 11 juin</span>
      </h3>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-[#bf3415]">
        <Compass aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="hidden sm:inline">PLANCHE VIII</span>
        <span className="sm:hidden">PL. VIII</span>
      </div>
    </header>
  );
}

/** Footer strip — scale bar, projection note, site tally. Engraver's small print. */
function CartoPlateFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#d6ccb6] px-3 py-2.5 sm:px-4">
      <CartoScaleBar />
      <span className={`hidden md:block ${T.folio}`}>
        Projection encre-sur-papier · relevé clos à 23 h 59
      </span>
      <span className={T.folio}>1 904 sites · 6 régions</span>
    </footer>
  );
}

/**
 * The full plate: 3px ink frame on paper lift, registration marks outside the
 * corners, then the layered map stack — dot-screen base, graticule, incident
 * annotation, compass (top-left, clear of all three markers), Sfax inset
 * (bottom-left, ≥lg). Everything visual is aria-hidden; the visible
 * figcaption and the legend table carry the real content.
 */
function CartoPlate() {
  return (
    <figure className="relative">
      <div className="relative border-[3px] border-[#1c1914] bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        {/* registration marks — pre-press corners, outside the frame */}
        <CartoRegMark className="absolute -left-3 -top-3" />
        <CartoRegMark className="absolute -right-3 -top-3" />
        <CartoRegMark className="absolute -bottom-3 -left-3" />
        <CartoRegMark className="absolute -bottom-3 -right-3" />
        <CartoPlateHeader />
        <div className="relative aspect-[680/300] w-full" aria-hidden>
          <InkDotMap w={CARTO_MAP_W} h={CARTO_MAP_H} markers={CARTO_MARKERS} className="absolute inset-0" />
          <CartoGraticule />
          <CartoToponyms />
          <CartoIncidentAnnotation />
          <CartoCompassRose className="absolute left-3 top-3 hidden h-[72px] w-[72px] sm:block lg:h-20 lg:w-20" />
          <CartoInset className="absolute bottom-3 left-3 hidden lg:block" />
        </div>
        <CartoPlateFooter />
      </div>
      <figcaption className={`mt-3 ${T.folio}`}>
        Fig. 8.1 — planche tirée de {EDITION.fileName} · fond de carte embarqué, aucun
        téléchargement
      </figcaption>
    </figure>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  THE LEGEND — hairline ledger of régions; the map's textual truth
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * One ledger row. The EST row takes the section's vermilion: name, figure and
 * sparkline all in the editor's red, with a triangle flag. Counter is
 * aria-hidden with an sr-only static twin so screen readers never hear the
 * count-up stutter. Spark + delta columns yield below sm — part and réussite
 * are the load-bearing figures on a phone.
 */
function CartoLegendRow({ row }: { row: CartoRegionRow }) {
  const hot = row.incident === true;
  const inkTone = hot ? "text-[#bf3415]" : "text-[#1c1914]";
  return (
    <tr className={`border-b border-[#d6ccb6] last:border-b-0 ${hot ? "bg-[#bf3415]/[0.05]" : ""}`}>
      <th scope="row" className="py-2.5 pr-2 text-left align-top font-normal">
        <span className={`flex items-center gap-1.5 font-grotesk text-[13px] font-bold uppercase tracking-[0.08em] ${inkTone}`}>
          {hot && <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
          {row.region}
        </span>
        <span className={`mt-0.5 block ${T.folio}`}>{row.chef}</span>
      </th>
      <td className="py-2.5 pr-2 text-right align-top font-mono text-[12px] tabular-nums text-[#4a4438]">
        {row.part}
      </td>
      <td className={`py-2.5 pr-2 text-right align-top font-mono text-[13px] font-semibold tabular-nums ${inkTone}`}>
        <span aria-hidden>
          <CountUpInk end={row.reussiteNum} decimals={1} suffix=" %" duration={1.2} />
        </span>
        <span className="sr-only">{row.reussite}</span>
      </td>
      <td className="hidden py-2.5 pr-2 text-right align-top font-mono text-[11px] tabular-nums text-[#857c69] sm:table-cell">
        {row.delta}
      </td>
      <td className="hidden py-2.5 align-middle sm:table-cell">
        <div className="ml-auto h-6 w-20">
          <InkLine
            data={row.spark}
            w={80}
            h={24}
            stroke={hot ? VERMILION : INK}
            markIndex={row.markIndex}
            duration={0.9}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * Legend box — the plate's ledger. A real <table> (the decorative map's text
 * equivalent), reconciliation footer, and the editor's margin note steering
 * readers to the page-3 enquête. The note sits in flow below the table,
 * rotated like a pencil aside, so it never overflows narrow viewports.
 */
function CartoLegend() {
  return (
    <SettleIn className="border border-[#1c1914] bg-[#eee6d6] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
          <MapPin aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
          Légende & relevés
        </h3>
        <span className={T.folio}>11 juin</span>
      </div>
      <Rule className="mt-3 bg-[#1c1914]" />
      <table className="mt-1 w-full border-collapse">
        <caption className="sr-only">
          Disponibilité par région le 11 juin : part du trafic, taux de réussite, écart à la
          veille et relevé horaire de 08 h à 19 h.
        </caption>
        <thead>
          <tr className="border-b-2 border-[#1c1914]">
            <th scope="col" className={`py-2 pr-2 text-left ${T.folio}`}>
              Région
            </th>
            <th scope="col" className={`py-2 pr-2 text-right ${T.folio}`}>
              Part
            </th>
            <th scope="col" className={`py-2 pr-2 text-right ${T.folio}`}>
              Réussite
            </th>
            <th scope="col" className={`hidden py-2 pr-2 text-right sm:table-cell ${T.folio}`}>
              Δ&nbsp;j−1
            </th>
            <th scope="col" className={`hidden py-2 text-right sm:table-cell ${T.folio}`}>
              08 h – 19 h
            </th>
          </tr>
        </thead>
        <tbody>
          {CARTO_REGIONS.map((row) => (
            <CartoLegendRow key={row.region} row={row} />
          ))}
        </tbody>
      </table>
      {/* reconciliation line — the ledger balances against the masthead totals */}
      <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-[#1c1914] pt-2.5 ${T.folio}`}>
        <span className="flex items-center gap-1.5">
          <RadioTower aria-hidden className="h-3 w-3" strokeWidth={2} />1 904 sites
        </span>
        <span aria-hidden>·</span>
        <span>{EDITION.rows} lignes</span>
        <span aria-hidden>·</span>
        <span>moyenne pondérée {EDITION.successRate}</span>
      </div>
      {/* symbol key — what the plate's ink means, in three glyphs */}
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-[#d6ccb6] pt-3 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
            <circle cx="7" cy="7" r="3" fill={VERMILION} />
            <circle cx="7" cy="7" r="6" fill="none" stroke={VERMILION} strokeWidth="1.2" strokeOpacity="0.55" />
          </svg>
          <dt className="sr-only">Point vermillon cerclé</dt>
          <dd className={T.folio}>incident signalé</dd>
        </div>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
            <circle cx="3.5" cy="4" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="8" cy="4" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="12.5" cy="4" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="5.5" cy="9" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="10" cy="9" r="1.3" fill={INK} fillOpacity="0.35" />
          </svg>
          <dt className="sr-only">Trame de points</dt>
          <dd className={T.folio}>territoire couvert</dd>
        </div>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
            <circle
              cx="7"
              cy="7"
              r="5.4"
              fill="none"
              stroke={VERMILION}
              strokeWidth="1.3"
              strokeDasharray="2.4 2.2"
            />
          </svg>
          <dt className="sr-only">Cercle pointillé vermillon</dt>
          <dd className={T.folio}>annotation de l'éditeur</dd>
        </div>
      </dl>
      {/* the pencilled aside — vermilion, slightly askew, points at page 3 */}
      <div className="mt-4 flex justify-end pr-1">
        <MarginNote side="right">
          <a
            href="#lead"
            className="underline decoration-[#bf3415]/50 decoration-1 underline-offset-2 transition-colors hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
          >
            l'Est a fait la une — voir l'enquête p. 3 ↘
          </a>
        </MarginNote>
      </div>
    </SettleIn>
  );
}

/**
 * Feuille de relevés — the surveyor's hourly log behind a disclosure. Real
 * <button> with aria-expanded/aria-controls; the panel enters on opacity and
 * a small y-slide only (no height animation — motion budget). The 16 h 04 row
 * is the page-3 incident, flagged in vermilion.
 */
function CartoReadingsSheet() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border border-[#d6ccb6]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1c1914]/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
      >
        <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.18em] text-[#1c1914]">
          Feuille de relevés — 11 juin
        </span>
        <span className="flex items-center gap-2">
          <span className={`hidden sm:block ${T.folio}`}>9 mesures</span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-[#4a4438] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: EASE_INK }}
            className="border-t border-[#d6ccb6] px-4 pb-4"
          >
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Relevés horaires du 11 juin : heure, région mesurée, taux de réussite et note du
                bureau des cartes.
              </caption>
              <thead>
                <tr className="border-b border-[#d6ccb6]">
                  <th scope="col" className={`py-2 pr-3 text-left ${T.folio}`}>
                    Heure
                  </th>
                  <th scope="col" className={`py-2 pr-3 text-left ${T.folio}`}>
                    Région
                  </th>
                  <th scope="col" className={`py-2 pr-3 text-right ${T.folio}`}>
                    Réussite
                  </th>
                  <th scope="col" className={`hidden py-2 text-left sm:table-cell ${T.folio}`}>
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {CARTO_READINGS.map((r) => (
                  <tr
                    key={r.heure}
                    className={`border-b border-[#d6ccb6]/70 last:border-b-0 ${
                      r.alarm ? "text-[#bf3415]" : "text-[#1c1914]"
                    }`}
                  >
                    <td className="py-1.5 pr-3 font-mono text-[11px] tabular-nums">{r.heure}</td>
                    <td className="py-1.5 pr-3 font-grotesk text-[11px] font-semibold uppercase tracking-[0.06em]">
                      {r.region}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[11px] font-semibold tabular-nums">
                      {r.valeur}
                    </td>
                    <td className="hidden py-1.5 font-serif text-[12.5px] italic leading-snug text-[#4a4438] sm:table-cell">
                      {r.alarm ? <span className="text-[#bf3415]">{r.note}</span> : r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  DÉPÊCHES RÉGIONALES — three datelined briefs under the plate
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * One dispatch. Dateline in small caps, body in serif, the figure set large
 * in mono beneath — a news brief with its own statistic. The half-degree
 * rotation from index math gives each brief the faint misregistration of a
 * page pulled off a real press.
 */
function CartoDispatch({ item, index }: { item: CartoDispatchItem; index: number }) {
  const tilt = Math.sin(index * 2.7) * 0.45;
  return (
    <SettleIn delay={index * 0.1} className="md:px-6 md:first:pl-0 md:last:pr-0">
      <article style={{ transform: `rotate(${tilt}deg)` }}>
        <div className={`flex items-baseline justify-between gap-2 ${T.folio}`}>
          <span>Dépêche · {item.heure}</span>
          <span className="uppercase">{item.canal}</span>
        </div>
        <Rule className="mb-3 mt-1.5 bg-[#1c1914]" />
        <p className="font-serif text-[16px] leading-[1.55] text-[#1c1914]">
          <span className="font-grotesk text-[13px] font-bold uppercase tracking-[0.1em]">
            {item.dateline} —{" "}
          </span>
          {item.body}
        </p>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-[1.3rem] font-semibold tabular-nums leading-none text-[#1c1914]">
            {item.figure}
          </span>
          <span className={T.folio}>{item.figureLabel}</span>
        </div>
      </article>
    </SettleIn>
  );
}

/**
 * The dispatch rail — an uneven three-column setting (first column wider,
 * hairline column rules) so it reads as a newspaper brief column, not a
 * feature-card grid. Stacks with generous rhythm below md.
 */
function CartoDispatchRail() {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-serif text-[1.55rem] font-medium leading-tight tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
          Dépêches régionales
        </h3>
        <span className={T.folio}>trois brèves · bouclées le 11 juin, 23 h 59</span>
      </div>
      <DoubleRule className="mt-3" />
      <div className="mt-6 grid gap-y-10 md:grid-cols-[1.15fr_1fr_1fr] md:divide-x md:divide-[#d6ccb6] md:gap-y-0">
        {CARTO_DISPATCHES.map((item, i) => (
          <CartoDispatch key={item.dateline} item={item} index={i} />
        ))}
      </div>
      <div className="mt-8 flex justify-end">
        <InkLink href="#lead">
          L'enquête complète sur l'incident de l'Est — p. 3
          <ArrowUpRight aria-hidden className="ml-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.2} />
        </InkLink>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  NOTE TECHNIQUE — the footnote band the security team reads twice
 * ═════════════════════════════════════════════════════════════════════════════ */

/** One row of the layer inventory: name + spec on the left, weight right. */
function CartoLayerLine({ layer }: { layer: CartoLayerRow }) {
  return (
    <li className="border-b border-[#d6ccb6] py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-grotesk text-[13px] font-semibold text-[#1c1914]">{layer.couche}</span>
        <span className="font-mono text-[12px] tabular-nums text-[#1c1914]">{layer.poids}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-mono text-[10px] tracking-[0.06em] text-[#857c69]">{layer.detail}</span>
        <span className="font-serif text-[12.5px] italic text-[#4a4438]">{layer.note}</span>
      </div>
    </li>
  );
}

/**
 * Full-bleed deep-paper band. Left: the bunker line (verbatim, in guillemets,
 * as the desk's official position) plus the sober English explanation and a
 * green RENDU LOCAL stamp. Right: the layer inventory with its 29,0 Mo total
 * and the zero-outbound-requests counter — WifiOff is the only icon allowed
 * to editorialise here.
 */
function CartoFootnote() {
  return (
    <div className="border-y border-[#d6ccb6] bg-[#eee6d6]">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className={T.kicker}>Note technique — le fond de carte</p>
            <SettleIn className="mt-4">
              <p className="font-serif text-[clamp(1.45rem,2.6vw,2rem)] font-medium leading-[1.25] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
                « Cartes PMTiles embarquées — fonctionne dans un{" "}
                <PenUnderline delay={0.5}>bunker</PenUnderline>. »
              </p>
            </SettleIn>
            <SettleIn delay={0.1} className="mt-5 max-w-[52ch]">
              <p className={T.ui}>
                The base map ships inside the installer and renders with MapLibre GL straight
                from disk. No tile server, no API key, no outbound request — if the building
                loses its uplink, page 8 prints anyway. The régions join onto the CSV in the
                same DuckDB process that set the rest of this edition.
              </p>
            </SettleIn>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Stamp color={STAMP_GREEN} tilt={-6}>
                Rendu local
              </Stamp>
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#4a4438]">
                <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                requêtes sortantes pendant le rendu : 0
              </span>
            </div>
          </div>
          <SettleIn delay={0.15}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="flex items-center gap-2 font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
                <Layers aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                Inventaire des couches
              </h3>
              <span className={T.folio}>5 couches · 29,0 Mo</span>
            </div>
            <Rule className="mt-3 bg-[#1c1914]" />
            <ul className="mt-1">
              {CARTO_LAYERS.map((layer) => (
                <CartoLayerLine key={layer.couche} layer={layer} />
              ))}
            </ul>
            <p className={`mt-3 ${T.folio}`}>
              poids total vérifié au bouclage — rien d'autre ne touche le disque
            </p>
          </SettleIn>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  ACCESSIBILITY — the spoken version of the plate
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Screen-reader summary. The map stack is aria-hidden end to end, so this
 * paragraph + list state everything the ink says: the three callouts, the
 * incident hour, and each région's verdict from the legend data.
 */
function CartoSrSummary() {
  return (
    <div className="sr-only">
      <p>
        Carte des régions du 11 juin : le Nord tient 99,2 % de réussite, le Centre 98,9 %, et
        l'Est signale un incident de passerelle survenu à 16 h 04, ramenant sa journée à
        91,4 %. Détail complet par région ci-dessous, dans la légende.
      </p>
      <ul>
        {CARTO_REGIONS.map((r) => (
          <li key={r.region}>
            {r.region} ({r.chef}) : {r.part} du trafic, réussite {r.reussite}, écart {r.delta}{" "}
            point par rapport à la veille — {r.note}.
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  §10 ROOT — CartoSection
 *  Page rhythm: mast → headline + article column → plate (parallax pair) with
 *  legend rail → dispatch rail → technical footnote band → folio. The only
 *  other section referenced is #lead (the page-3 enquête), twice, on purpose.
 * ═════════════════════════════════════════════════════════════════════════════ */

function CartoSection() {
  return (
    <section
      id="carto"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 2900px" }}
    >
      <div className="mx-auto max-w-[1180px] px-5 pb-8 pt-20 sm:px-8 sm:pt-28">
        <SectionMast rubrique="Cartographie" no="p. 8" />
        <CartoSrSummary />

        {/* ── headline row: deck left, article column right ─────────────────── */}
        <div className="mt-12 grid gap-10 sm:mt-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <SettleIn>
              <p className={T.kicker}>Rubrique VIII · le bureau des cartes</p>
            </SettleIn>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.5rem,5.2vw,4.5rem)] font-medium leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Six régions, one plate,
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.5rem,5.2vw,4.5rem)] font-medium leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  <PenUnderline delay={0.7}>no satellite</PenUnderline> required.
                </span>,
              ]}
            />
            <SettleIn delay={0.15} className="mt-6 max-w-[58ch]">
              <p className="font-grotesk text-[17px] leading-relaxed text-[#4a4438]">
                Geo analysis runs on the same desk as everything else: PMTiles base map in the
                installer, MapLibre drawing from disk, régions joined straight off the CSV. The
                map is finished before the kettle is.
              </p>
            </SettleIn>
            <Byline className="mt-6" name="Le bureau des cartes" desk="Géo hors ligne · MapLibre & PMTiles" />
          </div>
          <div className="lg:col-span-5 lg:pt-12">
            <DropCapParagraph>
              Maps are where dashboards go to exaggerate. The Daily Edition treats geography
              like any other column of the report: each of the 2 147 380 transactions carries a
              région, each région earns its dots on the plate, and the plate gets printed
              whether the news is good or not. On the 11th it mostly was — five régions filed
              between 97,8 % and 99,2 %.
            </DropCapParagraph>
            <p className={`mt-4 ${T.body}`}>
              The exception sits east. At 16 h 04 the Sfax gateway dropped, réussite fell to
              71,2 % inside the half-hour, and the desk re-routed 38 412 transactions through
              SFX-1 before the evening close. The full enquête runs on{" "}
              <a
                href="#lead"
                className="font-medium italic text-[#2b4a8b] underline decoration-[#2b4a8b]/40 underline-offset-[3px] transition-colors hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
              >
                page 3
              </a>
              ; the map just shows you where it happened.
            </p>
          </div>
        </div>

        {/* ── the plate + legend rail ───────────────────────────────────────────
             Two parallax speeds: the backing frame (20) lags the plate (45), so
             the pair separates as the reader scrolls — two physical plates on a
             light table. The backing frame is decorative, never interactive. */}
        <div className="mt-14 grid items-start gap-10 sm:mt-20 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <div className="relative">
            <Parallax speed={20} className="pointer-events-none absolute inset-0">
              <div
                aria-hidden
                className="absolute inset-0 translate-x-3 translate-y-4 border-2 border-[#1c1914]/25 sm:translate-x-5 sm:translate-y-6"
              />
            </Parallax>
            <Parallax speed={45}>
              <CartoPlate />
            </Parallax>
          </div>
          <div className="flex flex-col gap-5">
            <CartoLegend />
            <CartoReadingsSheet />
          </div>
        </div>

        {/* ── dépêches ──────────────────────────────────────────────────────── */}
        <div className="mt-20 sm:mt-24">
          <CartoDispatchRail />
        </div>
      </div>

      {/* ── note technique — full-bleed deep paper band ─────────────────────── */}
      <div className="mt-14 sm:mt-20">
        <CartoFootnote />
      </div>

      {/* ── folio ───────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-10 sm:px-8">
        <Rule className="mb-4" />
        <FolioLine page="p. 8" note="Cartographie · planche VIII · fond de carte embarqué" />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 11 — AlmanacSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §11 — L'ALMANACH · forecasting as the weather page
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The forecast rubrique is typeset like the météo page of a regional daily:
 *  a row of five day-cards with hand-inked sky glyphs, a large "planche météo"
 *  plate where ninety days of relevés hand over to a dashed projection inside
 *  a halftone confidence band, an éphémérides sidebar that parodies sunrise /
 *  sunset tables with the operator's real daily rhythm, and a seven-day
 *  échéancier whose ink literally pales past J+5 — the almanac admits doubt
 *  in print. Everything is computed on the device (augurs/ETS); the joke and
 *  the security promise are the same sentence.
 *
 *  Design intent
 *  ─────────────
 *  • The hero plate is ONE composed SVG (640×240): solid ink history (18 pts),
 *    vermilion dashed continuation (7 pts) anchored to the last relevé, and a
 *    press-blue halftone polygon for the 90 % band that fans out from "today".
 *    The band is drawn zero-width at the divider so uncertainty visibly GROWS —
 *    that is the editorial point of the whole page.
 *  • Day glyphs are margin doodles, not icon-font weather: wobbly InkPath
 *    suns, clouds and wind strokes. Failed-transaction "showers" fall in
 *    vermilion because red ink is the editor's, and failures are his beat.
 *  • Interactivity is one honest toggle (volume ⇄ taux de réussite) — real
 *    buttons, aria-pressed, the plate re-inks itself on swap.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.0 — TYPES
 * ──────────────────────────────────────────────────────────────────────────── */

type AlmanacTrend = "up" | "down";

type AlmanacGlyphId = "sun" | "cloudsun" | "cloud" | "rain" | "wind";

type AlmanacMoonPhase = "new" | "first" | "full" | "last";

type AlmanacSeriesId = "volume" | "reussite";

type AlmanacSeries = {
  id: AlmanacSeriesId;
  /** label on the plate toggle button */
  toggleLabel: string;
  /** unit line printed in the plate legend */
  unit: string;
  /** figure caption under the plate — newspaper convention, numbered */
  caption: string;
  /** fixed y-domain so the printed tick labels stay honest */
  yMin: number;
  yMax: number;
  ticks: ReadonlyArray<{ v: number; label: string }>;
  /** 18 daily relevés, Lun 26 mai → Jeu 12 juin (today, provisional) */
  history: ReadonlyArray<number>;
  /** 7 projected values, Ven 13 → Jeu 19 */
  forecast: ReadonlyArray<number>;
  lower: ReadonlyArray<number>;
  upper: ReadonlyArray<number>;
  /** annotation inked beside the last projected point */
  endNote: string;
};

type AlmanacDayForecast = {
  id: string;
  label: string;
  date: string;
  j: string;
  /** the parody saint's day — the almanac's oldest joke, kept alive */
  saint: string;
  glyph: AlmanacGlyphId;
  sky: string;
  volume: number;
  trend: AlmanacTrend;
  delta: string;
  band: string;
  /** last card spans two columns on the 360px grid so no orphan cell */
  wide: boolean;
};

type AlmanacEphemeride = {
  icon: typeof Sunrise;
  label: string;
  time: string;
  note: string;
};

type AlmanacMoonEntry = {
  phase: AlmanacMoonPhase;
  label: string;
  note: string;
  date: string;
};

type AlmanacHorizonEntry = {
  day: string;
  j: string;
  value: number;
  valueStr: string;
  lo: number;
  loStr: string;
  hi: number;
  hiStr: string;
  trend: AlmanacTrend;
  delta: string;
  /** rows past J+5 print in paled ink — the almanac's humility, typographic */
  faded: boolean;
};

type AlmanacModelEntry = {
  name: string;
  family: string;
  mape: string;
  verdict: string;
  retained: boolean;
  /** 12 residual points — the sparkline shows temperament, not triumph */
  residuals: ReadonlyArray<number>;
};

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.1 — DATA · relevés, projections, éphémérides
 *  Every figure is deterministic and cross-checked: day-card deltas are the
 *  true day-over-day percentages of the printed volumes, the Sunday dip in
 *  the corrections note matches the history series, and Mer 11 = 2 147 380
 *  is the same row count the masthead announces for DailyTransactions.csv.
 * ──────────────────────────────────────────────────────────────────────────── */

const ALMANAC_SERIES: Record<AlmanacSeriesId, AlmanacSeries> = {
  volume: {
    id: "volume",
    toggleLabel: "Volume",
    unit: "transactions / jour",
    caption: "Fig. 3 — Volume attendu, bande de confiance à 90 %",
    yMin: 1880000,
    yMax: 2320000,
    ticks: [
      { v: 1900000, label: "1,90 M" },
      { v: 2000000, label: "2,00 M" },
      { v: 2100000, label: "2,10 M" },
      { v: 2200000, label: "2,20 M" },
      { v: 2300000, label: "2,30 M" },
    ],
    // Lun 26 mai → Jeu 12 juin. Two weekend troughs, a steady drift upward,
    // and yesterday's CSV (2 147 380) sitting exactly where the masthead says.
    history: [
      2041930, 2068410, 2079260, 2102580, 2126340, 1968270, 1934580, 2057110, 2083640, 2096720,
      2121480, 2149860, 1989450, 1951210, 2088170, 2116090, 2147380, 2152840,
    ],
    forecast: [2184300, 2009800, 1973600, 2114500, 2138900, 2161200, 2187400],
    lower: [2146100, 1962600, 1917300, 2048400, 2061800, 2072100, 2085300],
    upper: [2222500, 2057000, 2029900, 2180600, 2216000, 2250300, 2289500],
    endNote: "≈ 2 187 k au 19 juin",
  },
  reussite: {
    id: "reussite",
    toggleLabel: "Taux de réussite",
    unit: "% de transactions réussies",
    caption: "Fig. 3 bis — Taux de réussite attendu, bande de confiance à 90 %",
    yMin: 95.4,
    yMax: 98.8,
    ticks: [
      { v: 96, label: "96 %" },
      { v: 97, label: "97 %" },
      { v: 98, label: "98 %" },
    ],
    // Success breathes against load: quiet Sundays clear the sky, busy
    // Fridays bring a little haze. Mer 11 = 97,4 % — the masthead figure.
    history: [
      97.1, 97.3, 97.2, 96.9, 96.6, 97.8, 97.9, 97.2, 97.0, 96.8, 96.7, 96.5, 97.7, 97.8, 97.1,
      96.9, 97.4, 97.3,
    ],
    forecast: [96.8, 97.9, 98.0, 97.2, 97.0, 96.9, 96.8],
    lower: [96.2, 97.4, 97.5, 96.5, 96.2, 96.0, 95.8],
    upper: [97.4, 98.4, 98.5, 97.9, 97.8, 97.8, 97.8],
    endNote: "≈ 96,8 % au 19 juin",
  },
};

const ALMANAC_SERIES_ORDER: ReadonlyArray<AlmanacSeriesId> = ["volume", "reussite"];

/** Dates printed along the plate's x-axis. Index 17 is today's divider. */
const ALMANAC_X_TICKS: ReadonlyArray<{ i: number; label: string }> = [
  { i: 0, label: "26 mai" },
  { i: 6, label: "1 juin" },
  { i: 12, label: "7 juin" },
  { i: 17, label: "12 juin" },
  { i: 21, label: "16 juin" },
  { i: 24, label: "19 juin" },
];

/** The five-day outlook row — Ven 13 → Mar 17, each with its parody saint. */
const ALMANAC_DAYS: ReadonlyArray<AlmanacDayForecast> = [
  {
    id: "ven13",
    label: "Ven",
    date: "13 juin",
    j: "J+1",
    saint: "St-Backup",
    glyph: "sun",
    sky: "Grand beau sur les canaux. Trafic dégagé toute la journée.",
    volume: 2184300,
    trend: "up",
    delta: "+1,5 %",
    band: "± 38 k",
    wide: false,
  },
  {
    id: "sam14",
    label: "Sam",
    date: "14 juin",
    j: "J+2",
    saint: "Ste-Réplique",
    glyph: "cloudsun",
    sky: "Voile de latence en matinée, dissipation vers midi.",
    volume: 2009800,
    trend: "down",
    delta: "−8,0 %",
    band: "± 47 k",
    wide: false,
  },
  {
    id: "dim15",
    label: "Dim",
    date: "15 juin",
    j: "J+3",
    saint: "St-Checksum",
    glyph: "cloud",
    sky: "Couvert — trafic au repos dominical, rien d'inquiétant.",
    volume: 1973600,
    trend: "down",
    delta: "−1,8 %",
    band: "± 56 k",
    wide: false,
  },
  {
    id: "lun16",
    label: "Lun",
    date: "16 juin",
    j: "J+4",
    saint: "Ste-Requête",
    glyph: "rain",
    sky: "Averses d'échecs isolées avant 9 h, à l'allumage des terminaux.",
    volume: 2114500,
    trend: "up",
    delta: "+7,1 %",
    band: "± 66 k",
    wide: false,
  },
  {
    id: "mar17",
    label: "Mar",
    date: "17 juin",
    j: "J+5",
    saint: "St-Rollback",
    glyph: "wind",
    sky: "Vent porteur sur les canaux mobiles, mer belle côté USSD.",
    volume: 2138900,
    trend: "up",
    delta: "+1,2 %",
    band: "± 77 k",
    wide: true,
  },
];

/** Sunrise/sunset, rewritten for a machine that never leaves the office. */
const ALMANAC_EPHEMERIDES: ReadonlyArray<AlmanacEphemeride> = [
  {
    icon: Database,
    label: "Compaction de la base",
    time: "00 h 05",
    note: "pendant que la ville dort, DuckDB range ses colonnes",
  },
  {
    icon: Sunrise,
    label: "Lever du flux",
    time: "06 h 12",
    note: "premiers paiements mobiles, cafés compris",
  },
  {
    icon: Store,
    label: "Ouverture des marchés",
    time: "08 h 00",
    note: "guichets, kiosques et distributeurs",
  },
  {
    icon: Coffee,
    label: "Creux méridien",
    time: "12 h 31",
    note: "le réseau déjeune aussi, −18 % sur tous les canaux",
  },
  {
    icon: Gauge,
    label: "Pic du trafic",
    time: "18 h 04",
    note: "heure de pointe — +34 % sur la moyenne du jour",
  },
  {
    icon: HardDrive,
    label: "Sauvegarde locale",
    time: "23 h 30",
    note: "coffre chiffré, aucun octet en voyage",
  },
  {
    icon: Sunset,
    label: "Coucher du flux",
    time: "23 h 47",
    note: "derniers SMS facturés, rideau",
  },
];

/** The data moon — the base waxes toward month-end, then someone purges. */
const ALMANAC_MOONS: ReadonlyArray<AlmanacMoonEntry> = [
  { phase: "full", label: "Pleine lune", note: "clôture mensuelle, la base déborde", date: "30 juin" },
  { phase: "last", label: "Dernier quartier", note: "audit des écarts", date: "7 juil." },
  { phase: "new", label: "Nouvelle lune", note: "purge des journaux", date: "14 juil." },
  { phase: "first", label: "Premier quartier", note: "revue de capacité", date: "21 juil." },
];

/** Seven days of ink — the échéancier behind the day-cards, bounds included. */
const ALMANAC_HORIZON: ReadonlyArray<AlmanacHorizonEntry> = [
  {
    day: "Ven 13",
    j: "J+1",
    value: 2184300,
    valueStr: "2 184 300",
    lo: 2146100,
    loStr: "2 146 100",
    hi: 2222500,
    hiStr: "2 222 500",
    trend: "up",
    delta: "+1,5 %",
    faded: false,
  },
  {
    day: "Sam 14",
    j: "J+2",
    value: 2009800,
    valueStr: "2 009 800",
    lo: 1962600,
    loStr: "1 962 600",
    hi: 2057000,
    hiStr: "2 057 000",
    trend: "down",
    delta: "−8,0 %",
    faded: false,
  },
  {
    day: "Dim 15",
    j: "J+3",
    value: 1973600,
    valueStr: "1 973 600",
    lo: 1917300,
    loStr: "1 917 300",
    hi: 2029900,
    hiStr: "2 029 900",
    trend: "down",
    delta: "−1,8 %",
    faded: false,
  },
  {
    day: "Lun 16",
    j: "J+4",
    value: 2114500,
    valueStr: "2 114 500",
    lo: 2048400,
    loStr: "2 048 400",
    hi: 2180600,
    hiStr: "2 180 600",
    trend: "up",
    delta: "+7,1 %",
    faded: false,
  },
  {
    day: "Mar 17",
    j: "J+5",
    value: 2138900,
    valueStr: "2 138 900",
    lo: 2061800,
    loStr: "2 061 800",
    hi: 2216000,
    hiStr: "2 216 000",
    trend: "up",
    delta: "+1,2 %",
    faded: false,
  },
  {
    day: "Mer 18",
    j: "J+6",
    value: 2161200,
    valueStr: "2 161 200",
    lo: 2072100,
    loStr: "2 072 100",
    hi: 2250300,
    hiStr: "2 250 300",
    trend: "up",
    delta: "+1,0 %",
    faded: true,
  },
  {
    day: "Jeu 19",
    j: "J+7",
    value: 2187400,
    valueStr: "2 187 400",
    lo: 2085300,
    loStr: "2 085 300",
    hi: 2289500,
    hiStr: "2 289 500",
    trend: "up",
    delta: "+1,2 %",
    faded: true,
  },
];

/** Shared scale bounds for the interval glyphs in the échéancier rows. */
const ALMANAC_HORIZON_MIN = 1917300;
const ALMANAC_HORIZON_MAX = 2289500;

/** Three augurs auditioned on 14 days of held-out relevés. One got the page. */
const ALMANAC_MODELS: ReadonlyArray<AlmanacModelEntry> = [
  {
    name: "Lissage exponentiel — ETS",
    family: "augurs · calculé sur l'appareil",
    mape: "2,8 %",
    verdict: "Retenu pour l'édition. Calme, ponctuel, n'invente rien.",
    retained: true,
    residuals: [0.4, -0.2, 0.3, -0.5, 0.1, 0.6, -0.3, 0.2, -0.1, 0.4, -0.4, 0.2],
  },
  {
    name: "Auto-régressif — AR(7)",
    family: "augurs · calculé sur l'appareil",
    mape: "3,4 %",
    verdict: "Solide en semaine, nerveux les lundis matin.",
    retained: false,
    residuals: [0.6, -0.8, 0.9, -0.4, 1.1, -0.6, 0.5, -1.0, 0.7, -0.3, 0.8, -0.5],
  },
  {
    name: "Naïve saisonnière",
    family: "témoin · même jour, semaine passée",
    mape: "5,1 %",
    verdict: "Recopie la semaine dernière et l'assume sans rougir.",
    retained: false,
    residuals: [1.2, -1.5, 0.8, -1.8, 1.4, -0.9, 1.6, -1.2, 0.9, -1.7, 1.3, -1.1],
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.2 — SKY GLYPHS · margin doodles, one stroke each
 *  Hand-wobbled paths, never icon-font geometry. The vermilion drops on the
 *  rain glyph are failed transactions — red ink belongs to the editor and to
 *  errors, and the météo page knows the difference is small.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Clear sky: a wobbly disc and eight quick rays, doodled in two strokes. */
function AlmanacGlyphSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M24 13 C 30 12, 35 17, 35 23 C 35 30, 30 35, 24 35 C 17 35, 13 30, 13 24 C 13 17, 18 13, 26 13"
        strokeWidth={2.2}
        duration={0.7}
      />
      <InkPath
        d="M24 3 L24 8 M24 40 L24 45 M3 24 L8 24 M40 24 L45 24 M9 9 L12.5 12.5 M35.5 35.5 L39 39 M39 9 L35.5 12.5 M12.5 35.5 L9 39"
        strokeWidth={2}
        delay={0.45}
        duration={0.6}
      />
    </svg>
  );
}

/** Latency haze: a sliver of sun ducking behind a low cumulus. */
function AlmanacGlyphCloudSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M29 7 C 34 7, 38 11, 38 16 M30 2 L30 5 M44 16 L41 16 M40 6 L37.5 8.5"
        strokeWidth={2}
        duration={0.5}
      />
      <InkPath
        d="M11 35 C 5 35, 4 27, 10 25 C 10 18, 20 16, 23 22 C 26 17, 35 19, 35 25 C 41 25, 42 34, 36 35 L11 35"
        strokeWidth={2.2}
        delay={0.35}
        duration={0.7}
      />
    </svg>
  );
}

/** Overcast: the Sunday cloud, drawn slow because nothing is happening. */
function AlmanacGlyphCloud({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M11 31 C 5 31, 4 23, 10 21 C 10 14, 20 12, 23 18 C 26 13, 36 15, 36 21 C 42 21, 43 30, 37 31 L11 31"
        strokeWidth={2.2}
        duration={0.8}
      />
      <InkPath d="M15 37 L33 37" stroke={INK_FADED} strokeWidth={1.8} delay={0.6} duration={0.3} />
    </svg>
  );
}

/** Failure showers: ink cloud, vermilion drops. Brief, local, survivable. */
function AlmanacGlyphRain({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath
        d="M11 29 C 5 29, 4 21, 10 19 C 10 12, 20 10, 23 16 C 26 11, 36 13, 36 19 C 42 19, 43 28, 37 29 L11 29"
        strokeWidth={2.2}
        duration={0.7}
      />
      <InkPath
        d="M16 34 L13 41 M24 34 L21 41 M32 34 L29 41"
        stroke={VERMILION}
        strokeWidth={2.2}
        delay={0.55}
        duration={0.45}
      />
    </svg>
  );
}

/** Tailwind, the meteorological kind: three gusts with quick arrowheads. */
function AlmanacGlyphWind({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <InkPath d="M5 15 Q 22 11, 38 15 M38 15 L33 11 M38 15 L33 19" strokeWidth={2.1} duration={0.5} />
      <InkPath
        d="M5 25 Q 24 21, 43 25 M43 25 L38 21 M43 25 L38 29"
        strokeWidth={2.1}
        delay={0.2}
        duration={0.5}
      />
      <InkPath
        d="M8 35 Q 22 32, 33 35 M33 35 L29 32 M33 35 L29 38"
        strokeWidth={2.1}
        delay={0.4}
        duration={0.45}
      />
    </svg>
  );
}

const ALMANAC_GLYPHS = {
  sun: AlmanacGlyphSun,
  cloudsun: AlmanacGlyphCloudSun,
  cloud: AlmanacGlyphCloud,
  rain: AlmanacGlyphRain,
  wind: AlmanacGlyphWind,
} as const;

/** Moon phases set in plain print geometry — fill says it all. */
function AlmanacMoon({ phase, className }: { phase: AlmanacMoonPhase; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill={phase === "new" ? INK : "none"}
        stroke={INK}
        strokeWidth="1.6"
      />
      {phase === "first" && <path d="M12 3 A 9 9 0 0 1 12 21 Z" fill={INK} />}
      {phase === "last" && <path d="M12 3 A 9 9 0 0 0 12 21 Z" fill={INK} />}
      {phase === "full" && (
        <g fill={INK} fillOpacity="0.3">
          <circle cx="9" cy="9" r="1.3" />
          <circle cx="14.5" cy="13.5" r="1" />
          <circle cx="10.5" cy="15.5" r="0.8" />
        </g>
      )}
    </svg>
  );
}

/**
 * The bureau's weather vane — a hand-inked compass rose that drifts on
 * parallax beside the headline. Pure ornament, openly admitted: every
 * almanac keeps one instrument it no longer reads.
 */
function AlmanacVane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <InkPath
        d="M60 14 C 86 15, 105 35, 104 60 C 103 87, 84 105, 59 104 C 34 103, 15 84, 16 59 C 17 33, 36 14, 62 14"
        strokeWidth={2}
        duration={1}
      />
      <InkPath d="M60 22 L60 38 M60 82 L60 98 M22 60 L38 60 M82 60 L98 60" strokeWidth={1.6} delay={0.5} duration={0.5} />
      {/* the needle settles north-north-east — toward Friday's peak */}
      <InkPath d="M48 76 L72 40 L66 70 Z" stroke={VERMILION} strokeWidth={2.2} delay={0.8} duration={0.6} />
      <text x="60" y="11" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
        N
      </text>
      <text x="60" y="117" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK_FADED}>
        S
      </text>
      <text x="113" y="64" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK_FADED}>
        E
      </text>
      <text x="7" y="64" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK_FADED}>
        O
      </text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.3 — THE PLANCHE MÉTÉO · one composed forecast plate
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * History (solid ink) hands over to projection (dashed vermilion) at a
 * dashed "AUJOURD'HUI" divider; the 90 % band fans out from that exact point
 * in press-blue halftone — InkArea's dot-screen, repurposed for uncertainty.
 * One SVG, fixed 640×240 viewBox, mono labels, hairline axes.
 */
function AlmanacChart({ series }: { series: AlmanacSeries }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[:]/g, "");
  const w = 640;
  const h = 240;
  const padL = 48;
  const padR = 18;
  const padT = 22;
  const padB = 30;
  const slots = series.history.length + series.forecast.length;

  const geom = useMemo(() => {
    const xAt = (i: number) => padL + (i * (w - padL - padR)) / (slots - 1);
    const yAt = (v: number) =>
      padT + (1 - (v - series.yMin) / (series.yMax - series.yMin)) * (h - padT - padB);
    const hPts = series.history.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    const anchor = hPts[hPts.length - 1];
    const hIdx = series.history.length - 1;
    const fPts = series.forecast.map((v, i) => ({ x: xAt(hIdx + 1 + i), y: yAt(v) }));
    const upPts = series.upper.map((v, i) => ({ x: xAt(hIdx + 1 + i), y: yAt(v) }));
    const loPts = series.lower.map((v, i) => ({ x: xAt(hIdx + 1 + i), y: yAt(v) }));
    const seg = (pts: ReadonlyArray<{ x: number; y: number }>) =>
      pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const at = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const histD = inkPathFrom(hPts);
    const projD = `M${at(anchor)} ${seg(fPts)}`;
    // Band: out along the upper bound, back along the lower, closed at the
    // anchor — zero-width at today, widest at J+7. Uncertainty, drawn.
    const bandD = `M${at(anchor)} ${seg(upPts)} ${seg([...loPts].reverse())} Z`;
    const upperD = `M${at(anchor)} ${seg(upPts)}`;
    const lowerD = `M${at(anchor)} ${seg(loPts)}`;
    return { xAt, yAt, hPts, anchor, fPts, histD, projD, bandD, upperD, lowerD };
  }, [series, slots]);

  const fLast = geom.fPts[geom.fPts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" aria-hidden>
      <defs>
        {/* InkArea's halftone screen, re-cut in press blue for the band */}
        <pattern id={`alm-ht-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.15" fill={PRESS_BLUE} fillOpacity="0.32" />
        </pattern>
      </defs>

      {/* y gridlines + tick labels — fixed domain, honest ticks */}
      {series.ticks.map((t) => (
        <g key={`yt-${t.v}`}>
          <line
            x1={padL}
            y1={geom.yAt(t.v)}
            x2={w - padR}
            y2={geom.yAt(t.v)}
            stroke={RULE}
            strokeWidth="1"
          />
          <text
            x={padL - 7}
            y={geom.yAt(t.v) + 3}
            textAnchor="end"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* baseline + x tick labels */}
      <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke={INK} strokeWidth="1.5" />
      <line x1={padL} y1={padT - 4} x2={padL} y2={h - padB} stroke={RULE} strokeWidth="1" />
      {ALMANAC_X_TICKS.map((t) => (
        <g key={`xt-${t.i}`}>
          <line
            x1={geom.xAt(t.i)}
            y1={h - padB}
            x2={geom.xAt(t.i)}
            y2={h - padB + 4}
            stroke={INK_SOFT}
            strokeWidth="1.2"
          />
          <text
            x={geom.xAt(t.i)}
            y={h - padB + 15}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* the 90 % band — fades in after the projection has been inked */}
      <motion.path
        d={geom.bandD}
        fill={`url(#alm-ht-${uid})`}
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.8, delay: 1.5 }}
      />
      <InkPath d={geom.upperD} stroke={PRESS_BLUE} strokeWidth={1.1} dashed delay={1.35} duration={0.7} />
      <InkPath d={geom.lowerD} stroke={PRESS_BLUE} strokeWidth={1.1} dashed delay={1.45} duration={0.7} />

      {/* history — solid ink, 18 relevés */}
      <InkPath d={geom.histD} strokeWidth={2.2} duration={1.2} />

      {/* projection — dashed vermilion continuation from the last relevé */}
      <InkPath d={geom.projD} stroke={VERMILION} strokeWidth={2.2} dashed delay={1.05} duration={0.9} />

      {/* today's divider — where the typesetting stops and the augury starts */}
      <line
        x1={geom.anchor.x}
        y1={padT - 4}
        x2={geom.anchor.x}
        y2={h - padB}
        stroke={VERMILION}
        strokeWidth="1.2"
        strokeDasharray="3 5"
        opacity="0.75"
      />
      <text
        x={geom.anchor.x}
        y={padT - 10}
        textAnchor="middle"
        fontSize="8"
        letterSpacing="1.6"
        fontFamily="var(--font-grotesk)"
        fontWeight="700"
        fill={VERMILION}
      >
        AUJOURD&rsquo;HUI
      </text>
      {/* the provisional relevé — open circle: counted, not yet closed */}
      <circle cx={geom.anchor.x} cy={geom.anchor.y} r="3.2" fill={PAPER} stroke={INK} strokeWidth="2" />

      {/* projected points settle in one by one once the line is drawn */}
      {geom.fPts.map((p, i) => (
        <motion.circle
          key={`fp-${p.x.toFixed(1)}`}
          cx={p.x}
          cy={p.y}
          r="2.4"
          fill={VERMILION}
          initial={reduce ? false : { opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: 1.25 + i * 0.09, duration: 0.3, ease: EASE_INK }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        />
      ))}

      {/* terminal annotation — the editor rings where the week should land */}
      <motion.circle
        cx={fLast.x}
        cy={fLast.y}
        r="8"
        fill="none"
        stroke={VERMILION}
        strokeWidth="1.8"
        initial={reduce ? false : { opacity: 0, scale: 1.7 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ delay: 2, duration: 0.4, ease: EASE_INK }}
        style={{ transformOrigin: `${fLast.x}px ${fLast.y}px` }}
      />
      <text
        x={fLast.x - 12}
        y={fLast.y - 12}
        textAnchor="end"
        fontSize="9.5"
        fontFamily="var(--font-mono)"
        fontWeight="600"
        fill={INK}
      >
        {series.endNote}
      </text>
    </svg>
  );
}

/** Legend swatches drawn at print scale — solid, dashed, halftone block. */
function AlmanacLegendSwatch({ kind }: { kind: "solid" | "dashed" | "band" }) {
  return (
    <svg viewBox="0 0 26 10" className="h-2.5 w-[26px] shrink-0" aria-hidden>
      {kind === "solid" && <line x1="1" y1="5" x2="25" y2="5" stroke={INK} strokeWidth="2.2" />}
      {kind === "dashed" && (
        <line x1="1" y1="5" x2="25" y2="5" stroke={VERMILION} strokeWidth="2.2" strokeDasharray="5 4" />
      )}
      {kind === "band" && (
        <g>
          <rect x="1" y="1" width="24" height="8" fill="none" stroke={PRESS_BLUE} strokeWidth="0.8" strokeOpacity="0.6" />
          <circle cx="6" cy="4" r="1.1" fill={PRESS_BLUE} fillOpacity="0.4" />
          <circle cx="12" cy="7" r="1.1" fill={PRESS_BLUE} fillOpacity="0.4" />
          <circle cx="18" cy="4" r="1.1" fill={PRESS_BLUE} fillOpacity="0.4" />
        </g>
      )}
    </svg>
  );
}

/** Volume ⇄ réussite. Real buttons, pressed state inked solid. */
function AlmanacSeriesToggle({
  active,
  onSelect,
}: {
  active: AlmanacSeriesId;
  onSelect: (id: AlmanacSeriesId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Choisir la série prévisionnelle"
      className="flex divide-x-2 divide-[#1c1914] border-2 border-[#1c1914]"
    >
      {ALMANAC_SERIES_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={active === id}
          onClick={() => onSelect(id)}
          className={`h-9 px-3 font-grotesk text-[11px] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] sm:px-4 ${
            active === id
              ? "bg-[#1c1914] text-[#f6f1e7]"
              : "bg-transparent text-[#4a4438] hover:bg-[#1c1914]/5"
          }`}
        >
          {ALMANAC_SERIES[id].toggleLabel}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.4 — THE FIVE-DAY ROW · weather cards for transaction skies
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacDayCard({ day, index }: { day: AlmanacDayForecast; index: number }) {
  const Glyph = ALMANAC_GLYPHS[day.glyph];
  const rising = day.trend === "up";
  return (
    <SettleIn
      delay={index * 0.08}
      className={`h-full bg-[#f6f1e7] ${day.wide ? "col-span-2 sm:col-span-1" : ""}`}
    >
      <article className="flex h-full flex-col px-4 py-4 sm:px-5 sm:py-5">
        <header className="flex items-baseline justify-between gap-2">
          <h4 className="font-grotesk text-[13px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
            {day.label} <span className="font-semibold text-[#857c69]">{day.date}</span>
          </h4>
          <span className={T.folio}>{day.j}</span>
        </header>
        <p className="mt-0.5 font-serif text-[11.5px] italic leading-tight text-[#857c69]">
          {day.saint}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <Glyph className="h-11 w-11 shrink-0" />
          <p className="font-serif text-[13px] italic leading-snug text-[#4a4438]">{day.sky}</p>
        </div>
        <div className="mt-auto pt-4">
          <div className="flex items-baseline gap-1.5">
            <CountUpInk end={day.volume} className="text-[17px] font-bold text-[#1c1914]" />
            <span className={T.folio}>tx</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className={`font-mono text-[12px] font-bold tabular-nums ${
                rising ? "text-[#2f6b3f]" : "text-[#bf3415]"
              }`}
            >
              {rising ? "▲" : "▼"} {day.delta}
            </span>
            <span className={T.folio}>I.C. 90 % {day.band}</span>
          </div>
        </div>
      </article>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.5 — ÉPHÉMÉRIDES · the operator's day, set like sunrise tables
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacEphemerideRow({ row }: { row: AlmanacEphemeride }) {
  const Icon = row.icon;
  return (
    <li className="px-4 py-2.5 sm:px-5">
      <div className="flex items-baseline gap-2.5">
        <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 translate-y-[2px] text-[#4a4438]" strokeWidth={1.8} />
        <span className="font-grotesk text-[12px] font-semibold uppercase tracking-[0.1em] text-[#1c1914]">
          {row.label}
        </span>
        {/* the dotted leader — the almanac's oldest piece of typography */}
        <span aria-hidden className="mx-1 flex-1 border-b border-dotted border-[#a89e8a]" />
        <span className="font-mono text-[13px] font-bold tabular-nums text-[#1c1914]">{row.time}</span>
      </div>
      <p className={`mt-0.5 pl-6 ${T.folio} normal-case tracking-normal`}>{row.note}</p>
    </li>
  );
}

function AlmanacEphemerides() {
  return (
    <SettleIn>
      <div className="border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]">
        <header className="border-b-2 border-[#1c1914] px-4 py-3 sm:px-5">
          <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.24em] text-[#1c1914]">
            Éphémérides des données
          </h3>
          <p className={`mt-1 ${T.folio} normal-case tracking-normal`}>
            heures locales — le PC ne change jamais de fuseau
          </p>
        </header>
        <ul className="divide-y divide-[#d6ccb6] py-1">
          {ALMANAC_EPHEMERIDES.map((row) => (
            <AlmanacEphemerideRow key={row.time} row={row} />
          ))}
        </ul>
        <footer className="border-t border-[#d6ccb6] px-4 py-3 sm:px-5">
          <p className="font-serif text-[12.5px] italic leading-snug text-[#4a4438]">
            Indice de fraîcheur du CSV&nbsp;: 9/10 — pressé ce matin, encore tiède à l&rsquo;ouverture.
          </p>
        </footer>
      </div>
    </SettleIn>
  );
}

/** The bureau's barometer — model confidence read like air pressure. */
function AlmanacBarometer() {
  return (
    <SettleIn delay={0.08}>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-4 sm:px-5">
        <h3 className={T.kicker}>Baromètre du modèle</h3>
        <div className="mt-2 flex items-center justify-center">
          <InkGauge value={90} label="confiance — 90 %" w={180} className="w-[180px] max-w-full" />
        </div>
        <dl className="mt-3 space-y-1.5 border-t border-[#d6ccb6] pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className={`${T.folio} normal-case tracking-[0.08em]`}>Pression réseau</dt>
            <dd className="font-mono text-[12px] font-semibold tabular-nums text-[#1c1914]">
              1 013 hPa — stable
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={`${T.folio} normal-case tracking-[0.08em]`}>Visibilité</dt>
            <dd className="font-mono text-[12px] font-semibold tabular-nums text-[#1c1914]">
              7 jours, puis brume
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={`${T.folio} normal-case tracking-[0.08em]`}>Houle des échecs</dt>
            <dd className="font-mono text-[12px] font-semibold tabular-nums text-[#1c1914]">
              2,6 % — mer belle
            </dd>
          </div>
        </dl>
      </div>
    </SettleIn>
  );
}

/** Lune des données — the base waxes and wanes with month-end. */
function AlmanacMoonStrip() {
  return (
    <SettleIn delay={0.14}>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <Moon aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.8} />
          <h3 className={T.kicker}>Lune des données</h3>
        </div>
        <ul className="mt-3 space-y-2.5">
          {ALMANAC_MOONS.map((m) => (
            <li key={m.date} className="flex items-center gap-3">
              <AlmanacMoon phase={m.phase} className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-grotesk text-[12px] font-semibold text-[#1c1914]">{m.label}</p>
                <p className={`${T.folio} normal-case tracking-normal`}>{m.note}</p>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[#857c69]">{m.date}</span>
            </li>
          ))}
        </ul>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.6 — L'ÉCHÉANCIER · seven days, bounds printed, ink that pales
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacHorizonRow({ row }: { row: AlmanacHorizonEntry }) {
  const rising = row.trend === "up";
  const span = ALMANAC_HORIZON_MAX - ALMANAC_HORIZON_MIN;
  const at = (v: number) => 4 + ((v - ALMANAC_HORIZON_MIN) / span) * 56;
  return (
    <tr className={`border-b border-[#d6ccb6] ${row.faded ? "text-[#857c69]" : "text-[#1c1914]"}`}>
      <th scope="row" className="py-2.5 pr-3 text-left font-grotesk text-[12.5px] font-bold uppercase tracking-[0.1em]">
        {row.day}{" "}
        <span className="font-mono text-[10px] font-normal tracking-[0.08em] text-[#857c69]">
          {row.j}
          {row.faded ? " *" : ""}
        </span>
      </th>
      <td className="py-2.5 pr-3 text-right font-mono text-[13px] font-bold tabular-nums">
        {row.valueStr}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums md:table-cell">
        {row.loStr}
      </td>
      <td className="hidden py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums md:table-cell">
        {row.hiStr}
      </td>
      <td
        className={`py-2.5 pr-3 text-right font-mono text-[12px] font-bold tabular-nums ${
          row.faded ? "" : rising ? "text-[#2f6b3f]" : "text-[#bf3415]"
        }`}
      >
        {rising ? "▲" : "▼"} {row.delta}
      </td>
      <td className="py-2.5 text-right">
        {/* the interval, drawn: hairline track, blue band, vermilion point */}
        <svg viewBox="0 0 64 10" className="ml-auto h-2.5 w-16" aria-hidden>
          <line x1="4" y1="5" x2="60" y2="5" stroke={RULE} strokeWidth="1" />
          <line
            x1={at(row.lo)}
            y1="5"
            x2={at(row.hi)}
            y2="5"
            stroke={row.faded ? INK_FADED : PRESS_BLUE}
            strokeWidth="3"
            strokeOpacity={row.faded ? 0.55 : 0.8}
          />
          <circle cx={at(row.value)} cy="5" r="2.2" fill={row.faded ? INK_FADED : VERMILION} />
        </svg>
      </td>
    </tr>
  );
}

function AlmanacHorizonTable() {
  return (
    <SettleIn>
      <div className="border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden className="h-4 w-4 text-[#4a4438]" strokeWidth={1.8} />
            <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.24em] text-[#1c1914]">
              L&rsquo;échéancier — sept jours d&rsquo;encre
            </h3>
          </div>
          <span className={T.folio}>volume — transactions / jour</span>
        </header>
        <div className="overflow-x-auto px-4 sm:px-6">
          <table className="w-full min-w-[520px] border-collapse">
            <caption className="sr-only">
              Prévision de volume à sept jours avec bornes de confiance à 90 %
            </caption>
            <thead>
              <tr className="border-b-2 border-[#1c1914]">
                <th scope="col" className={`py-2.5 pr-3 text-left ${T.folio}`}>
                  Jour
                </th>
                <th scope="col" className={`py-2.5 pr-3 text-right ${T.folio}`}>
                  Prévu
                </th>
                <th scope="col" className={`hidden py-2.5 pr-3 text-right md:table-cell ${T.folio}`}>
                  Borne basse
                </th>
                <th scope="col" className={`hidden py-2.5 pr-3 text-right md:table-cell ${T.folio}`}>
                  Borne haute
                </th>
                <th scope="col" className={`py-2.5 pr-3 text-right ${T.folio}`}>
                  Tendance
                </th>
                <th scope="col" className={`py-2.5 text-right ${T.folio}`}>
                  Intervalle
                </th>
              </tr>
            </thead>
            <tbody>
              {ALMANAC_HORIZON.map((row) => (
                <AlmanacHorizonRow key={row.j} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <footer className="px-4 py-3 sm:px-6">
          <p className={`${T.folio} normal-case tracking-normal`}>
            * au-delà de J+5, l&rsquo;encre pâlit volontairement&nbsp;: la bande s&rsquo;élargit, la
            certitude se retire sur la pointe des pieds.
          </p>
        </footer>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.7 — LES AUGURES · three models auditioned, one printed
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacModelCard({ model, index }: { model: AlmanacModelEntry; index: number }) {
  return (
    <SettleIn delay={index * 0.1} className="h-full">
      <article
        className={`relative flex h-full flex-col border-2 bg-[#f6f1e7] px-5 py-5 ${
          model.retained
            ? "border-[#1c1914] shadow-[4px_4px_0_#1c1914]"
            : "border-[#d6ccb6]"
        }`}
      >
        {model.retained && (
          <div className="absolute -top-3 right-4">
            <Stamp color={STAMP_GREEN} tilt={6}>
              Retenu
            </Stamp>
          </div>
        )}
        <h4 className="font-serif text-[19px] font-semibold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
          {model.name}
        </h4>
        <p className={`mt-1 ${T.folio} normal-case tracking-[0.06em]`}>{model.family}</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[26px] font-bold tabular-nums leading-none text-[#1c1914]">
              {model.mape}
            </span>
            <span className={`mt-1 block ${T.folio}`}>MAPE — 14 jours témoins</span>
          </div>
          {/* residual temperament: flat is virtue, jitter is gossip */}
          <div className="h-10 w-28 shrink-0">
            <InkLine
              data={model.residuals}
              w={112}
              h={40}
              stroke={model.retained ? INK : INK_FADED}
              duration={0.9}
            />
          </div>
        </div>
        <p className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13.5px] italic leading-snug text-[#4a4438]">
          {model.verdict}
        </p>
      </article>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.8 — NOTICES · the gale warning and the note de méthode
 * ──────────────────────────────────────────────────────────────────────────── */

/** Storm notice — the only box on the page allowed to raise its voice. */
function AlmanacNotice() {
  return (
    <SettleIn>
      <aside className="border-2 border-[#bf3415] bg-[#f6f1e7] px-5 py-4 shadow-[4px_4px_0_#bf3415]">
        <div className="flex flex-wrap items-center gap-3">
          <Stamp tilt={-5}>Avis</Stamp>
          <p className="font-serif text-[14.5px] leading-snug text-[#1c1914]">
            <strong className="font-semibold">Avis au lectorat —</strong> grains d&rsquo;échecs
            probables lundi 16 entre 8 h et 9 h sur le canal USSD, à l&rsquo;allumage des terminaux.
            L&rsquo;éditeur recommande un café avant d&rsquo;ouvrir le tableau de bord.
          </p>
        </div>
      </aside>
    </SettleIn>
  );
}

/** Note de méthode — the security promise, filed as a weather footnote. */
function AlmanacMethodNote() {
  return (
    <SettleIn>
      <aside className="border-l-[3px] border-[#bf3415] bg-[#eee6d6] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Sigma aria-hidden className="h-3.5 w-3.5 text-[#4a4438]" strokeWidth={1.8} />
          <h3 className={T.kicker}>Note de méthode — n° 12</h3>
        </div>
        <p className="mt-2 font-serif text-[15px] leading-relaxed text-[#1c1914]">
          Prévisions calculées sur l&rsquo;appareil (augurs/ETS) — la météo, elle, vient toujours du
          ciel.
        </p>
        <p className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${T.folio} normal-case`}>
          <Cpu aria-hidden className="h-3 w-3" strokeWidth={1.8} />
          <span>
            fenêtre 90 jours · saisonnalité hebdomadaire · MAPE 14 j&nbsp;: 2,8 % · 0 octet transmis
            · 0 antenne consultée
          </span>
        </p>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §11.9 — THE SECTION · l'almanach, page 9 of The Daily Edition
 * ──────────────────────────────────────────────────────────────────────────── */

function AlmanacSection() {
  const [seriesId, setSeriesId] = useState<AlmanacSeriesId>("volume");
  const reduce = useReducedMotion();
  const series = ALMANAC_SERIES[seriesId];

  return (
    <section
      id="almanac"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3500px" }}
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <SectionMast rubrique="L'Almanach — Prévisions" no="P. 9" />

        {/* ── headline block — the bureau introduces tomorrow ─────────────── */}
        <div className="relative mt-12 sm:mt-16">
          {/* the vane drifts in the wide margin; hidden where there is none */}
          <Parallax
            speed={34}
            rotate={5}
            className="pointer-events-none absolute -top-6 right-0 hidden w-36 opacity-80 xl:block"
          >
            <AlmanacVane className="h-auto w-full" />
          </Parallax>

          <div className="max-w-3xl">
            <SettleIn>
              <p className={`${T.kicker} flex items-center gap-2 text-[#bf3415]`}>
                <CloudSun aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                Rubrique météo — bulletin émis hier à 23 h 41, valable sept jours
              </p>
            </SettleIn>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Tomorrow&rsquo;s traffic,
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  set in <PenUnderline delay={0.7}>ink tonight</PenUnderline>
                </span>,
              ]}
            />
            <SettleIn delay={0.2}>
              <p className={`mt-6 max-w-2xl ${T.body}`}>
                A five-day outlook for the transaction sky, drawn from ninety days of relevés by a
                model that lives on your machine. The almanac works in airplane mode; the weather
                does not.
              </p>
            </SettleIn>
            <SettleIn delay={0.3} className="mt-5">
              <Byline name="Le Prévisionniste" desk="Bureau des modèles · colonne météo" />
              <p className="mt-1.5 font-mono text-[11px] tracking-[0.06em] text-[#857c69]">
                <TypeOn text="bulletin composé hors ligne — antenne facultative, encre obligatoire" speed={22} />
              </p>
            </SettleIn>
          </div>
        </div>

        {/* ── the five-day row ─────────────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <DoubleRule />
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className={T.kicker}>Prévisions — cinq prochains jours</h3>
            <span className={T.folio}>volume attendu par jour · intervalle à 90 %</span>
          </div>
          {/* hairline-grid: gap-px over a rule-coloured ground reads as
              column rules, exactly how a météo strip is ruled in print */}
          <div className="mt-4 grid grid-cols-2 gap-px border-2 border-[#1c1914] bg-[#d6ccb6] sm:grid-cols-5">
            {ALMANAC_DAYS.map((day, i) => (
              <AlmanacDayCard key={day.id} day={day} index={i} />
            ))}
          </div>
        </div>

        {/* ── plate + sidebar ──────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-10 sm:mt-16 lg:grid-cols-[1fr_320px] lg:gap-12">
          <div className="min-w-0">
            <SettleIn>
              <figure className="relative border-2 border-[#1c1914] bg-[#eee6d6] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
                {/* registration marks — the plate was proofed before printing */}
                <span aria-hidden className="pointer-events-none absolute -left-2 -top-2 h-4 w-4 border-l-2 border-t-2 border-[#1c1914]" />
                <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 h-4 w-4 border-r-2 border-t-2 border-[#1c1914]" />
                <span aria-hidden className="pointer-events-none absolute -bottom-2 -left-2 h-4 w-4 border-b-2 border-l-2 border-[#1c1914]" />
                <span aria-hidden className="pointer-events-none absolute -bottom-2 -right-2 h-4 w-4 border-b-2 border-r-2 border-[#1c1914]" />

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b-2 border-[#1c1914] px-4 py-3 sm:px-6">
                  <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.24em] text-[#1c1914]">
                    Planche météo — prévision à 7 jours
                  </h3>
                  <AlmanacSeriesToggle active={seriesId} onSelect={setSeriesId} />
                </div>

                <div className="px-3 pb-2 pt-4 sm:px-5">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={series.id}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, y: -8 }}
                      transition={{ duration: 0.35, ease: EASE_INK }}
                    >
                      <AlmanacChart series={series} />
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#d6ccb6] px-4 py-3 sm:px-6">
                  <span className="flex items-center gap-2">
                    <AlmanacLegendSwatch kind="solid" />
                    <span className={`${T.folio} normal-case tracking-[0.05em]`}>
                      relevé — 18 derniers jours
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <AlmanacLegendSwatch kind="dashed" />
                    <span className={`${T.folio} normal-case tracking-[0.05em]`}>
                      prévision ETS — 7 jours
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <AlmanacLegendSwatch kind="band" />
                    <span className={`${T.folio} normal-case tracking-[0.05em]`}>
                      bande de confiance à 90 %
                    </span>
                  </span>
                  <span className={`ml-auto ${T.folio}`}>{series.unit}</span>
                </div>

                <figcaption className="border-t-2 border-[#1c1914] px-4 py-3 sm:px-6">
                  <span className="font-serif text-[13.5px] italic text-[#4a4438]">
                    {series.caption}.
                  </span>{" "}
                  <span className="font-serif text-[13.5px] italic text-[#857c69]">
                    Le creux du dimanche n&rsquo;est pas une erreur&nbsp;; c&rsquo;est un dimanche.
                  </span>
                </figcaption>
              </figure>
            </SettleIn>

            {/* the editor's pencil hangs in the margin beside the band */}
            <div className="relative">
              <MarginNote className="mt-5 lg:absolute lg:-right-2 lg:top-4 lg:mt-0 xl:-right-8">
                past day five the ink admits doubt — the band widens on purpose.
              </MarginNote>
            </div>

            {/* ── the almanac column proper ──────────────────────────────── */}
            <div className="mt-10 max-w-2xl lg:pr-40 xl:pr-32">
              <SettleIn>
                <DropCapParagraph>
                  The almanac does not guess; it extrapolates with manners. Each evening the model
                  rereads ninety days of relevés, shakes them through an exponential smoother, and
                  prints Friday before Friday has formed an opinion. Saints du jour&nbsp;:
                  Saint-Backup et Sainte-Réplique. Expect clear traffic into the weekend, the usual
                  Sunday lull — observed forty-three times now, no longer considered dramatic — and
                  a Monday rebound brisk enough to deserve its own column. Plan the coffee
                  accordingly.
                </DropCapParagraph>
              </SettleIn>
              <PullQuote className="mt-8" cite="Dicton du bureau des prévisions, vérifié sur 90 jours">
                Rouge le soir, tableau plein d&rsquo;espoir&nbsp;; rouge le matin, incident en
                chemin.
              </PullQuote>
            </div>
          </div>

          {/* ── sidebar — éphémérides, baromètre, lune ─────────────────────── */}
          <aside className="space-y-6">
            <AlmanacEphemerides />
            <AlmanacBarometer />
            <AlmanacMoonStrip />
          </aside>
        </div>

        {/* ── échéancier + gale warning ────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <AlmanacHorizonTable />
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
            <SettleIn delay={0.1}>
              <p className="max-w-xl font-serif text-[13px] italic leading-relaxed text-[#857c69]">
                Correction — l&rsquo;almanach du 5 juin annonçait 1 952 000 relevés pour le dimanche
                8&nbsp;; il en est tombé 1 951 210. L&rsquo;écart (0,04 %) a été archivé sans
                commentaire.
              </p>
            </SettleIn>
            <AlmanacNotice />
          </div>
        </div>

        {/* ── the audition of the augurs ───────────────────────────────────── */}
        <div className="mt-12 sm:mt-16">
          <Rule />
          <SettleIn className="mt-8">
            <h3 className="max-w-2xl font-serif text-[clamp(1.5rem,3vw,2.1rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Three augurs auditioned. One made the page.
            </h3>
            <p className={`mt-3 max-w-2xl ${T.ui}`}>
              Every candidate trains on the same ninety days and answers for fourteen held-out
              mornings. Lowest mean error gets the column; the others wait politely in the
              margins, recomputed nightly in case the winner grows complacent.
            </p>
          </SettleIn>
          <div className="mt-8 grid gap-6 md:grid-cols-3 md:gap-5">
            {ALMANAC_MODELS.map((model, i) => (
              <AlmanacModelCard key={model.name} model={model} index={i} />
            ))}
          </div>
        </div>

        {/* ── note de méthode + folio ──────────────────────────────────────── */}
        <div className="mt-12 sm:mt-14">
          <AlmanacMethodNote />
        </div>

        <Rule className="mt-12" />
        <FolioLine className="mt-4" page="P. 9" note="Rubrique météo — aucune antenne consultée" />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 12 — ArchiveSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §12 — LES ARCHIVES · history & versioning as the morgue
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Old newsrooms kept every printed edition in a basement room they called
 *  the morgue. This section IS that room: a parallax shelf of the week's six
 *  past editions (no Sunday paper — the press rests), a "REGISTRE DES
 *  ÉDITIONS" ledger where every run is logged with its delta against the day
 *  before, a printed RECTIFICATIF proving that versions are kept rather than
 *  overwritten, three classified ads for the archive desk's quieter talents
 *  (lineage, reconciliation, restore), and a grep that finds Thursday's
 *  16 h 04 dip in 41 milliseconds.
 *
 *  Design intent
 *  ─────────────
 *  • Depth is literal: each shelf sheet rides its own Parallax speed —
 *    the deeper the edition, the slower it drifts (speed > 0 = behind the
 *    page plane, per the preamble's Parallax contract).
 *  • Versioning is told as print culture: a correction notice with the old
 *    figure struck in red pen, both versions kept on the shelf — not as a
 *    diff-viewer screenshot.
 *  • The ledger is the section's data spine: real-feeling seven-day numbers
 *    that reconcile against EDITION (jeu 11 = 2 147 380 lignes · 97,4 %),
 *    Sunday printed as «relâche», Thursday's réussite circled by the editor
 *    because that is the day the front page investigates.
 *  • All motion is transform/opacity/pathLength; everything gates behind
 *    useReducedMotion (Parallax, InkPath and Stamp do so internally).
 * ════════════════════════════════════════════════════════════════════════════ */

/* ── Data: the shelf ──────────────────────────────────────────────────────────
 * Six physical back-issues, deepest first. Issue numbers count back from
 * EDITION.issue (№ 847 = today, 12 juin) — Sunday 07 juin published nothing,
 * so the numbering skips a calendar day but not an issue.               */

type ArchiveSheetSpec = {
  id: string;
  /** dateline printed on the mini nameplate */
  date: string;
  issue: string;
  /** the day's one-line front-page head, set tiny */
  head: string;
  /** mono stat footer: lignes · réussite */
  stat: string;
  /** static rotation, −3..3 deg per the art direction */
  tilt: number;
  /** Parallax drift px — deeper = larger = slower against the page */
  speed: number;
  /** alternating paper stocks */
  stock: "deep" | "shade";
  /** left/top of the sheet inside the shelf, in % of the plate */
  x: number;
  y: number;
  /** greeked body layout — "a" two text cols, "b" text col + mini bars */
  layout: "a" | "b";
  /** small printed tag worn by a few sheets (rayon label, version tag) */
  tag?: string;
};

const ARCHIVE_SHEETS: ReadonlyArray<ArchiveSheetSpec> = [
  {
    id: "ven-05",
    date: "ven 05 juin",
    issue: "№ 841",
    head: "Mobile money carries the morning",
    stat: "2 094 113 lignes · 97,1 %",
    tilt: -3,
    speed: 46,
    stock: "deep",
    x: 0,
    y: 7,
    layout: "a",
    tag: "RAYON B",
  },
  {
    id: "sam-06",
    date: "sam 06 juin",
    issue: "№ 842",
    head: "Saturday runs light, behaves itself",
    stat: "1 862 447 lignes · 97,6 %",
    tilt: 2,
    speed: 38,
    stock: "shade",
    x: 12,
    y: 20,
    layout: "b",
  },
  {
    id: "lun-08",
    date: "lun 08 juin",
    issue: "№ 843",
    head: "Monday returns with 2,19 M receipts",
    stat: "2 188 902 lignes · 96,9 %",
    tilt: -2,
    speed: 31,
    stock: "deep",
    x: 24,
    y: 3,
    layout: "a",
  },
  {
    id: "mar-09",
    date: "mar 09 juin",
    issue: "№ 844",
    head: "A wrong drawer, quietly refiled",
    stat: "2 131 554 lignes · 97,0 %",
    tilt: 3,
    speed: 25,
    stock: "shade",
    x: 36,
    y: 17,
    layout: "b",
    tag: "v2 · corrigé",
  },
  {
    id: "mer-10",
    date: "mer 10 juin",
    issue: "№ 845",
    head: "Clean run, dull news, good news",
    stat: "2 156 209 lignes · 97,8 %",
    tilt: -1,
    speed: 19,
    stock: "deep",
    x: 48,
    y: 6,
    layout: "a",
  },
  {
    id: "jeu-11",
    date: "jeu 11 juin",
    issue: "№ 846",
    head: "The 16 h 04 dip makes the front page",
    stat: "2 147 380 lignes · 97,4 %",
    tilt: 2,
    speed: 12,
    stock: "shade",
    x: 60,
    y: 22,
    layout: "b",
    tag: "À LA UNE",
  },
];

/* ── Data: the ledger ─────────────────────────────────────────────────────────
 * One row per calendar day. Deltas are lignes vs the previous parution;
 * `rejetees` reconciles with réussite (lignes × (1 − réussite), rounded the
 * way a tired operator would). The 09 juin row is version 2 — its first
 * printing is preserved and confessed in the RECTIFICATIF below.         */

type ArchiveLedgerEntry = {
  id: string;
  jour: string;
  date: string;
  file: string;
  lignes: string;
  reussite: string;
  delta: { dir: "up" | "down"; text: string };
  duree: string;
  /** sha-256 fragment printed like a plate number */
  empreinte: string;
  /** Parquet snapshot weight */
  instantane: string;
  rejetees: string;
  /** one serif line the archivist allowed themselves */
  note: string;
  /** the day the editor circles — Thursday's 16 h 04 story */
  marked?: boolean;
  /** Sunday: the press rests, the row still prints */
  relache?: boolean;
  version?: string;
};

const ARCHIVE_LEDGER: ReadonlyArray<ArchiveLedgerEntry> = [
  {
    id: "ven-05",
    jour: "ven",
    date: "05.06",
    file: "DailyTransactions_2026-06-05.csv",
    lignes: "2 094 113",
    reussite: "97,1 %",
    delta: { dir: "up", text: "+1,8 %" },
    duree: "41 s",
    empreinte: "9f3a·17c2",
    instantane: "38,1 Mo",
    rejetees: "60 729",
    note: "A Friday like the textbooks promise: heavy, punctual, unremarkable.",
  },
  {
    id: "sam-06",
    jour: "sam",
    date: "06.06",
    file: "DailyTransactions_2026-06-06.csv",
    lignes: "1 862 447",
    reussite: "97,6 %",
    delta: { dir: "down", text: "−11,1 %" },
    duree: "37 s",
    empreinte: "b27e·d410",
    instantane: "33,9 Mo",
    rejetees: "44 699",
    note: "Weekend volume; the canaux mobiles keep the lights on.",
  },
  {
    id: "dim-07",
    jour: "dim",
    date: "07.06",
    file: "—",
    lignes: "—",
    reussite: "—",
    delta: { dir: "down", text: "—" },
    duree: "—",
    empreinte: "—",
    instantane: "—",
    rejetees: "—",
    note: "",
    relache: true,
  },
  {
    id: "lun-08",
    jour: "lun",
    date: "08.06",
    file: "DailyTransactions_2026-06-08.csv",
    lignes: "2 188 902",
    reussite: "96,9 %",
    delta: { dir: "up", text: "+17,5 %" },
    duree: "44 s",
    empreinte: "4cc1·08af",
    instantane: "39,8 Mo",
    rejetees: "67 856",
    note: "Monday's backlog arrives all at once, the way Mondays do.",
  },
  {
    id: "mar-09",
    jour: "mar",
    date: "09.06",
    file: "DailyTransactions_2026-06-09.csv",
    lignes: "2 131 554",
    reussite: "97,0 %",
    delta: { dir: "down", text: "−2,6 %" },
    duree: "42 s",
    empreinte: "e983·6b54",
    instantane: "38,7 Mo",
    rejetees: "63 947",
    note: "v1 misfiled 19 207 lignes under AGENCE; v2 confessed at 07 h 02. Both kept.",
    version: "v2",
  },
  {
    id: "mer-10",
    jour: "mer",
    date: "10.06",
    file: "DailyTransactions_2026-06-10.csv",
    lignes: "2 156 209",
    reussite: "97,8 %",
    delta: { dir: "up", text: "+1,2 %" },
    duree: "42 s",
    empreinte: "71d6·f2e9",
    instantane: "39,2 Mo",
    rejetees: "47 437",
    note: "The quietest run of the week. The archive likes quiet.",
  },
  {
    id: "jeu-11",
    jour: "jeu",
    date: "11.06",
    file: "DailyTransactions_2026-06-11.csv",
    lignes: "2 147 380",
    reussite: "97,4 %",
    delta: { dir: "down", text: "−0,4 %" },
    duree: "43 s",
    empreinte: "a3f2·91b0",
    instantane: "39,0 Mo",
    rejetees: "55 832",
    note: "The 16 h 04 dip — circled in red upstairs, filed in full down here.",
    marked: true,
  },
];

/** Réussite across the six parutions — the ledger's foot sparkline. The
 *  vermilion ring marks Thursday, agreeing with the editor's pen above. */
const ARCHIVE_SPARK: ReadonlyArray<number> = [97.1, 97.6, 96.9, 97.0, 97.8, 97.4];

/* ── Data: the classified ads ─────────────────────────────────────────────────
 * Three small ads from the archive desk, ruled like back-page classifieds.
 * Each leads with its French slogan — the desk speaks French to the data —
 * then permits itself exactly one English serif sentence.               */

type ArchiveAdSpec = {
  no: string;
  title: string;
  /** the French slogan, printed in guillemets */
  devise: string;
  line: string;
  foot: string;
  glyph: "lineage" | "scales" | "restore";
};

const ARCHIVE_ADS: ReadonlyArray<ArchiveAdSpec> = [
  {
    no: "ANN. 12-A",
    title: "Lignée des données",
    devise: "chaque chiffre cite sa source",
    line:
      "Click any total in any edition and the CSV rows that made it stand up to be counted — cell to line, line to file, file to checksum.",
    foot: "traçabilité cellule → ligne → fichier",
    glyph: "lineage",
  },
  {
    no: "ANN. 12-B",
    title: "Réconciliation",
    devise: "les écarts confessent",
    line:
      "When two editions disagree, the ledger names the rows, the canal and the minute. Discrepancies are explained here, never smoothed.",
    foot: "écarts expliqués · jamais lissés",
    glyph: "scales",
  },
  {
    no: "ANN. 12-C",
    title: "Restauration",
    devise: "hier revient en un clic",
    line:
      "Any edition reopens exactly as printed — same rows, same totals, same margins of error. Not a reconstruction; the paper itself.",
    foot: "restauration < 2 s · hors ligne",
    glyph: "restore",
  },
];

/** The standing-stats card beside the lead copy: what the basement holds. */
const ARCHIVE_HOLDINGS = [
  { label: "éditions en rayon", end: 365, suffix: "", decimals: 0 },
  { label: "instantanés Parquet", end: 9.4, suffix: " Go", decimals: 1 },
  { label: "restauration moyenne", end: 1.8, suffix: " s", decimals: 1 },
  { label: "octets sortis du poste", end: 0, suffix: "", decimals: 0 },
] as const;

/* ── Greeked body text ────────────────────────────────────────────────────────
 * The mini editions on the shelf carry unreadable body copy — printed greek.
 * Bar widths derive from index math (sin walk), never Math.random, so the
 * page renders identically on every press run.                          */

function ArchiveGreek({ rows, seed }: { rows: number; seed: number }) {
  return (
    <div aria-hidden className="space-y-[3px]">
      {Array.from({ length: rows }, (_, i) => {
        const w = 64 + Math.sin(seed * 1.7 + i * 2.7) * 28;
        // every ~5th line ends a paragraph short — real columns breathe
        const para = (i + seed) % 5 === 4;
        return (
          <div
            key={`g${seed}-${i}`}
            className="h-[2.5px] bg-[#1c1914]/[0.16]"
            style={{ width: `${para ? w * 0.55 : w}%` }}
          />
        );
      })}
    </div>
  );
}

/** Tiny deterministic bar chart for layout-"b" sheets — a printed graphic
 *  small enough to be furniture, real enough to feel typeset. */
function ArchiveGreekBars({ seed }: { seed: number }) {
  return (
    <div aria-hidden className="flex h-7 items-end gap-[2.5px]">
      {Array.from({ length: 9 }, (_, i) => {
        const h = 34 + Math.abs(Math.sin(seed * 2.3 + i * 1.9)) * 62;
        return (
          <div
            key={`b${seed}-${i}`}
            className="w-[4px] bg-[#1c1914]/[0.34]"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

/* ── One sheet on the shelf ───────────────────────────────────────────────────
 * A miniature past edition: nameplate, double rule, dateline, one headline,
 * greeked columns, stat footer. The front sheet (jeu 11) lifts 4px on hover —
 * the reader's hand reaching for yesterday. Rotation lives on a middle div so
 * the hover translate composes cleanly with the static tilt.            */

function ArchiveSheet({ sheet, front, index }: { sheet: ArchiveSheetSpec; front: boolean; index: number }) {
  const stock = sheet.stock === "deep" ? "bg-[#eee6d6]" : "bg-[#e4dac5]";
  return (
    <Parallax
      speed={sheet.speed}
      rotate={index % 2 === 0 ? 1.1 : -1.1}
      className="absolute w-[clamp(138px,30vw,225px)]"
      style={{ left: `${sheet.x}%`, top: `${sheet.y}%`, zIndex: index + 1 }}
    >
      <div style={{ transform: `rotate(${sheet.tilt}deg)` }}>
        <article
          className={`relative border border-[#1c1914]/25 px-3 pb-3 pt-2.5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] ${stock} ${
            front
              ? "transition-transform duration-300 ease-out hover:-translate-y-1"
              : ""
          }`}
        >
          {/* mini nameplate — the masthead in miniature */}
          <p className="text-center font-serif text-[10px] font-black leading-none tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            The Daily Edition
          </p>
          <DoubleRule className="mt-1.5" />
          <div className="mt-1 flex items-baseline justify-between font-mono text-[7px] uppercase tracking-[0.12em] text-[#857c69]">
            <span>{sheet.date}</span>
            <span>{sheet.issue}</span>
          </div>
          <Rule className="mt-1" />
          {/* the day's head — two lines max, set like a real single-column lede */}
          <h4 className="mt-1.5 font-serif text-[11px] font-bold leading-[1.12] text-[#1c1914]">
            {sheet.head}
          </h4>
          {/* greeked body, two layouts so the shelf never repeats itself */}
          {sheet.layout === "a" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ArchiveGreek rows={9} seed={index * 3 + 1} />
              <ArchiveGreek rows={9} seed={index * 3 + 2} />
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 items-end gap-2">
              <ArchiveGreek rows={9} seed={index * 3 + 1} />
              <div className="space-y-1.5">
                <ArchiveGreekBars seed={index + 2} />
                <ArchiveGreek rows={4} seed={index * 3 + 2} />
              </div>
            </div>
          )}
          <Rule className="mt-2" />
          <p className="mt-1 truncate text-center font-mono text-[7px] tabular-nums tracking-[0.04em] text-[#4a4438]">
            {sheet.stat}
          </p>
          {/* worn tags: rayon label on the deepest, version tag on the corrected,
              front-page cross-ref on the freshest */}
          {sheet.tag && (
            <span
              className={`absolute -right-1.5 top-7 rotate-[4deg] border px-1 py-px font-grotesk text-[6.5px] font-black uppercase tracking-[0.14em] ${
                sheet.tag === "v2 · corrigé"
                  ? "border-[#2f6b3f] bg-[#eee6d6] text-[#2f6b3f]"
                  : "border-[#bf3415] bg-[#f6f1e7] text-[#bf3415]"
              }`}
            >
              {sheet.tag}
            </span>
          )}
          {/* the front sheet earns a dog-eared corner — someone keeps reading it */}
          {front && (
            <span
              aria-hidden
              className="absolute bottom-0 right-0 h-4 w-4 border-l border-t border-[#1c1914]/25 bg-[#f6f1e7]"
            />
          )}
        </article>
      </div>
    </Parallax>
  );
}

/* ── The shelf itself ─────────────────────────────────────────────────────────
 * A relative plate the sheets float over, closed by a heavy "shelf board"
 * double rule with the rayon label. Sheets overlap left→right, deepest first
 * in DOM so z-index reads naturally.                                    */

function ArchiveShelf() {
  return (
    <div>
      <div className="relative h-[clamp(300px,40vw,460px)]">
        {ARCHIVE_SHEETS.map((sheet, i) => (
          <ArchiveSheet
            key={sheet.id}
            sheet={sheet}
            index={i}
            front={i === ARCHIVE_SHEETS.length - 1}
          />
        ))}
      </div>
      {/* the shelf board — the editions rest on it */}
      <SettleIn y={8}>
        <DoubleRule />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className={T.folio}>Rayon B — éditions récentes · classement chronologique</p>
          <Stamp tilt={-5} className="text-[9px]">
            Archivé ce matin
          </Stamp>
        </div>
      </SettleIn>
      <p className="mt-3 font-serif text-[13px] italic leading-snug text-[#857c69]">
        Pas d'édition le dimanche — the press rests, the archive does not. Hover the front
        issue: yesterday lifts to meet you.
      </p>
    </div>
  );
}

/* ── Delta cell ───────────────────────────────────────────────────────────────
 * ▲ in conserve-green, ▼ in vermilion, mono and tabular — the only colour the
 * ledger allows itself outside the editor's pen.                        */

function ArchiveDelta({ delta }: { delta: ArchiveLedgerEntry["delta"] }) {
  const up = delta.dir === "up";
  return (
    <span
      className={`font-mono text-[11px] font-semibold tabular-nums ${
        up ? "text-[#2f6b3f]" : "text-[#bf3415]"
      }`}
    >
      <span aria-hidden className="mr-0.5 text-[9px]">
        {up ? "▲" : "▼"}
      </span>
      <span className="sr-only">{up ? "hausse " : "baisse "}</span>
      {delta.text}
    </span>
  );
}

/* ── One ledger row ───────────────────────────────────────────────────────────
 * The whole row is a real <button> carrying aria-expanded; the chevron sits
 * inside the date cell like a proofreader's caret. Sunday renders as a quiet
 * italic strip — no file, no button, no exception. Expansion reveals the
 * snapshot details (empreinte, instantané, rejets) and the restore link.
 * Height is never animated (motion budget): the panel fades and settles,
 * layout snaps — like a drawer, not an accordion.                       */

function ArchiveLedgerRow({
  entry,
  open,
  onToggle,
}: {
  entry: ArchiveLedgerEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  if (entry.relache) {
    return (
      <div className="border-b border-[#d6ccb6] px-1 py-2.5">
        <p className="font-serif text-[13px] italic text-[#857c69]">
          <span className="mr-3 font-mono text-[11px] not-italic">{entry.jour} {entry.date}</span>
          relâche dominicale — pas de fichier, pas d'édition, pas d'exception.
        </p>
      </div>
    );
  }
  const panelId = `archive-panel-${entry.id}`;
  return (
    <div className="border-b border-[#d6ccb6]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[4.6rem_minmax(0,1fr)_4.4rem_3.9rem] items-baseline gap-x-2 px-1 py-2.5 text-left transition-colors hover:bg-[#1c1914]/[0.035] focus-visible:outline-2 focus-visible:outline-[#bf3415] focus-visible:outline-offset-[-2px] md:grid-cols-[5rem_minmax(0,1fr)_5.6rem_4.4rem_4.6rem_3.4rem]"
      >
        {/* date + caret */}
        <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-[#1c1914]">
          <ChevronDown
            aria-hidden
            className={`h-3 w-3 shrink-0 text-[#857c69] transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
          {entry.jour} {entry.date}
        </span>
        {/* fichier — desktop only; mobile gives the column to the numbers */}
        <span className="hidden truncate font-mono text-[10px] text-[#4a4438] md:block">
          {entry.file}
          {entry.version && (
            <span className="ml-1.5 border border-[#2f6b3f] px-1 font-grotesk text-[8px] font-black uppercase tracking-[0.1em] text-[#2f6b3f]">
              {entry.version}
            </span>
          )}
        </span>
        {/* mobile keeps a compressed file hint in the flexible column */}
        <span className="truncate font-mono text-[10px] text-[#857c69] md:hidden">
          …{entry.file.slice(-14)}
        </span>
        <span className="text-right font-mono text-[11px] tabular-nums text-[#1c1914]">
          {entry.lignes}
        </span>
        <span className="text-right font-mono text-[11px] tabular-nums text-[#1c1914]">
          {entry.marked ? <PenCircle delay={0.6}>{entry.reussite}</PenCircle> : entry.reussite}
        </span>
        <span className="hidden text-right md:block">
          <ArchiveDelta delta={entry.delta} />
        </span>
        <span className="hidden text-right font-mono text-[10px] tabular-nums text-[#857c69] md:block">
          {entry.duree}
        </span>
      </button>
      {/* mobile shows the delta beneath the row since its column is hidden */}
      <div className="flex justify-end px-1 pb-1.5 md:hidden">
        <ArchiveDelta delta={entry.delta} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: EASE_INK }}
            className="mb-2.5 border-l-2 border-[#1c1914] bg-[#eee6d6] px-3 py-3"
          >
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <p className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-[#4a4438]">
                <Fingerprint aria-hidden className="h-3 w-3 shrink-0 text-[#857c69]" />
                sha-256 · {entry.empreinte}…{entry.version ? " (v2 signée)" : ""}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                instantané Parquet · {entry.instantane}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                lignes rejetées · {entry.rejetees}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                traitement · {entry.duree} sur ce poste
              </p>
            </div>
            <p className="mt-2.5 font-serif text-[13.5px] italic leading-snug text-[#1c1914]">
              {entry.note}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 font-grotesk text-[12px] font-bold uppercase tracking-[0.12em] text-[#1c1914] underline decoration-[#bf3415] decoration-2 underline-offset-4 transition-colors hover:text-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                Restaurer cette édition
              </Link>
              <span className={T.folio}>byte for byte · sans réseau</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* the marked row hangs its margin note straight into the column —
          basement annotations don't wait for a margin to exist */}
      {entry.marked && (
        <div className="-mt-0.5 mb-2 flex justify-end pr-1">
          <MarginNote side="left" className="w-52">
            le creux de 16 h 04 — la une s'en charge,{" "}
            <a
              href="#lead"
              className="underline decoration-[#bf3415]/50 underline-offset-2 hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              voir p.3
            </a>
          </MarginNote>
        </div>
      )}
    </div>
  );
}

/* ── The ledger ───────────────────────────────────────────────────────────────
 * REGISTRE DES ÉDITIONS — the section's data spine. One open row at a time
 * (a registry, not a filing explosion); Thursday opens by default because
 * Thursday is the story. Foot carries the week's réussite sparkline with the
 * same vermilion ring the editor drew upstairs.                         */

function ArchiveLedger() {
  const [openId, setOpenId] = useState<string | null>("jeu-11");
  return (
    <SettleIn>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-grotesk text-[13px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
          <FileClock aria-hidden className="h-4 w-4 text-[#bf3415]" />
          Registre des éditions
        </h3>
        <span className={T.folio}>semaine 24 · tenu à la main, vérifié à la machine</span>
      </div>
      <DoubleRule className="mt-2" />
      {/* column heads — the mobile grid drops fichier/Δ/durée into the rows */}
      <div className="grid grid-cols-[4.6rem_minmax(0,1fr)_4.4rem_3.9rem] gap-x-2 px-1 pb-1.5 pt-2.5 md:grid-cols-[5rem_minmax(0,1fr)_5.6rem_4.4rem_4.6rem_3.4rem]">
        <span className={T.folio}>date</span>
        <span className={T.folio}>fichier</span>
        <span className={`${T.folio} text-right`}>lignes</span>
        <span className={`${T.folio} text-right`}>
          <span className="md:hidden">réuss.</span>
          <span className="hidden md:inline">réussite</span>
        </span>
        <span className={`${T.folio} hidden text-right md:block`}>Δ veille</span>
        <span className={`${T.folio} hidden text-right md:block`}>durée</span>
      </div>
      <div className="border-t border-[#1c1914]">
        {ARCHIVE_LEDGER.map((entry) => (
          <ArchiveLedgerRow
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
          />
        ))}
      </div>
      {/* week totals — the registrar rules off and sums the page. The Σ row
          reconciles by hand: six parutions, 12 580 605 lignes, mean 97,3 %. */}
      <div className="grid grid-cols-[4.6rem_minmax(0,1fr)_4.4rem_3.9rem] gap-x-2 border-b border-t-2 border-[#1c1914] border-b-[#d6ccb6] px-1 py-2.5 md:grid-cols-[5rem_minmax(0,1fr)_5.6rem_4.4rem_4.6rem_3.4rem]">
        <span className="font-mono text-[11px] font-semibold text-[#1c1914]">Σ S24</span>
        <span className="hidden font-serif text-[12px] italic text-[#857c69] md:block">
          six parutions servies, une relâche, un rectificatif
        </span>
        <span className="font-serif text-[12px] italic text-[#857c69] md:hidden">6 parutions</span>
        <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-[#1c1914]">
          12 580 605
        </span>
        <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-[#1c1914]">
          97,3 %
        </span>
        <span className="hidden text-right font-mono text-[10px] tabular-nums text-[#857c69] md:block">
          moy.
        </span>
        <span className="hidden text-right font-mono text-[10px] tabular-nums text-[#857c69] md:block">
          249 s
        </span>
      </div>
      {/* foot sparkline — six parutions of réussite, Thursday ringed */}
      <div className="mt-4 flex items-end gap-4">
        <div className="h-12 w-44 shrink-0 sm:w-56">
          <InkLine data={ARCHIVE_SPARK} w={224} h={48} markIndex={5} duration={1.1} />
        </div>
        <p className={`${T.folio} pb-0.5`}>
          réussite — 6 parutions · min 96,9 · max 97,8 · l'anneau, c'est jeudi
        </p>
      </div>
    </SettleIn>
  );
}

/* ── Ink glyphs for the classified ads ────────────────────────────────────────
 * Hand-drawn, not iconography: each glyph is two or three InkPath strokes
 * that draw themselves in view, like the archivist sketching the idea in
 * the ad's corner. 40×40 viewBox, pen-weight strokes.                   */

function ArchiveGlyphLineage() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      {/* one figure, two parents, four grandparents — provenance as a family tree */}
      <InkPath d="M20 35 V22" strokeWidth={2.2} duration={0.4} />
      <InkPath d="M20 22 C20 15 9 17 9 10" strokeWidth={2} delay={0.25} duration={0.45} />
      <InkPath d="M20 22 C20 15 31 17 31 10" strokeWidth={2} delay={0.35} duration={0.45} />
      <InkPath d="M9 10 C9 7 5 8 5 5 M9 10 C9 7 13 8 13 5" strokeWidth={1.6} delay={0.6} duration={0.4} />
      <InkPath d="M31 10 C31 7 27 8 27 5 M31 10 C31 7 35 8 35 5" strokeWidth={1.6} delay={0.7} duration={0.4} />
      <InkPath d="M17 35 H23" stroke={VERMILION} strokeWidth={2.4} delay={0.95} duration={0.25} />
    </svg>
  );
}

function ArchiveGlyphScales() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      {/* the reconciliation balance — two pans, one verdict */}
      <InkPath d="M20 7 V31" strokeWidth={2.2} duration={0.4} />
      <InkPath d="M7 11 H33" strokeWidth={2} delay={0.25} duration={0.4} />
      <InkPath d="M3 13 C3 19 11 19 11 13" strokeWidth={1.8} delay={0.5} duration={0.4} />
      <InkPath d="M29 13 C29 19 37 19 37 13" strokeWidth={1.8} delay={0.6} duration={0.4} />
      <InkPath d="M13 34 H27" stroke={VERMILION} strokeWidth={2.4} delay={0.9} duration={0.3} />
    </svg>
  );
}

function ArchiveGlyphRestore() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      {/* time runs widdershins; the hand still points at 16 h 04 */}
      <InkPath d="M31 13 A12.5 12.5 0 1 0 32.5 22" strokeWidth={2.2} duration={0.6} />
      <InkPath d="M31 5.5 V13 H23.5" strokeWidth={2} delay={0.5} duration={0.35} />
      <InkPath d="M20 14 V21 L25 24" stroke={VERMILION} strokeWidth={2.4} delay={0.85} duration={0.4} />
    </svg>
  );
}

/* ── One classified ad ────────────────────────────────────────────────────────
 * Ruled like the back page: index tag, glyph, head, the French devise in
 * guillemets, one serif sentence, mono foot. Columns are deliberately
 * unequal — classifieds are sold by the centimetre, not the grid.       */

function ArchiveAd({ ad, index }: { ad: ArchiveAdSpec; index: number }) {
  return (
    <SettleIn delay={index * 0.12} className="flex flex-col px-5 py-5 first:pl-0 last:pr-0 max-md:border-b max-md:border-[#d6ccb6] max-md:px-0 max-md:last:border-b-0 md:first:pl-5 md:last:pr-5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[9px] tracking-[0.14em] text-[#bf3415]">{ad.no}</span>
        {ad.glyph === "lineage" && <ArchiveGlyphLineage />}
        {ad.glyph === "scales" && <ArchiveGlyphScales />}
        {ad.glyph === "restore" && <ArchiveGlyphRestore />}
      </div>
      <h4 className="mt-2 font-serif text-[1.35rem] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
        {ad.title}
      </h4>
      <p className="mt-1 font-serif text-[14px] italic text-[#bf3415]">« {ad.devise} »</p>
      <p className={`${T.body} mt-2.5 !text-[14.5px] !leading-[1.55] grow`}>{ad.line}</p>
      <Rule className="mt-4" />
      <p className={`${T.folio} mt-2`}>{ad.foot}</p>
    </SettleIn>
  );
}

/* ── The rectificatif ─────────────────────────────────────────────────────────
 * Versioning, told as print culture: the 09 juin réussite was printed wrong,
 * the correction ran the next morning, and — the entire point — BOTH
 * printings stay on the shelf. The old figure is struck in the editor's pen,
 * not erased. Git would call this history; the desk calls it honesty.   */

function ArchiveRectificatif() {
  return (
    <SettleIn className="relative border-2 border-[#1c1914] bg-[#f6f1e7] p-6 shadow-[4px_4px_0_#1c1914] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#bf3415]">
          Rectificatif — édition du 09 juin
        </p>
        <Stamp color={STAMP_GREEN} tilt={6} className="text-[10px]">
          v2 · corrigé
        </Stamp>
      </div>
      <Rule className="mt-3" />
      <p className={`${T.body} mt-4`}>
        Tuesday's réussite ran as <PenStrike delay={0.5}>96,1 %</PenStrike>{" "}
        <strong className="font-bold">97,0 %</strong>. La réconciliation found 19 207 lignes
        filed under the wrong canal — AGENCE where USSD belonged — and refiled them before
        the kettle boiled. The first printing is not destroyed; it is archived beside the
        second, each with its own empreinte, so that anyone may check what we believed and
        when we stopped believing it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
          v1 · e983·11d8… · archivée 09.06, 06 h 31
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
          v2 · e983·6b54… · en rayon depuis 07 h 02
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[#2f6b3f]">
          diff · +19 207 lignes reclassées
        </span>
      </div>
    </SettleIn>
  );
}

/* ── Avis de conservation ─────────────────────────────────────────────────────
 * The retention notice, set as legal small print, plus a 52-week depth gauge:
 * one tick per conserved week, heights wandering deterministically, this
 * week's tick in vermilion. The archive has a floor and you can see it. */

function ArchiveRetention() {
  return (
    <SettleIn delay={0.1} className="flex h-full flex-col border border-[#d6ccb6] bg-[#eee6d6] p-6">
      <p className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
        <History aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" />
        Avis de conservation
      </p>
      <Rule className="mt-3" />
      <p className={`${T.ui} mt-4 !text-[13.5px]`}>
        Les 365 dernières éditions sont conservées sur ce poste — instantanés Parquet
        signés, journal SQLite, zéro octet en transit. Le service des archives ne connaît
        pas le cloud et ne s'en porte pas plus mal.
      </p>
      {/* 52-week depth gauge — S−52 on the left, this week on the right */}
      <div aria-hidden className="mt-auto pt-5">
        <div className="flex h-9 items-end gap-[2px]">
          {Array.from({ length: 52 }, (_, i) => {
            const h = 38 + Math.abs(Math.sin(i * 0.83) * 46) + (i % 4 === 0 ? 14 : 0);
            const current = i === 51;
            return (
              <div
                key={`w${i}`}
                className={`w-full ${current ? "bg-[#bf3415]" : "bg-[#1c1914]/30"}`}
                style={{ height: `${Math.min(h, 100)}%` }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.1em] text-[#857c69]">
          <span>S−52</span>
          <span>profondeur du rayon · 365 j</span>
          <span className="text-[#bf3415]">S−0</span>
        </div>
      </div>
    </SettleIn>
  );
}

/* ── Le règlement du sous-sol ─────────────────────────────────────────────────
 * The morgue's house rules, posted the way pressrooms post theirs: numbered
 * in the editor's pen, one serif sentence each, a folio sub-line for the
 * compliance reader. These four lines ARE the versioning model — everything
 * else on the page is illustration.                                     */

const ARCHIVE_REGLES = [
  {
    no: "1",
    regle: "On ne jette rien.",
    line: "A deleted edition is a missing receipt; the shelf only grows.",
    folio: "suppression: non prévue par le règlement",
  },
  {
    no: "2",
    regle: "On ne réécrit pas.",
    line: "Corrections print beside their mistakes, never over them.",
    folio: "v1 conservée · v2 datée · diff signée",
  },
  {
    no: "3",
    regle: "Chaque chiffre cite.",
    line: "Every figure names its file, its line and its checksum on request.",
    folio: "lignée: cellule → ligne → empreinte",
  },
  {
    no: "4",
    regle: "Le réseau attend dehors.",
    line: "The archive answers to the desk it lives under, and to no one else.",
    folio: "0 octet sorti · vérifiable au pare-feu",
  },
] as const;

function ArchiveReglement() {
  return (
    <SettleIn>
      <p className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
        <ScrollText aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" />
        Règlement du sous-sol
      </p>
      <DoubleRule className="mt-2" />
      <ol className="mt-1">
        {ARCHIVE_REGLES.map((r, i) => (
          <li
            key={r.no}
            className={`flex gap-4 py-3.5 ${i > 0 ? "border-t border-[#d6ccb6]" : ""}`}
          >
            <span
              aria-hidden
              className="mt-0.5 font-serif text-[1.6rem] font-black leading-none text-[#bf3415] [font-variation-settings:'WONK'_1]"
            >
              {r.no}
            </span>
            <div className="min-w-0">
              <p className="font-serif text-[16px] font-bold leading-snug text-[#1c1914]">
                {r.regle}{" "}
                <span className="font-normal italic text-[#4a4438]">{r.line}</span>
              </p>
              <p className={`${T.folio} mt-1`}>{r.folio}</p>
            </div>
          </li>
        ))}
      </ol>
    </SettleIn>
  );
}

/* ── Fiche de consultation ────────────────────────────────────────────────────
 * Paper archives lent nothing without a call slip. Ours survives as a small
 * stage prop: the forecasting desk pulls the SUPERSEDED 09 juin v1 — because
 * being allowed to consult what you used to believe is the whole argument
 * for keeping versions. Taped at a slight angle; the motif line types
 * itself like a clerk filling the form.                                 */

function ArchiveSlip() {
  return (
    <SettleIn delay={0.1}>
      <div className="rotate-[0.8deg]">
        <div className="relative border border-dashed border-[#1c1914]/55 bg-[#f6f1e7] p-5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:p-6">
          {/* two strips of archivist's tape — pure paper, no motion */}
          <span
            aria-hidden
            className="absolute -top-2 left-7 h-4 w-12 rotate-[-4deg] bg-[#1c1914]/10"
          />
          <span
            aria-hidden
            className="absolute -top-2 right-9 h-4 w-12 rotate-[3deg] bg-[#1c1914]/10"
          />
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
              Fiche de consultation
            </p>
            <span className="font-mono text-[9px] tabular-nums text-[#857c69]">№ 2 184</span>
          </div>
          <Rule className="mt-3" />
          <dl className="mt-3 space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>demandeur</dt>
              <dd className="font-mono text-[11px] text-[#1c1914]">
                L. Ben Salah — bureau des prévisions
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>édition demandée</dt>
              <dd className="font-mono text-[11px] text-[#1c1914]">
                № 844 · mar 09 juin —{" "}
                <span className="font-semibold text-[#bf3415]">version 1</span>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>motif</dt>
              <dd className="min-w-0 font-mono text-[11px] text-[#1c1914]">
                <TypeOn
                  text="vérifier ce que nous croyions avant le rectificatif"
                  speed={24}
                  startDelay={300}
                />
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>servie en</dt>
              <dd className="font-mono text-[11px] tabular-nums text-[#1c1914]">
                1,7 s · depuis l'instantané local
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-[30ch] font-serif text-[12.5px] italic leading-snug text-[#857c69]">
              La v1 se consulte; elle ne se réimprime pas. The past is open for reading,
              closed for editing.
            </p>
            <Stamp color={STAMP_GREEN} tilt={-7} className="text-[10px]">
              Servie
            </Stamp>
          </div>
        </div>
      </div>
    </SettleIn>
  );
}

/* ── The grep strip ───────────────────────────────────────────────────────────
 * The pull quote's proof: an ink-black terminal pane where ripgrep walks the
 * archive and finds Thursday's dip in 41 ms. The command types itself; the
 * matches settle in after the cursor finishes — call and response.      */

function ArchiveGrep() {
  return (
    <SettleIn className="border-2 border-[#1c1914] bg-[#1c1914] p-5 shadow-[4px_4px_0_#bf3415] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#f6f1e7]/45">
          poste de l'archiviste — sous-sol, rayon B
        </span>
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-[#f6f1e7]/25" />
          <span className="h-2 w-2 rounded-full bg-[#f6f1e7]/25" />
          <span className="h-2 w-2 rounded-full bg-[#bf3415]" />
        </span>
      </div>
      <div className="mt-4 font-mono text-[11.5px] leading-[1.8] sm:text-[12.5px]">
        <p className="text-[#f6f1e7]">
          <span className="text-[#bf3415]">$</span>{" "}
          <TypeOn text={'rg "16:04" rayon-b/edition-2026-06-*.ndjson'} speed={26} />
        </p>
        <SettleIn delay={1.35} y={6}>
          <p className="truncate text-[#f6f1e7]/75">
            edition-2026-06-11.ndjson<span className="text-[#bf3415]">:84117:</span>
            {'{"heure":"16:04","canal":"USSD","réussite":0.918}'}
          </p>
        </SettleIn>
        <SettleIn delay={1.55} y={6}>
          <p className="truncate text-[#f6f1e7]/75">
            edition-2026-06-11.ndjson<span className="text-[#bf3415]">:84118:</span>
            {'{"heure":"16:04","canal":"WEB","réussite":0.942}'}
          </p>
        </SettleIn>
        <SettleIn delay={1.75} y={6}>
          <p className="text-[#f6f1e7]/45">
            3 correspondances · 0,041 s — l'archive se souvient.
          </p>
        </SettleIn>
      </div>
    </SettleIn>
  );
}

/* ── Holdings card ────────────────────────────────────────────────────────────
 * What the basement holds, counted up in ink. The zero gets the green stamp:
 * the only figure on the page the security team reads twice.            */

function ArchiveHoldings() {
  return (
    <SettleIn delay={0.15} className="border border-[#1c1914] p-5">
      <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
        En rayon ce matin
      </p>
      <DoubleRule className="mt-2" />
      <dl className="mt-1">
        {ARCHIVE_HOLDINGS.map((stat, i) => (
          <div
            key={stat.label}
            className={`flex items-baseline justify-between gap-3 py-2.5 ${
              i > 0 ? "border-t border-[#d6ccb6]" : ""
            }`}
          >
            <dt className={T.folio}>{stat.label}</dt>
            <dd className="flex items-baseline gap-2">
              <CountUpInk
                end={stat.end}
                decimals={stat.decimals}
                suffix={stat.suffix}
                duration={1.2}
                className={`text-[15px] font-semibold ${
                  stat.end === 0 ? "text-[#2f6b3f]" : "text-[#1c1914]"
                }`}
              />
              {stat.end === 0 && (
                <span className="border border-[#2f6b3f] px-1 py-px font-grotesk text-[7.5px] font-black uppercase tracking-[0.12em] text-[#2f6b3f]">
                  juré
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Rule />
      <p className={`${T.folio} mt-2.5 flex items-center justify-between gap-2`}>
        <span>registre complet dans l'app</span>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-0.5 text-[#2b4a8b] underline decoration-[#2b4a8b]/40 underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
        >
          ouvrir
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </Link>
      </p>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  ArchiveSection — the assembled rubrique, p.10
 *  Reading order: mast → lede (headline, byline, drop cap) + holdings →
 *  shelf + ledger (the centerpiece spread) → rectificatif + avis →
 *  classifieds → grep + pull quote → folio.
 * ════════════════════════════════════════════════════════════════════════════ */

function ArchiveSection() {
  return (
    <section
      id="archive"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3400px" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-20 sm:px-8 sm:pt-28 lg:px-12">
        <SectionMast rubrique="Les archives" no="p.10" />

        {/* ── The lede ─────────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-12">
          <div className="lg:col-span-7 xl:col-span-8">
            <p className={`${T.kicker} text-[#bf3415]`}>Sous-sol · rayon B · la morgue</p>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Down in the morgue,
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  <PenUnderline delay={0.7}>every edition</PenUnderline> keeps
                </span>,
                <span
                  key="l3"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  its receipts.
                </span>,
              ]}
            />
            <Byline
              className="mt-6"
              name="Le service des archives"
              desk="Sous-sol, rayon B · registre № 12"
            />
            <div className="mt-6 max-w-[60ch]">
              <DropCapParagraph>
                Old newsrooms called the archive room the morgue, which slandered it —
                nothing in it was ever quite dead. Ours is livelier still. Each morning's
                report is filed the second the ink dries: the CSV that fed it, the queries
                that shaped it, the totals it swore by. Ask for le 9 juin and you receive
                le 9 juin — same rows, same réussite, same awkward dip at 16 h 04. Not a
                reconstruction. The edition itself.
              </DropCapParagraph>
              <p className={`${T.body} mt-4`}>
                Seven days are pictured below; three hundred and sixty-five wait on the
                shelf behind them. None has ever seen a network cable, and none ever will.
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 xl:col-span-4">
            <ArchiveHoldings />
          </div>
        </div>

        {/* ── The centerpiece spread: shelf beside ledger ──────────────────
            The shelf wants air for its parallax drift, so it takes the wider
            column; the ledger reads like the facing page.               */}
        <div className="mt-16 grid gap-x-14 gap-y-14 lg:mt-20 lg:grid-cols-12">
          <div className="lg:col-span-6 xl:col-span-7">
            <ArchiveShelf />
          </div>
          <div className="lg:col-span-6 xl:col-span-5">
            <ArchiveLedger />
          </div>
        </div>

        {/* ── House rules & the call slip ───────────────────────────────────
            Doctrine on the left, a working prop on the right: the rules say
            "on ne réécrit pas", the slip shows someone reading v1 anyway —
            legally, locally, in 1,7 s.                                  */}
        <div className="mt-16 grid items-start gap-x-14 gap-y-10 lg:mt-20 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <ArchiveReglement />
          </div>
          <div className="lg:col-span-7 xl:col-span-6 xl:col-start-7">
            <ArchiveSlip />
          </div>
        </div>

        {/* ── Corrections & conservation ───────────────────────────────── */}
        <div className="mt-16 grid gap-x-10 gap-y-8 lg:mt-20 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ArchiveRectificatif />
          </div>
          <div className="lg:col-span-5">
            <ArchiveRetention />
          </div>
        </div>

        {/* ── Classifieds — the archive desk advertises its services ────── */}
        <div className="mt-16 lg:mt-20">
          <SettleIn>
            <div className="flex items-center gap-4">
              <Rule className="flex-1" />
              <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.3em] text-[#1c1914]">
                Petites annonces — service des archives
              </p>
              <Rule className="flex-1" />
            </div>
          </SettleIn>
          {/* sold by the centimetre, not the grid — three unequal columns */}
          <div className="mt-2 border-y border-[#d6ccb6] md:grid md:grid-cols-[1.15fr_1fr_0.92fr] md:divide-x md:divide-[#d6ccb6]">
            {ARCHIVE_ADS.map((ad, i) => (
              <ArchiveAd key={ad.no} ad={ad} index={i} />
            ))}
          </div>
        </div>

        {/* ── The close: proof, then the quote it proves ─────────────────── */}
        <div className="mt-16 grid items-center gap-x-14 gap-y-10 lg:mt-24 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <ArchiveGrep />
          </div>
          <div className="lg:col-span-6">
            <PullQuote cite="Le chef de la documentation">
              An archive you can grep beats a memory you can't.
            </PullQuote>
          </div>
        </div>

        {/* ── Cross-references — the archive indexes the rest of the paper ── */}
        <SettleIn className="mt-14 lg:mt-16">
          <p className={`${T.folio} flex flex-wrap items-center gap-x-2 gap-y-1`}>
            <span className="font-bold uppercase text-[#1c1914]">Voir aussi</span>
            <span aria-hidden>—</span>
            <a
              href="#lead"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              La une, p.3 (le creux de 16 h 04)
            </a>
            <span aria-hidden>·</span>
            <a
              href="#workflow"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              Les presses, p.5
            </a>
            <span aria-hidden>·</span>
            <a
              href="#capabilities"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              L'index des capacités, p.6
            </a>
          </p>
        </SettleIn>

        <FolioLine
          className="mt-8 border-t border-[#d6ccb6] pt-4"
          page="p.10"
          note="Registre vérifié ce matin à 06 h 12 · rien n'a quitté le poste"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 13 — ColophonSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §13 — COLOPHON · "COMMENT C'EST IMPRIMÉ" — ARCHITECTURE & SÉCURITÉ      p. 11
 *  ────────────────────────────────────────────────────────────────────────────
 *  A colophon is the printer's note at the back of the paper — type, paper,
 *  press, the names of the people who set it. This one explains the press
 *  itself: how Data Navigator is built, and why a security team can sign off
 *  on it. It is the section the reviewer reads last and trusts most.
 *
 *  Design intent
 *  ─────────────
 *  • The centrepiece is an ink "press diagram" of the trust boundary, drawn the
 *    way an old manual draws a printing press: square boxes, hairline frames,
 *    offset-print shadows, the parts labelled in the margin. The sandboxed
 *    renderer sits left, the privileged main process right, and the only thing
 *    crossing between them is one narrow, allow-listed IPC bridge — a single
 *    line of ink the reader can trace end to end. No glow, no gradient.
 *  • The guarantees run as a numbered column of editorial entries, each closed
 *    with a rubber stamp: the things that do happen stamped in steward's green,
 *    the things that never happen stamped in the editor's vermilion. Every line
 *    is short, specific and checkable — the register a security desk audits in.
 *  • A pull quote restates the soul: nothing leaves the machine. A spec strip
 *    declares the press it runs on — medium-end hardware, no graphics card
 *    required, no datacenter behind it.
 *  • Motion is sober: the bridge inks itself across the boundary on scroll,
 *    boxes settle in, stamps slam once. Everything is transform / opacity /
 *    pathLength and honours prefers-reduced-motion. Vermilion is spent only on
 *    the negatives — the calls that never go out.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.1 — COPY & DATA · the trust boundary, the guarantees, the press
 *  All values are deterministic editorial data — no Math.random, no Date.
 * ──────────────────────────────────────────────────────────────────────────── */

type ColophonZoneItem = { id: string; icon: ReactNode; k: string; v: string };

/** What lives behind the sandbox wall, on the renderer side of the boundary. */
const COLOPHON_RENDERER_PARTS: ReadonlyArray<ColophonZoneItem> = [
  {
    id: "shell",
    icon: <SquareTerminal aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Interface",
    v: "Chromium, en bac à sable",
  },
  {
    id: "isolation",
    icon: <ShieldCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Contexte",
    v: "isolé · sans Node",
  },
  {
    id: "csp",
    icon: <Lock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Politique",
    v: "CSP stricte, sans inline",
  },
];

/** What lives in the privileged main process, on the far side of the boundary. */
const COLOPHON_MAIN_PARTS: ReadonlyArray<ColophonZoneItem> = [
  {
    id: "duckdb",
    icon: <Database aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Moteur",
    v: "DuckDB, en mémoire",
  },
  {
    id: "ai",
    icon: <Cpu aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Modèle",
    v: "GGUF local, CPU",
  },
  {
    id: "files",
    icon: <FolderLock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Fichiers",
    v: "chemins autorisés",
  },
  {
    id: "settings",
    icon: <HardDrive aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
    k: "Réglages",
    v: "SQLite durable",
  },
];

type ColophonGuarantee = {
  id: string;
  /** running plate number — "01 / 08" */
  no: string;
  icon: ReactNode;
  /** the heading of the entry, grotesk, sentence case */
  head: string;
  /** the specific, checkable body line a reviewer reads */
  body: ReactNode;
  /** the stamp that closes the entry */
  stamp: string;
  /** vermilion stamp for a negative ("never"), green for an enforced control */
  tone: "control" | "never";
};

/**
 * The register of guarantees, in the order a security desk audits them:
 * isolation first, then policy, fuses, the two allow-lists, the network
 * posture, and the two flat denials that close the audit.
 */
const COLOPHON_GUARANTEES: ReadonlyArray<ColophonGuarantee> = [
  {
    id: "sandbox",
    no: "01 / 08",
    icon: <ShieldCheck aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Bac à sable + isolation du contexte",
    body: (
      <>
        The interface runs in a sandboxed Chromium renderer with{" "}
        <strong className="font-semibold">contextIsolation</strong> on and Node disabled. Page code
        cannot touch the filesystem, spawn a process, or reach the engine — it can only post a
        message across the bridge.
      </>
    ),
    stamp: "Cloisonné",
    tone: "control",
  },
  {
    id: "ipc",
    no: "02 / 08",
    icon: <Network aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Un pont IPC étroit, sur liste blanche",
    body: (
      <>
        The renderer and the main process speak through one allow-listed IPC bridge — a fixed set of
        named channels, each with a typed payload. There is no general <code>eval</code>, no remote
        module, no open socket. <em>Ce que le pont ne nomme pas ne passe pas.</em>
      </>
    ),
    stamp: "Liste blanche",
    tone: "control",
  },
  {
    id: "csp",
    no: "03 / 08",
    icon: <Lock aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Politique de sécurité du contenu",
    body: (
      <>
        A strict Content-Security-Policy ships with the app: no inline script, no remote origin, no
        injected third-party. The policy fails closed — anything it does not name is refused, so a
        forgotten <code>&lt;script src&gt;</code> simply does not load.
      </>
    ),
    stamp: "CSP stricte",
    tone: "control",
  },
  {
    id: "fuses",
    no: "04 / 08",
    icon: <CircuitBoard aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Fusibles Electron grillés à la fabrication",
    body: (
      <>
        The packaged build burns its Electron fuses: <code>RunAsNode</code> off, no <code>--inspect</code>{" "}
        debugger, cookie encryption on, ASAR integrity checked. The switches that turn a desktop app
        into a shell are soldered shut before it ships.
      </>
    ),
    stamp: "Fusibles grillés",
    tone: "control",
  },
  {
    id: "fs",
    no: "05 / 08",
    icon: <FileCheck aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Accès fichiers par liste de chemins",
    body: (
      <>
        The app reads only what a native OS dialog hands it. There is no silent directory crawl: a
        path the user did not pick is a path the engine never sees. The CSV stays where the analyst
        left it.
      </>
    ),
    stamp: "Chemins autorisés",
    tone: "control",
  },
  {
    id: "registry",
    no: "06 / 08",
    icon: <KeyRound aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Modèles depuis un registre autorisé",
    body: (
      <>
        Model weights download from one allow-listed registry, checksum-verified, and from nowhere
        else — never an arbitrary URL the user pastes in. <em>Le correspondant n'accepte que des
        poids contrôlés à l'entrée.</em>
      </>
    ),
    stamp: "Registre vérifié",
    tone: "control",
  },
  {
    id: "lan",
    no: "07 / 08",
    icon: <RadioTower aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Collaboration en réseau local — uniquement",
    body: (
      <>
        When two analysts share a session, they pair over the local network and nothing else. No
        relay server, no cloud broker, no account in between — the data crosses the room, not the
        continent.
      </>
    ),
    stamp: "Réseau local",
    tone: "control",
  },
  {
    id: "updater",
    no: "08 / 08",
    icon: <ShieldOff aria-hidden className="h-4 w-4" strokeWidth={2} />,
    head: "Mise à jour automatique — désactivée par défaut",
    body: (
      <>
        The auto-updater is off out of the box. Nothing phones home to check for a version at start;
        updates are a deliberate act, decided by the people who approved the tool, on their schedule.
      </>
    ),
    stamp: "Désactivée",
    tone: "never",
  },
];

type ColophonDenial = { id: string; icon: ReactNode; what: string; detail: string };

/** The two flat denials the colophon closes on — the calls that never happen. */
const COLOPHON_DENIALS: ReadonlyArray<ColophonDenial> = [
  {
    id: "telemetry",
    icon: <EyeOff aria-hidden className="h-4 w-4" strokeWidth={2.1} />,
    what: "Aucune télémétrie",
    detail: "no usage pings, no crash beacon, no analytics SDK compiled in",
  },
  {
    id: "network",
    icon: <WifiOff aria-hidden className="h-4 w-4" strokeWidth={2.1} />,
    what: "Aucun appel réseau à l'exécution",
    detail: "unplug the cable and the morning report is identical",
  },
];

type ColophonSpecRow = { id: string; k: string; v: string; mark?: string };

/**
 * "L'IMPRIMERIE" — the press this paper runs on, declared like a real colophon
 * declares its type and paper. Medium-end hardware is the floor by design.
 */
const COLOPHON_PRESS: ReadonlyArray<ColophonSpecRow> = [
  { id: "platform", k: "Plateforme", v: "Electron · Next.js" },
  { id: "engine", k: "Moteur SQL", v: "DuckDB en mémoire" },
  { id: "ai", k: "Inférence", v: "node-llama-cpp, CPU", mark: "†" },
  { id: "ram", k: "Mémoire", v: "4–8 Go de RAM" },
  { id: "gpu", k: "Carte graphique", v: "non requise" },
  { id: "net", k: "Connexion", v: "aucune", mark: "‡" },
];

type ColophonThreatRow = {
  id: string;
  /** the question a reviewer brings to the table */
  surface: string;
  /** can it happen? — drives the verdict pill */
  reachable: boolean;
  /** the one-line answer, with the mechanism that decides it */
  verdict: ReactNode;
};

/**
 * The threat ledger — the questions a security desk actually asks, answered
 * by the architecture rather than by a promise. "Reachable" is false wherever
 * a control closes the path; the table is sorted with the reassuring denials
 * first and the two honest "yes, by design" rows last.
 */
const COLOPHON_THREATS: ReadonlyArray<ColophonThreatRow> = [
  {
    id: "exfil",
    surface: "Une page peut-elle exfiltrer le CSV ?",
    reachable: false,
    verdict: (
      <>
        Non. Le renderer n'a ni réseau sortant ni accès disque ; il ne peut que poster un message
        nommé sur le pont.
      </>
    ),
  },
  {
    id: "rce",
    surface: "Un script injecté peut-il s'exécuter ?",
    reachable: false,
    verdict: (
      <>
        Non. La CSP refuse l'inline et les origines distantes ; <code>RunAsNode</code> est grillé.
      </>
    ),
  },
  {
    id: "path",
    surface: "Le moteur peut-il lire un fichier non choisi ?",
    reachable: false,
    verdict: (
      <>
        Non. Seul un chemin issu d'un dialogue natif franchit la liste blanche du système de
        fichiers.
      </>
    ),
  },
  {
    id: "model",
    surface: "Un modèle malveillant peut-il être chargé ?",
    reachable: false,
    verdict: (
      <>
        Non. Les poids viennent d'un registre autorisé, vérifiés par empreinte, jamais d'une URL
        collée.
      </>
    ),
  },
  {
    id: "debug",
    surface: "Le débogueur distant est-il joignable ?",
    reachable: false,
    verdict: (
      <>
        Non. Le fusible <code>--inspect</code> est coupé à la fabrication ; aucun port d'inspection
        n'est ouvert.
      </>
    ),
  },
  {
    id: "lan",
    surface: "La session partagée sort-elle du bâtiment ?",
    reachable: true,
    verdict: (
      <>
        Oui, mais seulement jusqu'au poste voisin : appairage en réseau local, sans relais ni
        nuage.
      </>
    ),
  },
  {
    id: "update",
    surface: "L'app contacte-t-elle un serveur de mise à jour ?",
    reachable: true,
    verdict: (
      <>
        Uniquement si vous l'activez : l'auto-updater est désactivé par défaut et reste un choix
        explicite.
      </>
    ),
  },
];

type ColophonProvenanceRow = { id: string; k: string; v: string; icon: ReactNode };

/**
 * Build provenance — the supply-chain side of the colophon. A security desk
 * asks not only "what does it do at runtime" but "what went into the package",
 * so the imprint declares its build the way a paper names its press operators.
 */
const COLOPHON_PROVENANCE: ReadonlyArray<ColophonProvenanceRow> = [
  {
    id: "build",
    k: "Build",
    v: "déterministe, hors-ligne",
    icon: <Boxes aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
  },
  {
    id: "deps",
    k: "Dépendances",
    v: "verrouillées, auditées",
    icon: <FileCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
  },
  {
    id: "scan",
    k: "Analyse",
    v: "secrets + SAST en CI",
    icon: <ShieldCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
  },
  {
    id: "sign",
    k: "Signature",
    v: "artefacts signés",
    icon: <KeyRound aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />,
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.2 — THE PRESS DIAGRAM · the trust boundary, drawn in ink
 *  Two labelled boxes — the sandboxed renderer and the privileged main
 *  process — with one allow-listed IPC bridge between them. The bridge inks
 *  itself across the boundary on scroll; the boundary wall is a dashed rule
 *  the eye reads as "nothing crosses here uninvited". Pure SVG, square
 *  corners, offset-print shadows faked with a second offset rect, no glow.
 * ──────────────────────────────────────────────────────────────────────────── */

type ColophonNodeLabel = { x: number; y: number; text: string; sub?: string };

/** Small labelled node inside a press-diagram box (engine / model / files). */
function ColophonDiagramNode({ x, y, text, sub }: ColophonNodeLabel) {
  return (
    <g>
      <rect x={x} y={y} width="92" height="30" fill={PAPER} stroke={INK} strokeWidth="1.4" />
      <text
        x={x + 8}
        y={y + (sub ? 13 : 19)}
        fontSize="9"
        fontFamily="var(--font-grotesk)"
        fontWeight="700"
        fill={INK}
      >
        {text}
      </text>
      {sub && (
        <text x={x + 8} y={y + 24} fontSize="7.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
          {sub}
        </text>
      )}
    </g>
  );
}

/**
 * The full press plate. Renderer box on the left, main-process box on the
 * right, the dashed trust boundary down the middle, and the IPC bridge drawn
 * as a single ink line that pathLength-animates across the wall on scroll —
 * the only path that legitimately crosses. A vermilion "×" marks the wall
 * itself: the unsanctioned crossing that cannot happen.
 */
function ColophonPressDiagram() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  return (
    <figure ref={ref}>
      <div className="relative border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914]">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
            Schéma de presse — la frontière de confiance
          </span>
          <span className={T.folio}>fig. 1 · un seul passage</span>
        </figcaption>
        <div className="px-3 py-4 sm:px-5 sm:py-6">
          <svg viewBox="0 0 560 280" className="block h-auto w-full" aria-hidden>
            {/* ── the sandbox wall: dashed boundary down the middle ── */}
            <InkPath
              d="M280 26 L280 254"
              stroke={INK_SOFT}
              strokeWidth={1.6}
              dashed
              delay={0.1}
              duration={0.8}
            />
            <text
              x="280"
              y="18"
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill={INK_FADED}
              letterSpacing="1.5"
            >
              FRONTIÈRE DE CONFIANCE
            </text>

            {/* ── LEFT: the sandboxed renderer ── */}
            <rect x="30" y="40" width="206" height="200" fill={PAPER_DEEP} />
            <rect x="26" y="36" width="206" height="200" fill="none" stroke={INK} strokeWidth="2" />
            <text x="38" y="58" fontSize="11" fontFamily="var(--font-grotesk)" fontWeight="800" fill={INK}>
              RENDERER
            </text>
            <text x="38" y="70" fontSize="7.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
              bac à sable · contextIsolation
            </text>
            <ColophonDiagramNode x={42} y={86} text="Interface" sub="Chromium" />
            <ColophonDiagramNode x={42} y={128} text="CSP stricte" sub="sans inline" />
            <ColophonDiagramNode x={42} y={170} text="Aucun accès" sub="ni FS, ni proc." />

            {/* ── RIGHT: the privileged main process ── */}
            <rect x="328" y="40" width="206" height="200" fill={PAPER_DEEP} />
            <rect x="324" y="36" width="206" height="200" fill="none" stroke={INK} strokeWidth="2" />
            <text x="336" y="58" fontSize="11" fontFamily="var(--font-grotesk)" fontWeight="800" fill={INK}>
              MAIN PROCESS
            </text>
            <text x="336" y="70" fontSize="7.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
              privilégié · fusibles grillés
            </text>
            <ColophonDiagramNode x={340} y={86} text="DuckDB" sub="SQL local" />
            <ColophonDiagramNode x={438} y={86} text="LLM GGUF" sub="CPU" />
            <ColophonDiagramNode x={340} y={170} text="Fichiers" sub="liste blanche" />
            <ColophonDiagramNode x={438} y={170} text="SQLite" sub="réglages" />

            {/* ── THE BRIDGE: the one allow-listed crossing, inked on scroll ── */}
            <rect x="244" y="120" width="72" height="34" fill={VERMILION} stroke={INK} strokeWidth="1.6" />
            <text
              x="280"
              y="134"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-grotesk)"
              fontWeight="800"
              fill={PAPER}
            >
              PONT IPC
            </text>
            <text x="280" y="146" textAnchor="middle" fontSize="6.5" fontFamily="var(--font-mono)" fill={PAPER}>
              liste blanche
            </text>
            {/* renderer → bridge → main: the single path that crosses */}
            <InkPath d="M232 137 L244 137" stroke={INK} strokeWidth={2} delay={0.9} duration={0.4} />
            <InkPath d="M316 137 L328 137" stroke={INK} strokeWidth={2} delay={1.1} duration={0.4} />

            {/* the unsanctioned crossing, struck out in the editor's pen */}
            {inView && (
              <motion.g
                initial={reduce ? undefined : { opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.5, ...SPRING_STAMP }}
                style={{ transformOrigin: "280px 210px" }}
              >
                <line x1="272" y1="202" x2="288" y2="218" stroke={VERMILION} strokeWidth="2.6" strokeLinecap="round" />
                <line x1="288" y1="202" x2="272" y2="218" stroke={VERMILION} strokeWidth="2.6" strokeLinecap="round" />
              </motion.g>
            )}
            <text x="280" y="236" textAnchor="middle" fontSize="7" fontFamily="var(--font-mono)" fill={VERMILION}>
              tout autre passage : refusé
            </text>
          </svg>
        </div>
        <footer className="border-t-2 border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <p className={T.folio}>
            Le seul lien entre les deux côtés est le pont IPC, et il n'accepte que des messages
            nommés. Le reste de la frontière ne s'ouvre pas.
          </p>
        </footer>
      </div>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.3 — THE ZONE LEGEND · two stacked plates naming each side's parts
 *  A small companion to the diagram: what exactly sits in the sandbox, and
 *  what sits in the privileged process. Mono key→value rows, hairline ruled.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One side of the boundary, listed as a labelled plate of parts. */
function ColophonZonePlate({
  band,
  zone,
  parts,
  className,
}: {
  band: string;
  zone: string;
  parts: ReadonlyArray<ColophonZoneItem>;
  className?: string;
}) {
  return (
    <SettleIn className={className}>
      <div className="border border-[#1c1914] bg-[#f6f1e7]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#1c1914] px-4 py-2">
          <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
            {band}
          </span>
          <span className={T.folio}>{zone}</span>
        </header>
        <dl className="divide-y divide-[#d6ccb6] px-4 py-1">
          {parts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2">
              <dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#857c69]">
                <span className="text-[#1c1914]">{p.icon}</span>
                {p.k}
              </dt>
              <dd className="text-right font-grotesk text-[12px] font-semibold leading-snug text-[#1c1914]">
                {p.v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.4 — THE GUARANTEE REGISTER · eight editorial entries, each stamped
 *  This is the heart a reviewer reads: a numbered column, every entry a short
 *  specific claim closed with a rubber stamp. Controls stamp green; denials
 *  stamp vermilion — the editor's pen reserved for what never happens.
 * ──────────────────────────────────────────────────────────────────────────── */

function ColophonGuaranteeEntry({ item, index }: { item: ColophonGuarantee; index: number }) {
  const never = item.tone === "never";
  return (
    <SettleIn delay={Math.min(index * 0.05, 0.3)}>
      <article className="grid gap-x-4 gap-y-2 py-5 sm:grid-cols-[2.8rem_1fr] sm:gap-x-6">
        {/* the plate number in the gutter, with the control glyph beneath */}
        <div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-2 sm:pt-0.5">
          <span
            aria-hidden
            className={`${T.num} text-[15px] font-bold leading-none ${never ? "text-[#bf3415]" : "text-[#1c1914]"}`}
          >
            {item.no.split(" / ")[0]}
          </span>
          <span aria-hidden className={never ? "text-[#bf3415]" : "text-[#2f6b3f]"}>
            {item.icon}
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="font-grotesk text-[clamp(1rem,1.7vw,1.18rem)] font-bold leading-snug text-[#1c1914]">
            {item.head}
          </h3>
          <p className={`${T.body} mt-2 max-w-[60ch] text-[15.5px]`}>{item.body}</p>
          <div className="mt-3">
            <Stamp color={never ? VERMILION : STAMP_GREEN} tilt={index % 2 === 0 ? -6 : 5}>
              {item.stamp}
            </Stamp>
          </div>
        </div>
      </article>
    </SettleIn>
  );
}

/** The register, with its band header and a hairline between every entry. */
function ColophonRegister({ className }: { className?: string }) {
  return (
    <div className={className}>
      <SettleIn>
        <div className="flex items-center gap-2 border-b-2 border-[#1c1914] pb-2.5">
          <ScrollText aria-hidden className="h-4 w-4 text-[#1c1914]" strokeWidth={2.1} />
          <span className="font-grotesk text-[12px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
            Registre des garanties — huit contrôles
          </span>
        </div>
      </SettleIn>
      <div className="divide-y divide-[#d6ccb6]">
        {COLOPHON_GUARANTEES.map((item, i) => (
          <ColophonGuaranteeEntry key={item.id} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.5 — THE DENIALS PLATE · the two flat refusals, set in heavy ink
 *  Telemetry and runtime network calls each get a full bordered cell, the
 *  glyph struck through, the claim in serif. This is the box a security desk
 *  photographs for its report.
 * ──────────────────────────────────────────────────────────────────────────── */

function ColophonDenialsPlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside
        aria-label="Ce qui ne se produit jamais"
        className="border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <span className="flex items-center gap-2">
            <Ban aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.4} />
            <span className="font-grotesk text-[12px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
              Ce qui ne se produit jamais
            </span>
          </span>
          <span className={T.folio}>au repos comme à l'exécution</span>
        </header>
        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-[#d6ccb6]">
          {COLOPHON_DENIALS.map((d) => (
            <div key={d.id} className="border-t border-[#d6ccb6] px-4 py-4 first:border-t-0 sm:border-t-0 sm:px-5">
              <div className="flex items-center gap-2.5 text-[#bf3415]">
                {d.icon}
                <span className="font-grotesk text-[13px] font-black uppercase tracking-[0.12em]">
                  {d.what}
                </span>
              </div>
              <p className="mt-2 font-serif text-[14px] italic leading-snug text-[#4a4438]">{d.detail}</p>
            </div>
          ))}
        </div>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.5b — THE THREAT LEDGER · the reviewer's questions, answered by design
 *  A real <table> so the audit reads as a table: the surface in plain French,
 *  a verdict pill (refusé / par conception), and the mechanism that decides
 *  it. The "non" rows are stamped reachable=false; the two honest "oui" rows
 *  carry the press-blue pill so the reader sees they are deliberate, not gaps.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The verdict pill — vermilion "refusé" for a closed path, blue for a choice. */
function ColophonVerdictPill({ reachable }: { reachable: boolean }) {
  const label = reachable ? "par conception" : "refusé";
  const cls = reachable
    ? "border-[#2b4a8b] text-[#2b4a8b]"
    : "border-[#bf3415] text-[#bf3415]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 border-2 px-2 py-0.5 font-grotesk text-[9.5px] font-black uppercase tracking-[0.14em] [border-radius:3px] ${cls}`}
    >
      {reachable ? (
        <RadioTower aria-hidden className="h-3 w-3" strokeWidth={2.4} />
      ) : (
        <Ban aria-hidden className="h-3 w-3" strokeWidth={2.4} />
      )}
      {label}
    </span>
  );
}

/** One row of the ledger as a real <tr>, with the bar tracking aria semantics. */
function ColophonThreatRowEl({ row }: { row: ColophonThreatRow }) {
  return (
    <tr className="align-top">
      <th
        scope="row"
        className="border-t border-[#d6ccb6] px-3.5 py-3 text-left font-serif text-[14.5px] font-semibold leading-snug text-[#1c1914] sm:px-4"
      >
        {row.surface}
      </th>
      <td className="border-t border-[#d6ccb6] px-3.5 py-3 sm:px-4">
        <ColophonVerdictPill reachable={row.reachable} />
      </td>
      <td className="border-t border-[#d6ccb6] px-3.5 py-3 font-serif text-[13.5px] leading-snug text-[#4a4438] sm:px-4">
        {row.verdict}
      </td>
    </tr>
  );
}

/** LE GRAND LIVRE DES MENACES — the questions a reviewer brings, answered. */
function ColophonThreatLedger({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914]">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="flex items-center gap-2">
            <Ban aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
              Le grand livre des menaces — sept questions du service
            </span>
          </span>
          <span className={T.folio}>répondu par l'architecture</span>
        </figcaption>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="sr-only">
              Surfaces d'attaque examinées par le service de vérification et leur verdict
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-3.5 py-2 text-left font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-4"
                >
                  Surface examinée
                </th>
                <th
                  scope="col"
                  className="px-3.5 py-2 text-left font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-4"
                >
                  Verdict
                </th>
                <th
                  scope="col"
                  className="px-3.5 py-2 text-left font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-4"
                >
                  Le mécanisme qui décide
                </th>
              </tr>
            </thead>
            <tbody>
              {COLOPHON_THREATS.map((row) => (
                <ColophonThreatRowEl key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <footer className="space-y-1 border-t-2 border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <p className={T.folio}>
            Cinq « non » que l'architecture impose, deux « oui » que l'opérateur décide. Aucun « peut-être ».
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69] sm:hidden">
            faire défiler le tableau →
          </p>
        </footer>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.5c — BUILD PROVENANCE · the supply-chain side of the imprint
 *  A compact strip declaring how the package itself is made: deterministic
 *  build, locked dependencies, scanners in CI, signed artefacts. The other
 *  half of "trust the binary" that runtime controls cannot answer alone.
 * ──────────────────────────────────────────────────────────────────────────── */

function ColophonProvenancePlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside aria-label="Provenance de la fabrication" className="border border-[#1c1914] bg-[#eee6d6]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#1c1914] px-4 py-2">
          <span className="flex items-center gap-2">
            <Boxes aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.1} />
            <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
              Provenance de la fabrication
            </span>
          </span>
          <span className={T.folio}>chaîne d'approvisionnement</span>
        </header>
        <dl className="divide-y divide-[#d6ccb6] px-4 py-1 sm:grid sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0 sm:px-5">
          {COLOPHON_PROVENANCE.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 py-2.5 sm:border-b sm:border-[#d6ccb6] sm:last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <dt className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#857c69]">
                <span className="text-[#1c1914]">{row.icon}</span>
                {row.k}
              </dt>
              <dd className="text-right font-grotesk text-[12px] font-semibold leading-snug text-[#1c1914]">
                {row.v}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.6 — THE PRESS COLOPHON · "L'imprimerie" — the machine it runs on
 *  The traditional colophon line, reworked as a spec strip: the press, the
 *  type, the paper — here the platform, the engine, the hardware floor.
 * ──────────────────────────────────────────────────────────────────────────── */

function ColophonPressPlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside aria-label="L'imprimerie" className="border border-[#1c1914] bg-[#f6f1e7]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#1c1914] px-4 py-2">
          <span className="flex items-center gap-2">
            <HardDrive aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.1} />
            <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
              L'imprimerie
            </span>
          </span>
          <span className={T.folio}>réf. DN-ARCH-11</span>
        </header>
        <dl className="px-4 py-1.5">
          {COLOPHON_PRESS.map((row) => (
            <div key={row.id} className="flex items-baseline justify-between gap-3 border-t border-[#d6ccb6] py-2 first:border-t-0">
              <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[#857c69]">
                {row.k}
              </dt>
              <span aria-hidden className="mb-[3px] hidden h-px min-w-3 flex-1 self-end bg-[#d6ccb6] sm:block" />
              <dd className={`${T.num} text-right text-[11.5px] font-semibold text-[#1c1914]`}>
                {row.v}
                {row.mark && <sup className="font-serif"> {row.mark}</sup>}
              </dd>
            </div>
          ))}
        </dl>
        <footer className="space-y-1 border-t border-[#1c1914] px-4 py-2.5">
          <p className={T.folio}>† inférence sur processeur par défaut ; le GPU n'est qu'un bonus</p>
          <p className={T.folio}>‡ pensé pour un poste de bureau ordinaire, sans datacenter derrière</p>
        </footer>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.7 — PAGE FURNITURE · the masthead, the standfirst, the imprint line
 * ──────────────────────────────────────────────────────────────────────────── */

/** Masthead, deck, standfirst and byline for the colophon page. */
function ColophonHeader() {
  return (
    <header>
      <SectionMast rubrique="Colophon — comment c'est imprimé" no="p. 11" />
      <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-8">
          <SettleIn>
            <p className={T.kicker}>Architecture &amp; sécurité · la note de l'imprimeur</p>
          </SettleIn>
          <DeckReveal
            className="mt-4"
            lines={[
              <span
                key="l1"
                className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              >
                How the paper is set,
              </span>,
              <span
                key="l2"
                className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              >
                and why it <PenUnderline delay={0.9}>never leaves</PenUnderline>
              </span>,
            ]}
          />
          <SettleIn delay={0.2} className="mt-6 max-w-[60ch]">
            <DropCapParagraph>
              Every paper closes with a colophon — the printer's note on the type, the paper, the
              press. This is ours, written for the people who approve the tool before the analysts
              ever open it. The architecture is a single idea, drawn once below and held everywhere:
              a sandboxed interface and a privileged engine, divided by a wall, joined by one narrow
              bridge. Read the diagram, audit the register, then unplug the network and watch
              nothing change.
            </DropCapParagraph>
          </SettleIn>
          <SettleIn delay={0.3} className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Byline name="Composé par l'atelier" desk="Bureau de l'architecture · à huis clos" />
            <Stamp color={STAMP_GREEN} tilt={4}>
              Bon à tirer
            </Stamp>
          </SettleIn>
        </div>
        <div className="lg:col-span-4">
          <ColophonPressPlate />
        </div>
      </div>
    </header>
  );
}

/** The closing imprint line — the boundary restated as one auditor's sentence. */
function ColophonImprint({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="border-2 border-[#1c1914] bg-[#eee6d6] px-6 py-7 shadow-[4px_4px_0_#1c1914] sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-[52ch]">
            <p className={T.kicker}>L'avis du service de vérification</p>
            <p className="mt-2 font-serif text-[clamp(1.2rem,2.3vw,1.55rem)] font-bold leading-[1.2] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Une surface d'attaque qu'un humain peut tenir en tête : un mur, un pont, et rien qui
              sorte.
            </p>
            <p className={`${T.ui} mt-2 text-[14px]`}>
              The whole design fits on one page on purpose. A reviewer can read it, draw it, and sign
              it in an afternoon.
            </p>
          </div>
          <InkButton tone="outline" href="#faq" className="shrink-0">
            Les questions du service
            <ArrowUpRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-0.5" />
          </InkButton>
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §13.8 — THE SECTION · assembly of the colophon spread
 *  Print layout: masthead across the page; then the press diagram and its two
 *  zone legends in the left rail, the guarantee register in the wide column;
 *  the denials plate spans full width as the audit's photographed box; a pull
 *  quote restates the soul; the imprint line signs it off.
 * ──────────────────────────────────────────────────────────────────────────── */

function ColophonSection() {
  return (
    <section
      id="colophon"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 1100px" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10 lg:pb-24 lg:pt-24">
        <ColophonHeader />

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-12">
          {/* ── the diagram rail: press plate, zone legends, pull quote ── */}
          <aside className="space-y-10 lg:col-span-5">
            <SettleIn>
              <ColophonPressDiagram />
            </SettleIn>
            <div className="grid gap-6 sm:grid-cols-2">
              <ColophonZonePlate
                band="Côté renderer"
                zone="bac à sable"
                parts={COLOPHON_RENDERER_PARTS}
              />
              <ColophonZonePlate
                band="Côté main process"
                zone="privilégié"
                parts={COLOPHON_MAIN_PARTS}
              />
            </div>
            <ColophonProvenancePlate />
            <PullQuote cite="Le service de vérification" className="hidden lg:block">
              Rien ne quitte la machine. Pas une ligne, pas un octet, pas une statistique d'usage.
            </PullQuote>
            <div className="hidden lg:block">
              <MarginNote side="right">
                Le pont a un seul couloir, et le portier connaît chaque message par son nom.
              </MarginNote>
            </div>
          </aside>

          {/* ── the guarantee register, the audited column ── */}
          <div className="min-w-0 lg:col-span-7">
            <ColophonRegister />
          </div>
        </div>

        {/* the reviewer's ledger spans the page — questions answered by design */}
        <ColophonThreatLedger className="mt-14 lg:mt-16" />

        {/* the denials box — the part the report photographs */}
        <ColophonDenialsPlate className="mt-12 lg:mt-14" />

        {/* the soul, surfaced in-flow on smaller presses */}
        <PullQuote cite="Le service de vérification" className="mt-14 lg:hidden">
          Rien ne quitte la machine. Pas une ligne, pas un octet, pas une statistique d'usage.
        </PullQuote>

        <ColophonImprint className="mt-14 lg:mt-16" />

        <DoubleRule className="mt-16 lg:mt-20" />
        <FolioLine
          page="p. 11"
          note="Colophon — un mur, un pont, et la porte fermée à clé"
          className="mt-4"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 14 — LettersSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §14 — LETTERS · COURRIER DES LECTEURS · p. 12
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Testimonials, but printed the only honest way a newspaper knows how:
 *  as reader mail. Four letters lie on the page like scraps on the courrier
 *  desk — each on its own paper shade, each tilted a degree or two off true,
 *  each drifting at its own parallax speed so the desk feels three scraps
 *  deep. Every letter carries the full postal apparatus: a torn deckle edge
 *  where it was opened with the coupe-papier, a postage stamp in the corner
 *  (perforated, with the persona's trade as the engraving), and a vermilion
 *  postmark — double ring, curved town name, wavy killer bars cancelling the
 *  stamp — because ink that has travelled should look like it.
 *
 *  Editorial honesty is the design brief here. The mast carries the
 *  disclaimer in plain serif italic — "Lettres authentiquement fictives —
 *  vos chiffres, eux, seront réels." — and the footnote at the bottom of the
 *  rubrique explains exactly how the composites were assembled. A landing
 *  page that fakes testimonials silently is slop; one that says "these are
 *  composites, the stopwatch is real" is a newspaper.
 *
 *  Layout: an intro column (the courrier desk's own ledger — counts, the
 *  registre, a cut-out coupon) sits sticky at lg while the letters scroll
 *  past in a two-column scatter. Below, the "aussi reçu" digest prints the
 *  one-liners that didn't earn a full column. Motion stays inside budget:
 *  Parallax (transform), InkPath postmarks (pathLength), SettleIn reveals
 *  (opacity/transform), one green VISÉ stamp slam (ed-stamp). Everything
 *  routes through useReducedMotion via the preamble primitives.
 * ════════════════════════════════════════════════════════════════════════════ */

/** One reader letter — the full postal object, not just a quote. */
type LettersLetter = {
  /** stable key + anchor for margin furniture */
  id: string;
  /** courrier desk filing reference, set in mono in the letter head */
  refCode: string;
  /** the "Objet:" line — French data label per the bilingual newsroom rule */
  objet: string;
  /** reception dateline, e.g. "Reçu le 3 juin" */
  received: string;
  /** how the letter physically arrived — desk wit, one per letter */
  via: string;
  salutation: string;
  /** serif body; ReactNode so the editor's pen (PenCircle/PenUnderline) can mark figures */
  paragraphs: ReadonlyArray<ReactNode>;
  signature: { name: string; role: string; city: string };
  /** vermilion cancellation: curved town arc, date + heure in the ring */
  postmark: { town: string; date: string; time: string; tilt: number };
  /** corner postage stamp: trade glyph + a denomination that tells the story */
  stamp: { icon: ReactNode; denomination: string };
  /** alternating scrap shade — PAPER_DEEP / PAPER_SHADE per the brief */
  shade: string;
  /** static scrap tilt, −2..2deg */
  tilt: number;
  /** px of parallax drift — every scrap floats at its own depth */
  parallax: number;
  /** degrees of slow parallax rotation across the transit (organic, tiny) */
  drift: number;
  /** lg-only top padding class, staggering the two-column scatter */
  lift: string;
  /** the courrier desk's routing slip, stamped at the letter's foot */
  routing: ReadonlyArray<{ step: string; time: string }>;
  /** optional rubber stamp slammed beside the signature (Karim's VISÉ) */
  approval?: { label: string; tilt: number };
  /** optional editor's reply scrap, paperclipped under the letter */
  reply?: ReactNode;
  /** optional pencilled marginalia tucked beneath the scrap at lg */
  marginNote?: string;
};

/* ── The mail itself ──────────────────────────────────────────────────────
 *  Four composites. Diverse names, real trades, organic numbers, and the
 *  one rule of the rubrique: every figure quoted survived the desk's
 *  stopwatch. The grudging one goes last — scepticism is the best closer. */
const LETTERS_MAIL: ReadonlyArray<LettersLetter> = [
  {
    id: "sana",
    refCode: "Réf. CL-847/114",
    objet: "Six heures devenues onze minutes",
    received: "Reçu le 3 juin",
    via: "par porteur",
    salutation: "À la rédaction,",
    paragraphs: [
      <>
        For four years my mornings belonged to a spreadsheet. The daily file lands at 6 h 02 —
        2 147 380 rows of DailyTransactions — and by the time the pivot tables stopped repainting
        it was mid-afternoon. Six hours on a good day, with the door closed and the fan begging.
      </>,
      <>
        Last Tuesday I dropped the same file into Data Navigator at 7 h 49. It profiled the
        columns, flagged two canaux I would have missed, and put the finished PDF on my desk at{" "}
        <PenCircle delay={0.5}>
          <strong className="font-mono text-[15px] font-bold tracking-tight">8 h 00</strong>
        </PenCircle>
        . Eleven minutes, end to end. I timed it twice because I did not believe it once.
      </>,
      <>
        I have spent the recovered afternoons hunting the billing anomalies nobody ever had time
        for. Found three. Print this letter so my chef d’exploitation stops asking what changed.”
      </>,
    ],
    signature: { name: "Sana B.", role: "Analyste réseau", city: "Sfax" },
    postmark: { town: "SFAX · COURRIER", date: "03-06", time: "07 H 49", tilt: -7 },
    stamp: {
      icon: <RadioTower aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "11 MIN",
    },
    shade: PAPER_DEEP,
    tilt: -1.7,
    parallax: 18,
    drift: 0.5,
    lift: "",
    routing: [
      { step: "Levée", time: "06 h 12" },
      { step: "Tri", time: "06 h 40" },
      { step: "Marbre", time: "07 h 05" },
    ],
    reply: (
      <>
        La rédaction confirme : 11 minutes, montre en main. Le chrono est posé sur le bureau du
        rédacteur en chef ; il fait foi.{" "}
        <span className="font-grotesk text-[11px] font-bold not-italic uppercase tracking-[0.14em]">
          — N.D.L.R.
        </span>
      </>
    ),
  },
  {
    id: "karim",
    refCode: "Réf. CL-847/093",
    objet: "Approuvé pour ce qu’il ne fait pas",
    received: "Reçu le 28 mai",
    via: "par pli interne",
    salutation: "Monsieur le rédacteur,",
    paragraphs: [
      <>
        Security reviews are where my tools go to die. The questionnaire alone has outlived three
        vendors, and the analysts have learned not to name anything before it clears. So when the
        audit team took on Data Navigator, I scheduled a month and warned the desk not to get
        attached.
      </>,
      <>
        The review took eight days. They unplugged the network cable, ran the full morning
        pipeline — import, calculs, exports — and watched the firewall log stay{" "}
        <PenUnderline delay={0.45}>empty</PenUnderline>. Their conclusion fits on one line, and I
        have it framed: « Aucune donnée ne quitte le poste. »
      </>,
      <>
        I have approved many tools for what they do. This is the first one I have approved for
        what it refuses to do.”
      </>,
    ],
    signature: { name: "Karim T.", role: "Chef d’exploitation", city: "Tunis" },
    postmark: { town: "TUNIS R.P.", date: "28-05", time: "09 H 12", tilt: 5 },
    stamp: {
      icon: <ShieldCheck aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "0 OCTET",
    },
    shade: PAPER_SHADE,
    tilt: 1.4,
    parallax: 40,
    drift: -0.4,
    lift: "lg:pt-24",
    routing: [
      { step: "Levée", time: "08 h 30" },
      { step: "Tri", time: "08 h 51" },
      { step: "Marbre", time: "09 h 04" },
    ],
    approval: { label: "Visé — sécurité", tilt: -6 },
  },
  {
    id: "mounira",
    refCode: "Réf. CL-847/121",
    objet: "Douze diapositives, 7 h 45",
    received: "Reçu le 5 juin",
    via: "sous double enveloppe",
    salutation: "Chère rédaction,",
    paragraphs: [
      <>
        I will be honest with your readers: I do not open dashboards. I chair a regional committee
        at 8 h 00 and I have no appetite for filters before coffee.
      </>,
      <>
        What I open is the PPTX. It is waiting on the regional drive at{" "}
        <PenUnderline delay={0.4}>
          <strong className="font-mono text-[15px] font-bold tracking-tight">7 h 45</strong>
        </PenUnderline>{" "}
        every morning — twelve slides, our own template, the figures already placed and the
        commentary already drafted by the desk’s offline AI. My meeting now begins with decisions
        instead of formatting.
      </>,
      <>
        Whoever taught a database to respect a slide master deserves a promotion. Not mine to
        give — but noted, in writing, in your pages.”
      </>,
    ],
    signature: { name: "Mounira G.", role: "Direction régionale", city: "Sousse" },
    postmark: { town: "SOUSSE GARE", date: "05-06", time: "07 H 45", tilt: -4 },
    stamp: {
      icon: <Presentation aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "12 DIAPOS",
    },
    shade: PAPER_DEEP,
    tilt: 1.9,
    parallax: 26,
    drift: 0.4,
    lift: "lg:pt-4",
    routing: [
      { step: "Levée", time: "07 h 58" },
      { step: "Tri", time: "08 h 22" },
      { step: "Marbre", time: "08 h 47" },
    ],
    marginNote: "7 h 45 — avant même le café de la rédaction.",
  },
  {
    id: "yacine",
    refCode: "Réf. CL-847/130",
    objet: "Plainte retirée, à contrecœur",
    received: "Reçu le 9 juin",
    via: "glissée sous la porte",
    salutation: "To whoever edits this page,",
    paragraphs: [
      <>
        I came to file a complaint. I keep a pipeline alive for a living — a cluster, an
        orchestrator, three YAML files I see when I close my eyes. Your paper kept printing that
        a laptop now finishes the same morning aggregation before my cluster finishes
        provisioning. Irresponsible journalism, I thought.
      </>,
      <>
        So I tested it. DuckDB, embedded, no server: the GROUP BY over two million rows came back
        in{" "}
        <PenCircle delay={0.5}>
          <strong className="font-mono text-[15px] font-bold tracking-tight">11 secondes</strong>
        </PenCircle>
        . I read the query plan twice looking for the trick. There is no trick. There is a
        columnar engine doing its job uncomfortably well, on hardware I had already written off.
      </>,
      <>
        Fine. It is fast. I have written it down and I will not be repeating it in person. The
        complaint is withdrawn; the cluster and I need to talk.”
      </>,
    ],
    signature: { name: "Yacine R.", role: "Data engineer", city: "Ariana" },
    postmark: { town: "ARIANA NORD", date: "09-06", time: "23 H 41", tilt: 8 },
    stamp: {
      icon: <Database aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "11 SEC",
    },
    shade: PAPER_SHADE,
    tilt: -1.2,
    parallax: 48,
    drift: -0.6,
    lift: "lg:pt-16",
    routing: [
      { step: "Levée", time: "23 h 50" },
      { step: "Tri", time: "06 h 15" },
      { step: "Marbre", time: "06 h 38" },
    ],
    marginNote: "Il a relu le query plan deux fois. Nous aussi.",
  },
];

/* ── The overflow tray ────────────────────────────────────────────────────
 *  One-liners that earned a line of type but not a column. Same honesty
 *  rule applies; the signatures stay in the registre. */
const LETTERS_DIGEST: ReadonlyArray<{ quote: string; sig: string }> = [
  {
    quote: "« Mon VPN n’a jamais été aussi reposé. »",
    sig: "H. K., infrastructure, Gabès",
  },
  {
    quote: "« J’ai cherché le bouton cloud pendant dix minutes. Il n’existe pas. Bravo. »",
    sig: "A. S., conformité, Tunis",
  },
  {
    quote: "« Les prévisions se trompent moins que mon stagiaire. Gardez les deux. »",
    sig: "F. Z., planification, Nabeul",
  },
  {
    quote: "« Le DOCX respecte nos marges. Même la direction n’y arrive pas. »",
    sig: "L. B., qualité, Monastir",
  },
  {
    quote: "« Onze minutes ? Chez nous, neuf. Signé : un service réseau mieux câblé. »",
    sig: "O. T., NOC, Kairouan",
  },
  {
    quote: "« Première application approuvée sans réunion. On s’est sentis inutiles. »",
    sig: "Comité sécurité, anonyme",
  },
];

/* ── The registre — the courrier desk's own ledger, printed in the intro
 *  column. The zero is the line the security teams read first. */
const LETTERS_REGISTRY: ReadonlyArray<{ label: string; value: string; hot?: boolean }> = [
  { label: "Lettres reçues cette semaine", value: "23" },
  { label: "Publiées dans cette édition", value: "4" },
  { label: "Réclamations sur la vitesse", value: "0" },
  { label: "Octets sortis des postes", value: "0", hot: true },
];

/* ── The one that didn't make it ──────────────────────────────────────────
 *  A testimonial page that shows a REJECTED testimonial is making a claim
 *  about its own standards. This slip is that claim: a letter sent back
 *  because it praised in adjectives instead of figures. The desk's rule,
 *  printed where readers can hold it against us. */
const LETTERS_RETURNED = {
  refCode: "Réf. CL-847/108",
  received: "Reçu le 6 juin",
  excerpt: "« Deux fois plus rapide que tout ce que j’ai connu, un outil incroyable… »",
  motif: "Motif — superlatif sans unité. Aucun chiffre, aucune montre, aucun fichier.",
  verdict:
    "Retournée à l’expéditeur avec le chrono de la rédaction, en prêt. Le courrier publie des minutes, pas des adjectifs.",
} as const;

/* ── Errata du courrier ───────────────────────────────────────────────────
 *  A newspaper that corrects itself is a newspaper you can quote. Two
 *  corrections, one of which corrects nothing — that joke IS the security
 *  posture, restated as print furniture. */
const LETTERS_ERRATA: ReadonlyArray<{ edition: string; text: string }> = [
  {
    edition: "Édition du 5 juin",
    text: "M. Yacine R. était crédité de « 12 secondes ». Il insiste : 11. Dont acte, et nos excuses au moteur.",
  },
  {
    edition: "Édition du 29 mai",
    text: "Le registre annonçait « 0 octet sorti des postes ». Après recomptage : toujours 0. La rédaction maintient.",
  },
];

/* ════════════════════════════════════════════════════════════════════════════
 *  POSTAL FURNITURE — the apparatus that makes a quote into mail
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Airmail rule — the par-avion border, alternating vermilion and press-blue
 * slants. Printed once under the mast and once on the coupon: it is the
 * rubrique's signature ornament, not a repeating texture. Static DOM, zero
 * animation cost. Width overshoots (72 × 24px ≈ 1 730px) and clips, so it
 * holds from 360px to 1680px without measurement.
 */
function LettersAirmailRule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`flex h-[9px] items-stretch overflow-hidden ${className ?? ""}`}>
      {Array.from({ length: 72 }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static ornament segments
          key={i}
          className="mr-[7px] inline-block h-full w-[17px] shrink-0 -skew-x-[24deg]"
          style={{ backgroundColor: i % 2 === 0 ? VERMILION : PRESS_BLUE }}
        />
      ))}
    </div>
  );
}

/**
 * Deckle edge — the torn top of a scrap, opened with the coupe-papier.
 * The silhouette is deterministic sine jitter seeded per letter (rule 13:
 * no Math.random), filled in the scrap's own shade so it reads as part of
 * the paper against the page background.
 */
function LettersDeckleEdge({ seed, fill }: { seed: number; fill: string }) {
  const d = useMemo(() => {
    const steps = 46;
    const w = 640;
    const h = 12;
    let path = `M0,${h}`;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const y =
        6 + Math.sin(i * 1.9 + seed * 3.1) * 2.6 + Math.cos(i * 0.7 + seed * 1.7) * 1.8;
      path += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return `${path} L${w},${h} Z`;
  }, [seed]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 640 12"
      preserveAspectRatio="none"
      className="absolute -top-[11px] left-0 h-[12px] w-full"
    >
      <path d={d} fill={fill} />
    </svg>
  );
}

/**
 * The vermilion postmark — double InkPath ring drawn on scroll, town name
 * curved along the upper arc, TUNISIE smiling along the lower, date and
 * heure set in mono at the centre, three wavy killer bars cancelling the
 * stamp to the right. mix-blend-multiply lets the ink sit INTO the paper
 * and the stamp beneath it, the way real cancellation ink does.
 */
function LettersPostmark({
  town,
  date,
  time,
  tilt,
}: {
  town: string;
  date: string;
  time: string;
  tilt: number;
}) {
  const id = useId().replace(/[:]/g, "");
  return (
    <svg
      aria-hidden
      viewBox="0 0 178 96"
      className="h-[78px] w-[144px] mix-blend-multiply sm:h-[88px] sm:w-[163px]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <defs>
        {/* upper arc for the town name, lower arc (smiling) for the country */}
        <path id={`lpm-top-${id}`} d="M14,48 a34,34 0 0 1 68,0" />
        <path id={`lpm-bot-${id}`} d="M19,48 a29,29 0 0 0 58,0" />
      </defs>
      {/* double ring, drawn outside-in like a cancellation press coming down */}
      <InkPath d="M48,7 a41,41 0 1 1 -0.02,0" stroke={VERMILION} strokeWidth={2.2} duration={0.8} />
      <InkPath
        d="M48,14 a34,34 0 1 1 -0.02,0"
        stroke={VERMILION}
        strokeWidth={1.3}
        delay={0.18}
        duration={0.75}
      />
      <text
        fontSize="7.5"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="2"
        fill={VERMILION}
      >
        <textPath href={`#lpm-top-${id}`} startOffset="50%" textAnchor="middle">
          {town}
        </textPath>
      </text>
      <text fontSize="6.5" fontFamily="var(--font-mono)" letterSpacing="2.6" fill={VERMILION}>
        <textPath href={`#lpm-bot-${id}`} startOffset="50%" textAnchor="middle">
          TUNISIE
        </textPath>
      </text>
      {/* the date block — the part readers actually check */}
      <text
        x="48"
        y="45.5"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fontFamily="var(--font-mono)"
        letterSpacing="1"
        fill={VERMILION}
      >
        {date}
      </text>
      <text
        x="48"
        y="56"
        textAnchor="middle"
        fontSize="7"
        fontFamily="var(--font-mono)"
        letterSpacing="1.4"
        fill={VERMILION}
      >
        {time}
      </text>
      <text x="13.5" y="51" fontSize="7" fill={VERMILION}>
        ✦
      </text>
      <text x="77.5" y="51" fontSize="7" fill={VERMILION}>
        ✦
      </text>
      {/* killer bars — they ride over the stamp via absolute positioning */}
      <InkPath
        d="M96,30 q9,-5 18,0 t18,0 t18,0 t18,0"
        stroke={VERMILION}
        strokeWidth={2.4}
        delay={0.3}
        duration={0.5}
      />
      <InkPath
        d="M96,48 q9,-5 18,0 t18,0 t18,0 t18,0"
        stroke={VERMILION}
        strokeWidth={2.4}
        delay={0.38}
        duration={0.5}
      />
      <InkPath
        d="M96,66 q9,-5 18,0 t18,0 t18,0 t18,0"
        stroke={VERMILION}
        strokeWidth={2.4}
        delay={0.46}
        duration={0.5}
      />
    </svg>
  );
}

/**
 * Corner postage stamp — dotted outer border standing in for perforation,
 * a thin vermilion frame, the persona's trade as the engraving, and a
 * denomination that prices the letter in the unit that matters (11 MIN,
 * 0 OCTET…). Sits under the postmark's killer bars in the z-order.
 */
function LettersStampCorner({ icon, denomination }: { icon: ReactNode; denomination: string }) {
  return (
    <div
      aria-hidden
      className="relative h-[64px] w-[52px] rotate-[2.5deg] border-2 border-dotted border-[#857c69]/70 bg-[#f6f1e7] p-[4px] shadow-[3px_3px_0_#1c1914] sm:h-[72px] sm:w-[58px] sm:p-[5px]"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 border-[1.5px] border-[#bf3415] bg-[#eee6d6] text-[#1c1914]">
        {icon}
        <span className="font-mono text-[7.5px] font-semibold tracking-[0.06em] text-[#bf3415] sm:text-[8px]">
          {denomination}
        </span>
      </div>
    </div>
  );
}

/**
 * The full postal corner: stamp at right, postmark overlapping from the
 * left so its killer bars cancel the stamp. Pointer-events off — it is
 * furniture, not UI. The letter head reserves height for it (min-h on the
 * head row) so body copy never collides, even at 360px.
 */
function LettersPostalCorner({ letter }: { letter: LettersLetter }) {
  return (
    <div className="pointer-events-none absolute right-4 top-4 sm:right-6 sm:top-5">
      <div className="relative">
        <LettersStampCorner icon={letter.stamp.icon} denomination={letter.stamp.denomination} />
        <div className="absolute -left-[88px] top-0 z-10 sm:-left-[100px] sm:top-0.5">
          <LettersPostmark
            town={letter.postmark.town}
            date={letter.postmark.date}
            time={letter.postmark.time}
            tilt={letter.postmark.tilt}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Routing slip — the desk's own stamp at the letter's foot: levée, tri,
 * marbre, each ticked in proof-green, destination p. 12 in vermilion.
 * Pure print furniture; it also quietly tells the reader every letter on
 * this page went through a human tri.
 */
function LettersRoutingSlip({ routing }: { routing: ReadonlyArray<{ step: string; time: string }> }) {
  return (
    <div className="mt-6 border-t border-[#d6ccb6] pt-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
          Acheminement
        </span>
        {routing.map((s) => (
          <span key={s.step} className="inline-flex items-center gap-1.5">
            <Check aria-hidden className="h-3 w-3 text-[#2f6b3f]" strokeWidth={3} />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#4a4438]">
              {s.step} {s.time}
            </span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#bf3415]">
          → p. 12
        </span>
      </div>
    </div>
  );
}

/** Hand-drawn ink flourish under a reader's signature — readers sign in ink;
 *  only the editor writes in vermilion. */
function LettersSignatureFlourish() {
  return (
    <svg aria-hidden viewBox="0 0 130 10" className="h-[9px] w-[120px]">
      <InkPath
        d="M3,6 C 22,1 40,9 60,4 S 98,2 127,6"
        stroke={INK}
        strokeWidth={1.6}
        delay={0.25}
        duration={0.5}
      />
    </svg>
  );
}

/**
 * The editor's reply — a smaller scrap paperclipped beneath a letter,
 * set in italic vermilion because it is the pen, not the press, speaking.
 * Only one letter earns a reply; restraint is what makes it land.
 */
function LettersEditorReply({ children }: { children: ReactNode }) {
  return (
    <SettleIn y={12} className="relative z-10 -mt-3 ml-5 mr-8 sm:ml-12 sm:mr-16">
      <div className="relative rotate-[1.3deg] border border-[#d6ccb6] bg-[#f6f1e7] px-5 py-4 shadow-[3px_3px_0_#1c1914]">
        <Paperclip
          aria-hidden
          className="absolute -top-3.5 left-6 h-6 w-6 -rotate-12 text-[#4a4438]"
          strokeWidth={1.6}
        />
        <div className="flex items-start gap-2.5">
          <PenLine aria-hidden className="mt-1 h-4 w-4 shrink-0 text-[#bf3415]" strokeWidth={1.8} />
          <p className="font-serif text-[15px] italic leading-[1.55] text-[#bf3415]">{children}</p>
        </div>
      </div>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE LETTER SCRAP — one reader's mail, complete
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A single letter on its scrap. A real component (not a map callback) so
 * the postmark's useId and the deckle's useMemo run legally. Each scrap:
 * static tilt from data, its own Parallax depth and a whisper of rotation
 * drift, deckle edge in its own shade, offset-print shadow, and a hover
 * lift on a separate wrapper so the transform doesn't fight the tilt.
 */
function LettersLetterCard({ letter, index }: { letter: LettersLetter; index: number }) {
  return (
    <Parallax speed={letter.parallax} rotate={letter.drift} className={letter.lift}>
      <div className="transition-transform duration-300 ease-out hover:-translate-y-1">
        <div style={{ transform: `rotate(${letter.tilt}deg)` }}>
          <article
            aria-label={`Lettre de ${letter.signature.name}, ${letter.signature.role}`}
            className="relative shadow-[4px_4px_0_#1c1914]"
            style={{ backgroundColor: letter.shade }}
          >
            <LettersDeckleEdge seed={index + 1} fill={letter.shade} />
            <LettersPostalCorner letter={letter} />

            <div className="px-6 pb-7 pt-6 sm:px-8 sm:pb-9 sm:pt-7">
              {/* letter head — filing ref top-left, postal corner reserves the right */}
              <div className="min-h-[84px] sm:min-h-[92px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#857c69]">
                  {letter.refCode}
                </p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#857c69]">
                  Courrier · {EDITION.issue}
                </p>
              </div>

              <Rule className="mb-4" />

              {/* the Objet line — French data label, grotesk, the rubrique's handle */}
              <p className="font-grotesk text-[12px] font-bold uppercase tracking-[0.18em] text-[#1c1914]">
                Objet — {letter.objet}
              </p>
              <p className={`mt-1.5 ${T.folio}`}>
                {letter.received} · {letter.via}
              </p>

              {/* serif body with a hanging quotation mark — these are spoken words */}
              <div className="relative mt-6">
                <span
                  aria-hidden
                  className="absolute -left-1.5 -top-5 select-none font-serif text-[3.4rem] leading-none text-[#1c1914]/60"
                >
                  “
                </span>
                <p className="pl-7 font-serif text-[15px] italic leading-snug text-[#4a4438]">
                  {letter.salutation}
                </p>
                <div className="mt-3 space-y-4 pl-7">
                  {letter.paragraphs.map((para, pi) => (
                    <p
                      // biome-ignore lint/suspicious/noArrayIndexKey: static letter copy
                      key={pi}
                      className="font-serif text-[16px] leading-[1.68] text-[#1c1914]"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>

              {/* signature row — optional rubber stamp left, grotesk signature right */}
              <div className="mt-7 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  {letter.approval && (
                    <Stamp color={STAMP_GREEN} tilt={letter.approval.tilt}>
                      {letter.approval.label}
                    </Stamp>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <LettersSignatureFlourish />
                  <span className="font-grotesk text-[13px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
                    {letter.signature.name}
                  </span>
                  <span className="font-serif text-[13px] italic leading-tight text-[#4a4438]">
                    {letter.signature.role} · {letter.signature.city}
                  </span>
                </div>
              </div>

              <LettersRoutingSlip routing={letter.routing} />
            </div>
          </article>

          {letter.reply && <LettersEditorReply>{letter.reply}</LettersEditorReply>}

          {/* pencilled marginalia, tucked under the scrap edge — xl only, where
              the desk has room to scribble without colliding with the next scrap */}
          {letter.marginNote && (
            <div className="relative hidden xl:block">
              <div className="absolute -bottom-2 right-10 translate-y-full">
                <MarginNote side="right">{letter.marginNote}</MarginNote>
              </div>
            </div>
          )}
        </div>
      </div>
    </Parallax>
  );
}

/**
 * The returned letter — a thin slip on plain paper (lighter than the four
 * scraps, soft lift instead of offset shadow: it never reached the press).
 * It closes the scatter grid: after four letters that passed the stopwatch,
 * the reader sees what failing it looks like. The strike-through on the
 * quoted superlative is the editor's pen doing the rejecting, live.
 */
function LettersReturnedSlip() {
  return (
    <Parallax speed={30} rotate={-0.3} className="lg:pt-6">
      <div className="transition-transform duration-300 ease-out hover:-translate-y-1">
        <div style={{ transform: "rotate(0.9deg)" }}>
          <aside
            aria-label="Lettre retournée par la rédaction"
            className="relative border border-[#d6ccb6] bg-[#f6f1e7] px-6 py-6 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:px-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#857c69]">
                  {LETTERS_RETURNED.refCode}
                </p>
                <p className={`mt-1.5 ${T.folio}`}>{LETTERS_RETURNED.received} · non publiée</p>
              </div>
              <Stamp color={VERMILION} tilt={6}>
                Retourné au lecteur
              </Stamp>
            </div>

            <Rule className="my-4" />

            {/* the offending sentence, struck through by the pen itself */}
            <p className="font-serif text-[15.5px] italic leading-[1.6] text-[#4a4438]">
              <PenStrike delay={0.55}>{LETTERS_RETURNED.excerpt}</PenStrike>
            </p>
            <p className="mt-3 font-grotesk text-[11px] font-bold uppercase tracking-[0.16em] text-[#bf3415]">
              {LETTERS_RETURNED.motif}
            </p>
            <p className={`mt-3 ${T.ui}`}>{LETTERS_RETURNED.verdict}</p>

            <div className="mt-5 flex items-center gap-2 border-t border-[#d6ccb6] pt-3">
              <CornerUpLeft aria-hidden className="h-3.5 w-3.5 text-[#857c69]" strokeWidth={2} />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69]">
                Réexpédition · affranchie à 0 octet, comme tout le reste
              </span>
            </div>
          </aside>
        </div>
      </div>
    </Parallax>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE COURRIER DESK — intro column: ledger, registre, coupon
 * ════════════════════════════════════════════════════════════════════════════ */

/** Registre row — one line of the desk's ledger; the zero rows run hot. */
function LettersRegistryRow({ entry }: { entry: { label: string; value: string; hot?: boolean } }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#d6ccb6] py-2.5">
      <span className="font-grotesk text-[12px] uppercase tracking-[0.12em] text-[#4a4438]">
        {entry.label}
      </span>
      {entry.hot ? (
        <PenCircle delay={0.6}>
          <span className="font-mono text-[15px] font-bold tabular-nums text-[#bf3415]">
            {entry.value}
          </span>
        </PenCircle>
      ) : (
        <span className="font-mono text-[15px] font-bold tabular-nums text-[#1c1914]">
          {entry.value}
        </span>
      )}
    </div>
  );
}

/**
 * The cut-out coupon — dashed border, scissors at the corner, one outline
 * button. The rubrique's only call to action, priced like everything else
 * on this page: in the reader's own minutes.
 */
function LettersCoupon() {
  return (
    <SettleIn delay={0.15} className="relative mt-10">
      <div className="relative border-2 border-dashed border-[#857c69] p-5 sm:p-6">
        <Scissors
          aria-hidden
          className="absolute -top-[13px] left-5 h-5 w-5 rotate-90 bg-[#f6f1e7] px-0.5 text-[#4a4438]"
          strokeWidth={1.8}
        />
        <LettersAirmailRule className="mb-4" />
        <p className={T.kicker}>Bon pour un essai · découpez ici</p>
        <p className="mt-3 font-serif text-[16px] leading-[1.6] text-[#1c1914]">
          Run the stopwatch on your own CSV. The courrier desk accepts corrections, complaints and
          query plans — by the same route the data takes:{" "}
          <span className="font-semibold">none</span>.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <InkButton href="/signup" tone="outline">
            Écrire sa propre lettre
            <Send aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </InkButton>
          <InkLink href="#faq">Questions au courrier →</InkLink>
        </div>
        <p className={`mt-4 ${T.folio}`}>Valable hors connexion. Surtout hors connexion.</p>
      </div>
    </SettleIn>
  );
}

/**
 * The intro column. Sticky at lg so the desk's ledger keeps the reader
 * company while the four scraps scroll by. Headline is the rubrique's
 * whole argument in three lines.
 */
function LettersDeskIntro() {
  return (
    <div className="lg:sticky lg:top-24">
      <SettleIn>
        <div className="flex items-center gap-2.5">
          <Mail aria-hidden className="h-4 w-4 text-[#bf3415]" strokeWidth={1.8} />
          <span className={T.kicker}>Rubrique courrier · ouverte au coupe-papier</span>
        </div>
      </SettleIn>

      <DeckReveal
        className="mt-5"
        lines={[
          <span
            key="l1"
            className="font-serif text-[clamp(2.1rem,3.6vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            Four letters,
          </span>,
          <span
            key="l2"
            className="font-serif text-[clamp(2.1rem,3.6vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            one stopwatch,
          </span>,
          <span
            key="l3"
            className="font-serif text-[clamp(2.1rem,3.6vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#bf3415] [font-variation-settings:'WONK'_1]"
          >
            zero packets.
          </span>,
        ]}
      />

      <SettleIn delay={0.1}>
        <p className={`mt-6 ${T.body}`}>
          Every tool page prints applause; this desk prints mail. The letters opposite are
          composites — drawn from evaluation notes, renamed, set in type. The figures they quote
          went past our fact-checking desk, which owns a stopwatch and very little patience.
        </p>
        <p className={`mt-4 ${T.ui}`}>
          Le tri est fait à la main. Les chiffres sont vérifiés à la montre. Le réseau, lui, n’est
          au courant de rien.
        </p>
      </SettleIn>

      {/* the registre — the desk's ledger, closed by the line that matters */}
      <SettleIn delay={0.15} className="mt-9">
        <div className="flex items-center gap-2.5">
          <Inbox aria-hidden className="h-4 w-4 text-[#4a4438]" strokeWidth={1.8} />
          <span className={T.kicker}>Registre du courrier — semaine 24</span>
        </div>
        <div className="mt-2">
          {LETTERS_REGISTRY.map((entry) => (
            <LettersRegistryRow key={entry.label} entry={entry} />
          ))}
        </div>
        <p className={`mt-3 ${T.folio}`}>Relevé du {EDITION.datelineShort} · signé du coupe-papier</p>
      </SettleIn>

      <LettersCoupon />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE OVERFLOW TRAY — « aussi reçu » digest
 * ════════════════════════════════════════════════════════════════════════════ */

/** One digest entry — a quote that earned a line, not a column. */
function LettersDigestEntry({ entry }: { entry: { quote: string; sig: string } }) {
  return (
    <figure className="mb-7 break-inside-avoid border-l-2 border-[#d6ccb6] pl-4">
      <blockquote className="font-serif text-[15px] italic leading-[1.55] text-[#1c1914]">
        {entry.quote}
      </blockquote>
      <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#857c69]">
        — {entry.sig}
      </figcaption>
    </figure>
  );
}

/**
 * Errata du courrier — the corrections box every honest paper carries.
 * Boxed in a full ink border (corrections are formal), set smaller than
 * the letters: the paper lowering its voice to correct itself.
 */
function LettersErrata() {
  return (
    <div className="border border-[#1c1914] px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center gap-2.5">
        <PenLine aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={1.8} />
        <span className={T.kicker}>Errata du courrier</span>
      </div>
      <div className="mt-3 space-y-3">
        {LETTERS_ERRATA.map((erratum) => (
          <p key={erratum.edition} className="font-serif text-[13.5px] leading-[1.6] text-[#1c1914]">
            <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.14em] text-[#857c69]">
              {erratum.edition} ·{" "}
            </span>
            {erratum.text}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * The digest strip. CSS columns (not a grid of cards — this is a newspaper)
 * so the quotes rag naturally like classified lineage. One column at 360px,
 * two at 768px, three at 1280px. The errata box and the composites footnote
 * close the rubrique side by side at lg — confession and method, same row.
 */
function LettersDigest() {
  return (
    <SettleIn className="mt-16 sm:mt-20">
      <div className="flex items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <MailOpen aria-hidden className="h-4 w-4 text-[#4a4438]" strokeWidth={1.8} />
          <span className={T.kicker}>Aussi reçu cette semaine</span>
        </div>
        <Rule className="flex-1" />
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[#857c69] sm:block">
          19 lettres non publiées · conservées
        </span>
      </div>
      <div className="mt-7 gap-10 md:columns-2 lg:columns-3">
        {LETTERS_DIGEST.map((entry) => (
          <LettersDigestEntry key={entry.sig} entry={entry} />
        ))}
      </div>
      <div className="mt-4 grid items-start gap-8 lg:grid-cols-[minmax(0,30rem)_1fr]">
        <LettersErrata />
        {/* the honesty footnote — how the composites were made, in plain type */}
        <p className="max-w-2xl font-serif text-[12.5px] italic leading-[1.6] text-[#857c69] lg:pt-1">
          * Lettres composites : prénoms changés, métiers réels, chiffres vérifiés au chrono par
          la rédaction. Aucun octet n’a quitté un poste pour imprimer cette page. Les lettres non
          publiées dorment dans un tiroir — hors-ligne, évidemment.
        </p>
      </div>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §14 ROOT — LettersSection
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * COURRIER DES LECTEURS — p. 12 of The Daily Edition.
 *
 * Reading order: mast → honesty note → airmail rule → the desk (intro
 * column, sticky at lg) beside the scatter of four scraps → overflow
 * digest → folio. At 360px everything stacks in source order; the postal
 * corners shrink but never collide with copy because the letter heads
 * reserve their height. No StickyScene here, so contentVisibility is on
 * and the whole rubrique costs nothing until it scrolls near.
 */
function LettersSection() {
  return (
    <section
      id="letters"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3400px" }}
    >
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-28 lg:px-12">
        <SectionMast rubrique="Courrier des lecteurs" no="p. 12" />

        {/* the honesty note — the rubrique's terms, printed before the praise */}
        <SettleIn delay={0.1} className="mt-5 text-center">
          <p className="mx-auto max-w-xl font-serif text-[15px] italic leading-[1.6] text-[#4a4438]">
            Lettres authentiquement fictives<span className="text-[#bf3415]">*</span> — vos
            chiffres, eux, seront réels.
          </p>
        </SettleIn>

        <SettleIn delay={0.18} className="mt-7">
          <LettersAirmailRule />
        </SettleIn>

        {/* the desk and the scatter */}
        <div className="mt-12 grid gap-14 sm:mt-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <LettersDeskIntro />
          </div>

          {/* four scraps: 1-col stack on mobile in reading order, 2-col scatter
              at lg with per-letter lift + parallax doing the desk arrangement */}
          <div className="lg:col-span-8">
            <div className="grid items-start gap-12 sm:gap-14 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-16">
              {LETTERS_MAIL.map((letter, index) => (
                <LettersLetterCard key={letter.id} letter={letter} index={index} />
              ))}
              <LettersReturnedSlip />
            </div>
          </div>
        </div>

        <LettersDigest />

        <DoubleRule className="mt-14" />
        <FolioLine
          className="mt-3"
          page="p. 12"
          note="Le courrier est lu entre deux presses — répondre n’engage que l’encre"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 15 — QuestionsSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §15 — QUESTIONS · LE COURRIER DES QUESTIONS · p. 13
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  An FAQ printed the way a broadsheet runs its readers' questions: a Q&A
 *  column where letters arrive at the desk — from analysts who feed the file
 *  every morning and, more often, from the security teams who have to sign the
 *  tool before it touches a transaction record. Each question is set in
 *  Fraunces like a headline; the desk's reply is set in body serif, dry and
 *  specific, the way a sub-editor answers a reader who wants facts, not a
 *  brochure.
 *
 *  Design intent
 *  ─────────────
 *  • The accordion is the form. Every question is a real <button> carrying
 *    aria-expanded / aria-controls, a visible vermilion focus ring, and a
 *    proofreader's caret (Plus → Minus) that turns as the answer opens. The
 *    open/close state lives INSIDE a real child component (QuestionsItem) with
 *    its own useState — never a hook inside a .map() callback.
 *  • The reveal honours the motion budget: the answer panel fades and settles
 *    (opacity + y only, via AnimatePresence); height is never animated. Layout
 *    snaps like a drawer pulled open, the way print reveals a column.
 *  • Substance over decoration. The replies answer the questions a real
 *    security review and a real analyst would ask, with the product's true
 *    facts: nothing leaves the machine, the input is DailyTransactions.csv, a
 *    medium-end CPU-only PC is the floor, exports are PDF/DOCX/PPTX,
 *    collaboration is LAN-only, the renderer is sandboxed under CSP with
 *    Electron fuses and auto-update off by default.
 *  • Furniture frames it like a column: a mast, a standing "bureau des
 *    réponses" sidebar (counts + a routed call slip), a topic rail that lets
 *    the reader skim the dossier, and a closing coupon that mails the reader
 *    to /signup. One vermilion answer — "Rien ne sort du poste." — is the
 *    section's single circled figure, because it is the only answer the
 *    security desk reads twice.
 *  • All motion routes through the preamble primitives (SettleIn, RiseIn,
 *    Stamp, PenCircle, InkPath), each gated behind useReducedMotion internally.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ── The dossier of questions ──────────────────────────────────────────────────
 * One entry per question. `kicker` is the French filing label (the bilingual
 * newsroom rule: French data labels, English editorial voice). `answer` is a
 * ReactNode so the desk's pen (PenCircle) and tabular figures can sit inside
 * the reply. `tldr` is the one-line standfirst printed under the question even
 * when the panel is shut — a reader skimming the column still gets the verdict.
 * `tag` is the small proof printed beside the question; `topic` files the entry
 * under the rail above. `seed` drives deterministic micro-variation only.    */

type QuestionsEntry = {
  id: string;
  /** filing reference, set in mono in the question head — Q-01 … */
  ref: string;
  /** French topic label printed above the question */
  kicker: string;
  /** the question itself — Fraunces, headline voice, sentence case */
  question: string;
  /** standfirst: the answer in one line, printed shut or open */
  tldr: string;
  /** the full reply, body serif; ReactNode so figures can be circled */
  answer: ReactNode;
  /** lucide glyph filed beside the question */
  icon: QuestionsGlyph;
  /** small printed proof tag beside the question (mono) */
  tag: string;
  /** topic key, ties the entry to the rail */
  topic: QuestionsTopic;
  /** the desk's curt sign-off line under the reply */
  signoff: string;
  /** the one answer the security desk reads twice — circled in red */
  flagship?: boolean;
  /** opens by default — the question everyone asks first */
  defaultOpen?: boolean;
};

type QuestionsTopic = "données" | "matériel" | "ia" | "export" | "réseau" | "sécurité" | "départ";

/* lucide glyph names kept in a closed set so the manifest stays honest —
 * every name here is rendered by QuestionsGlyphFor and listed in the manifest. */
type QuestionsGlyph =
  | "ShieldCheck"
  | "FileText"
  | "Cpu"
  | "Brain"
  | "FileOutput"
  | "Network"
  | "Lock"
  | "Rocket";

const QUESTIONS_DOSSIER: ReadonlyArray<QuestionsEntry> = [
  {
    id: "exfil",
    ref: "Q-01",
    kicker: "Confidentialité · la question qu'on pose en premier",
    question: "Est-ce que mes données quittent la machine ?",
    tldr: "Non. Aucune. Pas un octet, pas une télémétrie, pas un ping.",
    icon: "ShieldCheck",
    tag: "0 octet · 0 requête",
    topic: "données",
    flagship: true,
    defaultOpen: true,
    answer: (
      <>
        <strong className="font-semibold">
          <PenCircle delay={0.5}>Rien ne sort du poste.</PenCircle>
        </strong>{" "}
        Data Navigator est une application de bureau qui lit votre{" "}
        <span className="font-mono text-[14px]">DailyTransactions.csv</span> et le traite sur
        place. Le moteur (DuckDB), l'IA (un modèle GGUF local) et l'export tournent tous dans le
        même processus, sur votre disque. Il n'y a pas de serveur distant à appeler parce qu'il
        n'y a pas de serveur. Au repos, l'application n'ouvre aucune connexion : pas de
        télémétrie, pas d'analytics, pas de « vérification de licence » qui téléphone à la maison.
        Coupez le réseau, débranchez le câble — le rapport du matin sort quand même.
      </>
    ),
    signoff: "Vérifiable au pare-feu : zéro connexion sortante en marche normale.",
  },
  {
    id: "input",
    ref: "Q-02",
    kicker: "Entrée · ce que vous donnez à manger",
    question: "Qu'est-ce que je lui donne, au juste ?",
    tldr: "Le fichier journalier — DailyTransactions.csv — tel qu'il sort.",
    icon: "FileText",
    tag: "CSV · ~2,1 M lignes",
    topic: "données",
    answer: (
      <>
        Un seul fichier : le <span className="font-mono text-[14px]">DailyTransactions.csv</span>{" "}
        que votre système produit chaque matin, sans le retoucher. L'application reconnaît les
        libellés télécoms français qu'il contient — <em>réussite</em>, <em>canaux</em>,{" "}
        <em>abonnés</em>, <em>montant TND</em> — profile les colonnes, repère les valeurs
        douteuses et bâtit le rapport autour. Une journée typique pèse{" "}
        <span className="font-mono text-[14px] tabular-nums">2 147 380</span> lignes ; DuckDB les
        avale en une quarantaine de secondes sur un poste ordinaire. Pas de schéma à déclarer, pas
        de connecteur à configurer, pas de base à provisionner : vous glissez le CSV, le reste est
        à nous.
      </>
    ),
    signoff: "Glissez le fichier tel quel — le profilage des colonnes est automatique.",
  },
  {
    id: "hardware",
    ref: "Q-03",
    kicker: "Matériel · le plancher, pas le plafond",
    question: "Il me faut quelle machine pour le faire tourner ?",
    tldr: "Un PC de milieu de gamme. Pas de GPU. Le processeur suffit.",
    icon: "Cpu",
    tag: "CPU · sans carte graphique",
    topic: "matériel",
    answer: (
      <>
        Un poste de bureau de milieu de gamme — celui que votre équipe a déjà. L'IA tourne sur le
        processeur par défaut : aucune carte graphique requise, aucun pilote à installer, aucune
        instance louée à l'heure. Le moteur DuckDB est taillé pour l'analytique sur une seule
        machine et garde la mémoire en laisse. Si un GPU est présent, tant mieux, l'IA s'en sert ;
        s'il n'y en a pas — le cas courant — le rapport sort tout de même, un peu plus
        tranquillement. Le plancher est volontairement bas : l'outil doit tourner au bureau de
        l'analyste, pas dans une salle serveur.
      </>
    ),
    signoff: "Conçu pour le poste de l'analyste, pas pour une grappe de calcul.",
  },
  {
    id: "offline-ai",
    ref: "Q-04",
    kicker: "Intelligence · l'IA sans le nuage",
    question: "Elle vaut quoi, l'IA, sans le cloud derrière ?",
    tldr: "Un modèle local — « Moudir » — qui rédige le brief et répond aux questions.",
    icon: "Brain",
    tag: "GGUF local · hors ligne",
    topic: "ia",
    answer: (
      <>
        L'IA embarquée — on l'appelle <strong className="font-semibold">Moudir</strong> — est un
        modèle de langage local, livré au format GGUF et exécuté sur votre machine. Elle ne
        remplace pas un grand modèle hébergé sur la dépense de quelqu'un d'autre, et elle ne
        prétend pas le faire. Ce qu'elle fait, elle le fait là où vivent les données : elle lit le
        rapport du jour, rédige le briefing du matin en quelques phrases, signale les anomalies
        qu'elle a relevées, et répond à vos questions sur les chiffres déjà calculés. Elle cite ce
        qu'elle avance — le total, le canal, la minute — parce qu'une réponse sans source n'est
        qu'une opinion. La latence dépend du poste, pas d'un quota d'API.
      </>
    ),
    signoff: "Briefing + Q&R en langage naturel, ancrés sur des chiffres déjà calculés.",
  },
  {
    id: "export",
    ref: "Q-05",
    kicker: "Sortie · ce que vous pouvez livrer",
    question: "Je peux exporter dans quoi ?",
    tldr: "PDF, DOCX, PPTX — le rapport fini, prêt à circuler.",
    icon: "FileOutput",
    tag: "PDF · DOCX · PPTX",
    topic: "export",
    answer: (
      <>
        Trois formats, ceux que votre direction lit déjà :{" "}
        <span className="font-mono text-[13px] font-semibold">PDF</span> pour la version à
        archiver et à imprimer,{" "}
        <span className="font-mono text-[13px] font-semibold">DOCX</span> quand le rapport doit
        encore passer entre des mains rédactrices, et{" "}
        <span className="font-mono text-[13px] font-semibold">PPTX</span> pour la réunion de
        9 h 30. Tout est composé localement — graphiques, tableaux, le briefing de Moudir et la
        géo comprise — puis écrit sur votre disque. Aucun convertisseur en ligne, aucun
        téléversement vers un service « cloud » de mise en page. Le fichier que vous envoyez est né
        sur la même machine que les chiffres qu'il contient.
      </>
    ),
    signoff: "Composition locale de bout en bout — aucun service de conversion distant.",
  },
  {
    id: "collab",
    ref: "Q-06",
    kicker: "Réseau · collaborer sans serveur",
    question: "Comment on collabore, s'il n'y a pas de serveur ?",
    tldr: "Sur le réseau local uniquement, poste à poste, jamais par Internet.",
    icon: "Network",
    tag: "LAN · pas d'Internet",
    topic: "réseau",
    answer: (
      <>
        En vase clos, sur votre réseau local. Quand deux postes du même bureau veulent travailler
        le même rapport, ils s'apparient sur le <span className="font-mono text-[13px]">LAN</span>{" "}
        — la salle, l'étage, le site — et échangent directement, sans passer par un service
        extérieur. Il n'y a pas de salon hébergé ailleurs, pas de compte à créer chez un tiers,
        pas de trafic qui sort par la passerelle Internet. La collaboration s'arrête au pare-feu de
        l'entreprise, parce que les données qu'elle déplace sont, elles aussi, censées s'y arrêter.
        Le réseau étendu reste dehors.
      </>
    ),
    signoff: "Appairage poste à poste sur le LAN — le trafic ne franchit pas la passerelle.",
  },
  {
    id: "secreview",
    ref: "Q-07",
    kicker: "Sécurité · pour ceux qui signent l'outil",
    question: "C'est défendable devant notre revue de sécurité ?",
    tldr: "Renderer en bac à sable, CSP, fuses Electron, zéro télémétrie.",
    icon: "Lock",
    tag: "sandbox · CSP · fuses",
    topic: "sécurité",
    answer: (
      <>
        C'est exactement le public qu'on a en tête. Le rendu tourne dans un{" "}
        <strong className="font-semibold">renderer en bac à sable</strong>, derrière une politique
        de sécurité du contenu (<span className="font-mono text-[13px]">CSP</span>) qui échoue en
        bloquant plutôt qu'en laissant passer. Les <em>fuses</em> Electron sont armés pour fermer
        les portes classiques — pas d'inspection à distance en production, pas d'exécution de code
        arbitraire injecté. La mise à jour automatique est <strong>désactivée par défaut</strong>,
        donc l'application ne va rien chercher en ligne sans qu'on le décide. Et puisque la liste
        des connexions sortantes est vide, l'audit réseau est court : il n'y a rien à voir passer.
        Votre équipe peut le vérifier au pare-feu plutôt que de nous croire sur parole.
      </>
    ),
    signoff: "Auditable plutôt que promis : la liste des flux sortants est vide.",
  },
  {
    id: "start",
    ref: "Q-08",
    kicker: "Départ · le premier matin",
    question: "Bon. Je commence comment ?",
    tldr: "Créez un compte local, ouvrez l'app, glissez le CSV de ce matin.",
    icon: "Rocket",
    tag: "/signup · puis le CSV",
    topic: "départ",
    answer: (
      <>
        Trois gestes. Vous créez un compte — local, sur ce poste — depuis{" "}
        <InkLink href="/signup">la page d'inscription</InkLink> ; vous ouvrez le tableau de bord ;
        vous glissez le <span className="font-mono text-[14px]">DailyTransactions.csv</span> du
        matin. L'application profile le fichier, bâtit le rapport, et Moudir vous tend le briefing
        pendant que vous retirez votre manteau. Le premier rapport sort en quelques minutes, sans
        configuration, sans connecteur, sans appel à un commercial. Si vous avez déjà un compte,{" "}
        <InkLink href="/login">la connexion</InkLink> vous y ramène ; l'app, elle, vit déjà dans{" "}
        <InkLink href="/dashboard">le tableau de bord</InkLink>.
      </>
    ),
    signoff: "Premier rapport en quelques minutes — aucune configuration préalable.",
  },
];

/* ── Topic rail data ───────────────────────────────────────────────────────────
 * The skim line above the column. Each chip names a topic and how many of the
 * dossier's questions it files — counted from the dossier so the figures can
 * never drift from the entries.                                            */

const QUESTIONS_TOPICS: ReadonlyArray<{ key: QuestionsTopic; label: string }> = [
  { key: "données", label: "Données" },
  { key: "matériel", label: "Matériel" },
  { key: "ia", label: "IA locale" },
  { key: "export", label: "Export" },
  { key: "réseau", label: "Réseau" },
  { key: "sécurité", label: "Sécurité" },
  { key: "départ", label: "Démarrage" },
];

/* ── The bureau's standing counts ──────────────────────────────────────────────
 * The sidebar's small ledger — what the réponses desk holds this morning. The
 * zero earns the green stamp, like the archive's "octets sortis du poste". */

const QUESTIONS_LEDGER: ReadonlyArray<{ label: string; value: string; vow?: boolean }> = [
  { label: "questions au dossier", value: "8" },
  { label: "délai de réponse", value: "hors ligne" },
  { label: "comptes requis chez un tiers", value: "0", vow: true },
  { label: "octets sortis pendant l'analyse", value: "0", vow: true },
];

/* ── The short column: questions also received ─────────────────────────────────
 * The one-liners that didn't earn a full panel — the desk answers them in a
 * sentence, agate-style, the way a paper clears its in-tray. Each is a true
 * product fact stated curtly. Set in a ruled list, French label then the
 * dry reply.                                                                */

const QUESTIONS_DIGEST: ReadonlyArray<{ q: string; a: ReactNode }> = [
  {
    q: "Et la prévision ?",
    a: (
      <>
        Le moteur prévoit la suite des séries journalières sur le poste — montant, réussite,
        volume par canal — à partir de l'historique déjà classé, sans appel extérieur.
      </>
    ),
  },
  {
    q: "Une carte géographique ?",
    a: (
      <>
        Oui : la plaque géo ventile abonnés et montant par zone, tracée localement à partir des
        libellés du fichier. La cartographie ne télécharge aucune tuile en marche normale.
      </>
    ),
  },
  {
    q: "La voix, vraiment hors ligne ?",
    a: (
      <>
        La dictée et la lecture tournent sur le poste. La qualité dépend des modèles présents ;
        rien n'est envoyé à un service de reconnaissance distant.
      </>
    ),
  },
  {
    q: "Et si l'IA n'a pas le modèle ?",
    a: (
      <>
        Le rapport, les chiffres et l'export marchent sans elle. Tant que le modèle GGUF n'est
        pas en place, Moudir se tait plutôt que d'inventer — le reste de la salle travaille.
      </>
    ),
  },
  {
    q: "Plusieurs fichiers par jour ?",
    a: (
      <>
        Chaque <span className="font-mono text-[12px]">DailyTransactions.csv</span> devient une
        édition datée, conservée à côté des précédentes : on classe, on ne réécrit pas.
      </>
    ),
  },
  {
    q: "La mise à jour, ça téléphone ?",
    a: (
      <>
        Pas par défaut. La mise à jour automatique est désactivée à la livraison ; rien ne va
        chercher en ligne tant que vous ne l'avez pas explicitement permise.
      </>
    ),
  },
];

/* ── What the desk won't pretend ───────────────────────────────────────────────
 * The honesty strip. A newspaper earns trust by printing what it cannot do as
 * plainly as what it can. Three limits, stated without apology — the security
 * reviewer trusts the page that has the nerve to say "non".                 */

const QUESTIONS_LIMITS: ReadonlyArray<{ point: string; line: string }> = [
  {
    point: "L'IA locale n'est pas un grand modèle hébergé.",
    line: "Elle résume, signale et répond sur des chiffres déjà calculés ; elle ne raisonne pas comme un modèle de plusieurs centaines de milliards de paramètres, et ne le prétend pas.",
  },
  {
    point: "La collaboration s'arrête au réseau local.",
    line: "Deux postes du même site s'apparient ; un collègue à l'autre bout du pays passe par vos propres tuyaux, pas par les nôtres. C'est une contrainte assumée, pas un oubli.",
  },
  {
    point: "Sur CPU seul, la grosse IA prend son temps.",
    line: "Le briefing arrive en quelques secondes à quelques dizaines de secondes selon le poste. Un GPU accélère ; son absence ralentit, sans jamais bloquer le rapport.",
  },
];

/* ── Glyph picker ──────────────────────────────────────────────────────────────
 * Maps the entry's glyph key to its lucide icon. Kept as a tiny component so
 * the .map() over the dossier never branches on icon imports inline.       */

function QuestionsGlyphFor({ name, className }: { name: QuestionsGlyph; className?: string }) {
  const cls = className ?? "h-4 w-4";
  switch (name) {
    case "ShieldCheck":
      return <ShieldCheck aria-hidden className={cls} strokeWidth={1.9} />;
    case "FileText":
      return <FileText aria-hidden className={cls} strokeWidth={1.9} />;
    case "Cpu":
      return <Cpu aria-hidden className={cls} strokeWidth={1.9} />;
    case "Brain":
      return <Brain aria-hidden className={cls} strokeWidth={1.9} />;
    case "FileOutput":
      return <FileOutput aria-hidden className={cls} strokeWidth={1.9} />;
    case "Network":
      return <Network aria-hidden className={cls} strokeWidth={1.9} />;
    case "Lock":
      return <Lock aria-hidden className={cls} strokeWidth={1.9} />;
    default:
      return <Rocket aria-hidden className={cls} strokeWidth={1.9} />;
  }
}

/* ── One Q&A item ──────────────────────────────────────────────────────────────
 * A real child component carrying its OWN open/close state — never a hook in a
 * .map() callback. The whole question row is a <button> with aria-expanded /
 * aria-controls and a visible vermilion focus ring; a Plus turns to a Minus as
 * the answer opens (the proofreader's caret). The panel fades + settles
 * (opacity / y only) under AnimatePresence — height is never animated, the way
 * a column is revealed in print, not scrolled. The flagship question prints its
 * reply on a deeper ledger stock so the eye lands on it first.            */

function QuestionsItem({ entry, index }: { entry: QuestionsEntry; index: number }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(Boolean(entry.defaultOpen));
  const panelId = useId();
  const headId = useId();
  /* deterministic micro-tilt for the proof tag — index math, never random */
  const tagTilt = Math.sin(index * 2.7) * 2.4;
  return (
    <div className="border-t border-[#d6ccb6] first:border-t-0">
      <h3 className="m-0">
        <button
          type="button"
          id={headId}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group grid w-full grid-cols-[2.1rem_minmax(0,1fr)_1.6rem] items-start gap-x-3 px-1 py-5 text-left transition-colors hover:bg-[#1c1914]/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#bf3415] sm:grid-cols-[2.4rem_minmax(0,1fr)_1.8rem] sm:gap-x-4"
        >
          {/* the glyph + filing ref, stacked like an index entry */}
          <span className="flex flex-col items-center gap-1.5 pt-1">
            <span
              className={`flex h-7 w-7 items-center justify-center border ${
                entry.flagship
                  ? "border-[#bf3415] bg-[#bf3415]/[0.06] text-[#bf3415]"
                  : "border-[#d6ccb6] text-[#4a4438]"
              }`}
            >
              <QuestionsGlyphFor name={entry.icon} className="h-[15px] w-[15px]" />
            </span>
            <span className="font-mono text-[8.5px] tracking-[0.08em] text-[#857c69]">
              {entry.ref}
            </span>
          </span>

          {/* the question itself — Fraunces, headline voice; standfirst beneath */}
          <span className="min-w-0">
            <span className={`${T.kicker} block text-[10px] text-[#bf3415]`}>{entry.kicker}</span>
            <span className="mt-1.5 block font-serif text-[clamp(1.25rem,2.6vw,1.7rem)] font-bold leading-[1.12] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              {entry.question}
            </span>
            <span
              className={`mt-2 block font-serif text-[14px] italic leading-snug ${
                open ? "text-[#857c69]" : "text-[#4a4438]"
              }`}
            >
              {entry.tldr}
            </span>
            {/* proof tag — only visible while shut, hinting the answer's spine */}
            {!open && (
              <span
                className="mt-2.5 inline-block border border-[#d6ccb6] bg-[#f6f1e7] px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#4a4438]"
                style={{ transform: `rotate(${tagTilt.toFixed(2)}deg)` }}
              >
                {entry.tag}
              </span>
            )}
          </span>

          {/* the proofreader's caret — Plus shut, Minus open */}
          <span
            className={`mt-1 flex h-7 w-7 items-center justify-center border transition-colors ${
              open
                ? "border-[#1c1914] bg-[#1c1914] text-[#f6f1e7]"
                : "border-[#1c1914] text-[#1c1914] group-hover:bg-[#1c1914]/[0.06]"
            }`}
            aria-hidden
          >
            {open ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </span>
        </button>
      </h3>

      {/* the reply — opacity/translate only; layout snaps, as columns do */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={headId}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: EASE_INK }}
            className={`mb-5 ml-[3.1rem] border-l-2 px-4 py-4 sm:ml-[3.4rem] sm:px-5 ${
              entry.flagship
                ? "border-[#bf3415] bg-[#eee6d6]"
                : "border-[#1c1914] bg-[#eee6d6]/70"
            }`}
          >
            <p className={`${T.body} !text-[15.5px] !leading-[1.62]`}>{entry.answer}</p>
            <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#d6ccb6] pt-3">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#4a4438]">
                <CornerDownRight aria-hidden className="h-3 w-3 shrink-0 text-[#bf3415]" />
                {entry.signoff}
              </span>
              {entry.flagship && (
                <Stamp tilt={-6} className="text-[8.5px]">
                  juré au pare-feu
                </Stamp>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── The column of questions ───────────────────────────────────────────────────
 * The dossier, ruled top and bottom like a real Q&A column. The mast above it
 * borrows the broadsheet's furniture; the list is a stack of QuestionsItem,
 * each owning its own state, so opening one never closes another — readers of
 * a printed column can keep three answers open at once.                    */

function QuestionsColumn() {
  return (
    <SettleIn>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-grotesk text-[13px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
          <MessageSquare aria-hidden className="h-4 w-4 text-[#bf3415]" />
          Lettres &amp; réponses
        </h3>
        <span className={T.folio}>réponses du bureau · au mot près</span>
      </div>
      <DoubleRule className="mt-2" />
      <div className="border-b border-[#1c1914]">
        {QUESTIONS_DOSSIER.map((entry, i) => (
          <QuestionsItem key={entry.id} entry={entry} index={i} />
        ))}
      </div>
      <p className="mt-4 font-serif text-[13px] italic leading-snug text-[#857c69]">
        Une question manque à l'appel ? Le bureau y répond le matin même —{" "}
        <a
          href="#subscribe"
          className="underline decoration-[#bf3415]/50 underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
        >
          écrivez au courrier
        </a>
        .
      </p>
    </SettleIn>
  );
}

/* ── The topic rail ────────────────────────────────────────────────────────────
 * A skim line above the column: one chip per topic, with the count of dossier
 * questions filed under it computed from the data so the numbers stay honest.
 * Decorative skim only — the real navigation is the column itself.         */

function QuestionsRail() {
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of QUESTIONS_DOSSIER) out[e.topic] = (out[e.topic] ?? 0) + 1;
    return out;
  }, []);
  return (
    <SettleIn className="mt-8">
      <div className="flex items-center gap-4">
        <span className="font-grotesk text-[10px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
          Au sommaire du courrier
        </span>
        <Rule className="flex-1" />
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {QUESTIONS_TOPICS.map((t) => (
          <li key={t.key}>
            <span className="inline-flex items-baseline gap-1.5 border border-[#d6ccb6] bg-[#f6f1e7] px-2.5 py-1 font-grotesk text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4a4438]">
              {t.label}
              <span className="font-mono text-[9px] tabular-nums text-[#bf3415]">
                {counts[t.key] ?? 0}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SettleIn>
  );
}

/* ── The bureau's call slip ────────────────────────────────────────────────────
 * A small routed slip in the sidebar: the réponses desk's own holdings, a
 * routing line for how a reader question is handled, and the coupon out to
 * /signup. The zero-figures wear the conserve-green vow, the same green the
 * archive uses for "octets sortis du poste".                               */

function QuestionsSlip() {
  return (
    <SettleIn delay={0.1} className="border border-[#1c1914] bg-[#eee6d6] p-5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-grotesk text-[10px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
          <Mailbox aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" />
          Bureau des réponses
        </p>
        <span className="font-mono text-[9px] tabular-nums text-[#857c69]">guichet 13</span>
      </div>
      <DoubleRule className="mt-2.5" />
      <dl className="mt-1">
        {QUESTIONS_LEDGER.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-baseline justify-between gap-3 py-2.5 ${
              i > 0 ? "border-t border-[#d6ccb6]" : ""
            }`}
          >
            <dt className={T.folio}>{row.label}</dt>
            <dd className="flex items-baseline gap-2">
              <span
                className={`font-mono text-[15px] font-semibold tabular-nums ${
                  row.vow ? "text-[#2f6b3f]" : "text-[#1c1914]"
                }`}
              >
                {row.value}
              </span>
              {row.vow && (
                <span className="border border-[#2f6b3f] px-1 py-px font-grotesk text-[7.5px] font-black uppercase tracking-[0.12em] text-[#2f6b3f]">
                  juré
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Rule />
      {/* how a reader's question travels the desk — pure print furniture */}
      <p className={`${T.folio} mt-3`}>trajet d'une question</p>
      <ol className="mt-1.5 space-y-1.5">
        {["reçue au guichet", "vérifiée sur le poste", "répondue, sources à l'appui"].map(
          (step, i) => (
            <li
              key={step}
              className="flex items-baseline gap-2 font-mono text-[10.5px] text-[#4a4438]"
            >
              <span className="text-[#bf3415]">{i + 1}.</span>
              {step}
            </li>
          ),
        )}
      </ol>
    </SettleIn>
  );
}

/* ── The digest: questions also received ───────────────────────────────────────
 * The in-tray cleared in agate: a two-column ruled list of short Q&A, French
 * label then a one-sentence reply. Mirrors the Letters desk's "aussi reçu"
 * digest — the questions too small for a panel but too real to drop.       */

function QuestionsDigest() {
  return (
    <SettleIn className="mt-12 lg:mt-16">
      <div className="flex items-center gap-4">
        <Rule className="flex-1" />
        <p className="flex items-center gap-2 font-grotesk text-[10px] font-black uppercase tracking-[0.3em] text-[#1c1914]">
          <MailQuestion aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" />
          Aussi reçu au courrier
        </p>
        <Rule className="flex-1" />
      </div>
      <ul className="mt-3 grid border-y border-[#d6ccb6] sm:grid-cols-2 sm:divide-x sm:divide-[#d6ccb6]">
        {QUESTIONS_DIGEST.map((item, i) => (
          <li
            key={item.q}
            className={`px-1 py-4 sm:px-5 ${
              i % 2 === 0 ? "sm:first:pl-0" : "sm:pr-0"
            } ${i >= 2 ? "border-t border-[#d6ccb6]" : ""} ${
              i === 1 ? "border-t border-[#d6ccb6] sm:border-t-0" : ""
            }`}
          >
            <p className="font-serif text-[15px] font-bold italic leading-snug text-[#1c1914]">
              {item.q}
            </p>
            <p className={`${T.body} mt-1.5 !text-[14px] !leading-[1.55] text-[#4a4438]`}>
              {item.a}
            </p>
          </li>
        ))}
      </ul>
      <p className={`${T.folio} mt-2.5`}>
        réponses courtes · faits vérifiables · le détail complet dans l'app
      </p>
    </SettleIn>
  );
}

/* ── What the desk won't pretend ───────────────────────────────────────────────
 * The honesty strip, set apart in a bordered box like a standing notice. A
 * page that lists its limits as plainly as its powers is a newspaper, not a
 * brochure — and it is exactly what a security reviewer trusts.            */

function QuestionsLimits() {
  return (
    <SettleIn className="mt-12 border-2 border-[#1c1914] bg-[#f6f1e7] p-6 shadow-[4px_4px_0_#1c1914] sm:p-7 lg:mt-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.24em] text-[#bf3415]">
          <PenLine aria-hidden className="h-3.5 w-3.5" />
          Ce que le bureau ne fera pas semblant de faire
        </p>
        <Stamp color={STAMP_GREEN} tilt={5} className="text-[9px]">
          dit franchement
        </Stamp>
      </div>
      <Rule className="mt-3" />
      <ol className="mt-2">
        {QUESTIONS_LIMITS.map((limit, i) => (
          <li
            key={limit.point}
            className={`flex gap-4 py-3.5 ${i > 0 ? "border-t border-[#d6ccb6]" : ""}`}
          >
            <span
              aria-hidden
              className="mt-0.5 font-serif text-[1.5rem] font-black leading-none text-[#bf3415] [font-variation-settings:'WONK'_1]"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-serif text-[16px] font-bold leading-snug text-[#1c1914]">
                {limit.point}
              </p>
              <p className={`${T.body} mt-1 !text-[14.5px] !leading-[1.55] text-[#4a4438]`}>
                {limit.line}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-serif text-[13px] italic leading-snug text-[#857c69]">
        Trois limites, dites sans détour. Un outil qui annonce ses bords est plus facile à signer
        qu'un outil qui prétend ne pas en avoir.
      </p>
    </SettleIn>
  );
}

/* ── The closing coupon ────────────────────────────────────────────────────────
 * The column ends the way a newspaper ends a service piece: a cut-out coupon
 * that takes the convinced reader straight to /signup. Dashed rule, scissor
 * note, an ink button — the only loud call in a dry column.               */

function QuestionsCoupon() {
  return (
    <SettleIn className="mt-12 lg:mt-16">
      <div className="relative border-2 border-dashed border-[#1c1914] bg-[#f6f1e7] p-6 shadow-[4px_4px_0_#1c1914] sm:p-8">
        <span
          aria-hidden
          className="absolute -top-2.5 left-7 bg-[#f6f1e7] px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#857c69]"
        >
          ✂ à découper
        </span>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <p className={`${T.kicker} text-[#bf3415]`}>Plus de questions ? Une réponse.</p>
            <p className="mt-3 font-serif text-[clamp(1.5rem,3.2vw,2.2rem)] font-black leading-[1.05] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Le seul moyen de vérifier, c'est de l'essayer sur vos chiffres.
            </p>
            <p className={`${T.body} mt-3 max-w-[52ch] !text-[15px]`}>
              Créez un compte local, glissez le CSV de ce matin, lisez le briefing de Moudir. Rien
              à installer côté serveur, rien à demander à un commercial, rien qui quitte le poste.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <InkButton href="/signup" tone="vermilion">
              Créer un compte
              <BadgeCheck aria-hidden className="h-4 w-4" />
            </InkButton>
            <span className="flex items-center gap-2">
              <InkLink href="/dashboard">Ouvrir l'application</InkLink>
              <span className={T.folio}>· déjà installée</span>
            </span>
          </div>
        </div>
      </div>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  QuestionsSection — the assembled rubrique, p.13 (#faq anchor)
 *  Reading order: mast → lede (the column's purpose) → topic rail →
 *  the spread (question column beside the réponses-desk slip) → coupon → folio.
 * ════════════════════════════════════════════════════════════════════════════ */

function QuestionsSection() {
  return (
    <section
      id="faq"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 2200px" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-20 sm:px-8 sm:pt-28 lg:px-12">
        <SectionMast rubrique="Les questions" no="p.13" />

        {/* ── The lede ─────────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-x-14 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className={`${T.kicker} text-[#bf3415]`}>
              Courrier des questions · le bureau répond
            </p>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Questions from
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  the <PenUnderline delay={0.7}>newsroom</PenUnderline> floor.
                </span>,
              ]}
            />
            <Byline
              className="mt-6"
              name="Le bureau des réponses"
              desk="Guichet 13 · courrier des lecteurs"
            />
            <p className={`${T.body} mt-6 max-w-[64ch]`}>
              The questions a telecom analyst and a security reviewer actually send the desk,
              answered in plain serif — no brochure, no hedging. Open one, open three; the column
              keeps them all. Every reply states what the tool does, what it needs, and the one
              thing it never does: send your numbers anywhere.
            </p>
          </div>
          <div className="lg:col-span-4">
            <MarginNote className="ml-auto w-full max-w-[16rem] lg:mt-2">
              On répond comme on imprime : court, daté, vérifiable. Les réponses tiennent au
              pare-feu.
            </MarginNote>
          </div>
        </div>

        {/* the skim rail — topics across the top of the column */}
        <QuestionsRail />

        {/* ── The spread: the question column beside the réponses desk ─────
            The column wants the width; the desk reads like the facing page,
            sticky at lg so the slip rides along as the reader works down. */}
        <div className="mt-12 grid gap-x-14 gap-y-12 lg:mt-14 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <QuestionsColumn />
          </div>
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24">
              <QuestionsSlip />
              <PullQuote className="mt-8" cite="Le secrétaire de rédaction">
                A tool you can audit at the firewall beats a promise you can only read.
              </PullQuote>
            </div>
          </div>
        </div>

        {/* ── The in-tray digest — short questions, short answers ───────── */}
        <QuestionsDigest />

        {/* ── The honesty strip — what the desk won't pretend ───────────── */}
        <QuestionsLimits />

        {/* ── The coupon out ───────────────────────────────────────────── */}
        <QuestionsCoupon />

        {/* ── Cross-references — the column points back into the paper ───── */}
        <SettleIn className="mt-14 lg:mt-16">
          <p className={`${T.folio} flex flex-wrap items-center gap-x-2 gap-y-1`}>
            <span className="font-bold uppercase text-[#1c1914]">Voir aussi</span>
            <span aria-hidden>—</span>
            <a
              href="#capabilities"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              L'index des capacités, p.6
            </a>
            <span aria-hidden>·</span>
            <a
              href="#workflow"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              Les presses, p.5
            </a>
            <span aria-hidden>·</span>
            <a
              href="#subscribe"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              L'abonnement, p.14
            </a>
          </p>
        </SettleIn>

        <FolioLine
          className="mt-8 border-t border-[#d6ccb6] pt-4"
          page="p.13"
          note="Courrier dépouillé ce matin à 06 h 18 · rien n'a quitté le poste"
        />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 16 — SubscribeSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ──────────────────────────────────────────────────────────────────────────────
 *  16 · SUBSCRIBE — the call to action, dressed as a newspaper subscription
 *  ─────────────────────────────────────────────────────────────────────────────
 *  The closing rubrique. Every broadsheet ends with the same small ritual: the
 *  subscription form clipped from the back page, filled in, posted off. Here the
 *  "subscription" is starting Data Navigator — and the gag that does the work is
 *  that there is nothing to post. No card, no cloud account, no data leaving the
 *  building. You simply start the press on your own desk.
 *
 *  Layout, two-column on wide paper, single column below md:
 *    • LEFT  — the editorial pitch: kicker, oversized headline (the value
 *      restated — your morning telecom report, composed on your machine, every
 *      day), a standfirst, the primary InkButton → /signup, and two secondary
 *      InkLinks → /login and /dashboard, with the delivery terms underneath.
 *    • RIGHT — the coupon: a dashed cut-out card the reader could imagine
 *      scissoring out, Scissors riding the perforation, square corners, an
 *      offset-print shadow. It lists what the subscription includes (offline AI
 *      briefings, ink charts, PDF/DOCX/PPTX export, LAN collaboration) with
 *      check marks, the price line, and a reassurance Stamp: "aucune connexion
 *      requise — vos données restent sur la machine".
 *
 *  Motion contract: 100 % transform / opacity, all of it through the preamble's
 *  RiseIn / SettleIn / Stamp primitives, every one of which already collapses to
 *  a static print under prefers-reduced-motion. The coupon's idle perforation
 *  shimmer is the lone looping accent and is gated on useReducedMotion inside a
 *  real child component — no hooks ever run in a render callback. The section is
 *  not a sticky scene, so it keeps contentVisibility for cheap offscreen cost.
 * ───────────────────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · DATA — the offer, set in type
 * ════════════════════════════════════════════════════════════════════════════ */

/** The headline deck — sentence case, broken to hold its shape at every width. */
const SUBSCRIBE_DECK: ReadonlyArray<ReactNode> = [
  <span key="l1">Subscribe to</span>,
  <span key="l2">
    The <SubscribeMark>Daily Edition</SubscribeMark>.
  </span>,
];

type SubscribeBenefit = {
  id: string;
  /** the line as printed on the coupon — English headline, French where it counts */
  label: string;
  /** the small print under each tick, in the newsroom's bilingual house style */
  note: string;
  icon: ReactNode;
};

/**
 * What the subscription delivers — the four things the rest of the paper spent
 * fifteen sections demonstrating, recapped here as coupon line items. Order is
 * the reading order of the product: brief, chart, export, share.
 */
const SUBSCRIBE_BENEFITS: ReadonlyArray<SubscribeBenefit> = [
  {
    id: "briefings",
    label: "Offline AI briefings",
    note: "l'IA de bureau lit le fichier et rédige le matin — réseau débranché",
    icon: <Sparkles aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
  },
  {
    id: "charts",
    label: "Graphiques à l'encre",
    note: "courbes, barres et cartes dessinées comme une planche de presse",
    icon: <PenLine aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
  },
  {
    id: "export",
    label: "Export PDF · DOCX · PPTX",
    note: "le rapport bouclé, prêt à distribuer, en trois formats",
    icon: <FileDown aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
  },
  {
    id: "lan",
    label: "Collaboration LAN",
    note: "la rédaction partage l'édition sur le réseau local, sans passer dehors",
    icon: <ShieldCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
  },
];

type SubscribeTerm = {
  id: string;
  /** column-one term, set in grotesk caps like a rate card */
  term: string;
  /** column-two value, set in mono */
  value: string;
};

/** The delivery terms — a subscriber's rate card, except the price is candour. */
const SUBSCRIBE_TERMS: ReadonlyArray<SubscribeTerm> = [
  { id: "rhythm", term: "Parution", value: "chaque matin · 06 h 00" },
  { id: "carrier", term: "Distribution", value: "votre machine · hors-ligne" },
  { id: "rate", term: "Tarif", value: "0 € — vos données restent vôtres" },
  { id: "cancel", term: "Résiliation", value: "fermez l'app · rien à révoquer" },
];

type SubscribeAction = {
  id: string;
  href: string;
  label: string;
  /** the dry editorial gloss printed under each secondary link */
  gloss: string;
};

/** The two secondary doors — sign in, or open the app on a desk already set up. */
const SUBSCRIBE_SECONDARY: ReadonlyArray<SubscribeAction> = [
  {
    id: "login",
    href: "/login",
    label: "Sign in",
    gloss: "déjà abonné — reprenez l'édition d'hier",
  },
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Open the app",
    gloss: "la presse est chaude — entrez directement",
  },
];

type SubscribeRound = {
  id: string;
  /** the hour the round runs, set in the paper's clock style */
  time: string;
  /** what the press does at that hour — English headline voice */
  title: string;
  /** the French operational note printed under it */
  note: string;
  icon: ReactNode;
};

/**
 * The morning delivery round — the four beats between the file landing and the
 * edition reaching the desk, told as a paperboy's route. It restates the product
 * loop one final time as a subscriber would experience it, hour by hour, instead
 * of as a feature list. Times are deterministic literals, never computed.
 */
const SUBSCRIBE_ROUNDS: ReadonlyArray<SubscribeRound> = [
  {
    id: "drop",
    time: "06 h 00",
    title: "The file lands",
    note: "DailyTransactions.csv arrive sur le bureau — rien n'est envoyé ailleurs",
    icon: <Inbox aria-hidden className="h-4 w-4" strokeWidth={2.1} />,
  },
  {
    id: "set",
    time: "06 h 02",
    title: "The press sets the page",
    note: "DuckDB profile chaque canal ; l'IA de bureau rédige le brief du matin",
    icon: <Sunrise aria-hidden className="h-4 w-4" strokeWidth={2.1} />,
  },
  {
    id: "proof",
    time: "06 h 05",
    title: "Charts inked, proof read",
    note: "courbes et cartes dessinées ; anomalies cerclées au crayon rouge",
    icon: <PenLine aria-hidden className="h-4 w-4" strokeWidth={2.1} />,
  },
  {
    id: "deliver",
    time: "06 h 07",
    title: "Edition on every desk",
    note: "export PDF · DOCX · PPTX, partagé sur le réseau local — jamais dehors",
    icon: <Truck aria-hidden className="h-4 w-4" strokeWidth={2.1} />,
  },
];

type SubscribeNo = {
  id: string;
  /** the thing the reader is NOT signing up for — the anti-coupon line */
  label: string;
  icon: ReactNode;
};

/**
 * The anti-coupon: every SaaS subscription clause this one strikes out. Printed
 * as crossed-off boxes so the reader sees, by absence, what "offline-first"
 * actually buys them. The contrast is the argument — no upload, no seat tax, no
 * telemetry, no lock-in, no renewal you forget to cancel.
 */
const SUBSCRIBE_NOTHINGS: ReadonlyArray<SubscribeNo> = [
  { id: "upload", label: "No upload — the data never leaves the machine", icon: <WifiOff aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} /> },
  { id: "account", label: "No remote account — credentials stay local", icon: <Lock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} /> },
  { id: "telemetry", label: "No telemetry — the page itself phones nobody", icon: <Ban aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} /> },
  { id: "renewal", label: "No renewal trap — close the app, nothing lingers", icon: <CircleDot aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} /> },
];

type SubscribeBackIssue = {
  id: string;
  /** the page reference, like a back-issue citation */
  page: string;
  /** the rubrique title, recapped */
  title: string;
  /** only real on-page anchors become links; the rest stay plain print */
  href?: string;
};

type SubscribeField = {
  id: string;
  /** the form-field caption, set in grotesk caps like a real coupon */
  caption: string;
  /** the value already inked in — pre-filled, because there is nothing to ask */
  filled: string;
};

/**
 * The subscriber-details strip — the fields a back-page coupon would make you
 * write out, here printed already filled. The point is that none of it has to
 * be sent anywhere: your desk is the address, your machine is the carrier, the
 * format is whichever export you reach for. A form with no blanks left.
 */
const SUBSCRIBE_FIELDS: ReadonlyArray<SubscribeField> = [
  { id: "desk", caption: "Bureau", filled: "le vôtre — analyse télécom" },
  { id: "address", caption: "Adresse de livraison", filled: "cette machine, hors-ligne" },
  { id: "format", caption: "Format préféré", filled: "PDF · DOCX · PPTX, au choix" },
  { id: "frequency", caption: "Fréquence", filled: "quotidienne, à l'aube" },
];

/** "Dans ce numéro" — a short index back into the edition, for the undecided. */
const SUBSCRIBE_BACK_ISSUES: ReadonlyArray<SubscribeBackIssue> = [
  { id: "lead", page: "p.4", title: "L'enquête — une anomalie corrigée avant l'heure", href: "#lead" },
  { id: "press", page: "p.6", title: "Les presses — la chaîne de fabrication", href: "#workflow" },
  { id: "classified", page: "p.7", title: "Petites annonces — trente et quelques capacités", href: "#capabilities" },
  { id: "faq", page: "p.15", title: "Questions — ce que la sécurité veut savoir", href: "#faq" },
];

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · INK ACCENTS — the small marks that make it feel printed
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Vermilion circle the editor draws around the paper's name in the headline —
 * the one word the whole page has been building toward. Reuses the pen idiom
 * without colliding with the preamble's PenCircle (kept here so the headline
 * deck can sit in a top-level const and stay prefix-clean).
 */
function SubscribeMark({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        aria-hidden
        viewBox="0 0 200 60"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -inset-x-[6%] -inset-y-[26%] h-[152%] w-[112%]"
      >
        <InkPath
          d="M100 6 C 168 3, 196 16, 193 31 C 190 47, 138 55, 92 54 C 40 53, 6 44, 8 28 C 10 13, 56 6, 116 8"
          stroke={VERMILION}
          strokeWidth={2.4}
          delay={0.55}
          duration={0.8}
        />
      </svg>
    </span>
  );
}

/**
 * The coupon's perforated cut line. A dashed rule with a pair of Scissors riding
 * it, exactly as on a back-page form. The dashes drift sideways with `ed-tape`
 * (the only sanctioned looping utility) so the perforation reads as "cut here";
 * reduced motion holds them still. Decorative throughout, so aria-hidden.
 */
function SubscribePerforation({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="relative h-5 w-full overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden">
        <div
          className={`h-px w-[200%] bg-[repeating-linear-gradient(to_right,#857c69_0_8px,transparent_8px_16px)] ${
            reduce ? "" : "ed-tape"
          }`}
        />
      </div>
      <span className="absolute left-6 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center bg-[#f6f1e7]">
        <Scissors aria-hidden className="h-3.5 w-3.5 -rotate-90 text-[#857c69]" strokeWidth={2} />
      </span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · THE PITCH — left column, the editorial argument
 * ════════════════════════════════════════════════════════════════════════════ */

/** One secondary door: a crafted InkLink with a dry gloss printed beneath it. */
function SubscribeSecondaryAction({ action }: { action: SubscribeAction }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <InkLink href={action.href}>{action.label}</InkLink>
        <ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-[#2b4a8b]" strokeWidth={2.2} />
      </span>
      <span className="font-serif text-[12.5px] italic leading-snug text-[#857c69]">
        {action.gloss}
      </span>
    </li>
  );
}

/** One line of the rate card — term left, value right, hairline between rows. */
function SubscribeTermRow({ row }: { row: SubscribeTerm }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 border-b border-[#d6ccb6]/70 py-1.5 last:border-b-0">
      <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.18em] text-[#4a4438]">
        {row.term}
      </span>
      <span className="text-right font-mono text-[11px] leading-snug text-[#1c1914]">
        {row.value}
      </span>
    </div>
  );
}

/**
 * The left column: kicker, the big headline deck, a standfirst restating the
 * value, the primary call-to-action, the two secondary doors, and the rate card.
 * Every block rises once on scroll through the preamble primitives, so a single
 * useReducedMotion gate (held by the children) governs the whole entrance.
 */
function SubscribePitch() {
  return (
    <div className="flex flex-col">
      <RiseIn amount={0.3}>
        <p className={`${T.kicker} text-[#bf3415]`}>
          Abonnement · the subscription desk · nº 16
        </p>
      </RiseIn>

      <div role="heading" aria-level={2} className="mt-3">
        <DeckReveal
          stagger={0.1}
          className="font-serif text-[clamp(2.3rem,5.4vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          lines={SUBSCRIBE_DECK}
        />
      </div>

      <SettleIn delay={0.12} className="mt-4 max-w-[54ch]">
        <p className={T.body}>
          Your morning telecom report, composed on your own machine, every day. One{" "}
          <span className="font-mono text-[15px] tabular-nums text-[#1c1914]">
            DailyTransactions.csv
          </span>{" "}
          arrives, the press runs — ingest, profile, chart, brief, export — and not a row of it
          leaves the desk. Receive your edition before the building is awake.
        </p>
      </SettleIn>

      <SettleIn delay={0.18} className="mt-3 max-w-[54ch]">
        <p className="font-serif text-[14px] italic leading-relaxed text-[#857c69]">
          « Recevez votre édition » — l'abonnement le plus simple jamais imprimé : pas de carte,
          pas de compte distant, rien à poster. Vous démarrez la presse, c'est tout.
        </p>
      </SettleIn>

      {/* the primary action + a one-line promise of what the button does */}
      <SettleIn delay={0.24} className="mt-7">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <InkButton href="/signup" tone="vermilion" className="h-14 px-7 text-[14px]">
            Get started
            <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </InkButton>
          <span className="flex items-center gap-2 font-grotesk text-[12px] font-semibold uppercase tracking-[0.16em] text-[#4a4438]">
            <CalendarCheck aria-hidden className="h-4 w-4 text-[#2f6b3f]" strokeWidth={2.2} />
            première édition en quelques minutes
          </span>
        </div>
      </SettleIn>

      {/* the two secondary doors */}
      <SettleIn delay={0.3} className="mt-7">
        <p className={`${T.folio} mb-2`}>Déjà des nôtres ?</p>
        <ul className="flex flex-col gap-3 sm:flex-row sm:gap-10">
          {SUBSCRIBE_SECONDARY.map((action) => (
            <SubscribeSecondaryAction key={action.id} action={action} />
          ))}
        </ul>
      </SettleIn>

      {/* the rate card — the terms of delivery, dry and specific */}
      <SettleIn delay={0.36} className="mt-8 max-w-md border-t-2 border-[#1c1914] pt-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-grotesk text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1914]">
            Conditions de distribution
          </span>
          <span className={T.folio}>tarif №&nbsp;16</span>
        </div>
        {SUBSCRIBE_TERMS.map((row) => (
          <SubscribeTermRow key={row.id} row={row} />
        ))}
      </SettleIn>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · THE COUPON — right column, the clip-out form
 * ════════════════════════════════════════════════════════════════════════════ */

/** One benefit line on the coupon: a hand-ticked box, the offer, the small print. */
function SubscribeBenefitRow({ benefit, index }: { benefit: SubscribeBenefit; index: number }) {
  return (
    <SettleIn delay={0.1 + index * 0.07} y={12}>
      <div className="flex items-start gap-3">
        {/* the ticked box — a printed checkbox the subscriber has already filled */}
        <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center border-2 border-[#1c1914] bg-[#f6f1e7]">
          <Check aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[#4a4438]">{benefit.icon}</span>
            <span className="font-grotesk text-[13.5px] font-bold leading-tight text-[#1c1914]">
              {benefit.label}
            </span>
          </div>
          <p className="mt-0.5 font-serif text-[12.5px] leading-snug text-[#4a4438]">
            {benefit.note}
          </p>
        </div>
      </div>
    </SettleIn>
  );
}

/**
 * One pre-filled coupon field: a caption with a written-in value sitting on a
 * dotted writing line, exactly like the address blanks on a paper form — only
 * already completed, because the subscription asks nothing of the reader.
 */
function SubscribeFieldRow({ field }: { field: SubscribeField }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-grotesk text-[9px] font-bold uppercase tracking-[0.18em] text-[#857c69]">
        {field.caption}
      </span>
      <span className="border-b border-dotted border-[#857c69] pb-0.5 font-serif text-[12.5px] italic leading-snug text-[#1c1914]">
        {field.filled}
      </span>
    </div>
  );
}

/**
 * The coupon proper — a dashed cut-out card with square corners and an
 * offset-print shadow. Header reads like a subscription form ("Bon d'abonnement
 * · clip and keep"), then the four ticked benefits, the perforated cut line with
 * Scissors, the price strip, and the reassurance Stamp. The reduce flag is
 * passed in from the section root so this stays a pure presentational child with
 * no hooks of its own — the only loop (the perforation drift) is a CSS utility.
 */
function SubscribeCoupon({ reduce }: { reduce: boolean }) {
  return (
    <SettleIn y={22} delay={0.1} className="relative">
      {/* a faint kicker tag pinned above the coupon, like a clipping instruction */}
      <div className="absolute -top-3 left-6 z-10 rotate-[-1.5deg]">
        <span className="flex items-center gap-1.5 border border-[#1c1914] bg-[#bf3415] px-2.5 py-1 font-grotesk text-[9.5px] font-black uppercase tracking-[0.18em] text-[#f6f1e7]">
          <Scissors aria-hidden className="h-3 w-3" strokeWidth={2.4} />
          à détacher
        </span>
      </div>

      <div className="border-2 border-dashed border-[#1c1914] bg-[#eee6d6] p-5 shadow-[7px_7px_0_#1c1914] sm:p-7">
        {/* coupon head — the form's title block */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`${T.kicker} text-[#bf3415]`}>Bon d'abonnement</p>
            <h3 className="mt-1 flex items-center gap-2 font-serif text-[1.6rem] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              <Newspaper aria-hidden className="h-5 w-5 -translate-y-px" strokeWidth={2.2} />
              {EDITION.masthead}
            </h3>
            <p className="mt-1.5 font-grotesk text-[11px] uppercase tracking-[0.14em] text-[#4a4438]">
              clip &amp; keep — un exemplaire par bureau
            </p>
          </div>
          <span className="hidden flex-none font-mono text-[10px] uppercase tracking-[0.12em] text-[#857c69] sm:block">
            {EDITION.issue}
          </span>
        </div>

        <DoubleRule className="mt-4" />

        {/* "votre édition comprend" — the ticked offer */}
        <p className="mt-4 font-grotesk text-[10px] font-bold uppercase tracking-[0.22em] text-[#857c69]">
          Votre édition comprend
        </p>
        <div className="mt-3 flex flex-col gap-3.5">
          {SUBSCRIBE_BENEFITS.map((benefit, i) => (
            <SubscribeBenefitRow key={benefit.id} benefit={benefit} index={i} />
          ))}
        </div>

        {/* the subscriber-details strip — a form already filled in for you */}
        <div className="mt-5 border-t border-[#d6ccb6] pt-4">
          <p className="font-grotesk text-[10px] font-bold uppercase tracking-[0.22em] text-[#857c69]">
            Coordonnées de l'abonné
          </p>
          <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3.5 sm:grid-cols-2">
            {SUBSCRIBE_FIELDS.map((field) => (
              <SubscribeFieldRow key={field.id} field={field} />
            ))}
          </div>
        </div>

        {/* the perforation — the line you would actually cut along */}
        <div className="my-5">
          <SubscribePerforation reduce={reduce} />
        </div>

        {/* the price strip — the joke that lands the whole page */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className={T.folio}>Prix au numéro</p>
            <p className="mt-0.5 font-serif text-[2.1rem] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              0 €
            </p>
          </div>
          <p className="max-w-[18ch] text-right font-serif text-[12px] italic leading-snug text-[#4a4438]">
            le seul coût est de garder vos données pour vous.
          </p>
        </div>

        {/* the action again, native to the coupon */}
        <div className="mt-5">
          <InkButton href="/signup" className="w-full">
            <MailCheck aria-hidden className="h-4 w-4" strokeWidth={2.2} />
            Commencer l'abonnement
          </InkButton>
        </div>

        {/* the reassurance — slammed on like a postal cachet */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#d6ccb6] pt-4">
          <Stamp color={STAMP_GREEN} tilt={-5} className="text-[9.5px]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="h-3 w-3" strokeWidth={2.4} />
              hors-ligne · vérifié
            </span>
          </Stamp>
          <p className="max-w-[26ch] text-right font-mono text-[10px] leading-snug text-[#4a4438]">
            Aucune connexion requise · vos données restent sur la machine.
          </p>
        </div>
      </div>

      {/* a printer's note hanging under the coupon, mirroring the page's voice */}
      <p className="mt-3 px-1 font-serif text-[11.5px] italic leading-snug text-[#857c69]">
        Imprimé sur place. Cette page n'a contacté aucun serveur pour vous le proposer.
      </p>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · THE DELIVERY ROUND — the morning told as a paperboy's route
 * ════════════════════════════════════════════════════════════════════════════ */

/** One stop on the round: the hour, the deed, the operational note beneath. */
function SubscribeRoundStop({ round, index }: { round: SubscribeRound; index: number }) {
  const last = index === SUBSCRIBE_ROUNDS.length - 1;
  return (
    <SettleIn delay={index * 0.08} y={14} className="relative flex-1">
      {/* the route line connecting stops — drawn behind the marker, wide paper */}
      {!last && (
        <span
          aria-hidden
          className="absolute left-[19px] top-9 hidden h-px w-full bg-[repeating-linear-gradient(to_right,#d6ccb6_0_5px,transparent_5px_10px)] md:block"
        />
      )}
      <div className="flex items-center gap-3 md:flex-col md:items-start">
        <span className="flex h-9 w-9 flex-none items-center justify-center border-2 border-[#1c1914] bg-[#f6f1e7] text-[#1c1914] shadow-[2px_2px_0_#1c1914]">
          {round.icon}
        </span>
        <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-[#bf3415] md:mt-2.5">
          {round.time}
        </span>
      </div>
      <h4 className="mt-2 font-serif text-[15px] font-bold leading-tight text-[#1c1914]">
        {round.title}
      </h4>
      <p className="mt-1 max-w-[30ch] font-grotesk text-[11.5px] leading-snug text-[#4a4438]">
        {round.note}
      </p>
    </SettleIn>
  );
}

/**
 * The delivery round, laid out as four stops on a route. Stacks to a vertical
 * itinerary on narrow paper and opens to a horizontal timeline at md. A quiet
 * restatement of the whole product loop, framed as the subscriber's morning.
 */
function SubscribeRound() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1914]">
          <Route aria-hidden className="h-4 w-4 text-[#bf3415]" strokeWidth={2.2} />
          La tournée du matin
        </p>
        <span className={`${T.folio} hidden sm:block`}>du fichier au bureau · sept minutes</span>
      </div>
      <Rule className="mt-2" />
      <div className="mt-6 flex flex-col gap-7 md:flex-row md:gap-5">
        {SUBSCRIBE_ROUNDS.map((round, i) => (
          <SubscribeRoundStop key={round.id} round={round} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · THE ANTI-COUPON & BACK ISSUES — argument by absence
 * ════════════════════════════════════════════════════════════════════════════ */

/** One struck-out clause: a crossed box and the SaaS term it refuses. */
function SubscribeNoRow({ item, index }: { item: SubscribeNo; index: number }) {
  return (
    <SettleIn delay={index * 0.06} y={10}>
      <div className="flex items-center gap-3">
        {/* the crossed box — the form field deliberately left blank */}
        <span
          aria-hidden
          className="relative flex h-5 w-5 flex-none items-center justify-center border-2 border-[#857c69] bg-[#f6f1e7]"
        >
          <span className="absolute h-[2px] w-[26px] rotate-45 bg-[#bf3415]" />
        </span>
        <span className="text-[#857c69]">{item.icon}</span>
        <span className="font-grotesk text-[12.5px] leading-snug text-[#4a4438]">{item.label}</span>
      </div>
    </SettleIn>
  );
}

/** The anti-coupon block — what the reader is pointedly NOT signing up for. */
function SubscribeAntiCoupon() {
  return (
    <div className="border-2 border-[#857c69]/60 bg-[#f6f1e7]/60 p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1914]">
          <Ban aria-hidden className="h-4 w-4 text-[#bf3415]" strokeWidth={2.2} />
          Ce à quoi vous n'abonnez pas
        </p>
        <span className={`${T.folio} hidden sm:block`}>les cases qu'on a barrées</span>
      </div>
      <Rule className="mt-2.5" />
      <div className="mt-4 flex flex-col gap-3.5">
        {SUBSCRIBE_NOTHINGS.map((item, i) => (
          <SubscribeNoRow key={item.id} item={item} index={i} />
        ))}
      </div>
      <p className="mt-5 border-t border-[#d6ccb6] pt-3 font-serif text-[12px] italic leading-snug text-[#857c69]">
        Quatre clauses standard, toutes biffées. Ce qui reste, c'est un journal qui s'imprime chez
        vous — et c'est tout le contrat.
      </p>
    </div>
  );
}

/** One back-issue line; rows with real anchors become editorial links. */
function SubscribeBackIssueRow({ issue }: { issue: SubscribeBackIssue }) {
  const body = (
    <span className="group flex items-baseline gap-3 py-2">
      <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-[#bf3415]">
        {issue.page}
      </span>
      <span className="flex flex-1 items-baseline gap-1.5 font-serif text-[13.5px] leading-snug text-[#1c1914]">
        {issue.title}
        {issue.href && (
          <ArrowUpRight
            aria-hidden
            className="h-3 w-3 flex-none translate-y-px text-[#2b4a8b] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.2}
          />
        )}
      </span>
    </span>
  );
  return issue.href ? (
    <a
      href={issue.href}
      className="block border-b border-[#d6ccb6]/70 last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
    >
      {body}
    </a>
  ) : (
    <div className="border-b border-[#d6ccb6]/70 last:border-b-0">{body}</div>
  );
}

/** "Dans ce numéro" — a compact index back into the paper for the undecided. */
function SubscribeBackIssues() {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-bold uppercase tracking-[0.2em] text-[#1c1914]">
          <Bookmark aria-hidden className="h-4 w-4 text-[#bf3415]" strokeWidth={2.2} />
          Dans ce numéro
        </p>
        <span className={`${T.folio} hidden sm:block`}>relire avant de signer</span>
      </div>
      <Rule className="mt-2.5" />
      <div className="mt-2">
        {SUBSCRIBE_BACK_ISSUES.map((issue) => (
          <SubscribeBackIssueRow key={issue.id} issue={issue} />
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  SUBSCRIBE · SECTION ROOT
 *  Not a sticky scene ⇒ keep contentVisibility for cheap offscreen cost. The one
 *  useReducedMotion gate is read here and threaded down to the coupon so no hook
 *  runs inside a render callback; every other entrance is a preamble primitive
 *  that self-gates. This is the page's last word before the folio.
 * ════════════════════════════════════════════════════════════════════════════ */

function SubscribeSection() {
  const reduce = useReducedMotion() ?? false;
  return (
    <section
      id="subscribe"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 800px" }}
    >
      {/* a faintly warmer block so the finale lifts off the running paper */}
      <div className="relative bg-[#eee6d6]">
        <DoubleRule />

        <div className="mx-auto w-full max-w-[1680px] px-4 py-16 sm:px-6 sm:py-20 lg:px-10 lg:py-24">
          <SectionMast rubrique="Abonnement" no="№ 16" />

          {/* the dateline strip — this edition's vital statistics, restated */}
          <SettleIn className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
            <span className={T.folio}>{EDITION.city}</span>
            <span aria-hidden className="hidden h-3 w-px bg-[#d6ccb6] sm:block" />
            <span className={T.folio}>{EDITION.volume} · {EDITION.issue}</span>
            <span aria-hidden className="hidden h-3 w-px bg-[#d6ccb6] sm:block" />
            <span className={T.folio}>{EDITION.dateline}</span>
          </SettleIn>

          {/* the two columns: pitch on the left, coupon on the right */}
          <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-12 lg:mt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <SubscribePitch />
            <SubscribeCoupon reduce={reduce} />
          </div>

          {/* the morning delivery round — the product loop as the subscriber lives it */}
          <div className="mt-16 border-t-2 border-[#1c1914] pt-8 lg:mt-20">
            <SubscribeRound />
          </div>

          {/* anti-coupon + back issues — argument by absence, then a way back in */}
          <div className="mt-12 grid grid-cols-1 gap-x-14 gap-y-10 lg:mt-14 lg:grid-cols-[1fr_1fr] lg:items-start">
            <SubscribeAntiCoupon />
            <SubscribeBackIssues />
          </div>

          {/* the closing pull quote — the editor's last marginal aside */}
          <SettleIn delay={0.1} className="mx-auto mt-16 max-w-3xl lg:mt-20">
            <PullQuote cite="La rédaction · Data Navigator">
              We built a newspaper that prints itself on your desk and never phones home. The only
              thing left to do is start the press.
            </PullQuote>
          </SettleIn>

          <FolioLine
            page="p.16 — abonnement"
            note="The Daily Edition · délivrée hors-ligne, chaque matin"
            className="mt-14"
          />
        </div>

        <DoubleRule />
      </div>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECTION 17 — FolioSection
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════════════════════
 *  §SECTION 17 — FOLIO · the footer · the last impression off the press
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The folio is where a newspaper signs its work: the nameplate repeated one
 *  last time, the table of contents reduced to a clean column index, the
 *  colophon naming where and how the sheet was printed, and the small print a
 *  security reviewer reads twice. Nothing here sells; everything here certifies.
 *
 *  Editorial logic
 *  ───────────────
 *  • The page opened on a masthead; it closes on a smaller echo of it — the
 *    same DN monogram, the same wordmark, set quiet. A reader who scrolled the
 *    whole edition should feel the paper close, not a CTA reopen.
 *  • The link columns are the honest table of contents, grouped the way a
 *    masthead groups its sections: "Le journal" (the reading), "Rubriques"
 *    (the services) and "L'application" (the desk itself). Every in-page anchor
 *    matches an id that exists on this page; every route is a real screen.
 *  • The colophon is the soul of the product set in type: composed offline,
 *    printed on the reader's own machine, no connection required. The three
 *    offline Stamps slam it shut — the press's certification mark.
 *  • The back-to-top control is a printer's reset: it returns the reader to the
 *    nameplate (#top) the way you'd re-rack a finished edition.
 *  • Motion is deliberately spare. The furniture (SettleIn / RiseIn) already
 *    gates its reveals behind prefers-reduced-motion; nothing here loops.
 *
 *  Structure (square corners, ink rules, warm paper throughout):
 *    FolioSection
 *    ├─ FolioColophonBand   composed-offline line + the three offline stamps
 *    ├─ FolioMainGrid
 *    │   ├─ FolioNameplate   the closing echo of the masthead + folio line
 *    │   └─ FolioIndex       three lettered link columns (InkLink)
 *    ├─ FolioPressMarks      registration ticks · file in / report out
 *    └─ FolioBaseline        legal + credit microcopy · back-to-top control
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §F1 — DATA · the index columns, colophon stamps, press marks, small print
 *  Anchors mirror the page's real section ids (#masthead #lead #workflow
 *  #capabilities #faq #subscribe #top); routes are the three real screens.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One destination in a folio column. anchors keep the `#`, routes start `/`. */
type FolioEntry = {
  readonly href: string;
  /** the link label — French rubrique name, newsroom voice */
  readonly label: string;
  /** the page folio this destination lives at, like a real contents list */
  readonly page: string;
};

/** One lettered column of the closing index, in the order a masthead lists. */
type FolioColumn = {
  /** the cahier letter that titles the column, set in vermilion mono */
  readonly cahier: string;
  /** the column heading — what kind of destinations these are */
  readonly title: string;
  /** a one-line standfirst under the heading, English editorial voice */
  readonly note: string;
  readonly entries: ReadonlyArray<FolioEntry>;
};

/**
 * The three columns of the closing table of contents. Cahier A is the reading
 * (the front page and the long pieces), B the services (questions and the
 * kiosk), C the desk itself (the three application screens). Page folios match
 * the edition's real section order so the foot reads like an honest index.
 */
const FOLIO_COLUMNS: ReadonlyArray<FolioColumn> = [
  {
    cahier: "A",
    title: "Le journal",
    note: "The edition, read front to back.",
    entries: [
      { href: "#masthead", label: "La une", page: "p. 02" },
      { href: "#lead", label: "L'enquête du jour", page: "p. 04" },
      { href: "#workflow", label: "La chaîne de fabrication", page: "p. 06" },
      { href: "#capabilities", label: "Les petites annonces", page: "p. 07" },
    ],
  },
  {
    cahier: "B",
    title: "Rubriques",
    note: "Questions answered, the kiosk open.",
    entries: [
      { href: "#faq", label: "Questions au rédacteur", page: "p. 15" },
      { href: "#subscribe", label: "Le kiosque", page: "p. 16" },
    ],
  },
  {
    cahier: "C",
    title: "L'application",
    note: "Straight to the desk — three doors in.",
    entries: [
      { href: "/signup", label: "S'abonner", page: "/signup" },
      { href: "/login", label: "Se connecter", page: "/login" },
      { href: "/dashboard", label: "Ouvrir l'application", page: "/dashboard" },
    ],
  },
] as const;

/** The colophon's certification stamps — what the press guarantees, in green. */
const FOLIO_STAMPS = [
  { Icon: WifiOff, text: "Composé hors-ligne" },
  { Icon: Printer, text: "Imprimé sur votre machine" },
  { Icon: Lock, text: "Aucune connexion requise" },
] as const;

type FolioStamp = (typeof FOLIO_STAMPS)[number];

/**
 * Press marks — the engineer's lines a typesetter leaves in the gutter. One
 * names the single input, the other the single output; the product is exactly
 * that narrow, and the footer says so plainly.
 */
const FOLIO_PRESS_MARKS = [
  { Icon: FileSpreadsheet, kind: "Entrée", value: "DailyTransactions.csv" },
  { Icon: ScrollText, kind: "Sortie", value: "Le rapport du matin" },
] as const;

type FolioPressMark = (typeof FOLIO_PRESS_MARKS)[number];

/**
 * The small print at the foot — the three lines the security team that signs
 * off on this tool will actually read. Bilingual newsroom rule holds: English
 * editorial voice, French data labels in the colophon above.
 */
const FOLIO_NOTES = [
  {
    Icon: HardDrive,
    text: "Every column stays on disk. Nothing is uploaded, telemetered or quietly “anonymised” on the way out.",
  },
  {
    Icon: ShieldCheck,
    text: "One desk licence, no account server to phone home to. The press answers to the machine it runs on.",
  },
  {
    Icon: Newspaper,
    text: "The edition is regenerated each morning from that day's file — yesterday's report is archived, never overwritten.",
  },
] as const;

type FolioNote = (typeof FOLIO_NOTES)[number];

/**
 * The masthead ledger — the desks a real paper prints in its foot, repurposed
 * as a plain-language map of where the work happens inside the app. Each desk
 * names a capability and the part of the report it owns; the "tenue" line is
 * the dry status note a managing editor leaves. All on-machine, no bylines to
 * a server. Anchors point at the rubriques that cover each desk in full.
 */
const FOLIO_DESKS = [
  {
    Icon: Database,
    desk: "Rédaction des données",
    held: "Moteur DuckDB — colonnes, jointures, agrégats",
    tenue: "En poste · sur votre disque",
    href: "#capabilities",
  },
  {
    Icon: PenTool,
    desk: "Bureau d'enquête",
    held: "Anomalies du jour, relevées ligne à ligne",
    tenue: "En poste · l'IA embarquée",
    href: "#lead",
  },
  {
    Icon: MapPin,
    desk: "Cartographie",
    held: "Plaques géographiques, prévisions régionales",
    tenue: "En poste · hors-ligne",
    href: "#capabilities",
  },
  {
    Icon: Mail,
    desk: "Distribution",
    held: "Exports PDF · DOCX · PPTX, partage en réseau local",
    tenue: "En poste · LAN seulement",
    href: "#workflow",
  },
] as const;

type FolioDesk = (typeof FOLIO_DESKS)[number];

/**
 * The edition ledger figures — the masthead numbers a paper carries in its
 * foot. Deterministic literals lifted from the shared EDITION constant where
 * possible; the rest are the edition's honest accounting. No Date, no random.
 */
const FOLIO_LEDGER = [
  { value: EDITION.rows, label: "lignes traitées" },
  { value: EDITION.successRate, label: "taux de réussite" },
  { value: "17", label: "rubriques à l'édition" },
  { value: "0", label: "octet quittant la machine" },
] as const;

type FolioLedgerStat = (typeof FOLIO_LEDGER)[number];

/** French aria strings, so the footer speaks one consistent voice. */
const FOLIO_A11Y = {
  region: "Pied de page — colophon et sommaire",
  nameplate: "Data Navigator — retour en tête de l'édition",
  index: "Sommaire en pied de page",
  backToTop: "Revenir en tête de l'édition",
} as const;

/**
 * The credit line. Deterministic — the edition's year is a literal, never a
 * `new Date()` (contract rule 13). It reads as a copyright notice but says the
 * true thing: the rights never leave the desk.
 */
const FOLIO_CREDIT =
  "© 2026 Data Navigator — composé et imprimé localement. Vos données restent vôtres.";

/* ────────────────────────────────────────────────────────────────────────────
 *  §F2 — ATOMS · monogram, hairline dot, certification stamp, index link
 * ──────────────────────────────────────────────────────────────────────────── */

/** Hairline interpunct between metadata fragments, matched to the spine's. */
function FolioDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[3px] w-[3px] rounded-full bg-[#857c69] ${className ?? ""}`}
    />
  );
}

/**
 * The closing monogram — the same "DN" plate the masthead opened with, scaled
 * down for the foot, with the printer's vermilion registration mark pinned to
 * its corner. Square box, 2 px ink border, wonky serif: identity, set quiet.
 */
function FolioMonogram() {
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center border-2 border-[#1c1914] font-serif text-[18px] font-black tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
      DN
      <span aria-hidden className="absolute -right-[5px] -top-[5px] h-2 w-2 bg-[#bf3415]" />
    </span>
  );
}

/**
 * One certification stamp on the colophon band — a hairline-boxed icon and a
 * short French clause, set in the press's green so it reads as a guarantee
 * rather than the editor's vermilion correction. Square corners, of course.
 */
function FolioCertStamp({ stamp }: { stamp: FolioStamp }) {
  return (
    <span className="inline-flex items-center gap-2 border-[1.5px] border-[#2f6b3f] px-3 py-1.5 text-[#2f6b3f]">
      <stamp.Icon aria-hidden className="h-3.5 w-3.5" />
      <span className="font-grotesk text-[11px] font-bold uppercase tracking-[0.16em]">
        {stamp.text}
      </span>
    </span>
  );
}

/**
 * One row in an index column. The InkLink carries the press-blue underline; the
 * page folio hangs at the right edge in faded mono, the way a contents list
 * sets its page numbers. A hairline rule closes each row.
 */
function FolioIndexRow({ entry }: { entry: FolioEntry }) {
  return (
    <li>
      <span className="flex items-baseline justify-between gap-3 py-2">
        <InkLink href={entry.href}>{entry.label}</InkLink>
        <span aria-hidden className={`shrink-0 ${T.folio}`}>
          {entry.page}
        </span>
      </span>
      <Rule />
    </li>
  );
}

/**
 * One index column — a lettered cahier heading over its rows. Real component
 * (not a `.map` body that calls hooks) so SettleIn can stagger each column in.
 */
function FolioIndexColumn({ column, order }: { column: FolioColumn; order: number }) {
  return (
    <SettleIn delay={0.05 + order * 0.07} className="flex min-w-0 flex-col">
      <div className="flex items-baseline gap-2.5">
        <span aria-hidden className="font-mono text-[12px] text-[#bf3415]">
          {column.cahier}.
        </span>
        <h3 className="font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
          {column.title}
        </h3>
      </div>
      <p className="mt-1.5 pl-[22px] font-serif text-[13px] italic leading-snug text-[#857c69]">
        {column.note}
      </p>
      <ul className="mt-3 flex flex-col">
        {column.entries.map((entry) => (
          <FolioIndexRow key={entry.href} entry={entry} />
        ))}
      </ul>
    </SettleIn>
  );
}

/** One press mark — boxed icon, French kind label, the mono value beside it. */
function FolioPressMarkRow({ mark }: { mark: FolioPressMark }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438]"
      >
        <mark.Icon className="h-4 w-4" />
      </span>
      <span className="flex flex-col">
        <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.22em] text-[#857c69]">
          {mark.kind}
        </span>
        <span className={`text-[13px] text-[#1c1914] ${T.num}`}>{mark.value}</span>
      </span>
    </span>
  );
}

/** One line of foot small print — hairline-boxed icon + a dry sentence. */
function FolioNoteRow({ note }: { note: FolioNote }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438]"
      >
        <note.Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-grotesk text-[12.5px] leading-snug text-[#4a4438]">{note.text}</span>
    </li>
  );
}

/**
 * Registration ticks — the alignment marks a pressman prints in the trim so
 * the plates line up. Pure decorative furniture: a static SVG ruler, every
 * fourth tick heavier, the centre cross in vermilion. Deterministic geometry
 * from index math (contract rule 13), aria-hidden, never tabbable.
 */
function FolioRegistrationMarks() {
  return (
    <svg aria-hidden viewBox="0 0 220 14" className="h-3.5 w-full max-w-[220px] text-[#857c69]">
      <title>Marques de repérage</title>
      {Array.from({ length: 23 }, (_, i) => (
        <line
          key={`reg-${i * 10}`}
          x1={i * 10 + 2}
          y1={i % 4 === 0 ? 1 : 5}
          x2={i * 10 + 2}
          y2={13}
          stroke="currentColor"
          strokeWidth={i % 4 === 0 ? 1.3 : 0.7}
        />
      ))}
      <circle cx="110" cy="7" r="4.5" fill="none" stroke="#bf3415" strokeWidth="1.4" />
      <line x1="110" y1="0.5" x2="110" y2="13.5" stroke="#bf3415" strokeWidth="1.4" />
      <line x1="103" y1="7" x2="117" y2="7" stroke="#bf3415" strokeWidth="1.4" />
    </svg>
  );
}

/** One edition-ledger figure — a big mono number over a French label. */
function FolioLedgerCell({ stat }: { stat: FolioLedgerStat }) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-[#1c1914] pl-3.5">
      <span className={`text-[clamp(1.3rem,3vw,1.85rem)] leading-none text-[#1c1914] ${T.num}`}>
        {stat.value}
      </span>
      <span className="font-grotesk text-[10px] font-semibold uppercase tracking-[0.16em] text-[#857c69]">
        {stat.label}
      </span>
    </div>
  );
}

/**
 * One desk row in the masthead ledger — a hairline-boxed icon, the desk name
 * in grotesk caps, what it holds in serif, and the managing editor's terse
 * "tenue" status in mono. The whole row links to the rubrique that covers the
 * desk in full; the arrow sets itself only on hover/focus, quiet like a proof.
 */
function FolioDeskRow({ desk }: { desk: FolioDesk }) {
  return (
    <li>
      <a
        href={desk.href}
        className="group flex items-start gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
      >
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438] transition-colors group-hover:border-[#bf3415] group-hover:text-[#bf3415]"
        >
          <desk.Icon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
              {desk.desk}
            </span>
            <ArrowUpRight
              aria-hidden
              className="h-4 w-4 shrink-0 -translate-x-1 translate-y-1 text-[#bf3415] opacity-0 transition-transform duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
            />
          </span>
          <span className="font-serif text-[14px] leading-snug text-[#4a4438]">{desk.held}</span>
          <span className={`${T.folio} text-[#2f6b3f]`}>{desk.tenue}</span>
        </span>
      </a>
      <Rule />
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §F3 — BANDS · colophon, nameplate echo, index grid, press marks, baseline
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The colophon band — the soul of the product set in Fraunces. One long serif
 * sentence states where and how the sheet was printed; the three offline
 * stamps below it slam the guarantee shut. This is the line the whole page has
 * been arguing toward: the press runs on the reader's machine, full stop.
 */
function FolioColophonBand() {
  return (
    <SettleIn className="flex flex-col gap-5">
      <p className="max-w-[58ch] font-serif text-[clamp(1.15rem,2.4vw,1.5rem)] font-medium leading-[1.4] tracking-[-0.005em] text-[#1c1914] [font-variation-settings:'SOFT'_60,'WONK'_1]">
        Composé hors-ligne · imprimé sur votre machine · aucune connexion requise.{" "}
        <span className="text-[#857c69]">
          Le journal se fabrique là où vous lisez — pas dans le cloud de quelqu'un d'autre.
        </span>
      </p>
      <div className="flex flex-wrap gap-2.5">
        {FOLIO_STAMPS.map((stamp) => (
          <FolioCertStamp key={stamp.text} stamp={stamp} />
        ))}
      </div>
    </SettleIn>
  );
}

/**
 * The masthead ledger band — the desks that staff the edition, set as a real
 * paper sets its masthead foot: a heading, then four desk rows, each a link to
 * the rubrique that covers it. It makes the abstract footer concrete — the
 * reader sees the actual workshop behind the report, all of it on-machine.
 */
function FolioDeskLedger() {
  return (
    <SettleIn className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className={T.kicker}>L'ours — les desks de l'édition</h3>
        <span className={T.folio}>Tous en poste · sur votre machine</span>
      </div>
      <ul className="flex flex-col">
        {FOLIO_DESKS.map((desk) => (
          <FolioDeskRow key={desk.desk} desk={desk} />
        ))}
      </ul>
    </SettleIn>
  );
}

/**
 * The edition-ledger band — the masthead figures a paper carries in its foot,
 * with the registration ticks running beneath like the trim of a printed
 * sheet. The last figure ("0 octet quittant la machine") is the whole product
 * argument, set as plainly as a circulation number.
 */
function FolioLedgerBand() {
  return (
    <SettleIn className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4">
        {FOLIO_LEDGER.map((stat) => (
          <FolioLedgerCell key={stat.label} stat={stat} />
        ))}
      </div>
      <FolioRegistrationMarks />
    </SettleIn>
  );
}

/**
 * The nameplate echo — the masthead, returned at footer scale. The whole
 * cluster is one link back to #top; the folio line under it carries the
 * edition's volume, issue and dateline, the way a paper signs every sheet.
 * The motto sits beneath in italics, quiet.
 */
function FolioNameplate() {
  return (
    <SettleIn className="flex flex-col gap-5">
      <a
        href="#top"
        aria-label={FOLIO_A11Y.nameplate}
        className="group inline-flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <FolioMonogram />
        <span className="flex flex-col">
          <span className="font-serif text-[20px] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            {EDITION.paper}
          </span>
          <span className="mt-1 font-grotesk text-[12px] font-semibold uppercase tracking-[0.2em] text-[#4a4438]">
            {EDITION.masthead}
          </span>
        </span>
      </a>

      <div className="flex flex-col gap-2.5">
        <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 ${T.folio}`}>
          <span>{EDITION.volume}</span>
          <FolioDot />
          <span className="text-[#bf3415]">{EDITION.issue}</span>
          <FolioDot />
          <span>{EDITION.dateline}</span>
        </div>
        <p className="max-w-[34ch] font-serif text-[13.5px] italic leading-snug text-[#857c69]">
          {EDITION.motto}
        </p>
        <p className={`${T.folio} text-[#bf3415]`}>{EDITION.city}</p>
      </div>
    </SettleIn>
  );
}

/**
 * The closing index grid — nameplate echo on the left, the three lettered
 * link columns on the right. Stacks to a single column at 360, splits the
 * three columns at 768, and lets the nameplate take its own track at 1280+.
 */
function FolioMainGrid() {
  return (
    <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      <FolioNameplate />
      <nav
        aria-label={FOLIO_A11Y.index}
        className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-3"
      >
        {FOLIO_COLUMNS.map((column, i) => (
          <FolioIndexColumn key={column.title} column={column} order={i} />
        ))}
      </nav>
    </div>
  );
}

/**
 * Press-marks band — the two engineer's lines (one input, one output) on the
 * left, the security small print on the right. The product's whole shape in
 * one strip: a single CSV in, a single morning report out, nothing leaking.
 */
function FolioPressMarks() {
  return (
    <SettleIn className="grid gap-x-10 gap-y-9 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.5fr)]">
      <div className="flex flex-col gap-5">
        <h3 className={T.kicker}>L'atelier — une entrée, une sortie</h3>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-7">
          {FOLIO_PRESS_MARKS.map((mark, i) => (
            <span key={mark.kind} className="flex items-center gap-4 sm:gap-7">
              <FolioPressMarkRow mark={mark} />
              {i === 0 && (
                <ArrowUpRight
                  aria-hidden
                  className="hidden h-5 w-5 rotate-45 text-[#bf3415] sm:block"
                />
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className={T.kicker}>Pour la rédaction sécurité</h3>
        <ul className="flex flex-col gap-3">
          {FOLIO_NOTES.map((note) => (
            <FolioNoteRow key={note.text} note={note} />
          ))}
        </ul>
      </div>
    </SettleIn>
  );
}

/**
 * The back-to-top control — a real button-shaped link that re-racks the
 * finished edition at the nameplate. Same mechanical press grammar as
 * InkButton: 2 px border, offset print shadow, square corners, the shadow
 * collapsing as it presses. Returns to #top, never to a CTA.
 */
function FolioBackToTop() {
  return (
    <a
      href="#top"
      aria-label={FOLIO_A11Y.backToTop}
      className="group inline-flex h-11 items-center gap-2.5 border-2 border-[#1c1914] bg-transparent px-4 font-grotesk text-[12px] font-bold uppercase tracking-[0.16em] text-[#1c1914] shadow-[3px_3px_0_#1c1914] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#1c1914]/5 hover:shadow-[1px_1px_0_#1c1914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
    >
      Revenir en tête
      <ArrowUp
        aria-hidden
        className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"
      />
    </a>
  );
}

/**
 * The baseline — the very last strip off the press. Credit microcopy on the
 * left (deterministic year, no Date), the back-to-top control on the right.
 * A DoubleRule above it closes the broadsheet the way every section closes.
 */
function FolioBaseline() {
  return (
    <div className="flex flex-col gap-5">
      <DoubleRule />
      <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1.5">
          <p className="font-grotesk text-[12px] leading-relaxed text-[#4a4438]">{FOLIO_CREDIT}</p>
          <p className={T.folio}>
            {EDITION.fileName} {"·"} {EDITION.rows} lignes {"·"} réussite {EDITION.successRate}
          </p>
          <p className="font-grotesk text-[11px] leading-relaxed text-[#857c69]">
            Corrections : la prochaine édition se compose au prochain fichier déposé. Aucun
            erratum n'est envoyé ailleurs que sur votre disque.
          </p>
        </div>
        <FolioBackToTop />
      </div>
      <FolioLine page="Fin de l'édition" note={EDITION.price} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §F4 — ROOT · the folio, sat on the deepest paper shade
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * FolioSection — the page's footer. The root is a <section> per the contract,
 * with a real <footer> landmark inside carrying the content. It sits on the
 * deepest paper shade so the foot reads a touch darker than the body, the way
 * a broadsheet's back page is set on heavier stock. A DoubleRule across the
 * top hands off from the section above; everything below is square-cornered,
 * inked furniture: colophon, index, press marks, baseline.
 *
 * contentVisibility is set per rule 10 (this is not a StickyScene), with an
 * intrinsic-size hint sized to the foot so the browser can skip its layout
 * until it scrolls near.
 */
function FolioSection() {
  return (
    <section
      id="folio"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}
    >
      <footer
        aria-label={FOLIO_A11Y.region}
        className="bg-[#e4dac5] text-[#1c1914]"
      >
        <DoubleRule />
        <div className="mx-auto flex max-w-[1560px] flex-col gap-14 px-5 py-16 sm:px-8 sm:py-20 xl:px-12">
          <FolioColophonBand />
          <Rule />
          <FolioMainGrid />
          <Rule />
          <div className="grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.05fr)]">
            <FolioDeskLedger />
            <FolioLedgerBand />
          </div>
          <Rule />
          <FolioPressMarks />
          <FolioBaseline />
        </div>
      </footer>
    </section>
  );
}


/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THE PAGE — sections bound in reading order
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

export default function Page() {
  return (
    <div
      id="top"
      className="ed-fiber relative min-h-[100dvh] bg-[#f6f1e7] text-[#1c1914] selection:bg-[#bf3415]/25"
    >
      <SpineSection />
      <MastheadSection />
      <TapeSection />
      <LeadSection />
      <FoldSection />
      <PressSection />
      <ClassifiedSection />
      <DeskSection />
      <BureauSection />
      <CartoSection />
      <AlmanacSection />
      <ArchiveSection />
      <ColophonSection />
      <LettersSection />
      <QuestionsSection />
      <SubscribeSection />
      <FolioSection />
    </div>
  );
}
