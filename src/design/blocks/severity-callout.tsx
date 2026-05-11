"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AtlasSeverity } from "../tokens";

interface CalloutProps {
  severity: AtlasSeverity;
  title?: string;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  action?: ReactNode;
}

const map: Record<
  AtlasSeverity,
  {
    icon: ReactNode;
    border: string;
    soft: string;
    fg: string;
  }
> = {
  info: {
    icon: <Info className="w-4 h-4" />,
    border: "border-[var(--atlas-info-border)]",
    soft: "bg-[var(--atlas-info-soft)]",
    fg: "text-[var(--atlas-info-fg)]",
  },
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    border: "border-[var(--atlas-success-border)]",
    soft: "bg-[var(--atlas-success-soft)]",
    fg: "text-[var(--atlas-success-fg)]",
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    border: "border-[var(--atlas-warning-border)]",
    soft: "bg-[var(--atlas-warning-soft)]",
    fg: "text-[var(--atlas-warning-fg)]",
  },
  danger: {
    icon: <AlertCircle className="w-4 h-4" />,
    border: "border-[var(--atlas-danger-border)]",
    soft: "bg-[var(--atlas-danger-soft)]",
    fg: "text-[var(--atlas-danger-fg)]",
  },
  accent: {
    icon: <Sparkles className="w-4 h-4" />,
    border: "border-[var(--atlas-accent-border)]",
    soft: "bg-[var(--atlas-accent-soft)]",
    fg: "text-[var(--atlas-accent-fg)]",
  },
};

export function AtlasCallout({
  severity,
  title,
  children,
  icon,
  className,
  action,
}: CalloutProps) {
  const m = map[severity];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[var(--atlas-radius-3)] border ${m.border} ${m.soft} px-3 py-2.5 ${className ?? ""}`}
    >
      <div className={`flex-none mt-0.5 ${m.fg}`}>{icon ?? m.icon}</div>
      <div className="flex-1 min-w-0">
        {title && (
          <div
            className={`text-xs font-semibold uppercase tracking-wide ${m.fg} mb-0.5`}
          >
            {title}
          </div>
        )}
        <div className="text-[13px] text-[var(--atlas-text)] leading-snug">
          {children}
        </div>
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}
