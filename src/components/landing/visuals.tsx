"use client";

/**
 * Real rendered data-visualisations for the landing page, built on recharts
 * (already a project dependency). These are genuine SVG charts driven by
 * sample data, used as honest "component previews" of the product instead of
 * div-based fake screenshots. All datasets are illustrative sample data.
 */

import { useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const ACCENT = "#22d3ee";

// Sample data: throughput (Gbps) per hour, with a dip at 16:00.
const throughput = [
  { h: "08", v: 6.2 },
  { h: "09", v: 7.1 },
  { h: "10", v: 7.8 },
  { h: "11", v: 8.0 },
  { h: "12", v: 7.6 },
  { h: "13", v: 8.3 },
  { h: "14", v: 8.9 },
  { h: "15", v: 9.1 },
  { h: "16", v: 4.2 },
  { h: "17", v: 6.8 },
  { h: "18", v: 8.4 },
  { h: "19", v: 9.0 },
  { h: "20", v: 8.7 },
];

export function ThroughputChart() {
  const reduce = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={throughput} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="h"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-mono)" }}
          interval={1}
        />
        <YAxis hide domain={[0, 11]} />
        <Area
          type="monotone"
          dataKey="v"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#tp-fill)"
          isAnimationActive={!reduce}
          animationDuration={900}
        />
        <ReferenceDot x="16" y={4.2} r={4} fill="#fb7185" stroke="#07090f" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Sample data: availability (%) per region.
const regions = [
  { r: "NORD", v: 99.2 },
  { r: "SUD", v: 97.8 },
  { r: "EST", v: 98.6 },
  { r: "OUEST", v: 96.4 },
  { r: "CENTRE", v: 98.9 },
];

export function RegionBars() {
  const reduce = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={regions} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={10}>
        <XAxis
          dataKey="r"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-mono)" }}
        />
        <YAxis hide domain={[90, 100]} />
        <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationDuration={800}>
          {regions.map((d) => (
            <Cell key={d.r} fill={d.v < 97 ? "#fbbf24" : ACCENT} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const trend = [
  { i: 0, v: 3 },
  { i: 1, v: 5 },
  { i: 2, v: 4 },
  { i: 3, v: 7 },
  { i: 4, v: 6 },
  { i: 5, v: 9 },
  { i: 6, v: 8 },
  { i: 7, v: 11 },
];

export function Sparkline() {
  const reduce = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, 12]} />
        <Area
          type="monotone"
          dataKey="v"
          stroke={ACCENT}
          strokeWidth={2}
          fill="url(#spark-fill)"
          isAnimationActive={!reduce}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Sample data: fleet availability gauge.
export function AvailabilityGauge({ value = 98.6 }: { value?: number }) {
  const reduce = useReducedMotion();
  const data = [{ name: "availability", value, fill: ACCENT }];
  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barSize={10}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={8}
            background={{ fill: "rgba(255,255,255,0.06)" }}
            isAnimationActive={!reduce}
            animationDuration={1000}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-semibold text-white">{value}%</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">avail</span>
      </div>
    </div>
  );
}
