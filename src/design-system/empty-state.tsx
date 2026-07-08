import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";

type Action =
  | {
      kind: "link";
      label: string;
      href: string;
      /** Optional progressive-enhancement handler (e.g. a desktop-window launcher intercept) — the href still navigates when nothing claims the click. */
      onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
    }
  | { kind: "button"; label: string; onClick: () => void };

/**
 * EmptyState kit — one component for every data-dependent screen so no surface
 * is ever a dead end. Per blueprint §3, the primary CTA is almost always
 * "Importer un fichier" → /dashboard/upload. Renders an optional secondary link.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondary,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: Action;
  secondary?: Action;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children}
      {action || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action ? <ActionButton action={action} /> : null}
          {secondary ? <ActionButton action={secondary} variant="ghost" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  action,
  variant = "default",
}: {
  action: Action;
  variant?: "default" | "ghost";
}) {
  if (action.kind === "link") {
    return (
      <Button asChild variant={variant}>
        <Link href={action.href} onClick={action.onClick}>
          {action.label}
        </Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
