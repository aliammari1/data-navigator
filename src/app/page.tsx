"use client";

/**
 * Data Navigator — landing experience.
 *
 * One self-contained page: every visual (charts, mocks, accordion, marquee,
 * counters) is hand-rolled here on top of motion/react + lucide only.
 * Motion budget for medium-end hardware: transform/opacity animations only,
 * static blurs, everything gated behind useReducedMotion.
 *
 * Narrative arc: a raw DailyTransactions.csv becomes a finished briefing —
 * Drop → Profile → Query → Brief → Ship — without a byte leaving the desk.
 */

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  Cpu,
  Database,
  FileSpreadsheet,
  FileText,
  Lock,
  Menu,
  Radar,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  AnimatePresence,
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
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/* ═════════════════════════════════ data ═════════════════════════════════ */

const NAV = [
  { href: "#workflow", label: "Workflow" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#architecture", label: "Architecture" },
  { href: "#faq", label: "FAQ" },
] as const;

const TICKER_A = [
  "CSV import wizard",
  "Column profiler",
  "DuckDB SQL",
  "Visual query builder",
  "Transform pipelines",
  "Version history",
  "Folder workspaces",
] as const;

const TICKER_B = [
  "Anomaly detection",
  "LAN collaboration",
  "Voice readout",
  "Command palette",
] as const;

const STEPS = [
  {
    k: "01",
    title: "Drop the file",
    body: "DailyTransactions.csv lands in a typed DuckDB table in seconds — encodings, delimiters and date formats detected, not guessed at.",
    tag: "Import",
  },
  {
    k: "02",
    title: "Profile every column",
    body: "Null rates, distinct counts, distributions and quality flags for the whole schema before you write a single query.",
    tag: "Profile",
  },
  {
    k: "03",
    title: "Ask in SQL — or in French",
    body: "A full DuckDB editor when you want it; natural-language questions translated to SQL when you don't.",
    tag: "Query",
  },
  {
    k: "04",
    title: "Let the AI brief you",
    body: "An embedded model reads the day's KPIs, flags the 16:00 dip on canal USSD, and writes the morning narrative. No API key. No network.",
    tag: "Brief",
  },
  {
    k: "05",
    title: "Ship the report",
    body: "One click renders the briefing to PDF, DOCX or PPTX with your charts — ready for the people who never open dashboards.",
    tag: "Ship",
  },
] as const;

const LAYERS = [
  {
    icon: Radar,
    name: "Renderer",
    detail: "React 19 + Next.js — no Node access, strict CSP",
  },
  {
    icon: Shield,
    name: "Typed IPC bridge",
    detail: "Allow-listed channels only, validated both ways",
  },
  {
    icon: Database,
    name: "Analytical core",
    detail: "DuckDB · SQLite · LanceDB — OLAP at desktop speed",
  },
  {
    icon: Cpu,
    name: "Worker fleet",
    detail: "LLM, forecasting, voice — off-thread, UI never blocks",
  },
] as const;

const FAQS = [
  {
    q: "Is it really offline-first?",
    a: "Yes. Import, queries, AI analysis and report export all run on-device. Zero outbound connections by default — you can add integrations later, but nothing requires them.",
  },
  {
    q: "What data sizes can it handle?",
    a: "DuckDB gives columnar, vectorised analytics on the desktop. Telecom-scale daily files — millions of rows, wide schemas — profile and query in seconds on a mid-range machine.",
  },
  {
    q: "Web app or desktop app?",
    a: "Both. A Next.js renderer runs inside a hardened Electron shell: modern web UI, local file access, and a typed IPC boundary between the two.",
  },
  {
    q: "Can I use it outside telecom?",
    a: "Yes. The telecom KPI suite is first-class, but import, profiling, SQL, AI briefings and report export work on any tabular data.",
  },
] as const;

/* ════════════════════════ in-file micro-primitives ═══════════════════════ */

const EASE = [0.16, 1, 0.3, 1] as const;

function Reveal({
  children,
  delay = 0,
  y = 24,
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
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Hand-rolled count-up — rAF driven, fires once when scrolled into view. */
function CountUp({
  end,
  decimals = 0,
  suffix = "",
  duration = 1.6,
}: {
  end: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
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
      const eased = 1 - (1 - p) ** 3;
      setVal(end * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration, reduce]);

  return (
    <span ref={ref}>
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Cursor-tracked spotlight surface — CSS variables only, zero re-renders. */
function Spotlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: decorative cursor highlight only
    <div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`);
      }}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors duration-300 hover:border-blue-400/30 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(340px circle at var(--sx, 50%) var(--sy, 50%), rgba(94,139,255,0.09), transparent 70%)",
        }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <motion.span whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} className="inline-block">
      <Link
        href={href}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-400 px-6 text-sm font-semibold text-[#04121f] shadow-[0_10px_40px_-10px_rgba(94,139,255,0.55)] transition-colors hover:bg-blue-300"
      >
        {children}
      </Link>
    </motion.span>
  );
}

function GhostCta({ href, children }: { href: string; children: ReactNode }) {
  const cls =
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/12 px-6 text-sm font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white";
  return href.startsWith("#") ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-blue-300/80">
      <span className="h-px w-8 bg-blue-400/40" />
      {children}
    </span>
  );
}

/* ═══════════════════════════ hand-rolled visuals ══════════════════════════ */

/** Area chart with animated stroke draw + anomaly marker. Pure SVG. */
function AreaViz({ anomaly = true }: { anomaly?: boolean }) {
  const reduce = useReducedMotion();
  // hourly throughput shape with a dip at the 9th point
  const pts = [22, 30, 38, 42, 40, 47, 55, 60, 18, 36, 52, 58, 56];
  const W = 300;
  const H = 96;
  const step = W / (pts.length - 1);
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${i * step},${H - v - 8}`).join(" ");
  const area = `${path} L${W},${H} L0,${H} Z`;
  const dipX = 8 * step;
  const dipY = H - pts[8] - 8;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="lp-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5e8bff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#5e8bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lp-area)" />
      <motion.path
        d={path}
        fill="none"
        stroke="#5e8bff"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />
      {anomaly && (
        <g>
          <circle cx={dipX} cy={dipY} r="4" fill="#fb7185" stroke="#05070d" strokeWidth="2" />
          <circle cx={dipX} cy={dipY} r="8" fill="none" stroke="#fb7185" strokeOpacity="0.4">
            {!reduce && (
              <animate attributeName="r" values="6;11;6" dur="2.4s" repeatCount="indefinite" />
            )}
          </circle>
        </g>
      )}
    </svg>
  );
}

/** Vertical bars growing from the baseline, staggered. */
function BarsViz() {
  const reduce = useReducedMotion();
  const bars = [82, 64, 91, 47, 73, 88, 58, 79];
  return (
    <div className="flex h-full w-full items-end gap-1.5" aria-hidden>
      {bars.map((v, i) => (
        <motion.div
          key={`${i}-${v}`}
          className="flex-1 rounded-t-[3px] bg-blue-400/70"
          style={{ transformOrigin: "bottom" }}
          initial={reduce ? false : { scaleY: 0 }}
          whileInView={{ scaleY: v / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: i * 0.05, ease: EASE }}
        />
      ))}
    </div>
  );
}

/** Radial gauge — animated stroke-dashoffset ring. */
function GaugeViz({ value = 97.4 }: { value?: number }) {
  const reduce = useReducedMotion();
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative grid h-full w-full place-items-center" aria-hidden>
      <svg viewBox="0 0 88 88" className="h-full max-h-28 w-auto -rotate-90">
        <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
        <motion.circle
          cx="44"
          cy="44"
          r={R}
          fill="none"
          stroke="#5e8bff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          whileInView={{ strokeDashoffset: C * (1 - value / 100) }}
          viewport={{ once: true }}
          transition={{ duration: 1.3, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold tabular-nums text-white">{value}%</span>
        <span className="font-mono text-xs uppercase tracking-wider text-slate-400">réussite</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════ atmosphere ═══════════════════════════════ */

function Atmosphere() {
  return (
    <>
      {/* grain — above everything, far below interaction */}
      <div aria-hidden className="lp-grain pointer-events-none fixed inset-0 z-50 opacity-[0.03]" />

      {/* aurora field */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="lp-drift absolute -left-[20%] -top-[25%] h-[85vh] w-[85vh] rounded-full blur-[110px]"
          style={{
            background: "radial-gradient(circle, rgba(94,139,255,0.11), transparent 62%)",
          }}
        />
        <div
          className="lp-drift absolute -right-[15%] top-[18%] h-[70vh] w-[70vh] rounded-full blur-[110px]"
          style={{
            background: "radial-gradient(circle, rgba(99,102,241,0.09), transparent 62%)",
            animationDelay: "-9s",
          }}
        />
        <div
          className="lp-drift absolute bottom-[-30%] left-[25%] h-[75vh] w-[75vh] rounded-full blur-[120px]"
          style={{
            background: "radial-gradient(circle, rgba(94,139,255,0.06), transparent 60%)",
            animationDelay: "-17s",
          }}
        />
      </div>
    </>
  );
}

/* ═══════════════════════════════ navigation ═══════════════════════════════ */

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 16));

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4">
      <div
        className={[
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-2xl border px-4 transition-all duration-300 sm:px-5",
          scrolled
            ? "border-white/10 bg-[#05070d]/80 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl"
            : "border-transparent bg-transparent",
        ].join(" ")}
      >
        <Link href="#top" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border border-blue-400/30 bg-blue-400/5">
            <Radar className="size-[18px] text-blue-300" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-white">
            Data Navigator
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-colors hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="hidden h-9 items-center gap-1.5 rounded-xl bg-blue-400 px-4 text-sm font-semibold text-[#04121f] transition-colors hover:bg-blue-300 sm:inline-flex"
          >
            Get started <ArrowUpRight className="size-3.5" />
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-xl border border-white/12 text-slate-200 md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* mobile sheet — hand-rolled */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="mx-auto mt-2 max-w-6xl rounded-2xl border border-white/10 bg-[#070a12]/95 p-3 backdrop-blur-xl md:hidden"
          >
            {NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
              <Link
                href="/login"
                className="flex-1 rounded-xl border border-white/12 py-2.5 text-center text-sm text-slate-200"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="flex-1 rounded-xl bg-blue-400 py-2.5 text-center text-sm font-semibold text-[#04121f]"
              >
                Get started
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ═══════════════════════════════════ hero ═══════════════════════════════════ */

function HeroPanel() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], reduce ? [0, 0] : [4.5, -4.5]), {
    stiffness: 150,
    damping: 20,
  });
  const ry = useSpring(useTransform(px, [0, 1], reduce ? [0, 0] : [-4.5, 4.5]), {
    stiffness: 150,
    damping: 20,
  });

  return (
    <motion.div
      onMouseMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-3 shadow-[0_50px_140px_-50px_rgba(0,0,0,0.95)] backdrop-blur-xl"
    >
      {/* window chrome */}
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          DailyTransactions_2026-06-11.csv · 2 147 380 rows
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-xs text-emerald-200">
          <span className="lp-pulse size-1.5 rounded-full bg-emerald-400" /> local
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="col-span-2 rounded-xl border border-white/8 bg-[#05070d] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
              Transactions / heure
            </span>
            <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-0.5 font-mono text-xs tabular-nums text-rose-200">
              anomalie 16:00
            </span>
          </div>
          <div className="h-28">
            <AreaViz />
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-[#05070d] p-3">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
            Taux de réussite
          </span>
          <div className="h-28">
            <GaugeViz />
          </div>
        </div>

        <div className="col-span-2 rounded-xl border border-white/8 bg-[#05070d] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
              Volume par canal
            </span>
            <span className="font-mono text-xs tracking-wide text-slate-400">
              USSD · APP · WEB · SMS
            </span>
          </div>
          <div className="h-16">
            <BarsViz />
          </div>
        </div>

        <div className="rounded-xl border border-blue-400/15 bg-blue-400/[0.04] p-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-blue-300" />
            <span className="font-mono text-xs uppercase tracking-wider text-blue-200/90">
              Briefing IA
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            Volume <span className="text-emerald-300">+4,2%</span> vs hier. Creux à 16:00 sur USSD —
            corrélé à l'incident régional EST.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  // parallax: each layer recedes at a different rate
  const yPanel = useTransform(scrollY, [0, 900], [0, reduce ? 0 : -90]);
  const yText = useTransform(scrollY, [0, 900], [0, reduce ? 0 : -36]);
  const yChipL = useTransform(scrollY, [0, 900], [0, reduce ? 0 : -150]);
  const yChipR = useTransform(scrollY, [0, 900], [0, reduce ? 0 : -200]);
  const heroFade = useTransform(scrollY, [0, 620], [1, 0]);

  const headline = ["Twelve", "million", "rows.", "One", "desktop.", "Zero", "cloud."];

  return (
    <section className="relative flex min-h-[100dvh] items-center overflow-hidden px-5 pb-20 pt-32 sm:px-6">
      {/* dot grid backdrop, masked toward the centre */}
      <div
        aria-hidden
        className="absolute inset-0 -z-[1] opacity-50"
        style={{
          backgroundImage: "radial-gradient(rgba(148,163,184,0.13) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 75% 60% at 50% 38%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 60% at 50% 38%, black 30%, transparent 75%)",
        }}
      />

      <motion.div
        style={{ opacity: heroFade }}
        className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 lg:grid-cols-12"
      >
        <motion.div style={{ y: yText }} className="lg:col-span-5">
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.06] px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-blue-200"
          >
            <Lock className="size-3" /> Desktop · Offline · Yours
          </motion.span>

          <h1 className="mt-7 font-display text-[clamp(2.6rem,6vw,4.4rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-white">
            {headline.map((w, i) => (
              <motion.span
                key={w}
                className="inline-block whitespace-pre"
                initial={reduce ? false : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08 + i * 0.07, ease: EASE }}
              >
                {w + (i < headline.length - 1 ? " " : "")}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.62, ease: EASE }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400"
          >
            Data Navigator imports your daily transaction files, profiles them in DuckDB and writes
            the morning briefing with an AI that never phones home.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.74, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <PrimaryCta href="/signup">
              Get started <ArrowUpRight className="size-4" />
            </PrimaryCta>
            <GhostCta href="#workflow">
              Follow a file through <ArrowDown className="size-4" />
            </GhostCta>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-slate-500"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-blue-400" /> no account required to explore
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-blue-400" /> zero outbound connections
            </span>
          </motion.div>
        </motion.div>

        <div className="relative lg:col-span-7">
          {/* floating satellites — parallax + levitation */}
          <motion.div
            style={{ y: yChipL }}
            className="lp-float absolute -left-4 -top-8 z-10 hidden lg:block"
          >
            <div className="rounded-xl border border-white/10 bg-[#070a12]/90 px-3.5 py-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur">
              <div className="font-mono text-xs uppercase tracking-wider text-slate-400">
                rows / sec
              </div>
              <div className="font-mono text-lg font-semibold tabular-nums text-blue-300">
                <CountUp end={12.4} decimals={1} suffix="M" />
              </div>
            </div>
          </motion.div>

          <motion.div
            style={{ y: yChipR }}
            className="lp-float-slow absolute -right-2 -bottom-10 z-10 hidden lg:block"
          >
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#070a12]/90 px-3.5 py-2.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur">
              <FileText className="size-4 text-blue-300" />
              <div>
                <div className="text-xs font-medium text-white">Rapport_2026-06-11.pdf</div>
                <div className="font-mono text-xs tabular-nums text-slate-400">
                  exporté · 0 octet envoyé
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            style={{ y: yPanel }}
            initial={reduce ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
          >
            <HeroPanel />
          </motion.div>
        </div>
      </motion.div>

      {/* scroll cue */}
      <motion.a
        href="#workflow"
        aria-label="Scroll to workflow"
        style={{ opacity: heroFade }}
        className="absolute bottom-7 left-1/2 -translate-x-1/2 text-slate-500 transition-colors hover:text-blue-300"
      >
        <motion.span
          animate={reduce ? undefined : { y: [0, 7, 0] }}
          transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          className="block"
        >
          <ChevronDown className="size-5" />
        </motion.span>
      </motion.a>
    </section>
  );
}

/* ════════════════════════════════ ticker ════════════════════════════════ */

function TickerRow({ items, reverse = false }: { items: readonly string[]; reverse?: boolean }) {
  const track = [...items, ...items];
  return (
    <div
      className="flex overflow-hidden"
      style={{
        maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)",
      }}
    >
      <div
        className={`${reverse ? "lp-marquee-reverse" : "lp-marquee"} flex w-max shrink-0 items-center gap-3 pr-3`}
      >
        {track.map((t, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static duplicated track
            key={`${t}-${i}`}
            className="whitespace-nowrap rounded-full border border-white/8 bg-white/[0.025] px-4 py-2 font-mono text-xs text-slate-400"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeatureTicker() {
  return (
    <section className="lp-marquee-paused border-y border-white/8 bg-white/[0.012] py-8">
      <Reveal>
        <p className="mb-5 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
          30+ analysis surfaces · one window
        </p>
      </Reveal>
      <div className="space-y-3">
        <TickerRow items={TICKER_A} />
        <TickerRow items={TICKER_B} reverse />
      </div>
    </section>
  );
}

/* ═══════════════════════════ golden path (pinned) ═══════════════════════════ */

function StepVisual({ step }: { step: number }) {
  // one hand-built mock per step, crossfaded by the parent
  switch (step) {
    case 0:
      return (
        <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
          <div className="grid w-full max-w-sm place-items-center rounded-2xl border-2 border-dashed border-blue-400/30 bg-blue-400/[0.03] px-8 py-12">
            <FileSpreadsheet className="size-10 text-blue-300/80" />
            <p className="mt-4 text-sm text-slate-300">DailyTransactions_2026-06-11.csv</p>
            <p className="mt-1 font-mono text-[11px] text-slate-500">2 147 380 lignes · 42 Mo</p>
          </div>
          <div className="w-full max-w-sm">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="h-full rounded-full bg-blue-400"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                style={{ transformOrigin: "left" }}
                transition={{ duration: 1.6, ease: "easeInOut" }}
              />
            </div>
            <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-slate-400">
              <span>schéma typé détecté</span>
              <span>duckdb://transactions</span>
            </div>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="flex h-full flex-col justify-center gap-2.5 p-8">
          {[
            { col: "transaction_id", type: "VARCHAR", null_: "0%", q: 100 },
            { col: "montant", type: "DECIMAL", null_: "0.2%", q: 98 },
            { col: "canal", type: "VARCHAR", null_: "0%", q: 100 },
            { col: "statut", type: "VARCHAR", null_: "1.4%", q: 92 },
            { col: "region", type: "VARCHAR", null_: "6.8%", q: 71 },
          ].map((r, i) => (
            <motion.div
              key={r.col}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: EASE }}
              className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-4 py-2.5"
            >
              <span className="w-36 truncate font-mono text-xs text-slate-200">{r.col}</span>
              <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-400">
                {r.type}
              </span>
              <span className="ml-auto font-mono text-xs tabular-nums text-slate-400">
                nulls {r.null_}
              </span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className={`h-full rounded-full ${r.q > 90 ? "bg-blue-400" : r.q > 80 ? "bg-amber-400" : "bg-rose-400"}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: r.q / 100 }}
                  style={{ transformOrigin: "left" }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: EASE }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      );
    case 2:
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#04060b]">
            <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
              <span className="font-mono text-xs text-slate-400">requête.sql</span>
              <span className="ml-auto rounded bg-blue-400/10 px-2.5 py-0.5 font-mono text-xs tabular-nums text-blue-300">
                ⌘↵ exécuter
              </span>
            </div>
            <div className="space-y-1.5 p-4 font-mono text-xs leading-relaxed">
              <p>
                <span className="text-indigo-300">SELECT</span>
                <span className="text-slate-300"> canal, </span>
                <span className="text-blue-300">count</span>
                <span className="text-slate-300">(*) </span>
                <span className="text-indigo-300">AS</span>
                <span className="text-slate-300"> tx,</span>
              </p>
              <p className="pl-7 text-slate-300">
                <span className="text-blue-300">avg</span>(montant){" "}
                <span className="text-indigo-300">AS</span> panier
              </p>
              <p>
                <span className="text-indigo-300">FROM</span>
                <span className="text-slate-300"> transactions</span>
              </p>
              <p>
                <span className="text-indigo-300">GROUP BY</span>
                <span className="text-slate-300"> canal </span>
                <span className="text-indigo-300">ORDER BY</span>
                <span className="text-slate-300"> tx </span>
                <span className="text-indigo-300">DESC</span>
                <span className="text-slate-300">;</span>
              </p>
            </div>
            <div className="border-t border-white/8 bg-white/[0.015] px-4 py-2.5 font-mono text-xs tabular-nums text-slate-400">
              4 lignes · 0.18 s —{" "}
              <span className="text-slate-300">« volume par canal hier » fonctionne aussi</span>
            </div>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="w-full max-w-md space-y-3">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="ml-auto w-fit rounded-2xl rounded-br-sm bg-blue-400/10 px-4 py-2.5 text-sm text-blue-100"
            >
              Pourquoi le creux à 16h ?
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4, ease: EASE }}
              className="flex gap-3 rounded-2xl rounded-bl-sm border border-white/8 bg-white/[0.03] px-4 py-3.5"
            >
              <span className="mt-0.5 grid size-7 flex-none place-items-center rounded-lg border border-blue-400/25 bg-blue-400/10">
                <Brain className="size-3.5 text-blue-300" />
              </span>
              <div className="text-sm leading-relaxed text-slate-300">
                Le canal <span className="font-mono text-blue-300">USSD</span> chute de{" "}
                <span className="text-rose-300">−54%</span> entre 15h50 et 16h20, uniquement en
                région <span className="font-mono">EST</span> — cohérent avec l'incident passerelle
                signalé. Les autres canaux absorbent 31% du volume perdu.
                <div className="mt-2 font-mono text-xs tabular-nums text-slate-400">
                  modèle local · 0 requête réseau
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      );
    default:
      return (
        <div className="relative flex h-full items-center justify-center p-8">
          {[2, 1, 0].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24, rotate: 0 }}
              animate={{ opacity: 1, y: i * -8, rotate: (i - 1) * 2.5 }}
              transition={{ delay: i * 0.12, duration: 0.5, ease: EASE }}
              className="absolute h-64 w-48 rounded-lg border border-white/12 bg-gradient-to-b from-[#0c111d] to-[#070a12] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
              style={{ zIndex: 3 - i }}
            >
              {i === 0 && (
                <div className="flex h-full flex-col p-4">
                  <div className="h-2 w-2/3 rounded bg-white/15" />
                  <div className="mt-2 h-1.5 w-1/2 rounded bg-white/8" />
                  <div className="mt-4 h-16 rounded bg-blue-400/10" />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="h-10 rounded bg-white/5" />
                    <div className="h-10 rounded bg-white/5" />
                  </div>
                  <div className="mt-auto flex gap-1.5">
                    {["PDF", "DOCX", "PPTX"].map((f) => (
                      <span
                        key={f}
                        className="rounded border border-blue-400/25 bg-blue-400/10 px-1.5 py-0.5 font-mono text-[8px] text-blue-300"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      );
  }
}

function GoldenPath() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
  });

  const rail = useSpring(scrollYProgress, { stiffness: 120, damping: 28 });

  return (
    <section
      id="workflow"
      ref={ref}
      className="relative"
      style={{ height: `${STEPS.length * 100}vh` }}
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden px-5 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <Reveal>
            <SectionLabel>The golden path</SectionLabel>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Follow one file from raw to briefing.
            </h2>
          </Reveal>

          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
            {/* rail + steps */}
            <div className="relative lg:col-span-5">
              <div className="absolute bottom-2 left-[15px] top-2 w-px bg-white/8" aria-hidden>
                <motion.div
                  className="w-full bg-blue-400"
                  style={{ scaleY: reduce ? 1 : rail, transformOrigin: "top", height: "100%" }}
                />
              </div>
              <ol className="space-y-1.5">
                {STEPS.map((s, i) => {
                  const active = i === step;
                  return (
                    <li key={s.k}>
                      <div
                        className={[
                          "relative flex gap-4 rounded-xl py-3 pl-10 pr-4 transition-colors duration-300",
                          active ? "bg-white/[0.035]" : "opacity-45",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "absolute left-[9px] top-[18px] size-[13px] rounded-full border-2 transition-colors duration-300",
                            active
                              ? "border-blue-300 bg-blue-400/30"
                              : "border-slate-600 bg-[#05070d]",
                          ].join(" ")}
                        />
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs tabular-nums text-slate-400">
                              {s.k}
                            </span>
                            <h3 className="font-display text-base font-semibold text-white">
                              {s.title}
                            </h3>
                            <span className="rounded-full border border-white/10 px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider text-slate-400">
                              {s.tag}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.body}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* visual stage */}
            <div className="hidden lg:col-span-7 lg:block">
              <div className="relative h-[460px] overflow-hidden rounded-2xl border border-white/10 bg-[#070a12]/70 backdrop-blur">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: "radial-gradient(rgba(148,163,184,0.1) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                />
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={reduce ? false : { opacity: 0, y: 22, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, y: -18, scale: 0.985 }}
                    transition={{ duration: 0.38, ease: EASE }}
                    className="absolute inset-0"
                  >
                    <StepVisual step={step} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ capabilities bento ═══════════════════════════ */

function BentoTitle({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ElementType;
  title: string;
  sub: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg border border-blue-400/20 bg-blue-400/[0.06]">
          <Icon className="size-4 text-blue-300" />
        </span>
        <h3 className="font-display text-[15px] font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{sub}</p>
    </div>
  );
}

function Capabilities() {
  return (
    <section id="capabilities" className="mx-auto max-w-7xl px-5 py-28 sm:px-6">
      <Reveal className="max-w-2xl">
        <SectionLabel>Capabilities</SectionLabel>
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white md:text-5xl">
          A full analytics floor, folded into one window.
        </h2>
        <p className="mt-4 text-lg text-slate-400">
          Every surface below ships in the box and runs on your machine — nothing is an add-on,
          nothing needs a connection.
        </p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6">
        {/* engine — wide */}
        <Reveal className="md:col-span-4">
          <Spotlight className="h-full p-6">
            <div className="flex h-full flex-col">
              <BentoTitle
                icon={Database}
                title="DuckDB analytical engine"
                sub="Columnar, vectorised SQL over millions of rows — locally, in milliseconds. The same table feeds every chart, query and AI answer."
              />
              <div className="mt-5 h-28 flex-1">
                <AreaViz anomaly={false} />
              </div>
              <div className="mt-3 flex justify-between font-mono text-xs tabular-nums text-slate-400">
                <span>SELECT … GROUP BY canal</span>
                <span className="text-blue-300">0.18 s · 2.1M rows</span>
              </div>
            </div>
          </Spotlight>
        </Reveal>

        {/* AI — tall */}
        <Reveal delay={0.08} className="md:col-span-2 md:row-span-2">
          <Spotlight className="h-full p-6">
            <div className="flex h-full flex-col">
              <BentoTitle
                icon={Brain}
                title="Embedded intelligence"
                sub="Natural-language questions, answered by a model that lives in the app."
              />
              <div className="mt-5 flex-1 space-y-2.5">
                <div className="ml-auto w-fit max-w-[90%] rounded-xl rounded-br-sm bg-blue-400/10 px-3 py-2 text-xs text-blue-100">
                  Résume la journée
                </div>
                <div className="rounded-xl rounded-bl-sm border border-white/8 bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-slate-300">
                  2,1M transactions, +4,2% vs hier. Réussite 97,4%. Un creux USSD à 16h (région
                  EST), résorbé en 30 min…
                </div>
                <div className="ml-auto w-fit max-w-[90%] rounded-xl rounded-br-sm bg-blue-400/10 px-3 py-2 text-xs text-blue-100">
                  Et la tendance sur 7 jours ?
                </div>
                <div className="flex items-center gap-1.5 rounded-xl rounded-bl-sm border border-white/8 bg-white/[0.03] px-3 py-2.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-1.5 rounded-full bg-slate-500"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 1.1,
                        repeat: Number.POSITIVE_INFINITY,
                        delay: i * 0.18,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4 border-t border-white/8 pt-3 font-mono text-xs tabular-nums text-slate-400">
                WebLLM + llama.cpp · aucun jeton ne quitte la machine
              </div>
            </div>
          </Spotlight>
        </Reveal>

        {/* telecom KPI */}
        <Reveal delay={0.05} className="md:col-span-4">
          <Spotlight className="h-full p-6">
            <BentoTitle
              icon={BarChart3}
              title="Telecom KPI suite"
              sub="Eight dedicated report tabs: canaux, journalier, périodes, données brutes…"
            />
            <div className="mt-4 h-24">
              <GaugeViz value={97.4} />
            </div>
          </Spotlight>
        </Reveal>

        {/* collaboration */}
        <Reveal delay={0.06} className="md:col-span-6">
          <Spotlight className="h-full p-6">
            <div className="flex items-start justify-between gap-4">
              <BentoTitle
                icon={Users}
                title="LAN collaboration"
                sub="Shared cursors, comments and live presence over the local network — CRDT-synced, no server in the cloud."
              />
              <div className="flex -space-x-2">
                {["AS", "KB", "MT"].map((u, i) => (
                  <span
                    key={u}
                    className="grid size-8 place-items-center rounded-lg border border-white/15 bg-[#0b101c] font-mono text-xs font-semibold tabular-nums text-slate-300"
                    style={{ zIndex: 3 - i }}
                  >
                    {u}
                  </span>
                ))}
              </div>
            </div>
          </Spotlight>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════ architecture stack ═══════════════════════════ */

/** One layer of the exploded stack. Collapsed: tight deck — expanded: spread. */
function ArchLayer({
  layer,
  index,
  spread,
  reduce,
}: {
  layer: (typeof LAYERS)[number];
  index: number;
  spread: ReturnType<typeof useSpring>;
  reduce: boolean;
}) {
  const Icon = layer.icon;
  const y = useTransform(
    spread,
    [0, 1],
    reduce ? [index * 88, index * 88] : [index * 26 + 90, index * 88],
  );
  return (
    <motion.div
      style={{ y, zIndex: LAYERS.length - index, rotateX: reduce ? 0 : 8 }}
      className="absolute inset-x-0 top-0"
    >
      <div className="mx-auto flex max-w-md items-center gap-4 rounded-2xl border border-white/12 bg-[#0a0f1a]/95 px-5 py-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] backdrop-blur">
        <span className="grid size-10 flex-none place-items-center rounded-xl border border-blue-400/20 bg-blue-400/[0.06]">
          <Icon className="size-[18px] text-blue-300" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold text-white">{layer.name}</div>
          <div className="truncate text-xs text-slate-400">{layer.detail}</div>
        </div>
        <span className="ml-auto font-mono text-xs tabular-nums text-slate-500">L{index}</span>
      </div>
    </motion.div>
  );
}

function Architecture() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const spread = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });

  return (
    <section
      id="architecture"
      className="border-y border-white/8 bg-white/[0.012] px-5 py-28 sm:px-6"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <Reveal>
          <SectionLabel>Architecture</SectionLabel>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Hardened layers, honest boundaries.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-400">
            The renderer never touches Node. Every privileged call crosses one typed, allow-listed
            IPC bridge. Heavy work — SQL, models, voice — runs in workers so the interface never
            stutters.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {["React 19", "Next.js", "Electron", "DuckDB", "SQLite", "ONNX"].map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-slate-300"
              >
                {t}
              </span>
            ))}
          </div>
        </Reveal>

        {/* exploded stack — layers separate as you scroll */}
        <div ref={ref} className="relative h-[380px]" style={{ perspective: 900 }}>
          {LAYERS.map((l, i) => (
            <ArchLayer key={l.name} layer={l} index={i} spread={spread} reduce={!!reduce} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════ numbers / faq / cta ════════════════════════════ */

function Numbers() {
  const stats = [
    { end: 12, suffix: "M+", label: "rows scanned per second", decimals: 0 },
    { end: 30, suffix: "+", label: "analysis surfaces in one window", decimals: 0 },
    { end: 0, suffix: "", label: "outbound connections by default", decimals: 0 },
    { end: 100, suffix: "%", label: "of the AI runs on-device", decimals: 0 },
  ];
  return (
    <section className="mx-auto max-w-7xl px-5 py-24 sm:px-6">
      <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <div className="font-mono text-4xl font-semibold tracking-tight text-blue-300 md:text-5xl">
              <CountUp end={s.end} decimals={s.decimals} suffix={s.suffix} />
            </div>
            <div className="mt-2.5 max-w-[22ch] text-sm leading-snug text-slate-400">{s.label}</div>
          </Reveal>
        ))}
      </div>
      <p className="mt-8 font-mono text-[11px] text-slate-600">Illustrative sample telemetry.</p>
    </section>
  );
}

function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <section id="faq" className="border-t border-white/8 px-5 py-28 sm:px-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white">
            The questions security teams ask first.
          </h2>
        </Reveal>

        <div className="lg:col-span-8">
          {FAQS.map((f, i) => {
            const open = openIdx === i;
            return (
              <Reveal key={f.q} delay={i * 0.05}>
                <div className="border-b border-white/8">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="font-display text-base font-medium text-white">{f.q}</span>
                    <motion.span
                      animate={{ rotate: open ? 45 : 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="grid size-7 flex-none place-items-center rounded-lg border border-white/10 text-slate-400"
                    >
                      <span className="text-base leading-none">+</span>
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-2xl pb-5 text-sm leading-relaxed text-slate-400">
                          {f.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 py-28 sm:px-6">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 px-8 py-20 text-center">
          {/* local aurora */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-[1]">
            <div
              className="lp-drift absolute -top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 rounded-full blur-[100px]"
              style={{
                background: "radial-gradient(circle, rgba(94,139,255,0.14), transparent 60%)",
              }}
            />
          </div>
          <div
            aria-hidden
            className="lp-grain pointer-events-none absolute inset-0 opacity-[0.04]"
          />

          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-blue-400/30 bg-blue-400/5">
            <Lock className="size-5 text-blue-300" />
          </span>
          <h2 className="mx-auto mt-7 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white md:text-6xl">
            Your data never leaves the desk.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">
            Import tomorrow's file and read its briefing before the first meeting — no account on
            anyone's cloud, no data on anyone's wire.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta href="/signup">
              Get started <ArrowUpRight className="size-4" />
            </PrimaryCta>
            <GhostCta href="/login">
              Sign in <ArrowRight className="size-4" />
            </GhostCta>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/8 px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 md:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg border border-blue-400/30 bg-blue-400/5">
            <Radar className="size-4 text-blue-300" />
          </span>
          <span className="font-display text-sm font-semibold text-white">Data Navigator</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-400">
          {NAV.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
          <Link href="/login" className="transition-colors hover:text-white">
            Sign in
          </Link>
        </nav>
        <span className="font-mono text-[11px] text-slate-500">On-device. Typed. Explainable.</span>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════ page ═══════════════════════════════════ */

export default function Page() {
  return (
    <div id="top" className="relative min-h-[100dvh] bg-[#05070d] text-slate-200">
      <Atmosphere />
      <TopNav />
      <main>
        <Hero />
        <FeatureTicker />
        <GoldenPath />
        <Capabilities />
        <Architecture />
        <Numbers />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
