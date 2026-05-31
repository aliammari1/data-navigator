"use client";

import ReactECharts from "echarts-for-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  Check,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  Eye,
  FileJson,
  FileSpreadsheet,
  GitBranch,
  Layers,
  LineChart,
  Loader2,
  Lock,
  MapPin,
  Menu,
  Mic,
  Monitor,
  Network,
  Play,
  Radar,
  ServerOff,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";

const layers = [
  {
    title: "Renderer · React 19 + Next.js 16",
    desc: "Isolated UI process. Strict CSP, no Node access. Visualization canvas, SQL editor, dashboards.",
    icon: Monitor,
    items: ["UI", "Charts", "Editor", "Dashboards"],
    accent: "text-primary",
  },
  {
    title: "Electron Main · Controlled IPC",
    desc: "Brokered, schema-validated channels between renderer and trusted services. Context isolation enforced.",
    icon: Shield,
    items: ["IPC", "Permissions", "Auth", "Lifecycle"],
    accent: "text-secondary",
  },
  {
    title: "Analytical Core · DuckDB + better-sqlite",
    desc: "Columnar OLAP engine for joins, window functions and aggregations. Metadata in embedded SQLite.",
    icon: Database,
    items: ["DuckDB", "Catalog", "Cache", "Lineage"],
    accent: "text-primary",
  },
  {
    title: "Workers · ML · LLM · Python · Voice",
    desc: "Off-thread compute. TensorFlow.js for forecasts, local LLM for narratives, Python bridge, voice commands.",
    icon: Brain,
    items: ["TF.js", "LLM", "Python", "Voice"],
    accent: "text-secondary",
  },
];

