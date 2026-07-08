"use client";

/**
 * Desktop app registry.
 *
 * Maps an `appId` to its window metadata + a lazy loader for the screen
 * component. Every existing feature screen is hosted as-is (no rewrite) inside
 * a desktop window via `next/dynamic`, so the desktop is a thin window manager
 * over the feature folders rather than a fork of them.
 *
 * Accent hues are warm (Daily-Edition flavoured) so the workspace reads like a
 * friendly desktop OS instead of a dark-SaaS console.
 */

import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  Clapperboard,
  Database,
  Eye,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Folders,
  Gauge,
  GitBranch,
  HelpCircle,
  History,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  MessageCircle,
  Microscope,
  Radio,
  Receipt,
  Scale,
  Settings,
  Sparkles,
  Table2,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const loading = () => (
  <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">
    <div className="flex items-center gap-2">
      <span className="size-2 animate-ping rounded-full bg-primary" />
      Chargement…
    </div>
  </div>
);

/** A hosted screen component (props are app-defined). */
// biome-ignore lint/suspicious/noExplicitAny: registry hosts heterogeneous screens
type Screen = ComponentType<any>;

export interface DesktopApp {
  id: string;
  title: string;
  /** Short tag used in the launcher. */
  blurb: string;
  icon: LucideIcon;
  /** Warm accent hue (0-360) for the window chrome + launcher tile. */
  hue: number;
  defaultSize: { w: number; h: number };
  /** Single-instance apps focus the existing window instead of re-opening. */
  singleInstance?: boolean;
  /** Show in the launcher grid (utility apps can be hidden). */
  inLauncher?: boolean;
  /** Pin to the dock by default. */
  pinned?: boolean;
  /** Native hosted screen (preferred — shares live stores, no reload). */
  Component?: Screen;
  /**
   * Route hosted in an in-window iframe. Used for multi-route apps (e.g. the
   * telecom report) that have no single screen component. The dashboard layout
   * renders bare chrome when framed, so the route appears window-native.
   */
  route?: string;
}

const d = (loader: () => Promise<{ default: Screen } | Record<string, Screen>>, name?: string) =>
  dynamic(
    name
      ? () => loader().then((m) => (m as Record<string, Screen>)[name])
      : (loader as () => Promise<{ default: Screen }>),
    { ssr: false, loading },
  );

