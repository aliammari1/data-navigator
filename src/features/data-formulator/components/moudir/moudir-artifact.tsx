"use client";

/**
 * Moudir — artifact rendering on the warm canvas.
 *
 * Charts reuse the app's FormulatorChart surface; tables/KPIs/insights are
 * rendered as quiet, editorial objects (the data is the hero, not the frame).
 */

import { motion } from "motion/react";
import { chartArtifactToQueryResult } from "../../core/swarm/agents/base";
import type { Artifact } from "../../core/swarm/types";
import { FormulatorChart } from "../formulator-chart";
import { MOUDIR, rise } from "./moudir-kit";

function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value === "string" && value.trim() !== "") return Number.isFinite(Number(value));
  return false;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

function ArtifactFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.figure variants={rise} className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium text-foreground">{title}</figcaption>
      <div
        className="overflow-hidden rounded-2xl p-4"
        style={{
          background: MOUDIR.panel,
          boxShadow: "inset 0 0 0 1px var(--glass-border)",
        }}
      >
        {children}
      </div>
    </motion.figure>
  );
}

export function MoudirArtifact({ artifact, lead = false }: { artifact: Artifact; lead?: boolean }) {
  if (artifact.kind === "chart") {
    return (
      <ArtifactFrame title={artifact.title}>
        <FormulatorChart
          spec={artifact.spec}
          result={chartArtifactToQueryResult(artifact)}
          height={lead ? 360 : 240}
        />
      </ArtifactFrame>
    );
  }

  if (artifact.kind === "table") {
    const rows = artifact.rows.slice(0, 12);
    const cols = rows.length ? Object.keys(rows[0]).slice(0, 8) : [];
    return (
      <ArtifactFrame title={artifact.title}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left">
                {cols.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-foreground/[0.03]" : undefined}>
                  {cols.map((c) => (
                    <td
                      key={c}
                      className={`px-3 py-2 text-foreground/80 ${
                        isNumeric(row[c]) ? "text-right font-mono tabular-nums" : ""
                      }`}
                    >
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ArtifactFrame>
    );
  }

  if (artifact.kind === "kpi") {
    const delta = artifact.delta;
    return (
      <motion.div
        variants={rise}
        className="flex flex-col gap-1 rounded-2xl p-5"
        style={{
          background: MOUDIR.panel,
          boxShadow: "inset 0 0 0 1px var(--glass-border)",
        }}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {artifact.label}
        </span>
        <span className="text-4xl font-semibold tabular-nums text-foreground">
          {artifact.value}
        </span>
        {typeof delta === "number" && (
          <span
            className="text-sm font-medium tabular-nums"
            style={{ color: delta >= 0 ? MOUDIR.green : MOUDIR.rose }}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString()}
          </span>
        )}
      </motion.div>
    );
  }

  // insight
  const accent =
    artifact.severity === "high"
      ? MOUDIR.rose
      : artifact.severity === "medium"
        ? MOUDIR.gold
        : MOUDIR.muted;
  return (
    <motion.div variants={rise} className="border-l-2 pl-4" style={{ borderColor: accent }}>
      <div className="text-sm font-medium text-foreground">{artifact.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{artifact.body}</p>
    </motion.div>
  );
}
