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
  { seg: "history", label: "Historique" },
  { seg: "config", label: "Config" },
];

/**
 * Horizontal tab strip for the telecom report shell.
 *
 * When `onTabChange` is provided (desktop-window mode), renders buttons with
 * local-state navigation so clicks don't affect the main app's URL.
 * Otherwise uses `next/link` for URL-based navigation (standalone route).
 */
export function TelecomTabStrip({
  activeTab,
  onTabChange,
}: {
  activeTab?: string;
  onTabChange?: (seg: string) => void;
}) {
  const pathname = usePathname();

  const tabClass = (active: boolean) =>
    cn(
      "flex-none whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      aria-label="Sections du rapport télécom"
      className="-mb-px flex items-center gap-1 overflow-x-auto"
    >
      {TELECOM_TABS.map(({ seg, label }) => {
        const active = onTabChange
          ? activeTab === seg
          : pathname === `${TELECOM_BASE}/${seg}` ||
            (seg === "overview" && pathname === TELECOM_BASE);

        if (onTabChange) {
          return (
            <button
              key={seg}
              type="button"
              onClick={() => onTabChange(seg)}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              {label}
            </button>
          );
        }

        return (
          <Link
            key={seg}
            href={`${TELECOM_BASE}/${seg}`}
            aria-current={active ? "page" : undefined}
            className={tabClass(active)}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
