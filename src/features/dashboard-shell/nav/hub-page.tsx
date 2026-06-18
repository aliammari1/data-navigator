"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/design-system/page-header";
import { StaggerGrid, StaggerItem } from "@/design-system/motion-components";
import { useSpotlight } from "@/design-system/use-spotlight";
import type { NavItem } from "@/features/dashboard-shell/nav/nav-config";

/**
 * Domain hub page (e.g. /dashboard/data, /dashboard/analysis). Gives a grouped
 * sidebar section a real discovery surface — launcher cards for each child —
 * instead of widening the nav. Cards use the spotlight + elevation utilities.
 */
export function HubPage({
  title,
  description,
  icon,
  items,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  items: NavItem[];
}) {
  return (
    <div className="">
      <PageHeader title={title} description={description} icon={icon} />
      <StaggerGrid className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <StaggerItem key={item.href}>
            <HubCard item={item} />
          </StaggerItem>
        ))}
      </StaggerGrid>
    </div>
  );
}

function HubCard({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const spotlight = useSpotlight<HTMLAnchorElement>();
  return (
    <Link
      href={item.href}
      {...spotlight}
      className="  group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-primary [&_svg]:size-5">
          <Icon aria-hidden="true" />
        </span>
        <ArrowRight className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      </div>
    </Link>
  );
}
