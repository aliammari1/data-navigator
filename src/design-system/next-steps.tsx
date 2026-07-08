import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/utils";

export type NextStep = {
  icon: LucideIcon;
  label: string;
  hint?: string;
  href: string;
};

/**
 * NextSteps — the slim "golden path" strip that makes the connected journey
 * (Importer → Profiler → Explorer → Analyser → Rapporter → Exporter) legible.
 * Dropped at the bottom of every golden-path screen with 2–3 contextual actions
 * so no screen is an isolated island.
 */
export function NextSteps({
  steps,
  title = "Étapes suivantes",
  className,
}: {
  steps: NextStep[];
  title?: string;
  className?: string;
}) {
  if (steps.length === 0) return null;
  return (
    <section
      aria-label={title}
      className={cn("rounded-xl border border-border bg-card/50 p-4", className)}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.href + step.label}
              href={step.href}
              className="  group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 flex-none items-center justify-center rounded-lg border border-border bg-background text-primary [&_svg]:size-4">
                <Icon aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {step.label}
                </span>
                {step.hint ? (
                  <span className="block truncate text-xs text-muted-foreground">{step.hint}</span>
                ) : null}
              </span>
              <ArrowRight className="size-4 flex-none text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
