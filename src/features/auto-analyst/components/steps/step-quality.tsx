"use client";

import { AtlasCallout } from "@/design/blocks/severity-callout";
import { AtlasProgress } from "@/design/primitives/progress";
import type { QualityReport } from "@/features/auto-analyst/core/types";

interface Props {
  report: QualityReport;
}

function tone(score: number): "success" | "info" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 60) return "info";
  if (score >= 40) return "warning";
  return "danger";
}

export function StepQuality({ report }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold text-(--atlas-text) tabular-nums">
          {report.score}
        </span>
        <span className="text-sm text-(--atlas-text-subtle)">/ 100</span>
        <span
          className={`ml-2 text-xs font-semibold uppercase tracking-wide ${
            tone(report.score) === "success"
              ? "text-(--atlas-success-fg)"
              : tone(report.score) === "info"
                ? "text-(--atlas-info-fg)"
                : tone(report.score) === "warning"
                  ? "text-(--atlas-warning-fg)"
                  : "text-(--atlas-danger-fg)"
          }`}
        >
          {report.score >= 80
            ? "Healthy"
            : report.score >= 60
              ? "Acceptable"
              : report.score >= 40
                ? "Needs work"
                : "Poor"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {report.axes.map((a) => (
          <div
            key={a.name}
            className="rounded-(--atlas-radius-3) border border-(--atlas-border) bg-(--atlas-surface) p-3"
          >
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wide font-bold text-(--atlas-text-subtle)">
                {a.name}
              </span>
              <span className="text-sm font-bold text-(--atlas-text) tabular-nums">
                {a.score}
              </span>
            </div>
            <AtlasProgress
              value={a.score}
              tone={tone(a.score) as "success" | "warning" | "danger"}
            />
            <div className="text-[11px] text-(--atlas-text-subtle) mt-1.5 leading-snug">
              {a.detail}
            </div>
          </div>
        ))}
      </div>
      {report.recommendations.length > 0 && (
        <div className="space-y-2">
          {report.recommendations.map((r) => (
            <AtlasCallout
              key={r.title}
              severity={
                r.severity === "danger"
                  ? "danger"
                  : r.severity === "warning"
                    ? "warning"
                    : "info"
              }
              title={r.title}
            >
              <div>{r.detail}</div>
              {r.fix && (
                <div className="mt-1 text-(--atlas-text-subtle)">
                  → {r.fix}
                </div>
              )}
            </AtlasCallout>
          ))}
        </div>
      )}
    </div>
  );
}
