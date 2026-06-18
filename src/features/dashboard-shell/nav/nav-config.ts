/**
 * Navigation metadata for the dashboard shell.
 *
 * This module intentionally has NO `"use client"` directive so the static nav
 * metadata can be imported by server components and tree-shaken cleanly, and so
 * desktop / mobile / command-palette surfaces never drift from a single source.
 *
 * IA v2 (redesign blueprint §2): French-first, 5 groups
 *   Accueil · Rapport · Intelligence · Données · Sorties + footer (Aide/Paramètres).
 * Telecom's 8 sub-tabs LEAVE the sidebar (they live in an in-page tab rail);
 * the sidebar shows a single "Rapport Télécom" entry. Two group headers are hub
 * pages (/dashboard/analysis, /dashboard/data) whose children expand inline.
 */

import {
  Activity,
  BarChart3,
  Brain,
  CalendarDays,
  Clapperboard,
  Database,
  FileText,
  FlaskConical,
  Folders,
  GitBranch,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Map as MapIcon,
  Microscope,
  Radio,
  Receipt,
  Scale,
  Settings,
  Settings2,
  Sparkles,
  Table2,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

export type TelecomDashboardTab =
  | "overview"
  | "canals"
  | "analysis"
  | "grid"
  | "period"
  | "day"
  | "history"
  | "config";

/** Tokenized badge tones — no raw colors. Only real/meaningful states. */
export type NavBadgeTone = "live" | "ai" | "info";

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

/** Telecom in-page tab rail (rendered inside the report, not the sidebar). */
export const TELECOM_NAV_ITEMS: Array<{
  key: TelecomDashboardTab;
  label: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    key: "overview",
    label: "Vue d'ensemble",
    description: "KPIs, statut global et synthèse",
    icon: LayoutDashboard,
  },
  {
    key: "canals",
    label: "Canaux",
    description: "Analyse par canal transactionnel",
    icon: Layers,
  },
  {
    key: "analysis",
    label: "Analyse",
    description: "Erreurs, opérateurs, régions et tendances",
    icon: BarChart3,
  },
  {
    key: "grid",
    label: "Données brutes",
    description: "Exploration filtrée des transactions",
    icon: Table2,
  },
  {
    key: "period",
    label: "Période",
    description: "Studio de période et comparaisons",
    icon: CalendarDays,
  },
  {
    key: "day",
    label: "Journalier",
    description: "Analytics par jour",
    icon: Activity,
  },
  {
    key: "history",
    label: "Historique",
    description: "Analyses et fichiers en cache",
    icon: History,
  },
  {
    key: "config",
    label: "Configuration",
    description: "Mapping, statuts et paramètres",
    icon: Settings2,
  },
];

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Accueil",
    items: [
      {
        title: "Accueil",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Tableau de bord et synthèse du jour",
        keywords: ["accueil", "home", "overview", "mission control", "kpi"],
      },
    ],
  },
  {
    label: "Rapport",
    items: [
      {
        title: "Rapport Télécom",
        href: "/dashboard/telecom-report",
        icon: Receipt,
        description: "Rapport DailyTransactions — KPIs, canaux, analyse",
        keywords: ["telecom", "rapport", "report", "kpi", "canal", "daily"],
      },
      {
        title: "Surveillance Canaux",
        href: "/dashboard/monitor",
        icon: Radio,
        description: "Surveillance des opérations en direct",
        badge: "LIVE",
        badgeTone: "live",
        keywords: ["monitor", "surveillance", "live", "ops", "temps réel", "alerte"],
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        title: "Studio IA",
        href: "/dashboard/data-formulator",
        icon: FlaskConical,
        description: "Atelier IA : NL→SQL, agents, voix, RAG",
        badge: "IA",
        badgeTone: "ai",
        keywords: ["studio", "formulator", "ia", "ai", "sql", "agent", "voix", "query"],
      },
      {
        title: "Briefing IA",
        href: "/dashboard/ai-briefing",
        icon: Sparkles,
        description: "Briefings narratifs et synthèses vocales",
        badge: "IA",
        badgeTone: "ai",
        keywords: ["briefing", "narratif", "ia", "ai", "synthèse", "tts", "story"],
      },
      {
        title: "Analyse",
        href: "/dashboard/analysis",
        icon: Brain,
        description: "Statistiques, prévisions et géographie",
        keywords: ["analyse", "analysis", "stats", "intelligence"],
        children: [
          {
            title: "Analyse statistique",
            href: "/dashboard/ai-analysis",
            icon: Brain,
            description: "Insights, anomalies, corrélations",
            keywords: ["stats", "anomalie", "corrélation", "insight", "analyse"],
          },
          {
            title: "Analyses approfondies",
            href: "/dashboard/deep-analytics",
            icon: Microscope,
            description: "Cohortes, attribution, clustering",
            keywords: ["deep", "approfondie", "cohorte", "cluster", "attribution"],
          },
          {
            title: "Prévisions",
            href: "/dashboard/forecast",
            icon: TrendingUp,
            description: "Prévisions et scénarios",
            keywords: ["prévision", "forecast", "predict", "tendance", "ml", "scénario"],
          },
          {
            title: "Géographie",
            href: "/dashboard/geo-analysis",
            icon: MapIcon,
            description: "Analyse spatiale et régionale",
            keywords: ["géo", "geo", "carte", "map", "région", "spatial"],
          },
        ],
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
        title: "Données",
        href: "/dashboard/data",
        icon: Database,
        description: "Catalogue, profil, exploration et transformations",
        keywords: ["données", "data", "catalogue", "dataset"],
        children: [
          {
            title: "Catalogue",
            href: "/dashboard/folders",
            icon: Folders,
            description: "Organisation des jeux de données",
            keywords: ["catalogue", "dossier", "folder", "tag", "organiser"],
          },
          {
            title: "Profil des données",
            href: "/dashboard/parsed",
            icon: Table2,
            description: "Profilage des colonnes et qualité",
            keywords: ["profil", "profile", "colonne", "qualité", "parsed"],
          },
          {
            title: "Explorateur",
            href: "/dashboard/data-browser",
            icon: BarChart3,
            description: "Explorateur générique de jeux de données",
            keywords: ["explorateur", "browser", "explorer", "table"],
          },
          {
            title: "Transformations",
            href: "/dashboard/transform",
            icon: Layers,
            description: "Pipelines et ETL",
            keywords: ["transform", "etl", "pipeline", "transformation"],
          },
          {
            title: "Lignage",
            href: "/dashboard/lineage",
            icon: GitBranch,
            description: "Suivi du flux des données",
            keywords: ["lignage", "lineage", "graph", "dag", "flux"],
          },
          {
            title: "Réconciliation",
            href: "/dashboard/reconciliation",
            icon: Scale,
            description: "Rapprochement et audit des écarts",
            keywords: ["réconciliation", "reconcile", "écart", "audit", "balance"],
          },
          {
            title: "Journal d'activité",
            href: "/dashboard/history",
            icon: History,
            description: "Historique des actions et versions",
            keywords: ["journal", "history", "historique", "version", "activité"],
          },
        ],
      },
    ],
  },
  {
    label: "Sorties",
    items: [
      {
        title: "Studio de Rapports",
        href: "/dashboard/report-studio",
        icon: FileText,
        description: "Composer et exporter des rapports",
        keywords: ["rapport", "report", "studio", "export", "pdf", "publier"],
      },
      {
        title: "Théâtre Analytique",
        href: "/dashboard/analytics-theater",
        icon: Clapperboard,
        description: "Présentations immersives en scrollytelling",
        keywords: ["théâtre", "theater", "présentation", "scrollytelling", "cinema"],
      },
      {
        title: "Collaboration",
        // collab-hub (annotations / approval / audit) is now folded into the
        // collaboration workspace, served at /dashboard/collaborative.
        href: "/dashboard/collaborative",
        icon: Users,
        description: "Espace d'équipe, commentaires et approbations",
        keywords: ["collaboration", "équipe", "team", "commentaire", "partage"],
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
