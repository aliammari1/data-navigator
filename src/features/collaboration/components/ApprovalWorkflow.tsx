"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  ChevronRight,
  Share2,
  Download,
  Send,
  RefreshCw,
  User,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getLANJoinUrl, getLANStatus, readLANSettings } from "@/platform/lan/lan-collab";
import type { ApprovalHistoryEntry, ApprovalStatus } from "@/platform/collab";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";
import { currentUserName, recordAudit, useApprovalCRDT } from "../collab/collab-hub-crdt";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEAM_MEMBERS = ["Alice Martin", "Bob Chen", "Cécile Dupont", "David Osei", "Elena Kovač"];

const STATUS_CONFIG: Record<
  ApprovalStatus,
  { label: string; icon: React.ReactNode; color: string; step: number }
> = {
  DRAFT: {
    label: "Draft",
    icon: <AlertCircle className="size-4" />,
    color: "bg-muted text-muted-foreground",
    step: 1,
  },
  REVIEW: {
    label: "In Review",
    icon: <Clock className="size-4" />,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    step: 2,
  },
  APPROVED: {
    label: "Approved",
    icon: <CheckCircle2 className="size-4" />,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    step: 3,
  },
  REJECTED: {
    label: "Rejected",
    icon: <XCircle className="size-4" />,
    color: "bg-destructive/10 text-destructive",
    step: 3,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ─── Workflow step dots ───────────────────────────────────────────────────────

function ProgressSteps({ status }: { status: ApprovalStatus }) {
  const currentStep = STATUS_CONFIG[status].step;
  const steps = ["Draft", "Review", status === "REJECTED" ? "Rejected" : "Approved"];

  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const step = i + 1;
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-all",
                  done && "bg-emerald-500 text-white",
                  active && status === "REJECTED" && "bg-destructive text-white",
                  active && status !== "REJECTED" && "bg-primary text-primary-foreground",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="size-3.5" /> : step}
              </div>
              <span className="mt-1 text-[10px] text-muted-foreground">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1 mb-4 h-0.5 w-10 rounded-full transition-all",
                  step < currentStep ? "bg-emerald-500" : "bg-muted",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── History timeline ─────────────────────────────────────────────────────────

function HistoryTimeline({ entries }: { entries: ApprovalHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">History</p>
      <div className="space-y-1.5">
        {[...entries].reverse().map((entry, idx) => {
          const config = STATUS_CONFIG[entry.status];
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px]",
                    config.color,
                  )}
                >
                  {config.icon}
                </div>
                {idx < entries.length - 1 && <div className="w-px flex-1 bg-border" />}
              </div>
              <div className="pb-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium">{config.label}</span>
                  <span className="text-[10px] text-muted-foreground">by {entry.by}</span>
                  <span className="text-[10px] text-muted-foreground">
                    · {relativeTime(entry.at)}
                  </span>
                </div>
                {entry.comment && (
                  <p className="mt-0.5 text-xs text-muted-foreground italic">"{entry.comment}"</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ApprovalWorkflow() {
  const username = currentUserName();
  const shareReport = useCollabHubStore.use.shareReport();
  // Approval state is now a CRDT record on the shared doc, so a decision made on
  // one machine appears on every connected peer (the workflow used to be a
  // single-player zustand silo). `transition` is last-writer-wins on `status`
  // with an append-only `history` that merges conflict-free.
  const { record, transition: transitionApproval, setSharedUrl, reset } = useApprovalCRDT();

  const [reviewer, setReviewer] = useState(TEAM_MEMBERS[0]);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);

  const { status, history, reviewerName } = record;
  const config = STATUS_CONFIG[status];

  function transition(newStatus: ApprovalStatus, _by: string, commentText: string) {
    transitionApproval(newStatus, commentText, newStatus === "REVIEW" ? reviewer : undefined);
    setComment("");
  }

  const handleSubmitForReview = () => {
    transition("REVIEW", username, comment);
  };

  const handleApprove = () => transition("APPROVED", username, comment);
  const handleRequestChanges = () => {
    if (!comment.trim()) return;
    transition("DRAFT", username, comment);
  };
  const handleReject = () => {
    if (!comment.trim()) return;
    transition("REJECTED", username, comment);
  };

  const lanConnected = typeof window !== "undefined" && getLANStatus() === "connected";

  const handleShare = () => {
    if (typeof window === "undefined") return;
    // Produce a REAL shareable artifact: the LAN join URL teammates on the
    // same network actually open (room + pairing code), rather than an
    // app:///localhost origin URL that is meaningless across machines.
    const settings = readLANSettings();
    if (!lanConnected || !settings.url) {
      recordAudit(
        "system",
        "Share attempted with no active LAN session — start a LAN session to generate a join link",
        username,
      );
      return;
    }
    const url = getLANJoinUrl(settings);
    navigator.clipboard.writeText(url).catch(() => {});
    // Persist the share URL onto the CRDT approval record so it syncs to peers
    // (without appending a redundant workflow-history entry).
    setSharedUrl(url);
    shareReport({
      id: record.reportId || makeId(),
      name: record.reportId || "Approved Report",
      approvedBy: username,
      approvedAt: Date.now(),
      url,
    });
    recordAudit(
      "export",
      `Approved report shared via LAN join link (room ${settings.room})`,
      username,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    recordAudit("export", "Approved report downloaded", username);
  };

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3",
          status === "APPROVED" &&
            "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30",
          status === "REJECTED" && "border-destructive/20 bg-destructive/5",
          status === "REVIEW" &&
            "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
          status === "DRAFT" && "border-border bg-muted/30",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold",
            config.color,
          )}
        >
          {config.icon}
          {config.label}
        </span>
        <div className="flex-1 text-sm text-muted-foreground">
          {status === "DRAFT" && "Report is in draft — submit for review when ready"}
          {status === "REVIEW" && (
            <>
              Pending review by <span className="font-medium text-foreground">{reviewerName}</span>
            </>
          )}
          {status === "APPROVED" &&
            `Approved by ${history.at(-1)?.by ?? "—"} at ${formatTime(history.at(-1)?.at ?? 0)}`}
          {status === "REJECTED" && `Rejected by ${history.at(-1)?.by ?? "—"}`}
        </div>
        <ProgressSteps status={status} />
      </div>

      {/* ── DRAFT ─────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {status === "DRAFT" && (
          <motion.div
            key="draft"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reviewer</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
                <select
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  className="w-full appearance-none rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50 dark:bg-input/30"
                >
                  {TEAM_MEMBERS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note for the reviewer (optional)…"
              className="min-h-16 resize-none text-sm"
            />
            <Button className="w-full gap-2" onClick={handleSubmitForReview}>
              <Send className="size-4" />
              Submit for Review
            </Button>
          </motion.div>
        )}

        {/* ── REVIEW ──────────────────────────────────────────────────────── */}
        {status === "REVIEW" && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (required for changes/rejection)…"
              className="min-h-16 resize-none text-sm"
            />
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleApprove}
              >
                <CheckCircle2 className="size-4" />
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
                onClick={handleRequestChanges}
                disabled={!comment.trim()}
              >
                <RefreshCw className="size-4" />
                Request Changes
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-1.5"
                onClick={handleReject}
                disabled={!comment.trim()}
              >
                <XCircle className="size-4" />
                Reject
              </Button>
            </div>
            {!comment.trim() && (
              <p className="text-[11px] text-muted-foreground">
                A comment is required to request changes or reject.
              </p>
            )}
          </motion.div>
        )}

        {/* ── APPROVED ────────────────────────────────────────────────────── */}
        {status === "APPROVED" && (
          <motion.div
            key="approved"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 py-6 dark:bg-emerald-950/30">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <CheckCircle2 className="size-12 text-emerald-500" />
              </motion.div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Report Approved
              </p>
              <p className="text-xs text-muted-foreground">
                by {history.at(-1)?.by ?? "—"} · {formatTime(history.at(-1)?.at ?? 0)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-1.5"
                onClick={handleShare}
                disabled={!lanConnected}
                title={
                  lanConnected
                    ? "Copy a LAN join link teammates can open"
                    : "Start a LAN session to generate a shareable join link"
                }
              >
                <Share2 className="size-4" />
                {copied
                  ? "Link copied!"
                  : lanConnected
                    ? "Share via LAN"
                    : "Share (no LAN session)"}
              </Button>
              <Button variant="outline" className="flex-1 gap-1.5" onClick={handleDownload}>
                <Download className="size-4" />
                Download
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => reset()}>
              Reset to Draft
            </Button>
          </motion.div>
        )}

        {/* ── REJECTED ────────────────────────────────────────────────────── */}
        {status === "REJECTED" && (
          <motion.div
            key="rejected"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex flex-col items-center gap-2 rounded-xl bg-destructive/5 py-5">
              <XCircle className="size-10 text-destructive" />
              <p className="text-sm font-semibold text-destructive">Report Rejected</p>
              {history.at(-1)?.comment && (
                <p className="mx-4 text-center text-xs text-muted-foreground italic">
                  "{history.at(-1)?.comment}"
                </p>
              )}
            </div>
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => transition("DRAFT", username, "returned to draft")}
            >
              <ChevronRight className="size-4" />
              Return to Draft
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History */}
      <HistoryTimeline entries={history} />
    </div>
  );
}
