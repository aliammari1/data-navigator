"use client";

/**
 * Reusable, accessible settings controls.
 *
 * These replace the previous hand-rolled `Toggle` (a bare `<button role=switch>`
 * with no label association), native `<select>`, and raw `<input type=range>`
 * that fired a store write on every intermediate value. They are built on the
 * project's existing Radix-based primitives (`@/components/ui/*`) for WAI-ARIA
 * correctness and keyboard support, and the numeric/slider controls commit to
 * the store only on blur / `onValueCommit` to kill the per-keystroke /
 * per-drag write storm.
 */

import { useEffect, useId, useState } from "react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/shared/utils";
import {
  type NumericFieldName,
  parseNullDisplay,
  parseNumericSetting,
} from "../lib/settings-schema";

// ─── Section wrapper ──────────────────────────────────────────────────────────

export function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

// ─── Row item ─────────────────────────────────────────────────────────────────

export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <label
          htmlFor={htmlFor}
          className="text-sm text-foreground block"
        >
          {label}
        </label>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
        )}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

// ─── Toggle (Radix Switch) ──────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-sm text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
        )}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="flex-none"
      />
    </div>
  );
}

// ─── Select (Radix) ─────────────────────────────────────────────────────────────

export function SettingSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="sm" className="min-w-[8rem]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Validated number field (commit on blur via zod) ────────────────────────────

export function NumberSetting({
  field,
  value,
  onCommit,
  suffix,
  className,
}: {
  field: NumericFieldName;
  value: number;
  onCommit: (v: number) => void;
  suffix?: string;
  className?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));

  // Keep the draft in sync when the committed value changes elsewhere
  // (e.g. reset-to-defaults / restore).
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseNumericSetting(field, draft);
    if (parsed.success) {
      if (parsed.value !== value) onCommit(parsed.value);
      setDraft(String(parsed.value));
    } else {
      setDraft(String(value)); // revert invalid input
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cn(
          "w-24 bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 text-right tabular-nums",
          className,
        )}
      />
      {suffix && (
        <span className="text-xs text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

// ─── Validated text field (commit on blur) ──────────────────────────────────────

export function NullDisplayField({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const parsed = parseNullDisplay(draft);
    if (parsed.success) {
      if (parsed.value !== value) onCommit(parsed.value);
    } else {
      setDraft(value);
    }
  };

  return (
    <input
      id={id}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      maxLength={8}
      className="w-20 bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 text-center font-mono"
    />
  );
}

// ─── Slider (commit on value-commit, draft shown live) ──────────────────────────

export function SliderSetting({
  field,
  value,
  onCommit,
  min,
  max,
  step = 1,
  ariaLabel,
}: {
  field: NumericFieldName;
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[draft]}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onValueChange={(v) => setDraft(v[0] ?? draft)}
        onValueCommit={(v) => {
          // Validate/clamp through the schema before committing.
          const next = parseNumericSetting(field, v[0] ?? draft);
          if (next.success && next.value !== value) onCommit(next.value);
        }}
        className="w-28"
      />
      <span className="text-sm text-foreground w-5 text-center tabular-nums">
        {draft}
      </span>
    </div>
  );
}

// ─── Quota progress bar ─────────────────────────────────────────────────────────

export function QuotaBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <Progress
      value={clamped}
      className={cn(
        clamped > 85 && "[&_[data-slot=progress-indicator]]:bg-red-500",
        clamped > 60 &&
          clamped <= 85 &&
          "[&_[data-slot=progress-indicator]]:bg-amber-500",
      )}
    />
  );
}
