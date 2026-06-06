"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Brain,
  Check,
  Cpu,
  Database,
  FileSpreadsheet,
  GitBranch,
  Globe2,
  Lock,
  Menu,
  MessageSquareText,
  Radar,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const nav = [
  { href: "#product", label: "Product" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#trust", label: "Trust" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

const trustSignals = [
  { icon: Shield, label: "Hardened shell", desc: "Isolated renderer + typed IPC." },
  { icon: Lock, label: "Data stays local", desc: "No default outbound traffic." },
  { icon: Database, label: "DuckDB core", desc: "OLAP joins + windows in-process." },
  { icon: Brain, label: "Embedded AI", desc: "Anomalies, forecasts, narratives." },
] as const;

const capabilities = [
  {
    icon: FileSpreadsheet,
    title: "Ingest anything tabular",
    desc: "CSV, Parquet, JSON, Excel. Schema inference, type casting, and fast import.",
    chips: ["CSV", "Parquet", "XLSX", "JSON"],
  },
  {
    icon: Database,
    title: "Query at operator scale",
    desc: "DuckDB SQL for millions of rows with joins, windows and aggregations in milliseconds.",
    chips: ["DuckDB", "SQL", "Windows", "Joins"],
  },
  {
    icon: Activity,
    title: "AI-assisted analysis",
    desc: "Anomaly detection, correlation analysis, and short-horizon forecasts — on-device.",
    chips: ["Anomalies", "Forecasts", "Correlation", "Narratives"],
  },
  {
    icon: GitBranch,
    title: "Lineage you can trust",
    desc: "See how files → tables → queries → charts → reports connect. Replayable steps.",
    chips: ["Lineage", "Audit trail", "Replay", "Impact"],
  },
  {
    icon: Radar,
    title: "Telecom-first KPIs",
    desc: "Availability, throughput, latency, drop rate, traffic patterns and churn indicators.",
    chips: ["5G", "QoS", "CDR", "Churn"],
  },
  {
    icon: MessageSquareText,
    title: "Collaboration-ready",
    desc: "Presence, threaded discussion, and shareable narratives designed for teams.",
    chips: ["Presence", "Comments", "Roles", "History"],
  },
] as const;

const testimonials = [
  {
    name: "Network Operations Lead",
    org: "Tier-1 operator",
    quote:
      "We can run deep KPI investigations locally, explain the anomalies, and walk into the war room with lineage-backed evidence.",
    initials: "NO",
  },
  {
    name: "Data Engineering Manager",
    org: "Enterprise analytics",
    quote:
      "The workflow feels like a control room: import → query → narrative. The UI makes complex pipelines feel obvious.",
    initials: "DE",
  },
  {
    name: "Security Architect",
    org: "Regulated environment",
    quote:
      "Local-first by default changes the whole conversation. The product reads like an architecture decision, not a marketing claim.",
    initials: "SA",
  },
] as const;

const pricing = [
  {
    name: "Personal",
    price: "Free",
    desc: "Explore datasets locally and build dashboards.",
    badge: "Best for solo",
    features: ["Imports + profiling", "DuckDB SQL", "Core charts", "Local projects"],
    cta: "Start free",
  },
  {
    name: "Team",
    price: "Contact",
    desc: "Collaboration, governance, and shared workspaces.",
    badge: "Most popular",
    features: [
      "Everything in Personal",
      "Presence + comments",
      "Audit trails",
      "Role-based access",
    ],
    cta: "Talk to us",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Contact",
    desc: "Security reviews, dedicated support, and custom integrations.",
    badge: "For regulated orgs",
    features: ["SSO / identity", "Compliance support", "Deployment hardening", "SLA"],
    cta: "Request a demo",
  },
] as const;

const faqs = [
  {
    q: "Is it really offline-first?",
    a: "Yes. The platform is designed so analysis runs on-device and your data does not need to leave the workstation. You can still choose to integrate external services later — it’s just not required.",
  },
  {
    q: "What data sizes can it handle?",
    a: "DuckDB enables fast analytics on large, columnar datasets. Practical limits depend on your device resources, but the workflow is built for telecom-scale tables and wide schemas.",
  },
  {
    q: "Is this a web app or a desktop app?",
    a: "Both: the UI runs in a Next.js renderer inside an Electron shell. That gives you a modern web UI while keeping local access and a hardened boundary via typed IPC.",
  },
  {
    q: "Can I use it outside telecom?",
    a: "Absolutely. Telecom KPIs are first-class, but the import/query/AI workflow applies to any tabular analytics workload.",
  },
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <div className="grid size-9 place-items-center rounded-3xl border border-border bg-card-gradient">
          <Sparkles className="text-primary" />
        </div>
        <span className="pointer-events-none absolute -right-1 -top-1 size-3 rounded-full bg-success/90 ring-2 ring-background animate-pulse-dot" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-heading text-[15px] font-semibold tracking-tight">
          Data Navigator
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          local · duckdb · ai
        </span>
      </div>
    </div>
  );
}

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 10));

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass border-b border-border" : "bg-transparent",
      ].join(" ")}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="#top" className="focus-visible:outline-none">
          <Logo />
        </Link>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {nav.map((l) => (
              <NavigationMenuItem key={l.href}>
                <NavigationMenuLink
                  href={l.href}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {l.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          <Button
            variant="gradient"
            className="hidden sm:inline-flex"
            render={<Link href="/login?redirect=/dashboard" />}
            nativeButton={false}
          >
            Open platform
            <ArrowUpRight data-icon="inline-end" />
          </Button>

          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="gap-0 p-0">
              <SheetHeader className="border-b border-border">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 p-4">
                {nav.map((l) => (
                  <SheetClose
                    // Base UI uses `render`, not `asChild`.
                    key={l.href}
                    render={
                      <a
                        href={l.href}
                        className="rounded-3xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      />
                    }
                  >
                    {l.label}
                  </SheetClose>
                ))}
              </div>
              <div className="mt-auto border-t border-border p-4">
                <SheetClose
                  render={
                    <Button
                      variant="gradient"
                      className="w-full"
                      // Base UI Button renders a <button> by default; we replace it with a link.
                      render={<Link href="/login?redirect=/dashboard" />}
                      nativeButton={false}
                    />
                  }
                >
                  Open platform <ArrowUpRight data-icon="inline-end" />
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function ChipRow({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((t) => (
        <Badge key={t} variant="secondary" className="font-mono text-[11px]">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function ProductDemo() {
  const tiles = useMemo(
    () => [
      {
        title: "Import",
        icon: FileSpreadsheet,
        body: (
          <div className="flex flex-col gap-2">
            {[
              { name: "cdr_q3.parquet", meta: "2.4 GB", ok: true },
              { name: "kpi_4g.json", meta: "84 MB", ok: true },
              { name: "churn_train.csv", meta: "210 MB", ok: false },
            ].map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2 rounded-3xl bg-muted/40 px-3 py-2"
              >
                <span className="font-mono text-[11px] text-foreground/90">
                  {f.name}
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {f.meta}
                </span>
                {f.ok ? (
                  <Check className="text-success" />
                ) : (
                  <span className="size-2 rounded-full bg-warning animate-pulse-dot" />
                )}
              </div>
            ))}
          </div>
        ),
      },
      {
        title: "Query",
        icon: Database,
        body: (
          <div className="rounded-3xl border border-border bg-background/40 p-3">
            <pre className="overflow-hidden font-mono text-[11px] leading-relaxed text-foreground/90">
              <span className="text-secondary">SELECT</span> cell_id,{" "}
              <span className="text-primary">avg</span>(throughput_mbps){" "}
              <span className="text-secondary">AS</span> avg_tp{"\n"}
              <span className="text-secondary">FROM</span> read_parquet(
              <span className="text-success">'cdr_q3.parquet'</span>){"\n"}
              <span className="text-secondary">GROUP BY</span> 1{"\n"}
              <span className="text-secondary">ORDER BY</span> avg_tp{" "}
              <span className="text-secondary">DESC</span>
              <span className="ml-0.5 inline-block h-3 w-1.5 -mb-0.5 bg-primary animate-pulse-dot" />
            </pre>
          </div>
        ),
      },
      {
        title: "Explain",
        icon: Brain,
        body: (
          <div className="flex flex-col gap-3">
            <div className="rounded-3xl border border-warning/30 bg-warning/10 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-1 size-2 rounded-full bg-warning animate-pulse-dot" />
                <div>
                  <p className="text-sm font-medium">QoS drop · zone NORD-3</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    p95 latency 312 ms · +4.2σ · correlated with congestion
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-background/40 p-3">
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">Narrative:</span> The spike
                begins at 16:00, coinciding with a throughput drop on cells
                0xA14–0xA18. The agent recommends a capacity review and a
                handover-parameter check.
              </p>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <Card className="border-gradient shadow-elevated bg-card-gradient">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-3xl border border-border bg-background/60 text-primary">
            <Zap />
          </div>
          <div>
            <CardTitle className="font-heading text-lg">
              Control-room workflow
            </CardTitle>
            <CardDescription>
              Import → query → explain. Everything stays on-device.
            </CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="hidden sm:inline-flex font-mono">
          local · 0 outbound connections
        </Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.title} size="sm" className="bg-background/40">
              <CardHeader className="border-b border-border">
                <div className="flex items-center gap-2">
                  <Icon className="text-primary" />
                  <CardTitle className="text-sm">{t.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">{t.body}</CardContent>
            </Card>
          );
        })}
      </CardContent>
      <CardFooter className="border-t border-border justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="text-primary" />
          Isolated renderer · typed IPC · local OLAP
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<a href="#capabilities" />}
          nativeButton={false}
        >
          See features <ArrowRight data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function Page() {
  return (
    <div id="top" className="min-h-[100dvh] bg-background text-foreground dn-page">
      <TopNav />

      {/* HERO */}
      <section className="relative overflow-hidden pt-28 md:pt-36">
        <div className="absolute inset-0 -z-10 bg-hero" />
        <div className="absolute inset-0 -z-10 grid-bg mask-fade-b opacity-35" />
        <div className="absolute -left-40 top-40 -z-10 h-[520px] w-[680px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-44 top-10 -z-10 h-[420px] w-[620px] rounded-full bg-accent/10 blur-3xl" />

        <div className="container">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-end">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="font-mono" variant="secondary">
                  offline-first
                </Badge>
                <Badge className="font-mono" variant="secondary">
                  duckdb core
                </Badge>
                <Badge className="font-mono" variant="secondary">
                  hardened electron shell
                </Badge>
              </div>

              <h1 className="mt-6 font-heading text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
                Enterprise analytics
                <br />
                without surrendering <span className="text-primary">your data</span>.
              </h1>

              <p className="mt-7 max-w-2xl text-lg text-muted-foreground md:text-xl">
                Data Navigator imports, profiles, queries, and explains telecom-scale
                tabular data — entirely on-device. A modern Next.js UI on top of DuckDB
                and embedded AI, inside a hardened desktop shell.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Button
                  variant="gradient"
                  size="lg"
                  render={<Link href="/login?redirect=/dashboard" />}
                  nativeButton={false}
                >
                  Open platform <ArrowUpRight data-icon="inline-end" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  render={<a href="#product" />}
                  nativeButton={false}
                >
                  See the workflow <ArrowRight data-icon="inline-end" />
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Lock className="text-success" />
                  zero-default outbound connections
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span className="inline-flex items-center gap-2">
                  <Database className="text-primary" />
                  in-process OLAP engine
                </span>
                <Separator orientation="vertical" className="h-4" />
                <span className="inline-flex items-center gap-2">
                  <Globe2 className="text-secondary" />
                  works beyond telecom
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5"
            >
              <Card className="bg-card-gradient border-gradient shadow-elevated">
                <CardHeader className="border-b border-border">
                  <CardTitle className="text-base">What you get</CardTitle>
                  <CardDescription>
                    A control-room UI built for speed, trust, and narrative clarity.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {trustSignals.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.label} className="flex items-start gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded-3xl border border-border bg-background/60 text-primary">
                          <Icon />
                        </div>
                        <div>
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="mt-0.5 text-sm text-muted-foreground">
                            {s.desc}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
                <CardFooter className="border-t border-border">
                  <Button
                    variant="outline"
                    className="w-full"
                    render={<a href="#trust" />}
                    nativeButton={false}
                  >
                    Read the security story <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          </div>

          <div id="product" className="mt-14 pb-24 md:mt-20">
            <ProductDemo />
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section id="capabilities" className="container py-24 md:py-32">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
              + capabilities
            </div>
            <h2 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
              Built for the messy reality of{" "}
              <span className="text-primary">telecom data engineering</span>.
            </h2>
          </div>
          <p className="lg:col-span-5 text-base text-muted-foreground">
            The landing page is the product: structured, legible, and precise.
            Every section maps to a real workflow stage and a real trust boundary.
          </p>
        </div>

        <div className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.45, delay: i * 0.04 }}
              >
                <Card className="dn-card-hover bg-card-gradient border-gradient">
                  <CardHeader className="gap-3">
                    <div className="flex items-center justify-between">
                      <div className="grid size-10 place-items-center rounded-3xl border border-border bg-background/60 text-primary">
                        <Icon />
                      </div>
                      <Badge variant="secondary" className="font-mono">
                        {String(i + 1).padStart(2, "0")}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{c.title}</CardTitle>
                    <CardDescription className="text-sm">{c.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ChipRow items={c.chips} />
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* TRUST */}
      <section
        id="trust"
        className="relative border-y border-border bg-card/10 py-24 md:py-32"
      >
        <div className="absolute inset-0 -z-10 grid-bg-fine opacity-20" />
        <div className="container">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
                + trust model
              </div>
              <h2 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
                Sovereign by <span className="text-primary">construction</span>.
              </h2>
              <p className="mt-5 text-base text-muted-foreground">
                The architecture is a contract: the UI runs in an isolated world,
                and every sensitive capability crosses a typed boundary.
              </p>

              <div className="mt-8 flex flex-col gap-3">
                {trustSignals.map((t) => {
                  const Icon = t.icon;
                  return (
                    <div key={t.label} className="flex items-start gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-3xl border border-border bg-background/60 text-success">
                        <Icon />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {t.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7">
              <Card className="bg-card-gradient border-gradient shadow-elevated">
                <CardHeader className="border-b border-border">
                  <CardTitle>Architecture snapshot</CardTitle>
                  <CardDescription>
                    Next.js UI in an isolated renderer · Electron main as broker · DuckDB core · workers for ML/LLM.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {[
                    {
                      k: "Renderer (UI)",
                      v: "React 19 + Next.js",
                      icon: Sparkles,
                      note: "No Node access. Strict CSP.",
                    },
                    {
                      k: "Main process",
                      v: "Typed IPC bridge",
                      icon: Shield,
                      note: "Allow-listed channels only.",
                    },
                    {
                      k: "Analytical core",
                      v: "DuckDB + SQLite metadata",
                      icon: Database,
                      note: "OLAP at desktop speed.",
                    },
                    {
                      k: "Workers",
                      v: "ML · LLM · Python · Voice",
                      icon: Cpu,
                      note: "Off-thread compute, responsive UI.",
                    },
                  ].map((b) => {
                    const Icon = b.icon;
                    return (
                      <Card key={b.k} size="sm" className="bg-background/40">
                        <CardHeader className="border-b border-border gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className="text-primary" />
                            <CardTitle className="text-sm">{b.k}</CardTitle>
                          </div>
                          <CardDescription className="text-xs font-mono">
                            {b.v}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          {b.note}
                        </CardContent>
                      </Card>
                    );
                  })}
                </CardContent>
                <CardFooter className="border-t border-border">
                  <div className="flex flex-wrap items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-2 rounded-full bg-success animate-pulse-dot" />
                      designed for air-gapped + regulated environments
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href="/dashboard" />}
                      nativeButton={false}
                    >
                      View dashboard <ArrowUpRight data-icon="inline-end" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="container py-24 md:py-32">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <h2 className="lg:col-span-7 font-heading text-4xl font-semibold tracking-tight md:text-5xl">
            Built for teams that need{" "}
            <span className="text-primary">answers they can defend</span>.
          </h2>
          <p className="lg:col-span-5 text-base text-muted-foreground">
            The UI is optimized for narrative clarity: what happened, why it happened,
            and what to do next — with lineage to back it up.
          </p>
        </div>

        <div className="mt-12 grid gap-3 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
            >
              <Card className="bg-card-gradient border-gradient">
                <CardHeader className="gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback className="font-mono">
                        {t.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-sm">{t.name}</CardTitle>
                      <CardDescription className="text-sm">{t.org}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  “{t.quote}”
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="relative border-y border-border bg-card/10 py-24 md:py-32"
      >
        <div className="absolute inset-0 -z-10 bg-hero opacity-70" />
        <div className="container">
          <div className="max-w-3xl">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
              + pricing
            </div>
            <h2 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
              Choose your lane. Keep your{" "}
              <span className="text-primary">data sovereignty</span>.
            </h2>
            <p className="mt-5 text-base text-muted-foreground">
              Start locally. Add collaboration and governance when you need it.
            </p>
          </div>

          <div className="mt-12 grid gap-3 lg:grid-cols-3">
            {pricing.map((p) => (
              <Card
                key={p.name}
                className={[
                  "bg-card-gradient border-gradient",
                  p.highlight ? "shadow-elevated" : "",
                ].join(" ")}
              >
                <CardHeader className="gap-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{p.name}</CardTitle>
                    <Badge
                      variant={p.highlight ? "default" : "secondary"}
                      className="font-mono"
                    >
                      {p.badge}
                    </Badge>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="font-heading text-4xl font-semibold">
                      {p.price}
                    </div>
                    <div className="pb-1 text-sm text-muted-foreground">/ user</div>
                  </div>
                  <CardDescription className="text-sm">{p.desc}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Separator />
                  <ul className="flex flex-col gap-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 text-success" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="border-t border-border">
                  <Button
                    variant={p.highlight ? "gradient" : "outline"}
                    className="w-full"
                    render={<Link href="/login?redirect=/dashboard" />}
                    nativeButton={false}
                  >
                    {p.cta} <ArrowUpRight data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-24 md:py-32">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-primary">
              + faq
            </div>
            <h2 className="font-heading text-4xl font-semibold tracking-tight md:text-5xl">
              Questions, answered.
            </h2>
            <p className="mt-5 text-base text-muted-foreground">
              If you want, tell me your exact positioning (B2B vs open-source vs
              internal tool) and I’ll tailor the copy precisely.
            </p>
          </div>

          <Card className="lg:col-span-7 bg-card-gradient border-gradient">
            <CardHeader className="border-b border-border">
              <CardTitle>FAQ</CardTitle>
              <CardDescription>
                Practical details for teams evaluating a local-first analytics stack.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((f, i) => (
                  <AccordionItem key={f.q} value={`faq-${i}`}>
                    <AccordionTrigger>{f.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 -z-10 bg-hero opacity-80" />
        <div className="absolute left-1/2 top-1/2 -z-10 h-[420px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="container">
          <Card className="mx-auto max-w-3xl bg-card-gradient border-gradient shadow-elevated">
            <CardHeader className="text-center gap-3">
              <CardTitle className="text-3xl md:text-5xl">
                Start navigating <span className="text-primary">your data</span>.
              </CardTitle>
              <CardDescription className="mx-auto max-w-xl">
                Open the platform, import your first dataset, and generate a narrative
                report — locally, securely, in minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                variant="gradient"
                size="lg"
                render={<Link href="/login?redirect=/dashboard" />}
                nativeButton={false}
              >
                Open platform <ArrowUpRight data-icon="inline-end" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                render={<a href="#capabilities" />}
                nativeButton={false}
              >
                Explore features <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-card/20">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 md:flex-row">
          <Logo />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {nav.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="size-2 rounded-full bg-success animate-pulse-dot" />
            on-device · typed · explainable
          </div>
        </div>
      </footer>
    </div>
  );
}
