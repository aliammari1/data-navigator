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
  FileSpreadsheet,
  Folders,
  Gauge,
  HelpCircle,
  type LucideIcon,
  MessageCircle,
  Receipt,
  Settings,
  Trash2,
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
