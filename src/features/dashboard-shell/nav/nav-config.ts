/**
 * Navigation metadata for the dashboard shell.
 *
 * This module intentionally has NO `"use client"` directive so the static nav
 * metadata can be imported by server components and tree-shaken cleanly, and so
 * desktop / mobile / command-palette surfaces never drift from a single source.
 *
 * IA v3: French-first, 4 groups
 *   Rapport · Intelligence · Données · Sorties + footer (Aide/Paramètres).
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
  Users,
} from "lucide-react";

/** Tokenized badge tones — no raw colors. Only real/meaningful states. */
export type NavBadgeTone = "live" | "ai" | "info";

/** Shared badge color classes — one definition for every surface that renders a NavItem badge. */
export const NAV_BADGE_TONE_CLASSES: Record<NavBadgeTone, string> = {
  live: "bg-[color-mix(in_oklab,var(--negative)_18%,transparent)] text-negative",
  ai: "bg-[color-mix(in_oklab,var(--ai)_18%,transparent)] text-ai",
  info: "bg-muted text-muted-foreground",
};

/**
 * Access tier for nav filtering. Mirrors `DashboardRole` (settings store)
 * without importing it, so this module stays server-safe data.
 */
export type NavAccessRole = "viewer" | "editor" | "owner";

const NAV_ROLE_RANK: Record<NavAccessRole, number> = { viewer: 0, editor: 1, owner: 2 };

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
  /**
   * Minimum role that sees this item (default "editor"). Guests joining a
   * shared session as read-only viewers keep only the `minRole: "viewer"`
   * entries — shared report views, live monitoring, collaboration, help and
   * settings. This is UX shaping; real write protection is enforced by the
   * collab hub (server-side read-only) and per-screen permission checks.
   */
  minRole?: NavAccessRole;
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
        minRole: "viewer",
        children: [
          {
            title: "Vue d'ensemble",
            href: "/dashboard/telecom-report/overview",
            icon: LayoutDashboard,
            description: "KPIs, statut global et synthèse",
            keywords: ["accueil", "home", "overview", "mission control", "kpi"],
            minRole: "viewer",
          },
          {
            title: "Canaux",
            href: "/dashboard/telecom-report/canals",
            icon: Layers,
            description: "Analyse par canal transactionnel",
            minRole: "viewer",
          },
          {
            title: "Analyse",
            href: "/dashboard/telecom-report/analysis",
            icon: BarChart3,
            description: "Erreurs, opérateurs, régions et tendances",
            minRole: "viewer",
          },
          {
            title: "Données brutes",
            href: "/dashboard/telecom-report/grid",
            icon: Table2,
            description: "Exploration filtrée des transactions",
            minRole: "viewer",
          },
          {
            title: "Période",
            href: "/dashboard/telecom-report/period",
            icon: CalendarDays,
            description: "Studio de période et comparaisons",
            minRole: "viewer",
          },
          {
            title: "Journalier",
            href: "/dashboard/telecom-report/day",
            icon: Activity,
            description: "Analytics par jour",
            minRole: "viewer",
          },
          {
            title: "Historique",
            href: "/dashboard/telecom-report/history",
            icon: History,
            description: "Analyses et fichiers en cache",
            minRole: "viewer",
          },
          {
            title: "Configuration",
            href: "/dashboard/telecom-report/config",
            icon: Settings2,
            description: "Mapping, statuts et paramètres",
            minRole: "viewer",
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
  {
    label: "Sorties",
    items: [
      {
        title: "Collaboration",
        // collab-hub (annotations / approval / audit) is now folded into the
        // collaboration workspace, served at /dashboard/collaborative.
        href: "/dashboard/collaborative",
        icon: Users,
        description: "Espace d'équipe, commentaires et approbations",
        keywords: ["collaboration", "équipe", "team", "commentaire", "partage"],
        minRole: "viewer",
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
    minRole: "viewer",
  },
  {
    title: "Paramètres",
    href: "/dashboard/settings",
    icon: Settings,
    description: "Préférences et diagnostics",
    keywords: ["paramètres", "settings", "préférences", "thème", "langue"],
    minRole: "viewer",
  },
];

/** Flattened list (groups + children) for the command palette and pins. */
export const ALL_ITEMS: NavItem[] = [
  ...NAV_SECTIONS.flatMap((s) =>
    s.items.flatMap((item) => (item.children ? [item, ...item.children] : [item])),
  ),
  ...FOOTER_ITEMS,
];

// ─── Role-based visibility ────────────────────────────────────────────────────

/** True when `role` may see an item with the given `minRole` (default editor). */
export function navItemVisibleForRole(item: NavItem, role: NavAccessRole): boolean {
  return NAV_ROLE_RANK[role] >= NAV_ROLE_RANK[item.minRole ?? "editor"];
}

/** Filter a flat item list (children pruned recursively, childless hubs dropped). */
export function filterNavItemsForRole(items: NavItem[], role: NavAccessRole): NavItem[] {
  return items
    .filter((item) => navItemVisibleForRole(item, role))
    .map((item) =>
      item.children ? { ...item, children: filterNavItemsForRole(item.children, role) } : item,
    )
    .filter((item) => !item.children || item.children.length > 0);
}

/** Filter grouped sections, dropping sections left empty for the role. */
export function filterNavSectionsForRole(
  sections: NavSection[],
  role: NavAccessRole,
): NavSection[] {
  return sections
    .map((section) => ({ ...section, items: filterNavItemsForRole(section.items, role) }))
    .filter((section) => section.items.length > 0);
}

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
