import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader v2 — the single page-title primitive every screen must use, so the
 * display ramp (30/36 semibold) is identical app-wide. Replaces the per-feature
 * headers that drifted to `text-sm h1`s and ad-hoc spacing.
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Right-aligned action cluster (buttons, menus). */
  actions?: ReactNode;
  /** Small tracked label above the title (e.g. section / dataset name). */
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex size-10 flex-none items-center justify-center rounded-xl border border-border bg-card text-primary shadow-[var(--shadow-1)] [&_svg]:size-5">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-pretty text-3xl font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-none flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
