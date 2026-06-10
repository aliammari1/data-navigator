"use client";

import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Brain,
  Check,
  Cpu,
  Database,
  FileSpreadsheet,
  GitBranch,
  Lock,
  Menu,
  MessageSquareText,
  Radar,
  Shield,
} from "lucide-react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CountStat, SpotlightCard } from "@/components/landing/interactive";
import {
  AvailabilityGauge,
  RegionBars,
  Sparkline,
  ThroughputChart,
} from "@/components/landing/visuals";

/* ───────────────────────────── data ───────────────────────────── */

const nav = [
  { href: "#capabilities", label: "Capabilities" },
  { href: "#architecture", label: "Architecture" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

const pillars = [
  { icon: Radar, k: "Renderer", v: "React 19 + Next.js", note: "No Node access, strict CSP." },
  { icon: Shield, k: "Main process", v: "Typed IPC bridge", note: "Allow-listed channels only." },
  { icon: Database, k: "Analytical core", v: "DuckDB + SQLite", note: "OLAP at desktop speed." },
  { icon: Cpu, k: "Workers", v: "ML, LLM, voice", note: "Off-thread, responsive UI." },
] as const;

const flow = ["Files", "Tables", "Queries", "Charts", "Reports"] as const;

const pricing = [
  {
    name: "Personal",
    price: "Free",
    desc: "Explore datasets locally and build dashboards.",
    features: ["Imports and profiling", "DuckDB SQL", "Core charts", "Local projects"],
    cta: "Get started",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Team",
    price: "Custom",
    desc: "Collaboration, governance and shared workspaces.",
    features: ["Everything in Personal", "Presence and comments", "Audit trails", "Role-based access"],
    cta: "Talk to us",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    desc: "Security reviews, dedicated support, integrations.",
    features: ["SSO and identity", "Compliance support", "Deployment hardening", "SLA"],
    cta: "Request a demo",
    href: "/signup",
    highlight: false,
  },
] as const;

const faqs = [
  {
    q: "Is it really offline-first?",
    a: "Yes. Analysis runs on-device and your data does not need to leave the workstation. You can still integrate external services later, but it is never required.",
  },
  {
    q: "What data sizes can it handle?",
    a: "DuckDB enables fast analytics on large, columnar datasets. Practical limits depend on your device, but the workflow is built for telecom-scale tables and wide schemas.",
  },
  {
    q: "Is this a web app or a desktop app?",
    a: "Both. The UI runs in a Next.js renderer inside an Electron shell: a modern web UI with local access and a hardened boundary via typed IPC.",
  },
  {
    q: "Can I use it outside telecom?",
    a: "Yes. Telecom KPIs are first-class, but the import, query and AI workflow applies to any tabular analytics workload.",
  },
] as const;

/* ──────────────────────────── primitives ──────────────────────────── */

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/5">
        <Radar className="size-[18px] text-cyan-300" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-white">Data Navigator</span>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-[#04121f] shadow-[0_8px_30px_-8px_rgba(34,211,238,0.5)] transition-all hover:bg-cyan-300 active:translate-y-px"
    >
      {children}
    </Link>
  );
}

function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  const cls =
    "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/12 px-5 text-sm font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white active:translate-y-px";
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

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-slate-300">
      {children}
    </span>
  );
}

