"use client";

/**
 * Shared scene-state surfaces (empty / loading / error) for the analytics
 * theater, built on the app's shadcn semantic tokens. These replace the former
 * legacy design-system state blocks with the same props and behavior so theater
 * scenes keep consistent state handling.
 */

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils";

export function SceneEmptyState({
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
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SceneLoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-12", className)}>
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function SceneErrorState({
  title = "Something went wrong",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      )}
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 text-xs text-primary hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
