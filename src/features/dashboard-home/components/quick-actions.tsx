"use client";

import {
  ArrowUpRight,
  Brain,
  FlaskConical,
  type LucideIcon,
  Radio,
  TrendingUp,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { StaggerGrid, StaggerItem } from "@/design-system/motion-components";
import { useSpotlight } from "@/design-system/use-spotlight";
import { type DesktopAppId, handleLauncherClick } from "@/features/dashboard-home/lib/open-app";

interface QuickAction {
  appId: DesktopAppId;
  route: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile — warm, per-action hue. */
  tile: string;
}

/**
 * "Reprendre" / quick-actions. Each card is a real anchor (route fallback for
 * classic /dashboard mode) AND dispatches `desktop:open-app` so the desktop
 * window manager can open it in-place. See `lib/open-app.ts` for the contract.
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    appId: "moudir",
    route: "/dashboard/data-formulator",
    title: "Studio IA",
    description: "Conversez avec vos données — NL→SQL, agents, voix.",
    icon: FlaskConical,
    tile: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300",
  },
  {
    appId: "telecom",
    route: "/dashboard/telecom-report/overview",
    title: "Rapport Télécom",
    description: "Le rapport du jour : KPIs, canaux, anomalies.",
    icon: Radio,
    tile: "border-orange-500/25 bg-orange-500/10 text-orange-600 dark:text-orange-300",
  },
  {
    appId: "upload",
    route: "/dashboard/upload",
    title: "Importer",
    description: "Chargez un fichier DailyTransactions ou un CSV.",
    icon: Upload,
    tile: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  {
    appId: "forecast",
    route: "/dashboard/forecast",
    title: "Prévisions",
    description: "Scénarios et tendances calculés localement.",
    icon: TrendingUp,
    tile: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  {
    appId: "ai-analysis",
    route: "/dashboard/ai-analysis",
    title: "Analyse",
    description: "Statistiques, insights et détection d'anomalies.",
    icon: Brain,
    tile: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
];

export function QuickActions() {
  return (
    <section aria-label="Reprendre">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Reprendre</h2>
        <span className="text-xs text-muted-foreground">Vos espaces de travail</span>
      </div>
      <StaggerGrid className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_ACTIONS.map((action) => (
          <StaggerItem key={action.appId}>
            <QuickActionCard action={action} />
          </StaggerItem>
        ))}
      </StaggerGrid>
    </section>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const spotlight = useSpotlight<HTMLAnchorElement>();
  const Icon = action.icon;
  return (
    <Link
      href={action.route}
      onClick={handleLauncherClick(action.appId, action.route)}
      {...spotlight}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex size-11 items-center justify-center rounded-xl border [&_svg]:size-5 ${action.tile}`}
        >
          <Icon aria-hidden="true" />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{action.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{action.description}</p>
      </div>
    </Link>
  );
}
