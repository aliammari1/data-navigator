"use client";

/**
 * Voice Transcript Review
 *
 * Reusable transcript review UI for the voice-agent pipeline.
 *
 * Responsibilities:
 * - Show the raw STT transcript.
 * - Allow editing before routing.
 * - Show language/model/audio metadata.
 * - Let the user accept, retry, clear, or cancel.
 * - Keep this component UI-only: no VAD/STT/router side effects here.
 */

import {
  CheckCircle2,
  Clock,
  Languages,
  MessageSquareText,
  Mic,
  Pencil,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/shared/utils";
import {
  mapLanguageHintToDisplayLabel,
  type SttEngine,
  type VoiceLanguageHint,
  type VoiceRuntime,
} from "@/features/data-formulator/core/voice/voice-model-registry";

export interface VoiceTranscriptReviewMetadata {
  language?: VoiceLanguageHint | string;
  sttEngine?: SttEngine | string;
  runtime?: VoiceRuntime | string;
  model?: string;
  audioDurationMs?: number;
  latencyMs?: number;
  sampleRate?: number;
  confidence?: number;
}

export interface VoiceTranscriptReviewProps {
  transcript: string;
  metadata?: VoiceTranscriptReviewMetadata;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  title?: string;
  description?: string;
  acceptLabel?: string;
  retryLabel?: string;
  cancelLabel?: string;
  showOriginal?: boolean;
  showMetadata?: boolean;
  showCharacterCount?: boolean;
  minLength?: number;
  maxLength?: number;
  footer?: ReactNode;

  onAccept: (transcript: string) => void;
  onRetry?: () => void;
  onCancel?: () => void;
  onClear?: () => void;
  onChange?: (transcript: string) => void;
}

function normalizeTranscript(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function formatMs(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatSampleRate(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}kHz`;
  return `${value}Hz`;
}

function formatConfidence(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const normalized = value > 1 ? value / 100 : value;

  return `${Math.round(Math.min(1, Math.max(0, normalized)) * 100)}%`;
}

function getLanguageLabel(language?: VoiceLanguageHint | string): string {
  if (!language) return "Auto";

  if (
    language === "auto" ||
    language === "ar" ||
    language === "ar-TN" ||
    language === "fr" ||
    language === "en"
  ) {
    return mapLanguageHintToDisplayLabel(language);
  }

  return language;
}

function getTranscriptQuality({
  text,
  minLength,
  maxLength,
}: {
  text: string;
  minLength: number;
  maxLength?: number;
}): {
  valid: boolean;
  label: string;
  tone: "success" | "warning" | "danger";
  message: string;
} {
  const trimmed = normalizeTranscript(text);

  if (!trimmed) {
    return {
      valid: false,
      label: "Empty",
      tone: "danger",
      message: "Transcript is empty.",
    };
  }

  if (trimmed.length < minLength) {
    return {
      valid: false,
      label: "Too short",
      tone: "warning",
      message: `Transcript should be at least ${minLength} characters.`,
    };
  }

  if (maxLength && trimmed.length > maxLength) {
    return {
      valid: false,
      label: "Too long",
      tone: "warning",
      message: `Transcript should stay under ${maxLength} characters.`,
    };
  }

  return {
    valid: true,
    label: "Ready",
    tone: "success",
    message: "Transcript is ready to route.",
  };
}

export function VoiceTranscriptReview({
  transcript,
  metadata,
  disabled,
  autoFocus = true,
  className,
  title = "Review transcript",
  description = "Edit the transcript if needed, then route it to the local command router.",
  acceptLabel = "Use transcript",
  retryLabel = "Retry",
  cancelLabel = "Cancel",
  showOriginal = true,
  showMetadata = true,
  showCharacterCount = true,
  minLength = 2,
  maxLength = 2000,
  footer,
  onAccept,
  onRetry,
  onCancel,
  onClear,
  onChange,
}: VoiceTranscriptReviewProps) {
  const [draft, setDraft] = useState(transcript);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const normalizedDraft = useMemo(() => normalizeTranscript(draft), [draft]);

  const originalNormalized = useMemo(
    () => normalizeTranscript(transcript),
    [transcript],
  );

  const changed = normalizedDraft !== originalNormalized;

  const quality = useMemo(
    () =>
      getTranscriptQuality({
        text: draft,
        minLength,
        maxLength,
      }),
    [draft, maxLength, minLength],
  );

  const canAccept = quality.valid && !disabled;

  useEffect(() => {
    setDraft(transcript);
  }, [transcript]);

  useEffect(() => {
    if (!autoFocus) return;

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    });
  }, [autoFocus]);

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      onChange?.(value);
    },
    [onChange],
  );

  const handleAccept = useCallback(() => {
    if (!canAccept) return;
    onAccept(normalizedDraft);
  }, [canAccept, normalizedDraft, onAccept]);

  const handleClear = useCallback(() => {
    setDraft("");
    onChange?.("");
    onClear?.();
  }, [onChange, onClear]);

  const handleRestoreOriginal = useCallback(() => {
    setDraft(transcript);
    onChange?.(transcript);
  }, [onChange, transcript]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-background/95 p-3 text-left shadow-xl backdrop-blur-xl",
        disabled && "opacity-70",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
          <MessageSquareText className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>

            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px]",
                quality.tone === "success"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : quality.tone === "warning"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-300",
              )}
            >
              {quality.label}
            </span>

            {changed && (
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                Edited
              </span>
            )}
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

      {showMetadata && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <MetadataBadge
            icon={<Languages className="h-3 w-3" />}
            label={getLanguageLabel(metadata?.language)}
          />

          <MetadataBadge
            icon={<Sparkles className="h-3 w-3" />}
            label={metadata?.sttEngine ?? "STT"}
          />

          <MetadataBadge
            icon={<Mic className="h-3 w-3" />}
            label={metadata?.runtime ?? "runtime"}
          />

          <MetadataBadge
            icon={<Clock className="h-3 w-3" />}
            label={`audio ${formatMs(metadata?.audioDurationMs)}`}
          />

          <MetadataBadge
            icon={<Clock className="h-3 w-3" />}
            label={`stt ${formatMs(metadata?.latencyMs)}`}
          />

          <MetadataBadge
            icon={<GaugeIcon />}
            label={`confidence ${formatConfidence(metadata?.confidence)}`}
          />

          {metadata?.sampleRate && (
            <MetadataBadge
              icon={<Mic className="h-3 w-3" />}
              label={formatSampleRate(metadata.sampleRate)}
            />
          )}
        </div>
      )}

      {showOriginal && transcript && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            Original STT output
          </div>
          <div className="line-clamp-2 text-xs leading-relaxed text-foreground/85">
            “{transcript}”
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Pencil className="h-3 w-3" />
            Editable transcript
          </div>

          {showCharacterCount && (
            <div
              className={cn(
                "text-[10px]",
                maxLength && draft.length > maxLength
                  ? "text-rose-300"
                  : "text-muted-foreground",
              )}
            >
              {draft.length}
              {maxLength ? `/${maxLength}` : ""}
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          placeholder="Edit the transcript before routing..."
          className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-white/5 p-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-emerald-500/35 disabled:cursor-not-allowed disabled:opacity-60"
        />

        {!quality.valid && (
          <div
            className={cn(
              "mt-1 text-[10px]",
              quality.tone === "danger" ? "text-rose-300" : "text-amber-300",
            )}
          >
            {quality.message}
          </div>
        )}
      </div>

      {footer && <div className="mt-3">{footer}</div>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <RefreshCcw className="h-3 w-3" />
              {retryLabel}
            </button>
          )}

          <button
            type="button"
            onClick={handleRestoreOriginal}
            disabled={disabled || !changed}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <RefreshCcw className="h-3 w-3" />
            Restore
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || !draft}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>

        <button
          type="button"
          onClick={handleAccept}
          disabled={!canAccept}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            canAccept
              ? "border border-emerald-500/25 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              : "cursor-not-allowed border border-white/10 bg-white/5 text-muted-foreground",
          )}
        >
          <Send className="h-3.5 w-3.5" />
          {acceptLabel}
        </button>
      </div>
    </div>
  );
}

function MetadataBadge({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function GaugeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 14a8 8 0 0 1 16 0" />
      <path d="m12 14 4-4" />
      <path d="M12 14h.01" />
    </svg>
  );
}
