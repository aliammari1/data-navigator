"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileSearch,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { getIntentProfile } from "@/features/data-formulator/core/language/intent";
import type { ManagerAnswer } from "@/features/data-formulator/core/manager-answer";
import { cn } from "@/shared/utils";

interface ManagerAnswerPanelProps {
  answer: ManagerAnswer | null;
  className?: string;
  onFollowUp?: (text: string) => void;
  onShowTrace?: () => void;
  showTrace?: boolean;
}

const STATUS_ICON = {
  ready: CheckCircle2,
  "needs-input": HelpCircle,
  error: AlertTriangle,
  running: Bot,
};

const STATUS_TONE = {
  ready: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "needs-input":
    "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  running: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const CONFIDENCE_TONE = {
  high: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium:
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-border bg-muted text-muted-foreground",
};

function formatTime(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function ManagerAnswerPanel({
  answer,
  className,
  onFollowUp,
  onShowTrace,
  showTrace = false,
}: ManagerAnswerPanelProps) {
  const [expandedEvidence, setExpandedEvidence] = useState(false);
  if (!answer) {
    return (
      <section
        className={cn(
          "rounded-lg border border-border/80 bg-background/95 p-4 shadow-xl backdrop-blur-xl",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/25 bg-blue-500/10">
            <Sparkles className="h-4 w-4 text-blue-700 dark:text-blue-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-foreground">
                Moudir AI decision desk
              </div>
              <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                Local-first
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask for a KPI, dashboard, investigation, signal scan, scenario, or
              executive brief. Responses stay grounded in the loaded table.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const profile = getIntentProfile(answer.intent);
  const Icon = STATUS_ICON[answer.status];
  const visibleEvidence = expandedEvidence
    ? answer.evidence
    : answer.evidence.slice(0, 3);

  return (
    <section
      className={cn(
        "rounded-lg border border-border/80 bg-background/95 shadow-xl backdrop-blur-xl",
        answer.status === "error" && "border-red-500/25",
        className,
      )}
    >
      <div className="border-b border-border/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                STATUS_TONE[answer.status],
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {profile.label}
                </span>
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase",
                    STATUS_TONE[answer.status],
                  )}
                >
                  {answer.status.replace("-", " ")}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  {formatTime(answer.createdAt)}
                </span>
              </div>
              <h2 className="mt-2 text-sm font-semibold text-foreground">
                {answer.title}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {answer.summary}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "rounded-md border px-2 py-1 text-[10px] font-medium",
              CONFIDENCE_TONE[answer.confidence],
            )}
          >
            {answer.confidence} confidence
          </span>
        </div>
      </div>

      {(answer.decision || answer.impact || answer.nextAction) && (
        <div className="grid gap-2 border-b border-border/70 bg-muted/25 p-3 md:grid-cols-3">
          {answer.decision && (
            <div className="rounded-md border border-blue-500/20 bg-blue-500/8 p-3">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-blue-700 dark:text-blue-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Decision
              </div>
              <p className="text-[11px] leading-relaxed text-foreground">
                {answer.decision}
              </p>
            </div>
          )}
          {answer.impact && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/8 p-3">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                <Lightbulb className="h-3.5 w-3.5" />
                Impact
              </div>
              <p className="text-[11px] leading-relaxed text-foreground">
                {answer.impact}
              </p>
            </div>
          )}
          {answer.nextAction && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/8 p-3">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                <ArrowRight className="h-3.5 w-3.5" />
                Next action
              </div>
              <p className="text-[11px] leading-relaxed text-foreground">
                {answer.nextAction}
              </p>
            </div>
          )}
        </div>
      )}

      {(answer.assumptions.length > 0 || answer.evidence.length > 0) && (
        <div className="grid gap-3 p-3 md:grid-cols-2">
          {answer.assumptions.length > 0 && (
            <div className="rounded-md border border-border bg-card/70 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                Assumptions
              </div>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {answer.assumptions.slice(0, 4).map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-blue-600 dark:text-blue-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {answer.evidence.length > 0 && (
            <div className="rounded-md border border-border bg-card/70 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
                  <FileSearch className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
                  Evidence ({answer.evidence.length})
                </div>
                {answer.evidence.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setExpandedEvidence(!expandedEvidence)}
                    className="flex cursor-pointer items-center gap-1 rounded-sm px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {expandedEvidence ? (
                      <>
                        <ChevronUp className="h-3 w-3" /> Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" /> More
                      </>
                    )}
                  </button>
                )}
              </div>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {visibleEvidence.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500/70" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {answer.followUps.length > 0 && (
        <div className="border-t border-border/70 p-3">
          <div className="mb-2 text-[10px] font-medium uppercase text-muted-foreground">
            Follow-ups
          </div>
          <div className="flex flex-wrap gap-2">
            {answer.followUps.slice(0, 5).map((followUp) => (
              <button
                key={followUp}
                type="button"
                onClick={() => onFollowUp?.(followUp)}
                className="cursor-pointer rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {followUp}
              </button>
            ))}
          </div>
        </div>
      )}

      {onShowTrace && (
        <div className="flex justify-end border-t border-border/70 px-3 py-2">
          <button
            type="button"
            onClick={onShowTrace}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showTrace ? (
              <>
                <ChevronUp className="h-3 w-3" /> Hide trace
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show trace
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
