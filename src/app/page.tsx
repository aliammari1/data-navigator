"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  Database,
  GitBranch,
  Layers,
  Shield,
  Sparkles,
  Upload,
  Users,
  Wifi,
  Zap,
} from "lucide-react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Animated counter ─────────────────────────────────────────────────────────

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const dur = 1500;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - t0) / dur, 1);
          const ease = 1 - (1 - p) ** 3;
          setVal(Math.round(ease * to));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

// ─── Hero chart ───────────────────────────────────────────────────────────────

const heroChartOption = {
  backgroundColor: "transparent",
  animation: true,
  animationDuration: 1800,
  animationEasing: "cubicOut",
  grid: [
    { top: 10, right: "52%", bottom: 10, left: 10, containLabel: true },
    { top: 10, right: 10, bottom: 10, left: "52%", containLabel: true },
  ],
  xAxis: [
    {
      type: "category",
      gridIndex: 0,
      show: false,
      data: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
    },
    { type: "value", gridIndex: 1, show: false },
  ],
  yAxis: [
    { type: "value", gridIndex: 0, show: false },
    {
      type: "category",
      gridIndex: 1,
      show: false,
      data: ["APAC", "EMEA", "LATAM", "NA", "MEA"],
    },
  ],
  tooltip: { trigger: "none" },
  series: [
    {
      name: "Revenue",
      type: "line",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: [
        82000, 94000, 88000, 110000, 105000, 122000, 118000, 135000, 130000,
        148000, 142000, 162000,
      ],
      smooth: true,
      symbol: "none",
      lineStyle: { color: "#818cf8", width: 2.5 },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: "rgba(129,140,248,0.3)" },
            { offset: 1, color: "transparent" },
          ],
        },
      },
    },
    {
      name: "Users",
      type: "bar",
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: [
        3200, 3800, 3500, 4200, 4000, 4800, 4600, 5200, 5100, 5800, 5600, 6400,
      ],
      itemStyle: { color: "rgba(99,102,241,0.3)", borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 14,
    },
    {
      name: "Region",
      type: "bar",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: [48000, 62000, 31000, 95000, 27000],
      itemStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: "#4f46e5" },
            { offset: 1, color: "#7c3aed" },
          ],
        },
        borderRadius: [0, 3, 3, 0],
      },
      barMaxWidth: 16,
    },
  ],
};

// ─── Feature cards ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    color: "from-violet-500 to-indigo-600",
    glow: "shadow-violet-500/20",
    title: "Offline AI Assistant",
    description:
      "Natural language → SQL in milliseconds. No API key, no internet required. Ask questions in plain English, get instant DuckDB results.",
    badge: "100% Offline",
  },
  {
    icon: Database,
    color: "from-indigo-500 to-blue-600",
    glow: "shadow-indigo-500/20",
    title: "DuckDB WASM Engine",
    description:
      "Full SQL engine running in your browser via WebAssembly. Joins, aggregations, window functions — on millions of rows, offline.",
    badge: "In-Browser SQL",
  },
  {
    icon: BarChart3,
    color: "from-emerald-500 to-teal-600",
    glow: "shadow-emerald-500/20",
    title: "Smart Visualisations",
    description:
      "Auto-recommended ECharts based on your data's column types and cardinality. One click from query to publication-ready chart.",
    badge: "AI-Recommended",
  },
  {
    icon: GitBranch,
    color: "from-amber-500 to-orange-600",
    glow: "shadow-amber-500/20",
    title: "Data Lineage Graph",
    description:
      "Track every transformation: where data came from, what changed it, and what depends on it. Interactive DAG with impact analysis.",
    badge: "Full Lineage",
  },
  {
    icon: Users,
    color: "from-rose-500 to-pink-600",
    glow: "shadow-rose-500/20",
    title: "Real-time Collaboration",
    description:
      "Comments, change tracking, live cursors, and team chat — all offline-first with local sync. Works without a backend.",
    badge: "Offline-first",
  },
  {
    icon: Layers,
    color: "from-cyan-500 to-sky-600",
    glow: "shadow-cyan-500/20",
    title: "Transform Pipelines",
    description:
      "Build composable ETL pipelines with a visual editor. Filter, aggregate, join, pivot — with full SQL under the hood.",
    badge: "Visual ETL",
  },
];

