"use client";

/**
 * Voice Tool Preview
 *
 * Reusable UI for showing the routed voice command before it is executed.
 *
 * Responsibilities:
 * - Show intent, confidence, safety, transcript, entities, and tool args.
 * - Support confirmation for mutating tool calls.
 * - Allow copy/export of tool args.
 * - Keep this component UI-only: no router/provider/tool side effects here.
 */

import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Info,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wand2,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import type {
  VoiceCommand,
  VoiceEntity,
  VoiceIntent,
  VoiceToolCall,
  VoiceToolSafety,
} from "@/features/data-formulator/core/voice/voice-command-router";
import { cn } from "@/shared/utils";

export interface VoiceToolPreviewRunPayload {
  command?: VoiceCommand;
  toolCall: VoiceToolCall;
}

export interface VoiceToolPreviewProps {
  command?: VoiceCommand | null;
  toolCall?: VoiceToolCall | null;
  transcript?: string;
  intent?: VoiceIntent | string;
  confidence?: number;
  entities?: VoiceEntity[];
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  runLabel?: string;
  cancelLabel?: string;
  showTranscript?: boolean;
  showEntities?: boolean;
  showArgs?: boolean;
  defaultArgsOpen?: boolean;
  defaultEntitiesOpen?: boolean;
  requireConfirmation?: boolean;
  footer?: ReactNode;

  onRun?: (payload: VoiceToolPreviewRunPayload) => void;
  onConfirm?: (payload: VoiceToolPreviewRunPayload) => void;
  onCancel?: () => void;
  onEditTranscript?: (transcript: string) => void;
  onCopyArgs?: (argsText: string) => void;
}

function formatConfidence(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const normalized = value > 1 ? value / 100 : value;

  return `${Math.round(Math.min(1, Math.max(0, normalized)) * 100)}%`;
}

function getConfidenceTone(value?: number): "high" | "medium" | "low" | "none" {
  if (typeof value !== "number" || !Number.isFinite(value)) return "none";

  const normalized = value > 1 ? value / 100 : value;

  if (normalized >= 0.8) return "high";
  if (normalized >= 0.6) return "medium";
  return "low";
}

function getSafetyTone(
  safety?: VoiceToolSafety,
  requiresConfirmation?: boolean,
): "safe" | "confirm" {
  if (requiresConfirmation) return "confirm";
  if (safety === "requires-confirmation") return "confirm";
  return "safe";
}

function stringifyArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function getEntityTone(type: VoiceEntity["type"]): string {
  switch (type) {
    case "metric":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-300";
    case "dimension":
      return "border-violet-500/25 bg-violet-500/10 text-violet-300";
    case "time_range":
      return "border-amber-500/25 bg-amber-500/10 text-amber-300";
    case "format":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
    case "threshold":
      return "border-rose-500/25 bg-rose-500/10 text-rose-300";
    case "language":
      return "border-blue-500/25 bg-blue-500/10 text-blue-300";
    case "channel":
      return "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300";
    default:
      return "border-white/10 bg-white/5 text-muted-foreground";
  }
}

function getIntentIcon(intent?: string): ReactNode {
  switch (intent) {
    case "kpi":
      return <Gauge className="h-3.5 w-3.5" />;
    case "dashboard":
      return <Wand2 className="h-3.5 w-3.5" />;
    case "investigate":
    case "explain":
      return <Info className="h-3.5 w-3.5" />;
    case "setup":
      return <TerminalSquare className="h-3.5 w-3.5" />;
    case "signal":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    default:
      return <Sparkles className="h-3.5 w-3.5" />;
  }
}

