"use client";

import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { AtlasSpinner } from "../primitives/spinner";

export function AtlasEmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-12 h-12 rounded-full border border-[var(--atlas-border)] bg-[var(--atlas-surface)] flex items-center justify-center text-[var(--atlas-text-subtle)] mb-4">
        {icon ?? <Inbox className="w-5 h-5" />}
      </div>
      <h3 className="text-sm font-semibold text-[var(--atlas-text)]">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--atlas-text-subtle)] mt-1 max-w-sm leading-snug">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AtlasLoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-12 ${className ?? ""}`}
    >
      <AtlasSpinner />
      <span className="text-xs text-[var(--atlas-text-muted)]">{label}</span>
    </div>
  );
}

export function AtlasErrorState({
  title = "Something went wrong",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-12 h-12 rounded-full border border-[var(--atlas-danger-border)] bg-[var(--atlas-danger-soft)] flex items-center justify-center text-[var(--atlas-danger-fg)] mb-3">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--atlas-text)]">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--atlas-text-subtle)] mt-1 max-w-md leading-snug">
          {description}
        </p>
      )}
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 text-xs text-[var(--atlas-accent-fg)] hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