export const Architecture = () => (
  <div className="relative mx-auto max-w-5xl">
    <div className="absolute inset-y-0 left-1/2 -z-10 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-border to-transparent" />
    <div className="space-y-4">
      {layers.map((l, i) => {
        const Icon = l.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="group relative grid grid-cols-12 gap-4 rounded-xl border border-border bg-card-gradient p-5 shadow-card transition-all hover:border-primary/40 hover:shadow-glow"
          >
            <div className="col-span-12 flex items-center gap-3 md:col-span-4">
              <div
                className={`grid h-10 w-10 place-items-center rounded-md border border-border bg-background/60 ${l.accent}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Layer {String(i + 1).padStart(2, "0")}
                </div>
                <div className="font-display text-sm font-semibold">
                  {l.title}
                </div>
              </div>
            </div>
            <p className="col-span-12 self-center text-sm text-muted-foreground md:col-span-5">
              {l.desc}
            </p>
            <div className="col-span-12 flex flex-wrap items-center gap-1.5 md:col-span-3 md:justify-end">
              {l.items.map((it) => (
                <span
                  key={it}
                  className="rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {it}
                </span>
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Code2 className="h-3.5 w-3.5 text-primary" />
        Typed IPC contracts
      </span>
      <span className="text-border">·</span>
      <span className="inline-flex items-center gap-1.5">
        <Cpu className="h-3.5 w-3.5 text-secondary" />
        Off-thread compute
      </span>
      <span className="text-border">·</span>
      <span className="inline-flex items-center gap-1.5">
        <Mic className="h-3.5 w-3.5 text-primary" />
        Voice ready
      </span>
    </div>
  </div>
);

const sqlLine = (txt: string, c: string) => (
  <div className="whitespace-pre">
    <span className="text-muted-foreground">{txt}</span>
    <span className={c} />
  </div>
);

const chartOption = {
  grid: { left: 28, right: 12, top: 14, bottom: 18 },
  tooltip: { show: false },
  xAxis: {
    type: "category",
    data: ["00", "04", "08", "12", "16", "20", "24"],
    axisLine: { lineStyle: { color: "hsl(215 30% 22%)" } },
    axisLabel: { color: "hsl(215 20% 55%)", fontSize: 9 },
    axisTick: { show: false },
  },
  yAxis: {
    type: "value",
    splitLine: { lineStyle: { color: "hsl(215 30% 16%)" } },
    axisLabel: { color: "hsl(215 20% 55%)", fontSize: 9 },
  },
  series: [
    {
      type: "line",
      smooth: true,
      symbol: "none",
      data: [42, 58, 71, 65, 82, 96, 88],
      lineStyle: { color: "hsl(188 95% 60%)", width: 2 },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: "hsl(188 95% 55% / 0.35)" },
            { offset: 1, color: "hsl(188 95% 55% / 0)" },
          ],
        },
      },
    },
    {
      type: "line",
      smooth: true,
      symbol: "none",
      data: [30, 40, 48, 52, 60, 72, 64],
      lineStyle: { color: "hsl(215 85% 65%)", width: 1.5, type: "dashed" },
    },
  ],
};

export const Cockpit = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="relative mx-auto w-full max-w-6xl"
    >
      {/* outer glow */}
      <div className="absolute -inset-x-20 -top-10 bottom-0 -z-10 rounded-[3rem] bg-primary/10 blur-3xl" />
      <div className="rounded-2xl border border-border bg-card-gradient shadow-elevated">
        {/* window chrome */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Database className="h-3 w-3 text-primary" />
            workspace://telecom_q3_2026.duckdb
          </div>
          <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2 py-0.5 font-mono text-[10px] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
            LOCAL
          </div>
        </div>

        <div className="grid grid-cols-12 gap-3 p-3">
          {/* Left: import + agent */}
          <div className="col-span-12 space-y-3 lg:col-span-3">
            <Panel
              title="Import"
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
            >
              {[
                {
                  i: <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />,
                  n: "cdr_q3.parquet",
                  s: "2.4 GB",
                  ok: true,
                },
                {
                  i: <FileJson className="h-3.5 w-3.5 text-secondary" />,
                  n: "kpi_4g.json",
                  s: "84 MB",
                  ok: true,
                },
                {
                  i: <FileSpreadsheet className="h-3.5 w-3.5 text-warning" />,
                  n: "churn_train.csv",
                  s: "210 MB",
                  ok: false,
                },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[11px] hover:bg-muted/60"
                >
                  {f.i}
                  <span className="flex-1 truncate font-mono">{f.n}</span>
                  <span className="font-mono text-muted-foreground">{f.s}</span>
                  {f.ok ? (
                    <Check className="h-3 w-3 text-success" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin text-warning" />
                  )}
                </div>
              ))}
            </Panel>

            <Panel
              title="Agent Canvas"
              icon={<Sparkles className="h-3.5 w-3.5" />}
            >
              <ol className="space-y-2 text-[11px]">
                {[
                  { k: "Profile", s: "done", c: "text-success" },
                  { k: "Detect anomalies (5σ)", s: "done", c: "text-success" },
                  {
                    k: "Correlate KPI ↔ churn",
                    s: "running",
                    c: "text-primary",
                  },
                  {
                    k: "Narrative summary",
                    s: "queued",
                    c: "text-muted-foreground",
                  },
                ].map((step, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${step.c === "text-primary" ? "bg-primary animate-pulse-dot" : step.c === "text-success" ? "bg-success" : "bg-muted-foreground/50"}`}
                    />
                    <span className={step.c}>{step.k}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {step.s}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          {/* Center: SQL + chart */}
          <div className="col-span-12 space-y-3 lg:col-span-6">
            <Panel
              title="DuckDB SQL"
              icon={<Database className="h-3.5 w-3.5" />}
              right={
                <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                  <Play className="h-2.5 w-2.5" /> 184 ms · 12.4M rows
                </span>
              }
            >
              <pre className="font-mono text-[11px] leading-relaxed text-foreground/90">
                <span className="text-secondary">WITH</span> hourly{" "}
                <span className="text-secondary">AS</span> (
                <span className="text-secondary">SELECT</span> date_trunc(
                <span className="text-success">'hour'</span>, ts){" "}
                <span className="text-secondary">AS</span> h, cell_id,
                <span className="text-primary">avg</span>(throughput_mbps){" "}
                <span className="text-secondary">AS</span> avg_tp,
                <span className="text-primary">approx_quantile</span>
                (latency_ms, 0.95) <span className="text-secondary">AS</span>{" "}
                p95
                <span className="text-secondary">FROM</span> read_parquet(
                <span className="text-success">'cdr_q3.parquet'</span>)
                <span className="text-secondary">GROUP BY</span> 1, 2 )
                <span className="text-secondary">SELECT</span> h, cell_id,
                avg_tp, p95
                <span className="text-secondary">FROM</span> hourly
                <span className="text-secondary">WHERE</span> p95 {">"} 220
                <span className="text-secondary">ORDER BY</span> p95{" "}
                <span className="text-secondary">DESC</span>
                <span className="ml-0.5 inline-block h-3 w-1.5 -mb-0.5 bg-primary animate-pulse-dot" />
              </pre>
            </Panel>

            <Panel
              title="Throughput vs Forecast — Cell 0xA14"
              icon={<Activity className="h-3.5 w-3.5" />}
              right={
                <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-3 rounded bg-primary" /> actual
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-3 rounded bg-secondary" /> forecast
                  </span>
                </div>
              }
            >
              <div className="h-40">
                <ReactECharts
                  option={chartOption}
                  style={{ height: "100%", width: "100%" }}
                  opts={{ renderer: "svg" }}
                />
              </div>
            </Panel>
          </div>

          {/* Right: anomaly + kpis + lineage */}
          <div className="col-span-12 space-y-3 lg:col-span-3">
            <Panel
              title="Anomaly"
              icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}
            >
              <div className="rounded-md border border-warning/30 bg-warning/5 p-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-warning animate-pulse-dot" />
                  <div className="flex-1">
                    <p className="text-[11px] font-medium">
                      QoS drop · zone NORD-3
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      p95 latency 312 ms · +4.2σ
                    </p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-7 gap-0.5">
                  {[2, 3, 2, 4, 3, 9, 7].map((h, i) => (
                    <div
                      key={i}
                      className="rounded-sm bg-warning/30"
                      style={{ height: 4 + h * 2 }}
                    />
                  ))}
                </div>
              </div>
            </Panel>

            <Panel
              title="Telecom KPIs"
              icon={<Activity className="h-3.5 w-3.5" />}
            >
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "Avail.", v: "99.84%", c: "text-success" },
                  { k: "Churn", v: "2.1%", c: "text-warning" },
                  { k: "DL Mbps", v: "184", c: "text-primary" },
                  { k: "Drop", v: "0.12%", c: "text-success" },
                ].map((k, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-background/40 p-2"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {k.k}
                    </div>
                    <div
                      className={`font-display text-base font-semibold ${k.c}`}
                    >
                      {k.v}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Lineage" icon={<GitBranch className="h-3.5 w-3.5" />}>
              <svg viewBox="0 0 200 100" className="h-24 w-full">
                {[
                  ["file", 14, 22],
                  ["table", 78, 22],
                  ["query", 142, 22],
                  ["chart", 78, 78],
                  ["report", 142, 78],
                ].map(([label, x, y], i) => (
                  <g key={i}>
                    <rect
                      x={x as number}
                      y={y as number}
                      width="44"
                      height="18"
                      rx="4"
                      fill="hsl(220 40% 12%)"
                      stroke="hsl(var(--border))"
                    />
                    <text
                      x={(x as number) + 22}
                      y={(y as number) + 12}
                      textAnchor="middle"
                      fontSize="8"
                      fill="hsl(var(--foreground))"
                      fontFamily="monospace"
                    >
                      {label as string}
                    </text>
                  </g>
                ))}
                {[
                  ["M58 31 L78 31"],
                  ["M122 31 L142 31"],
                  ["M100 40 L100 78"],
                  ["M142 78 L122 40"],
                ].map(([d], i) => (
                  <path
                    key={i}
                    d={d as string}
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.2"
                    fill="none"
                    className="animate-flow"
                  />
                ))}
                <circle
                  cx="186"
                  cy="31"
                  r="3"
                  fill="hsl(var(--success))"
                  className="animate-pulse-dot"
                />
              </svg>
            </Panel>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 font-mono text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3 text-primary" />
              WORKER · ml-anomaly
            </span>
            <span>RAM 1.8 GB</span>
            <span>RENDERER · isolated</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
            offline · 0 outbound connections
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Panel = ({
  title,
  icon,
  right,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border bg-background/40">
    <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {right}
    </div>
    <div className="p-3">{children}</div>
  </div>
);

export const Logo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    <div className="relative h-9 w-9">
      <svg viewBox="0 0 36 36" className="h-9 w-9">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" />
          </linearGradient>
        </defs>
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="9"
          fill="hsl(var(--card))"
          stroke="url(#lg)"
          strokeWidth="1.5"
        />
        <circle cx="11" cy="12" r="2" fill="hsl(var(--primary))" />
        <circle cx="25" cy="12" r="2" fill="hsl(var(--secondary))" />
        <circle cx="18" cy="24" r="2" fill="hsl(var(--primary-glow))" />
        <path
          d="M11 12 L25 12 L18 24 Z"
          stroke="url(#lg)"
          strokeWidth="1.2"
          fill="none"
        />
        <circle cx="18" cy="18" r="1.4" fill="hsl(var(--foreground))" />
      </svg>
      <motion.div
        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success"
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
    <div className="flex flex-col leading-none">
      <span className="font-display text-[15px] font-semibold tracking-tight">
        Data Navigator
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        local · duckdb · ai
      </span>
    </div>
  </div>
);

const links = [
  { href: "#product", label: "Product" },
  { href: "#architecture", label: "Architecture" },
  { href: "#ai", label: "AI" },
  { href: "#telecom", label: "Telecom" },
  { href: "#security", label: "Security" },
];

export const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "glass border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="container flex h-16 items-center justify-between">
        <a href="#top">
          <Logo />
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="/login?redirect=/dashboard"
            className="group hidden items-center gap-1.5 rounded-md bg-primary-gradient px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:scale-[1.02] sm:inline-flex"
          >
            Open Platform
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
          <button
            onClick={() => setOpen(!open)}
            className="rounded-md border border-border p-2 md:hidden"
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="glass border-t border-border md:hidden">
          <div className="container flex flex-col py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="px-2 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <a
              href="/login?redirect=/dashboard"
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary-gradient px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Open Platform <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
};

const metrics = [
  {
    n: "01",
    k: "DEPLOYMENT",
    v: "0",
    l: "Cloud dependencies",
    s: "All compute happens on device.",
  },
  {
    n: "02",
    k: "PERFORMANCE",
    v: "1×",
    l: "Local SQL engine",
    s: "DuckDB columnar OLAP, in-process.",
  },
  {
    n: "03",
    k: "INTELLIGENCE",
    v: "ML",
    l: "Assisted insights",
    s: "Anomalies, forecasts, narratives.",
  },
  {
    n: "04",
    k: "PROTOCOL",
    v: "IPC",
    l: "Secure architecture",
    s: "Context-isolated renderer.",
  },
];

const workflow = [
  {
    n: "01",
    t: "Ingest",
    d: "CSV, Parquet, JSON, Excel. Auto-detect schema and types.",
    icon: FileSpreadsheet,
    m: "PARQUET · CSV · JSON",
  },
  {
    n: "02",
    t: "Profile",
    d: "Quality scores, missing values, duplicates, distributions, descriptive stats.",
    icon: Eye,
    m: "AUTO DETECT",
  },
  {
    n: "03",
    t: "Query",
    d: "DuckDB SQL on million-row tables. Joins, windows, aggregations in milliseconds.",
    icon: Database,
    m: "DUCKDB OLAP",
  },
  {
    n: "04",
    t: "Reason",
    d: "On-device anomaly detection, trend forecasting, correlation analysis.",
    icon: Brain,
    m: "EMBEDDED ML",
  },
  {
    n: "05",
    t: "Report",
    d: "Data Formulator canvas, auto-SQL from chart specs, narrative telecom reports.",
    icon: BarChart3,
    m: "NARRATIVE OUT",
  },
];

const aiFeatures = [
  {
    t: "Anomaly detection",
    d: "Statistical and ML outlier scoring across KPIs, with zone and time slicing.",
    icon: AlertTriangle,
  },
  {
    t: "Trend forecasting",
    d: "Short-horizon prediction for traffic, throughput and load curves.",
    icon: TrendingUp,
  },
  {
    t: "Correlation analysis",
    d: "Relationships between KPIs, segments and operational events.",
    icon: Activity,
  },
  {
    t: "Natural language queries",
    d: "Ask in plain language, get SQL, a chart and an explanation back.",
    icon: Sparkles,
  },
  {
    t: "Automatic narratives",
    d: "One-paragraph insight summaries for every analysis run.",
    icon: Brain,
  },
  {
    t: "Agent canvas",
    d: "Multi-step reasoning broken into observable, replayable steps with lineage.",
    icon: Workflow,
  },
];

const telecom = [
  {
    t: "Network KPI monitoring",
    d: "Availability, throughput, latency, drop rate across cells and zones.",
    icon: Radar,
  },
  {
    t: "QoS analysis",
    d: "Per-service quality with p95 and p99 latency, jitter views.",
    icon: LineChart,
  },
  {
    t: "Traffic pattern analysis",
    d: "Hourly, daily, seasonal decomposition with anomaly overlays.",
    icon: Activity,
  },
  {
    t: "Churn risk",
    d: "Cohort and individual churn scoring driven by usage and QoS signals.",
    icon: Users,
  },
  {
    t: "Fraud detection",
    d: "Behavioural and CDR-based scoring for suspicious activity patterns.",
    icon: AlertTriangle,
  },
  {
    t: "Infrastructure planning",
    d: "Capacity and load forecasting to inform rollouts and densification.",
    icon: MapPin,
  },
];

const security = [
  {
    t: "Local processing",
    d: "Data never leaves the workstation. Compile, query and train on-device.",
    icon: ServerOff,
  },
  {
    t: "Context isolation",
    d: "Renderer runs in an isolated world with no Node integration.",
    icon: Layers,
  },
  {
    t: "Controlled IPC",
    d: "Every renderer-to-main call goes through a typed, allow-listed bridge.",
    icon: Network,
  },
  {
    t: "Restrictive CSP",
    d: "Tight Content Security Policy blocks remote scripts and inline eval.",
    icon: Shield,
  },
  {
    t: "SQL sanitization",
    d: "Queries are parameterized and validated against a parsed AST before execution.",
    icon: Lock,
  },
  {
    t: "Data sovereignty",
    d: "Your data stays under your jurisdiction and your policies, by construction.",
    icon: CheckCircle2,
  },
];

const stack = [
  "Electron",
  "Next.js 16",
  "React 19",
  "TypeScript",
  "DuckDB",
  "TensorFlow.js",
  "Web Workers",
  "Zustand",
  "TanStack Query",
  "Tailwind CSS",
];

const operators = [
  { name: "Verizon", slug: "verizon" },
  { name: "Ericsson", slug: "ericsson" },
  { name: "Vodafone", slug: "vodafone" },
  { name: "Nokia", slug: "nokia" },
  { name: "Orange", slug: "orange" },
  { name: "Telefónica", slug: "telefonica" },
];

const Index = () => {
  return (
    <div id="top" className="min-h-[100dvh] bg-background text-foreground">
      <Navbar />

      {/* HERO — left-aligned editorial */}
      <section className="relative overflow-hidden pt-32 md:pt-40">
        <div className="absolute inset-0 bg-hero -z-10" />
        <div className="absolute inset-0 grid-bg mask-fade-b opacity-40 -z-10" />
        <div className="absolute -left-40 top-32 h-[520px] w-[680px] rounded-full bg-primary/10 blur-3xl -z-10" />

        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-5xl"
          >
            <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              Enterprise analytics
              <br />
              without surrendering{" "}
              <span className="text-primary">your data.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Data Navigator is a local-first analytics platform that imports,
              profiles, queries and explains telecom-scale tabular data. Built
              on DuckDB and embedded AI, inside a hardened Electron shell. Zero
              cloud round-trips.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href="/login?redirect=/dashboard"
                className="group inline-flex items-center gap-2 bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-glow hover:shadow-glow"
              >
                Deploy local instance
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 border border-border bg-card/40 px-6 py-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-card/70"
              >
                View documentation <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          {/* Logo wall — integrated under hero */}
          <div className="mt-20 border-t border-border pt-8">
            <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Validated deployment environments
            </p>
            <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
              {operators.map((op) => (
                <img
                  key={op.slug}
                  src={`https://cdn.simpleicons.org/${op.slug}/9ca3af`}
                  alt={op.name}
                  className="h-7 w-auto opacity-50 transition-opacity hover:opacity-100"
                  loading="lazy"
                />
              ))}
            </div>
          </div>

          {/* COCKPIT */}
          <div id="product" className="mt-20 pb-24">
            <Cockpit />
          </div>
        </div>
      </section>

      {/* METRICS — hairline grid with 01 // labels */}
      <section className="border-y border-border bg-card/20">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 md:grid-cols-4">
          {metrics.map((m, i) => (
            <div
              key={m.n}
              className={`group p-8 transition-colors hover:bg-card/40 md:p-10 ${
                i < metrics.length - 1 ? "md:border-r" : ""
              } border-b border-border md:border-b-0 ${i % 2 === 0 ? "border-r" : ""}`}
            >
              <div className="mb-4 font-mono text-[11px] tracking-widest text-primary">
                {m.n} // {m.k}
              </div>
              <div className="font-display text-5xl font-semibold text-foreground md:text-6xl">
                {m.v}
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">
                {m.l}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{m.s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WORKFLOW — sticky split */}
      <section id="workflow" className="container py-24 md:py-32">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                From raw file to{" "}
                <span className="text-primary">narrative report</span>
              </h2>
              <p className="mt-6 text-base leading-relaxed text-muted-foreground">
                Five stages, fully offline. Every step is observable,
                reproducible and bound to its lineage. Built for the friction of
                telecom data engineering without the overhead of cloud
                infrastructure.
              </p>
              <div className="mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
                Pipeline status: local
              </div>
            </div>
          </div>

          <ol className="lg:col-span-7 space-y-1">
            {workflow.map((w, i) => {
              const Icon = w.icon;
              return (
                <motion.li
                  key={w.n}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{
                    duration: 0.45,
                    delay: i * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="group flex items-center justify-between gap-6 border border-border bg-card/20 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/40"
                >
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-sm text-muted-foreground">
                      {w.n}
                    </span>
                    <span className="grid h-10 w-10 place-items-center border border-border bg-background/60 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-display text-xl font-semibold">
                        {w.t}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {w.d}
                      </p>
                    </div>
                  </div>
                  <span className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground md:inline">
                    {w.m}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ARCHITECTURE + AI BRIDGE — asymmetric 2/1 */}
      <section
        id="architecture"
        className="relative border-y border-border bg-card/10 py-24 md:py-32"
      >
        <div className="absolute inset-0 grid-bg-fine opacity-20 -z-10" />
        <div className="container">
          <div className="mb-12 max-w-2xl">
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
              + Architecture
            </div>
            <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
              A layered desktop{" "}
              <span className="text-primary">built for trust.</span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Four cooperating layers, separated by typed contracts. Each layer
              does one thing, well.
            </p>
          </div>
          <Architecture />
        </div>
      </section>

      {/* AI — 2x3 grid, no eyebrow (budget) */}
      <section id="ai" className="container py-24 md:py-32">
        <div className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <h2 className="lg:col-span-7 font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
            Insights that{" "}
            <span className="text-primary">explain themselves.</span>
          </h2>
          <p className="lg:col-span-5 text-base text-muted-foreground">
            Embedded models and an agent canvas turn data into decisions,
            without sending a single byte off-device.
          </p>
        </div>

        <div className="grid gap-px border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {aiFeatures.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="group relative bg-background p-8 transition-colors hover:bg-card/40"
              >
                <div className="mb-6 grid h-10 w-10 place-items-center border border-border bg-card/40 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="font-display text-lg font-semibold">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.d}
                </p>
                <span className="absolute right-6 top-6 font-mono text-[10px] text-muted-foreground/40">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 flex items-center gap-3 border-l-2 border-primary/50 bg-card/30 px-6 py-4 text-sm text-muted-foreground">
          <Mic className="h-4 w-4 shrink-0 text-primary" />
          Voice command module: ask questions about your dataset out loud,
          on-device.
        </div>
      </section>

      {/* TELECOM — two-column index list */}
      <section
        id="telecom"
        className="relative border-y border-border bg-card/10 py-24 md:py-32"
      >
        <div className="container grid grid-cols-1 gap-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
              + Telecom use cases
            </div>
            <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Designed for <span className="text-primary">network teams.</span>
            </h2>
            <p className="mt-6 text-base text-muted-foreground">
              First-class KPIs, segmentation, and narrative summaries. Optimized
              for 5G core logs and CDR processing at operator scale.
            </p>
            <div className="mt-8 inline-flex items-center gap-3 border border-border bg-background/60 px-4 py-3 font-mono text-[11px] uppercase tracking-widest">
              <span className="text-primary">query_time</span>
              <span className="text-foreground">240ms</span>
              <span className="text-border">/</span>
              <span className="text-primary">rows</span>
              <span className="text-foreground">12.4M</span>
            </div>
          </div>

          <ul className="lg:col-span-8 divide-y divide-border border-y border-border">
            {telecom.map((t, i) => {
              const Icon = t.icon;
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                  className="group grid grid-cols-12 items-start gap-6 py-6 transition-colors hover:bg-card/30"
                >
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Icon className="col-span-1 mt-0.5 h-5 w-5 text-primary" />
                  <div className="col-span-10 md:col-span-4">
                    <div className="font-display text-base font-semibold">
                      {t.t}
                    </div>
                  </div>
                  <p className="col-span-12 text-sm text-muted-foreground md:col-span-6">
                    {t.d}
                  </p>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* SECURITY — numbered editorial list */}
      <section id="security" className="container py-24 md:py-32">
        <div className="mb-16 max-w-3xl">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
            + Security &amp; sovereignty
          </div>
          <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Sovereign by <span className="text-primary">construction.</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Hardened Electron architecture, restrictive policies, and zero
            outbound traffic by default.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {security.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="flex items-start gap-6 border-t border-border pt-6"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon className="h-5 w-5 shrink-0 text-success" />
                <div>
                  <h3 className="font-display text-base font-semibold">
                    {s.t}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {s.d}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* STACK MARQUEE */}
      <section className="border-y border-border bg-card/20 py-16 overflow-hidden">
        <div className="container mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Built on a modern, typed foundation
          </p>
        </div>
        <div className="relative">
          <div className="flex w-max gap-3 animate-marquee">
            {[...stack, ...stack].map((s, i) => (
              <span
                key={i}
                className="border border-border bg-background/60 px-5 py-2.5 font-mono text-xs text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 -z-10 bg-hero opacity-80" />
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl -z-10" />
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-3xl border border-border bg-card-gradient p-10 text-center shadow-elevated md:p-14"
          >
            <h2 className="font-display text-4xl font-semibold tracking-tight md:text-6xl">
              Start navigating <span className="text-primary">your data.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
              Open the platform and explore your first dataset, locally,
              securely, in seconds.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/login?redirect=/dashboard"
                className="group inline-flex items-center gap-2 bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-glow hover:shadow-glow"
              >
                Deploy local instance
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 border border-border bg-card/40 px-6 py-4 text-sm font-semibold text-foreground hover:border-primary/40"
              >
                View workflow <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-card/20">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 md:flex-row">
          <Logo />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Data Navigator. Local-first analytics
            for telecom &amp; business intelligence.
          </p>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
            All systems on-device
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
