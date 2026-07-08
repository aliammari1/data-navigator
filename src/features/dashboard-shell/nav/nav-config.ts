/**
 * Navigation metadata for the dashboard shell.
 *
 * This module intentionally has NO `"use client"` directive so the static nav
 * metadata can be imported by server components and tree-shaken cleanly, and so
 * desktop / mobile / command-palette surfaces never drift from a single source.
 *
 * IA v3: French-first, 4 groups
 *   Rapport · Intelligence · Données + footer (Aide/Paramètres).
 * "Rapport Télécom" is a hub whose 8 tabs (previously an in-page tab rail)
 * are now sidebar children — "Vue d'ensemble" doubles as the app's landing
 * page (bare /dashboard redirects there; there is no separate Accueil
 * screen).
 */

import {
  Activity,
  BarChart3,
  CalendarDays,
  FlaskConical,
  Folders,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Settings,
  Settings2,
  Table2,
  Upload,
} from "lucide-react";

/** Tokenized badge tones — no raw colors. Only real/meaningful states. */
export type NavBadgeTone = "live" | "ai" | "info";

/** Shared badge color classes — one definition for every surface that renders a NavItem badge. */
export const NAV_BADGE_TONE_CLASSES: Record<NavBadgeTone, string> = {
  live: "bg-[color-mix(in_oklab,var(--negative)_18%,transparent)] text-negative",
  ai: "bg-[color-mix(in_oklab,var(--ai)_18%,transparent)] text-ai",
  info: "bg-muted text-muted-foreground",
};

export interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  description: string;
  badge?: string;
  /** Tokenized tone for the badge (defaults to neutral). */
  badgeTone?: NavBadgeTone;
  /** @deprecated retained for older consumers; styling reads `badgeTone`. */
  badgeColor?: string;
  keywords?: string[];
  /** Group children — when present this item is a collapsible hub header. */
  children?: NavItem[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Rapport",
    items: [
      {
        title: "Rapport Télécom",
        href: "/dashboard/telecom-report",
        icon: Receipt,
        description: "Rapport DailyTransactions — KPIs, canaux, analyse",
        keywords: ["telecom", "rapport", "report", "kpi", "canal", "daily", "accueil", "home"],
        children: [
          {
            title: "Vue d'ensemble",
            href: "/dashboard/telecom-report/overview",
            icon: LayoutDashboard,
            description: "KPIs, statut global et synthèse",
            keywords: ["accueil", "home", "overview", "mission control", "kpi"],
          },
          {
            title: "Canaux",
            href: "/dashboard/telecom-report/canals",
            icon: Layers,
            description: "Analyse par canal transactionnel",
          },
          {
            title: "Analyse",
            href: "/dashboard/telecom-report/analysis",
            icon: BarChart3,
            description: "Erreurs, opérateurs, régions et tendances",
          },
          {
            title: "Données brutes",
            href: "/dashboard/telecom-report/grid",
            icon: Table2,
            description: "Exploration filtrée des transactions",
          },
          {
            title: "Période",
            href: "/dashboard/telecom-report/period",
            icon: CalendarDays,
            description: "Studio de période et comparaisons",
          },
          {
            title: "Journalier",
            href: "/dashboard/telecom-report/day",
            icon: Activity,
            description: "Analytics par jour",
          },
          {
            title: "Historique",
            href: "/dashboard/telecom-report/history",
            icon: History,
            description: "Analyses et fichiers en cache",
          },
          {
            title: "Configuration",
            href: "/dashboard/telecom-report/config",
            icon: Settings2,
            description: "Mapping, statuts et paramètres",
          },
        ],
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        title: "Formulateur",
        href: "/dashboard/data-formulator",
        icon: FlaskConical,
        description: "Visualisations par concepts, dérivées par l'IA",
        badge: "IA",
        badgeTone: "ai",
        keywords: ["formulateur", "formulator", "studio", "ia", "ai", "visualisation", "concept"],
      },
      {
        title: "Moudir",
        href: "/dashboard/moudir",
        icon: MessageCircle,
        description: "Assistant IA — posez vos questions en langage naturel",
        badge: "IA",
        badgeTone: "ai",
        keywords: ["moudir", "assistant", "ia", "ai", "chat", "question", "voix", "swarm"],
      },
    ],
  },
  {
    label: "Données",
    items: [
      {
        title: "Importer",
        href: "/dashboard/upload",
        icon: Upload,
        description: "Importer un fichier DailyTransactions ou CSV",
        keywords: ["import", "importer", "upload", "csv", "fichier", "json"],
      },
      {
        title: "Catalogue",
        href: "/dashboard/folders",
        icon: Folders,
        description: "Organisation des jeux de données",
        keywords: [
          "catalogue",
          "dossier",
          "folder",
          "tag",
          "organiser",
          "données",
          "data",
          "dataset",
        ],
      },
    ],
  },
];

export const FOOTER_ITEMS: NavItem[] = [
  {
    title: "Aide",
    href: "/dashboard/help",
    icon: HelpCircle,
    description: "Documentation et visite guidée",
    keywords: ["aide", "help", "docs", "support", "visite"],
  },
  {
    title: "Paramètres",
    href: "/dashboard/settings",
    icon: Settings,
    description: "Préférences et diagnostics",
    keywords: ["paramètres", "settings", "préférences", "thème", "langue"],
  },
];

/** Flattened list (groups + children) for the command palette and pins. */
export const ALL_ITEMS: NavItem[] = [
  ...NAV_SECTIONS.flatMap((s) =>
    s.items.flatMap((item) => (item.children ? [item, ...item.children] : [item])),
  ),
  ...FOOTER_ITEMS,
];

/**
 * Active-state predicate. Computed once in the parent and passed down so nav
 * buttons no longer each subscribe to the router via `usePathname()`.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

/** A group is active when its hub or any of its children matches the route. */
export function isNavGroupActive(pathname: string, item: NavItem): boolean {
  if (isNavItemActive(pathname, item.href)) return true;
  return (item.children ?? []).some((child) => isNavItemActive(pathname, child.href));
}
