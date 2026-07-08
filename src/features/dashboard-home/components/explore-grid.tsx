"use client";

import Fuse from "fuse.js";
import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { handleLauncherClick } from "@/features/dashboard-home/lib/open-app";
import {
  NAV_BADGE_TONE_CLASSES,
  NAV_SECTIONS,
  type NavItem,
  navItemVisibleForRole,
} from "@/features/dashboard-shell/nav/nav-config";
import { useDashboardAccess } from "@/platform/auth/dashboard-access";
import { cn } from "@/shared/utils";

/**
 * Every real destination reachable from Accueil, grouped exactly like the
 * sidebar's own IA — hub items (Analyse, Données) expand to their children so
 * each entry is a concrete page, not another hub with nothing behind it.
 */
const EXPLORE_GROUPS = NAV_SECTIONS.filter((section) => section.label !== "Accueil").map(
  (section) => ({
    label: section.label,
    items: section.items.flatMap((item) => (item.children?.length ? item.children : [item])),
  }),
);

/** The 3 destinations most people reach for — get a bigger, richer tile instead of a plain row. */
const FEATURED_HREFS = [
  "/dashboard/telecom-report",
  "/dashboard/data-formulator",
  "/dashboard/upload",
];

/** href → desktop app id, so these open in-place when the desktop shell is active (see open-app.ts). */
const APP_ID_BY_HREF: Record<string, string> = {
  "/dashboard/telecom-report": "telecom",
  "/dashboard/monitor": "monitor",
  "/dashboard/data-formulator": "moudir",
  "/dashboard/ai-briefing": "ai-briefing",
  "/dashboard/ai-analysis": "ai-analysis",
  "/dashboard/deep-analytics": "deep-analytics",
  "/dashboard/forecast": "forecast",
  "/dashboard/geo-analysis": "geo",
  "/dashboard/upload": "upload",
  "/dashboard/folders": "folders",
  "/dashboard/parsed": "parsed",
  "/dashboard/data-browser": "data-browser",
  "/dashboard/transform": "transform",
  "/dashboard/lineage": "lineage",
  "/dashboard/reconciliation": "reconciliation",
  "/dashboard/history": "history",
  "/dashboard/report-studio": "report-studio",
  "/dashboard/analytics-theater": "theater",
  "/dashboard/collaborative": "collaboration",
};

function launcherProps(href: string) {
  const appId = APP_ID_BY_HREF[href];
  return { href, onClick: appId ? handleLauncherClick(appId, href) : undefined };
}

/**
 * Explorer — the gate to everything else in the app. Three destinations get
 * a featured tile (weight varies by importance, not a wall of identical
 * squares), the rest are dense grouped lists, and a real search filters all
 * 19 by title/description when typing beats scanning.
 */
export function ExploreGrid() {
  const [query, setQuery] = useState("");
  // Same visibility rule as the sidebar: guests only see viewer-safe destinations.
  const { role } = useDashboardAccess();

  const exploreGroups = useMemo(
    () =>
      EXPLORE_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => navItemVisibleForRole(item, role)),
      })).filter((group) => group.items.length > 0),
    [role],
  );
  const visibleItems = useMemo(() => exploreGroups.flatMap((g) => g.items), [exploreGroups]);

  const fuse = useMemo(
    () =>
      new Fuse(visibleItems, {
        keys: ["title", "description", "keywords"],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [visibleItems],
  );

  const results = useMemo(() => {
    const q = query.trim();
    return q ? fuse.search(q).map((r) => r.item) : null;
  }, [query, fuse]);

  const featured = visibleItems.filter((item) => FEATURED_HREFS.includes(item.href));

  return (
    <section aria-label="Explorer">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Explorer</h2>
          <p className="text-xs text-muted-foreground">{visibleItems.length} destinations</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une destination…"
            className="w-full rounded-lg border border-input bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      </div>

      {results ? (
        <SearchResults items={results} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {featured.map((item) => (
              <FeaturedTile key={item.href} item={item} />
            ))}
          </div>

          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {exploreGroups.map((group) => (
              <div key={group.label}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h3>
                <ul className="flex flex-col">
                  {group.items
                    .filter((item) => !FEATURED_HREFS.includes(item.href))
                    .map((item) => (
                      <li key={item.href}>
                        <ExploreRow item={item} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SearchResults({ items }: { items: NavItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Aucune destination ne correspond.
      </p>
    );
  }
  return (
    <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.href}>
          <ExploreRow item={item} showDescription />
        </li>
      ))}
    </ul>
  );
}

function ExploreRow({ item, showDescription }: { item: NavItem; showDescription?: boolean }) {
  return (
    <Link
      {...launcherProps(item.href)}
      className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <item.icon
        className="size-4 flex-none text-muted-foreground/70 transition-colors group-hover:text-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.title}</span>
        {showDescription ? (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        ) : null}
      </span>
      {item.badge ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
            NAV_BADGE_TONE_CLASSES[item.badgeTone ?? "info"],
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function FeaturedTile({ item }: { item: NavItem }) {
  return (
    <Link
      {...launcherProps(item.href)}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary [&_svg]:size-5">
          <item.icon aria-hidden="true" />
        </span>
        <div className="flex items-center gap-1.5">
          {item.badge ? (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                NAV_BADGE_TONE_CLASSES[item.badgeTone ?? "info"],
              )}
            >
              {item.badge}
            </span>
          ) : null}
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
          />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
      </div>
    </Link>
  );
}