/* ──────────────────────────── nav ──────────────────────────── */

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled ? "border-b border-white/10 bg-[#07090f]/85 backdrop-blur-xl" : "border-b border-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-6">
        <Link href="#top">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((l) => (
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
          <div className="hidden sm:block">
            <PrimaryLink href="/signup">
              Get started <ArrowUpRight className="size-4" />
            </PrimaryLink>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="grid size-10 place-items-center rounded-xl border border-white/12 text-slate-200 md:hidden"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="gap-0 border-white/10 bg-[#0a0d14] p-0">
              <SheetHeader className="border-b border-white/10">
                <SheetTitle className="text-white">Menu</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 p-4">
                {nav.map((l) => (
                  <SheetClose key={l.href} asChild>
                    <a
                      href={l.href}
                      className="rounded-lg px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      {l.label}
                    </a>
                  </SheetClose>
                ))}
              </div>
              <div className="mt-auto flex flex-col gap-2 border-t border-white/10 p-4">
                <SheetClose asChild>
                  <Link
                    href="/login"
                    className="rounded-lg px-3 py-2.5 text-center text-sm text-slate-300 hover:text-white"
                  >
                    Sign in
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <PrimaryLink href="/signup">
                    Get started <ArrowUpRight className="size-4" />
                  </PrimaryLink>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/* ──────────────────────────── hero ──────────────────────────── */

function HeroDashboard() {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useTransform(py, [0, 1], reduce ? ["0deg", "0deg"] : ["5deg", "-5deg"]);
  const rotateY = useTransform(px, [0, 1], reduce ? ["0deg", "0deg"] : ["-5deg", "5deg"]);

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
      style={{ rotateX, rotateY, transformPerspective: 1200 }}
      initial={reduce ? false : { opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.9)] backdrop-blur-xl"
    >
      {/* header */}
      <div className="flex items-center justify-between px-3 pb-3 pt-2">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Activity className="size-4 text-cyan-300" />
          Operations overview
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[11px] text-emerald-200">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse-dot" /> live
        </span>
      </div>

      {/* mini bento of real charts */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-xl border border-white/10 bg-[#07090f] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">Throughput, Gbps</span>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-200">
              anomaly 16:00
            </span>
          </div>
          <div className="h-36">
            <ThroughputChart />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#07090f] p-3">
          <span className="text-xs text-slate-400">Fleet availability</span>
          <div className="mt-1 h-36">
            <AvailabilityGauge value={98.6} />
          </div>
        </div>

        <div className="col-span-3 rounded-xl border border-white/10 bg-[#07090f] p-3">
          <span className="text-xs text-slate-400">Availability by region</span>
          <div className="mt-2 h-24">
            <RegionBars />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pt-3 font-mono text-[11px] text-slate-500">
        <span>navigator://operations</span>
        <span>sample data</span>
      </div>
    </motion.div>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="relative flex min-h-[100dvh] items-center px-6 pt-24 pb-16">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <motion.div
          className="lg:col-span-5"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-200">
            Offline-first analytics
          </span>

          <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight text-white md:text-6xl">
            Query telecom-scale data, fully{" "}
            <span className="relative inline-block text-cyan-300">
              on-device
              <motion.span
                aria-hidden
                className="absolute -bottom-1 left-0 h-0.5 w-full origin-left rounded-full bg-cyan-400/60"
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </span>
            .
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            Import, profile, query and explain large tabular datasets locally. DuckDB performance and
            embedded AI in a hardened desktop shell.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <PrimaryLink href="/signup">
              Get started <ArrowUpRight className="size-4" />
            </PrimaryLink>
            <GhostLink href="#capabilities">
              See how it works <ArrowRight className="size-4" />
            </GhostLink>
          </div>
        </motion.div>

        <div className="lg:col-span-7">
          <HeroDashboard />
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────── telemetry band ──────────────────────────── */

function Telemetry() {
  return (
    <section className="border-y border-white/10 bg-white/[0.015]">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          <CountStat end={12} suffix="M+" label="rows scanned per second" />
          <CountStat end={98.6} decimals={1} suffix="%" label="fleet availability" />
          <CountStat end={0} label="outbound connections by default" />
          <CountStat end={6} label="AI models running on-device" />
        </div>
        <p className="mt-6 font-mono text-[11px] text-slate-500">Illustrative sample telemetry.</p>
      </div>
    </section>
  );
}

/* ──────────────────────────── capabilities ──────────────────────────── */

function Capabilities() {
  return (
    <section id="capabilities" className="mx-auto max-w-7xl px-6 py-28">
      <Reveal className="max-w-2xl">
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Built for the messy reality of telecom data engineering.
        </h2>
        <p className="mt-5 text-lg text-slate-400">
          Every part of the workflow maps to a real stage and a real trust boundary.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-6">
        {/* A — large, with real bar chart */}
        <Reveal className="lg:col-span-4">
          <SpotlightCard className="h-full">
            <div className="flex h-full flex-col p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <Database className="size-5 text-cyan-300" />
                    <h3 className="text-xl font-semibold text-white">Query at operator scale</h3>
                  </div>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                    DuckDB SQL across millions of rows: joins, windows and aggregations resolved in
                    milliseconds, entirely in-process.
                  </p>
                </div>
                <div className="hidden gap-1.5 sm:flex">
                  <Chip>DuckDB</Chip>
                  <Chip>SQL</Chip>
                </div>
              </div>
              <div className="mt-6 h-40 flex-1">
                <RegionBars />
              </div>
              <div className="mt-2 font-mono text-[11px] text-slate-500">
                availability by region, sample data
              </div>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* B — ingest */}
        <Reveal delay={0.05} className="lg:col-span-2">
          <SpotlightCard className="h-full">
            <div className="flex h-full flex-col p-6">
              <FileSpreadsheet className="size-5 text-cyan-300" />
              <h3 className="mt-4 text-xl font-semibold text-white">Ingest anything tabular</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Schema inference, type casting and fast import in a single pass.
              </p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                <Chip>CSV</Chip>
                <Chip>Parquet</Chip>
                <Chip>XLSX</Chip>
                <Chip>JSON</Chip>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* C — AI */}
        <Reveal className="lg:col-span-2">
          <SpotlightCard className="h-full">
            <div className="flex h-full flex-col p-6">
              <Brain className="size-5 text-cyan-300" />
              <h3 className="mt-4 text-xl font-semibold text-white">AI-assisted analysis</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Anomaly detection, correlation and short-horizon forecasts, computed on-device.
              </p>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* D — lineage */}
        <Reveal delay={0.05} className="lg:col-span-2">
          <SpotlightCard className="h-full">
            <div className="flex h-full flex-col p-6">
              <GitBranch className="size-5 text-cyan-300" />
              <h3 className="mt-4 text-xl font-semibold text-white">Lineage you can defend</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Files to tables to queries to charts to reports, fully connected and replayable.
              </p>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* E — KPIs, tinted background */}
        <Reveal delay={0.1} className="lg:col-span-2">
          <div className="h-full rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-transparent p-6">
            <Radar className="size-5 text-cyan-300" />
            <h3 className="mt-4 text-xl font-semibold text-white">Telecom-first KPIs</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Availability, throughput, latency, drop rate and churn indicators out of the box.
            </p>
          </div>
        </Reveal>

        {/* F — full width, collaboration + sparkline */}
        <Reveal className="lg:col-span-6">
          <SpotlightCard className="h-full">
            <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-2 sm:items-center">
              <div>
                <div className="flex items-center gap-2.5">
                  <MessageSquareText className="size-5 text-cyan-300" />
                  <h3 className="text-xl font-semibold text-white">Collaboration-ready</h3>
                </div>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                  Presence, threaded discussion and shareable narratives engineered for operations
                  teams that need answers they can defend.
                </p>
              </div>
              <div className="h-24 w-full">
                <Sparkline />
              </div>
            </div>
          </SpotlightCard>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────── architecture ──────────────────────────── */

function Architecture() {
  return (
    <section id="architecture" className="border-y border-white/10 bg-white/[0.015] px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Sovereign by construction.
          </h2>
          <p className="mt-5 text-lg text-slate-400">
            The UI runs in an isolated world and every sensitive capability crosses a typed boundary.
            Designed for air-gapped and regulated environments.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.k} delay={i * 0.05}>
                <div className="h-full rounded-2xl border border-white/10 bg-[#07090f] p-6">
                  <Icon className="size-5 text-cyan-300" />
                  <div className="mt-4 text-base font-semibold text-white">{p.k}</div>
                  <div className="mt-1 font-mono text-[12px] text-cyan-300/80">{p.v}</div>
                  <div className="mt-3 text-sm text-slate-400">{p.note}</div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* animated data pipeline */}
        <Reveal delay={0.1}>
          <div className="mt-4 rounded-2xl border border-white/10 bg-[#07090f] px-6 py-8">
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              {flow.map((step, i) => (
                <div key={step} className="flex items-center gap-3 sm:flex-1">
                  <span className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm text-slate-200 sm:w-auto sm:flex-1">
                    {step}
                  </span>
                  {i < flow.length - 1 && (
                    <span className="relative hidden h-px w-10 overflow-hidden rounded-full bg-white/10 sm:block">
                      <span className="absolute inset-0 flow-shimmer" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ──────────────────────────── pricing ──────────────────────────── */

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-28">
      <Reveal className="max-w-2xl">
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Start locally. Add governance when you need it.
        </h2>
        <p className="mt-5 text-lg text-slate-400">
          One workflow, three ways to run it. Keep your data sovereignty at every tier.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        {pricing.map((p, i) => (
          <Reveal key={p.name} delay={i * 0.05}>
            <div
              className={[
                "flex h-full flex-col rounded-2xl border p-7",
                p.highlight
                  ? "border-cyan-400/40 bg-gradient-to-b from-cyan-400/[0.07] to-transparent lg:-my-2 lg:py-9"
                  : "border-white/10 bg-white/[0.02]",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-white">{p.name}</span>
                {p.highlight && (
                  <span className="rounded-full bg-cyan-400/15 px-2.5 py-0.5 font-mono text-[11px] text-cyan-200">
                    most teams
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-end gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-white">{p.price}</span>
                {p.price !== "Custom" && <span className="pb-1.5 text-sm text-slate-500">/ user</span>}
              </div>
              <p className="mt-3 text-sm text-slate-400">{p.desc}</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <Check className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-2">
                {p.highlight ? (
                  <Link
                    href={p.href}
                    className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-[#04121f] transition-all hover:bg-cyan-300 active:translate-y-px"
                  >
                    {p.cta} <ArrowUpRight className="size-4" />
                  </Link>
                ) : (
                  <Link
                    href={p.href}
                    className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 px-5 text-sm font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/5 hover:text-white active:translate-y-px"
                  >
                    {p.cta} <ArrowUpRight className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────── faq ──────────────────────────── */

function Faq() {
  return (
    <section id="faq" className="border-t border-white/10 px-6 py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Questions, answered.
          </h2>
          <p className="mt-5 text-lg text-slate-400">
            Practical details for teams evaluating a local-first analytics stack.
          </p>
          <div className="mt-8">
            <GhostLink href="/login">
              Sign in to your workspace <ArrowRight className="size-4" />
            </GhostLink>
          </div>
        </Reveal>

        <div className="lg:col-span-7">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((f) => (
              <AccordionItem key={f.q} value={f.q} className="border-white/10">
                <AccordionTrigger className="py-5 text-left text-base text-white hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-slate-400">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────── cta + footer ──────────────────────────── */

function CtaBand() {
  return (
    <section className="px-6 py-28">
      <Reveal className="mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-cyan-400/[0.08] to-transparent px-8 py-16 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/5">
            <Lock className="size-5 text-cyan-300" />
          </div>
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Start navigating your data, locally and securely.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
            Create an account, import your first dataset and generate a narrative report in minutes.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryLink href="/signup">
              Get started <ArrowUpRight className="size-4" />
            </PrimaryLink>
            <GhostLink href="/login">
              Sign in <ArrowRight className="size-4" />
            </GhostLink>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 md:flex-row">
        <Logo />
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-400">
          {nav.map((l) => (
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

/* ──────────────────────────── page ──────────────────────────── */

export default function Page() {
  return (
    <div id="top" className="relative min-h-[100dvh] overflow-hidden bg-[#07090f] text-slate-200">
      {/* moving aurora wash (gated by reduced motion) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="aurora absolute -left-1/4 -top-1/3 h-[80vh] w-[80vh] rounded-full opacity-90 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.10), transparent 65%)" }}
        />
        <div
          className="aurora absolute -right-1/4 top-1/4 h-[70vh] w-[70vh] rounded-full opacity-80 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.08), transparent 65%)", animationDelay: "-7s" }}
        />
      </div>

      <TopNav />
      <Hero />
      <Telemetry />
      <Capabilities />
      <Architecture />
      <Pricing />
      <Faq />
      <CtaBand />
      <Footer />
    </div>
  );
}
