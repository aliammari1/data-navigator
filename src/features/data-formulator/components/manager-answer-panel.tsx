"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  FileSearch,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import type { ManagerAnswer } from "@/features/data-formulator/core/manager-answer";
import { getIntentProfile } from "@/features/data-formulator/core/language/intent";
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
          "rounded-xl border border-white/10 bg-background/90 p-4 shadow-2xl backdrop-blur-xl",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <Bot className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">
              Moudir AI is ready for an intent
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ask for a KPI, dashboard, investigation, signal scan, scenario,
              or executive brief. The answer will stay visible here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const profile = getIntentProfile(answer.intent);
  const Icon = STATUS_ICON[answer.status];

  return (
    <section
      className={cn(
        "rounded-xl border border-white/10 bg-background/92 p-4 shadow-2xl backdrop-blur-xl",
        answer.status === "error" && "border-red-500/25",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border",
              answer.status === "error"
                ? "border-red-500/25 bg-red-500/10 text-red-300"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {profile.label}
              </span>
              <h2 className="text-sm font-semibold text-foreground">
                {answer.title}
              </h2>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {answer.summary}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-1 text-[10px] font-medium",
            answer.confidence === "high"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : answer.confidence === "medium"
                ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : "border-white/10 bg-white/5 text-muted-foreground",
          )}
        >
          {answer.confidence} confidence
        </span>
      </div>

      {(answer.assumptions.length > 0 || answer.evidence.length > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {answer.assumptions.length > 0 && (
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground">
                <Lightbulb className="h-3.5 w-3.5 text-amber-300" />
                Assumptions
              </div>
              <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                {answer.assumptions.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {answer.evidence.length > 0 && (
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
              <div className="mb-2 text-[11px] font-semibold text-foreground">
                Evidence
              </div>
              <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                {answer.evidence.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Evidence */}
      {answer.evidence.length > 0 && (
        <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground">
              <FileSearch className="h-3.5 w-3.5 text-cyan-300" />
              Evidence ({answer.evidence.length})
            </div>
            <button
              onClick={() => setExpandedEvidence(!expandedEvidence)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
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
          </div>
          <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {(expandedEvidence ? answer.evidence : answer.evidence.slice(0, 3)).map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-cyan-400/60" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Follow-ups */}
      {answer.followUps.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Follow-ups
          </div>
          <div className="flex flex-wrap gap-2">
            {answer.followUps.slice(0, 5).map((followUp) => (
              <button
                key={followUp}
                onClick={() => onFollowUp?.(followUp)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-foreground"
              >
                {followUp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Trace button */}
      {onShowTrace && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={onShowTrace}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
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