function normalizeTranscript(value?: string): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function VoiceToolPreview({
  command,
  toolCall: toolCallProp,
  transcript,
  intent,
  confidence,
  entities,
  disabled,
  compact = false,
  className,
  title = "Tool preview",
  description = "Review the routed voice command before running it.",
  confirmLabel = "Confirm and run",
  runLabel = "Run command",
  cancelLabel = "Cancel",
  showTranscript = true,
  showEntities = true,
  showArgs = true,
  defaultArgsOpen = true,
  defaultEntitiesOpen = false,
  requireConfirmation,
  footer,
  onRun,
  onConfirm,
  onCancel,
  onEditTranscript,
  onCopyArgs,
}: VoiceToolPreviewProps) {
  const [argsOpen, setArgsOpen] = useState(defaultArgsOpen);
  const [entitiesOpen, setEntitiesOpen] = useState(defaultEntitiesOpen);
  const [argsCopied, setArgsCopied] = useState(false);
  const [showRawArgs, setShowRawArgs] = useState(false);

  const toolCall = command?.toolCall ?? toolCallProp ?? null;

  const resolvedTranscript = normalizeTranscript(
    command?.normalized ?? command?.transcript ?? transcript,
  );

  const resolvedIntent = command?.intent ?? intent ?? "ask";
  const resolvedConfidence = command?.confidence ?? confidence;
  const resolvedEntities = command?.entities ?? entities ?? [];

  const argsText = useMemo(
    () => stringifyArgs(toolCall?.args ?? {}),
    [toolCall?.args],
  );

  const confidenceTone = getConfidenceTone(resolvedConfidence);

  const safetyTone = getSafetyTone(
    toolCall?.safety,
    requireConfirmation ?? toolCall?.requiresConfirmation,
  );

  const requiresConfirmation =
    requireConfirmation ?? toolCall?.requiresConfirmation ?? false;

  const canRun = Boolean(toolCall) && !disabled;

  const handleCopyArgs = useCallback(async () => {
    if (!toolCall) return;

    try {
      await navigator.clipboard.writeText(argsText);
      setArgsCopied(true);
      window.setTimeout(() => setArgsCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; still call callback with text.
    }

    onCopyArgs?.(argsText);
  }, [argsText, onCopyArgs, toolCall]);

  const handleRun = useCallback(() => {
    if (!toolCall || !canRun) return;

    const payload: VoiceToolPreviewRunPayload = {
      command: command ?? undefined,
      toolCall,
    };

    if (requiresConfirmation) {
      onConfirm?.(payload);
      return;
    }

    onRun?.(payload);
  }, [canRun, command, onConfirm, onRun, requiresConfirmation, toolCall]);

  if (!toolCall) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-white/10 bg-background/95 p-3 text-left shadow-xl backdrop-blur-xl",
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground">
            <Bot className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground">
              No tool selected yet
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              Transcribe and route a voice command to preview the selected tool.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-background/95 p-3 text-left shadow-xl backdrop-blur-xl",
        disabled && "opacity-70",
        compact && "p-2.5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
            safetyTone === "safe"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/25 bg-amber-500/10 text-amber-300",
          )}
        >
          {safetyTone === "safe" ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>

            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                safetyTone === "safe"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-300",
              )}
            >
              {safetyTone === "safe" ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <ShieldAlert className="h-3 w-3" />
              )}
              {requiresConfirmation ? "Confirmation required" : "Read-only"}
            </span>

            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                confidenceTone === "high"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : confidenceTone === "medium"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                    : confidenceTone === "low"
                      ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
                      : "border-white/10 bg-white/5 text-muted-foreground",
              )}
            >
              <Gauge className="h-3 w-3" />
              {formatConfidence(resolvedConfidence)}
            </span>
          </div>

          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            aria-label={cancelLabel}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <InfoCard
          icon={getIntentIcon(resolvedIntent)}
          label="Intent"
          value={String(resolvedIntent)}
        />
        <InfoCard
          icon={<TerminalSquare className="h-3.5 w-3.5" />}
          label="Tool"
          value={toolCall.toolName}
        />
        <InfoCard
          icon={
            toolCall.mutatesState ? (
              <ShieldAlert className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )
          }
          label="Safety"
          value={toolCall.mutatesState ? "Mutates state" : "Read-only"}
          tone={toolCall.mutatesState ? "warning" : "success"}
        />
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
            <Wand2 className="h-3.5 w-3.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">
              {toolCall.displayName}
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {toolCall.description}
            </div>
          </div>
        </div>
      </div>

      {showTranscript && resolvedTranscript && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Routed transcript
            </div>

            {onEditTranscript && (
              <button
                type="button"
                onClick={() => onEditTranscript(resolvedTranscript)}
                disabled={disabled}
                className="text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Edit
              </button>
            )}
          </div>

          <div className="text-xs leading-relaxed text-foreground">
            “{resolvedTranscript}”
          </div>
        </div>
      )}

      {showEntities && resolvedEntities.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
          <button
            type="button"
            onClick={() => setEntitiesOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {entitiesOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Extracted entities
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
              {resolvedEntities.length}
            </span>
          </button>

          {entitiesOpen && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {resolvedEntities.map((entity, index) => (
                <span
                  key={`${entity.type}-${entity.value}-${index}`}
                  title={`${entity.type} · ${formatConfidence(entity.confidence)}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                    getEntityTone(entity.type),
                  )}
                >
                  <BadgeCheck className="h-3 w-3" />
                  <span className="font-medium">{entity.type}</span>
                  <span>{entity.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {showArgs && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setArgsOpen((open) => !open)}
              className="flex min-w-0 items-center gap-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {argsOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Braces className="h-3 w-3" />
              Tool arguments
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowRawArgs((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                {showRawArgs ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                {showRawArgs ? "Pretty" : "Raw"}
              </button>

              <button
                type="button"
                onClick={handleCopyArgs}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                {argsCopied ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {argsCopied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {argsOpen && (
            <div className="max-h-72 overflow-auto p-2.5">
              {showRawArgs ? (
                <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed text-foreground">
                  {argsText}
                </pre>
              ) : (
                <ArgsPrettyView args={toolCall.args} />
              )}
            </div>
          )}
        </div>
      )}

      {footer && <div className="mt-3">{footer}</div>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <Clipboard className="h-3 w-3" />
          <span>
            {requiresConfirmation
              ? "This action requires confirmation before execution."
              : "This tool can run without extra confirmation."}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={disabled}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              canRun
                ? requiresConfirmation
                  ? "border border-amber-500/25 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                  : "border border-emerald-500/25 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                : "cursor-not-allowed border border-white/10 bg-white/5 text-muted-foreground",
            )}
          >
            {requiresConfirmation ? (
              <ShieldAlert className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {requiresConfirmation ? confirmLabel : runLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-2",
        tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/10"
          : tone === "warning"
            ? "border-amber-500/20 bg-amber-500/10"
            : "border-white/10 bg-white/5",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="truncate text-[11px] font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function ArgsPrettyView({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);

  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No arguments were generated for this tool.
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="rounded-lg border border-white/10 bg-white/[0.03] p-2"
        >
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {key}
          </div>
          <div className="break-words text-[11px] leading-relaxed text-foreground">
            {formatArgValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatArgValue(value: unknown): ReactNode {
  if (value == null) {
    return <span className="text-muted-foreground">null</span>;
  }

  if (typeof value === "string") {
    return value || <span className="text-muted-foreground">empty</span>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {value.slice(0, 12).map((item, index) => (
          <span
            key={`${String(item)}-${index}`}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </span>
        ))}
        {value.length > 12 && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
            +{value.length - 12}
          </span>
        )}
      </div>
    );
  }

  try {
    return (
      <pre className="whitespace-pre-wrap break-words text-[10px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } catch {
    return String(value);
  }
}
