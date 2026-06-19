"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/utils";

const TELECOM_BASE = "/dashboard/telecom-report";

/** Report sections, in the order they appear across the top of the shell. */
const TELECOM_TABS: ReadonlyArray<{ seg: string; label: string }> = [
  { seg: "overview", label: "Vue d'ensemble" },
  { seg: "canals", label: "Canaux" },
  { seg: "analysis", label: "Analyse" },
  { seg: "grid", label: "Données" },
  { seg: "period", label: "Période" },
  { seg: "day", label: "Jour" },
  { seg: "history", label: "Historique" },
  { seg: "config", label: "Config" },
];

/**
 * Horizontal tab strip for the telecom report shell.
 *
 * The eight report sections are otherwise reachable only by URL; this strip
 * makes them discoverable. Active state is derived from `usePathname()` (the
 * bare base path redirects to `overview`, so it is treated as active there).
 * Uses `next/link` so navigation stays client-side both on the standalone
 * route and inside the framed desktop-window host.
 */
export function TelecomTabStrip() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections du rapport télécom"
      className="-mb-px flex items-center gap-1 overflow-x-auto"
    >
      {TELECOM_TABS.map(({ seg, label }) => {
        const href = `${TELECOM_BASE}/${seg}`;
        const active = pathname === href || (seg === "overview" && pathname === TELECOM_BASE);

        return (
          <Link
            key={seg}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-none whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