export const DESKTOP_APPS: DesktopApp[] = [
  {
    id: "home",
    title: "Accueil",
    blurb: "Synthèse du jour",
    icon: LayoutDashboard,
    hue: 28,
    defaultSize: { w: 1100, h: 760 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    Component: d(() => import("@/features/dashboard-home/screens/DashboardHomeScreen")),
  },
  {
    id: "moudir",
    title: "Formulateur — Studio IA",
    blurb: "Visualisations par concepts, dérivées par l'IA",
    icon: FlaskConical,
    hue: 268,
    defaultSize: { w: 1080, h: 820 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    Component: d(() => import("@/features/data-formulator/screens/FormulatorScreen")),
  },
  {
    id: "moudir-chat",
    title: "Moudir — Assistant IA",
    blurb: "Posez vos questions en langage naturel",
    icon: MessageCircle,
    hue: 268,
    defaultSize: { w: 960, h: 760 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    Component: d(() => import("@/features/data-formulator/screens/MoudirChatScreen")),
  },
  {
    id: "commander",
    title: "Commandant IA",
    blurb: "Pilotez l'app à la voix",
    icon: Bot,
    hue: 152,
    defaultSize: { w: 560, h: 680 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    Component: d(() => import("@/features/ai-commander/screens/CommanderScreen")),
  },
  {
    id: "eye-tracking",
    title: "Suivi du regard",
    blurb: "Attention & heatmap",
    icon: Eye,
    hue: 198,
    defaultSize: { w: 560, h: 620 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    Component: d(() => import("@/features/eye-tracking/screens/EyeTrackingScreen")),
  },
  {
    id: "telecom",
    title: "Rapport Télécom",
    blurb: "DailyTransactions",
    icon: Receipt,
    hue: 18,
    defaultSize: { w: 1180, h: 800 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    // Native Component (not iframe) so it shares the Electron IPC bridge,
    // Zustand stores, and React Query cache with the rest of the app.
    Component: d(
      () => import("@/features/desktop/screens/TelecomDesktopScreen"),
      "TelecomDesktopScreen",
    ),
  },
  {
    id: "ai-briefing",
    title: "Briefing IA",
    blurb: "Synthèses narratives",
    icon: Sparkles,
    hue: 286,
    defaultSize: { w: 820, h: 760 },
    inLauncher: true,
    Component: d(() => import("@/features/ai-briefing/screens/AIBriefingScreen")),
  },
  {
    id: "ai-analysis",
    title: "Analyse statistique",
    blurb: "Insights & anomalies",
    icon: Brain,
    hue: 244,
    defaultSize: { w: 1080, h: 780 },
    inLauncher: true,
    Component: d(() => import("@/features/ai-analysis/screens/AiAnalysisScreen")),
  },
  {
    id: "deep-analytics",
    title: "Analyses approfondies",
    blurb: "Cohortes & clustering",
    icon: Microscope,
    hue: 220,
    defaultSize: { w: 1080, h: 780 },
    inLauncher: true,
    Component: d(
      () => import("@/features/deep-analytics/screens/DeepAnalyticsScreen"),
      "DeepAnalyticsScreen",
    ),
  },
  {
    id: "forecast",
    title: "Prévisions",
    blurb: "Scénarios & tendances",
    icon: TrendingUp,
    hue: 142,
    defaultSize: { w: 1080, h: 760 },
    inLauncher: true,
    Component: d(
      () => import("@/features/forecast-intelligence/screens/ForecastScreen"),
      "ForecastScreen",
    ),
  },
  {
    id: "geo",
    title: "Géographie",
    blurb: "Analyse spatiale",
    icon: MapIcon,
    hue: 168,
    defaultSize: { w: 1080, h: 780 },
    inLauncher: true,
    Component: d(() => import("@/features/geo-analysis/screens/GeoAnalysisScreen")),
  },
  {
    id: "monitor",
    title: "Surveillance Canaux",
    blurb: "Ops en direct",
    icon: Radio,
    hue: 8,
    defaultSize: { w: 1120, h: 780 },
    inLauncher: true,
    Component: d(
      () => import("@/features/channel-monitor/screens/ChannelMonitorScreen"),
      "ChannelMonitorScreen",
    ),
  },
  {
    id: "upload",
    title: "Importer",
    blurb: "CSV / DailyTransactions",
    icon: Upload,
    hue: 36,
    defaultSize: { w: 820, h: 700 },
    inLauncher: true,
    Component: d(() => import("@/features/data-import/screens/DataImportScreen")),
  },
  {
    id: "csv-parser",
    title: "Analyseur CSV",
    blurb: "Parsing & profilage",
    icon: FileSpreadsheet,
    hue: 50,
    defaultSize: { w: 1120, h: 780 },
    inLauncher: true,
    Component: d(() => import("@/features/csv-parser/screens/CsvParserScreen")),
  },
  {
    id: "folders",
    title: "Catalogue",
    blurb: "Jeux de données",
    icon: Folders,
    hue: 46,
    defaultSize: { w: 980, h: 720 },
    inLauncher: true,
    Component: d(() => import("@/features/folders/screens/FoldersScreen")),
  },
  {
    id: "parsed",
    title: "Profil des données",
    blurb: "Colonnes & qualité",
    icon: Table2,
    hue: 54,
    defaultSize: { w: 1080, h: 760 },
    inLauncher: true,
    Component: d(() => import("@/features/parsed-data/screens/ParsedDataScreen")),
  },
  {
    id: "data-browser",
    title: "Explorateur",
    blurb: "Tables & datasets",
    icon: BarChart3,
    hue: 200,
    defaultSize: { w: 1120, h: 780 },
    inLauncher: true,
    Component: d(() => import("@/features/data-browser/screens/DataBrowserScreen")),
  },
  {
    id: "transform",
    title: "Transformations",
    blurb: "Pipelines ETL",
    icon: Database,
    hue: 188,
    defaultSize: { w: 1120, h: 780 },
    inLauncher: true,
    Component: d(() => import("@/features/data-transform/screens/DataTransformScreen")),
  },
  {
    id: "lineage",
    title: "Lignage",
    blurb: "Flux des données",
    icon: GitBranch,
    hue: 176,
    defaultSize: { w: 1080, h: 760 },
    inLauncher: true,
    Component: d(() => import("@/features/lineage/screens/LineageScreen")),
  },
  {
    id: "reconciliation",
    title: "Réconciliation",
    blurb: "Audit des écarts",
    icon: Scale,
    hue: 14,
    defaultSize: { w: 1080, h: 760 },
    inLauncher: true,
    Component: d(
      () => import("@/features/reconciliation/screens/ReconciliationScreen"),
      "ReconciliationScreen",
    ),
  },
  {
    id: "history",
    title: "Journal d'activité",
    blurb: "Historique & versions",
    icon: History,
    hue: 40,
    defaultSize: { w: 920, h: 720 },
    inLauncher: true,
    Component: d(() => import("@/features/history/screens/HistoryScreen")),
  },
  {
    id: "report-studio",
    title: "Studio de Rapports",
    blurb: "PowerPoint / PDF",
    icon: FileText,
    hue: 24,
    defaultSize: { w: 1120, h: 800 },
    inLauncher: true,
    Component: d(
      () => import("@/features/report-studio/screens/ReportStudioScreen"),
      "ReportStudioScreen",
    ),
  },
  {
    id: "theater",
    title: "Théâtre Analytique",
    blurb: "Scrollytelling",
    icon: Clapperboard,
    hue: 300,
    defaultSize: { w: 1180, h: 820 },
    inLauncher: true,
    Component: d(
      () => import("@/features/analytics-theater/screens/AnalyticsTheaterScreen"),
      "AnalyticsTheaterScreen",
    ),
  },
  {
    id: "collaboration",
    title: "Collaboration",
    blurb: "Équipe & commentaires",
    icon: Users,
    hue: 258,
    defaultSize: { w: 1020, h: 760 },
    inLauncher: true,
    Component: d(() => import("@/features/collaboration/screens/CollaborationHostedScreen")),
  },
  {
    id: "agent-canvas",
    title: "Agent Canvas",
    blurb: "Orchestration visuelle",
    icon: Activity,
    hue: 232,
    defaultSize: { w: 1180, h: 820 },
    inLauncher: true,
    Component: d(() => import("@/features/agent-canvas/screens/AgentCanvasScreen")),
  },
  {
    id: "ux-innovations",
    title: "Succès",
    blurb: "Badges & visite guidée",
    icon: Trophy,
    hue: 96,
    defaultSize: { w: 1020, h: 760 },
    inLauncher: true,
    Component: d(() => import("@/features/ux-innovations/screens/UxInnovationsScreen")),
  },
  {
    id: "diagnostics",
    title: "Système",
    blurb: "Moteur, modèle & LAN",
    icon: Gauge,
    hue: 206,
    defaultSize: { w: 980, h: 760 },
    singleInstance: true,
    inLauncher: true,
    Component: d(
      () => import("@/features/dashboard-shell/screens/shell-overview-screen"),
      "ShellOverviewScreen",
    ),
  },
  {
    id: "help",
    title: "Aide",
    blurb: "Docs & visite",
    icon: HelpCircle,
    hue: 60,
    defaultSize: { w: 820, h: 700 },
    inLauncher: true,
    Component: d(() => import("@/features/help/screens/HelpScreen")),
  },
  {
    id: "recycle-bin",
    title: "Corbeille",
    blurb: "Éléments supprimés",
    icon: Trash2,
    hue: 210,
    defaultSize: { w: 620, h: 540 },
    singleInstance: true,
    inLauncher: false,
    Component: d(() => import("@/features/desktop/apps/RecycleBinScreen")),
  },
  {
    id: "settings",
    title: "Paramètres",
    blurb: "Préférences",
    icon: Settings,
    hue: 30,
    defaultSize: { w: 900, h: 740 },
    singleInstance: true,
    inLauncher: true,
    pinned: true,
    Component: d(() => import("@/features/settings/screens/SettingsScreen")),
  },
];

const APP_MAP = new Map(DESKTOP_APPS.map((a) => [a.id, a]));

export function getApp(appId: string): DesktopApp | undefined {
  return APP_MAP.get(appId);
}

export const LAUNCHER_APPS = DESKTOP_APPS.filter((a) => a.inLauncher !== false);
export const PINNED_APPS = DESKTOP_APPS.filter((a) => a.pinned);