const STATS = [
  { value: 10, suffix: "M+", label: "Rows queryable in-browser" },
  { value: 0, suffix: "ms", label: "Network latency (offline)" },
  { value: 100, suffix: "%", label: "Data stays on your device" },
  { value: 11, suffix: "", label: "Screens, all interconnected" },
];

const TECH = [
  { name: "DuckDB WASM", desc: "SQL engine" },
  { name: "Next.js 16", desc: "Framework" },
  { name: "ECharts 6", desc: "Visualisations" },
  { name: "Framer Motion", desc: "Animations" },
  { name: "Transformers.js", desc: "Offline AI" },
  { name: "Zustand", desc: "State" },
  { name: "TF.js", desc: "ML engine" },
  { name: "Tailwind 4", desc: "Styling" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0.3]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 bg-background/40 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Database className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-foreground">
            DataNavigator
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          {["Features", "How it Works", "Tech Stack"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase().replace(/ /g, "-")}`}
              className="hover:text-foreground transition-colors"
            >
              {label}
            </a>
          ))}
        </div>
        <Link
          href="/login?redirect=/dashboard"
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 rounded-xl text-sm font-semibold text-primary-foreground transition-colors shadow-lg shadow-indigo-500/25"
        >
          Open App <ArrowRight className="w-4 h-4" />
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-16 overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-225 h-150 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 left-1/4 w-100 h-100 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 w-75 h-75 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="text-center max-w-4xl mx-auto z-10"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300 mb-6"
          >
            <Sparkles className="w-3.5 h-3.5" />
            100% Offline · DuckDB WASM · No Backend Required
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6"
          >
            <span className="text-foreground">The data tool</span>
            <br />
            <span className="bg-linear-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              that never leaves you.
            </span>
          </motion.h1>

          {/* Subline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Query, transform, visualise and collaborate on data — entirely in
            your browser. Full SQL engine. Offline AI. Real-time insights. Zero
            cloud dependency.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Link
              href="/login?redirect=/dashboard"
              className="flex items-center gap-2.5 px-7 py-4 bg-primary hover:bg-primary/90 rounded-2xl text-base font-bold text-primary-foreground transition-all shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5"
            >
              Launch Dashboard
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#features"
              className="flex items-center gap-2 px-7 py-4 bg-muted hover:bg-accent border border-border rounded-2xl text-base font-medium text-foreground transition-colors"
            >
              See Features
              <ChevronDown className="w-4 h-4" />
            </a>
          </motion.div>

          {/* Trust signals */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
          >
            {[
              { icon: Shield, label: "Data never leaves your device" },
              { icon: Wifi, label: "Works fully offline" },
              { icon: Zap, label: "Millisecond query speed" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-indigo-400" /> {label}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Hero chart */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          className="relative w-full max-w-4xl mx-auto mt-4 z-10"
        >
          <div className="relative bg-card backdrop-blur border border-border rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            {/* Fake chrome bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted">
              <div className="flex gap-1.5">
                {["bg-red-400", "bg-amber-400", "bg-emerald-400"].map((c) => (
                  <div
                    key={c}
                    className={`w-3 h-3 rounded-full ${c} opacity-60`}
                  />
                ))}
              </div>
              <div className="flex-1 text-center text-[11px] text-muted-foreground font-mono">
                SELECT department, SUM(revenue) as total FROM sales GROUP BY
                department
              </div>
            </div>
            <ReactECharts
              option={heroChartOption}
              style={{ height: 220 }}
              opts={{ renderer: "canvas" }}
            />
          </div>
          {/* Floating badges */}
          <div className="absolute -top-4 -left-4 bg-card border border-emerald-500/30 rounded-xl px-3 py-2 text-xs shadow-xl">
            <div className="text-emerald-400 font-bold">12.4M rows</div>
            <div className="text-muted-foreground">processed in 42ms</div>
          </div>
          <div className="absolute -bottom-4 -right-4 bg-card border border-indigo-500/30 rounded-xl px-3 py-2 text-xs shadow-xl">
            <div className="text-indigo-400 font-bold flex items-center gap-1">
              <Brain className="w-3 h-3" /> AI insight
            </div>
            <div className="text-muted-foreground">APAC revenue up 34%</div>
          </div>
        </motion.div>
      </section>

      {/* ── Stats ── */}
      <section className="py-20 px-6 border-y border-border bg-muted">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="text-4xl md:text-5xl font-black text-foreground mb-1 tabular-nums">
                <Counter to={s.value} suffix={s.suffix} />
              </div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs text-indigo-300 mb-4">
              <Sparkles className="w-3.5 h-3.5" /> Capabilities
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-foreground mb-4">
              Everything you need.
              <br />
              <span className="text-muted-foreground">Nothing you don't.</span>
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Built to outperform cloud-based data tools — without the latency,
              cost, or privacy concerns.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.07 }}
                  className="group relative bg-card border border-border rounded-2xl p-6 hover:border-border transition-all overflow-hidden"
                >
                  <div
                    className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-linear-to-br ${f.color} mask-[radial-gradient(ellipse_at_top_left,black_30%,transparent_70%)] opacity-5`}
                  />
                  <div
                    className={`w-11 h-11 rounded-2xl bg-linear-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg ${f.glow}`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-bold text-foreground">
                      {f.title}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 bg-muted border border-border rounded-full text-muted-foreground whitespace-nowrap ml-2">
                      {f.badge}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="py-24 px-6 bg-muted border-y border-border"
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-foreground mb-4">
              How it works
            </h2>
            <p className="text-muted-foreground">
              From raw file to AI-powered insights in three steps.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                icon: Upload,
                title: "Upload your data",
                desc: "Drag & drop CSV, JSON, Parquet, or Excel. Parsed instantly in-browser — no server needed.",
                color: "text-indigo-400",
              },
              {
                step: "02",
                icon: Database,
                title: "Query with DuckDB",
                desc: "Full SQL engine runs via WebAssembly. Use the AI assistant or write SQL directly.",
                color: "text-violet-400",
              },
              {
                step: "03",
                icon: BarChart3,
                title: "Visualise & share",
                desc: "Auto-recommended charts, lineage tracking, collaboration — all offline-first.",
                color: "text-emerald-400",
              },
            ].map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="text-center"
                >
                  <div className="text-5xl font-black text-white/5 mb-2">
                    {step.step}
                  </div>
                  <div
                    className={`w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center mx-auto mb-4 ${step.color}`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section id="tech-stack" className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black text-foreground mb-3">
            Built on the best
          </h2>
          <p className="text-muted-foreground mb-12">
            Modern, open-source technologies. All offline-capable.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TECH.map((t) => (
              <div
                key={t.name}
                className="bg-muted border border-border rounded-2xl py-5 px-4 hover:border-border transition-colors"
              >
                <div className="text-sm font-bold text-foreground">
                  {t.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="relative bg-linear-to-br from-indigo-950 to-violet-950 border border-indigo-500/20 rounded-3xl p-12 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15),transparent_70%)]" />
            <div className="relative z-10">
              <h2 className="text-4xl font-black text-foreground mb-4">
                Start exploring your data.
                <br />
                Right now. Offline.
              </h2>
              <p className="text-muted-foreground mb-8">
                Local signup. No API key. No cloud. Just open the dashboard.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/login?redirect=/dashboard"
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 rounded-2xl text-base font-bold text-primary-foreground transition-all shadow-xl shadow-indigo-500/30"
                >
                  Launch Dashboard <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
              <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
                {["Local account", "No API key", "No data upload to cloud"].map(
                  (t) => (
                    <span key={t} className="flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      {t}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-6 border-t border-border text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-muted-foreground font-semibold">
            DataNavigator
          </span>
        </div>
        <p>Open source · Offline first · Built with Next.js 16 + DuckDB WASM</p>
      </footer>
    </div>
  );
}
