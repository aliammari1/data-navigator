"use client";

/**
 * Composes the focused app's final menu bar.
 *
 * Each app contributes only what is special about it (see `./apps/<id>`); this
 * module slots those groups into the standard macOS order and fills the rest
 * with the universal builders:
 *
 *   [App]  [Fichier]  [Édition]  [Affichage]  [app menus…]  [Fenêtre]  [Aide]
 *
 * Standard ids from an app override/merge with the universal defaults:
 *   - "file"  → replaces the default Fichier
 *   - "edit"  → replaces the default Édition
 *   - "view"  → its items are prepended to the universal Affichage
 *   - "help"  → its items are prepended to the universal Aide
 *   - any other id → an app-specific menu placed before Fenêtre
 *
 * A throwing app builder is contained (returns no app groups) so one bad menu
 * never blanks the whole bar.
 */

import { buildMenu as agentCanvas } from "@/features/desktop/core/menu/apps/agent-canvas";
import { buildMenu as aiAnalysis } from "@/features/desktop/core/menu/apps/ai-analysis";
import { buildMenu as aiBriefing } from "@/features/desktop/core/menu/apps/ai-briefing";
import { buildMenu as collaboration } from "@/features/desktop/core/menu/apps/collaboration";
import { buildMenu as commander } from "@/features/desktop/core/menu/apps/commander";
import { buildMenu as csvParser } from "@/features/desktop/core/menu/apps/csv-parser";
import { buildMenu as dataBrowser } from "@/features/desktop/core/menu/apps/data-browser";
import { buildMenu as deepAnalytics } from "@/features/desktop/core/menu/apps/deep-analytics";
import { buildMenu as diagnostics } from "@/features/desktop/core/menu/apps/diagnostics";
import { buildMenu as eyeTracking } from "@/features/desktop/core/menu/apps/eye-tracking";
import { buildMenu as folders } from "@/features/desktop/core/menu/apps/folders";
import { buildMenu as forecast } from "@/features/desktop/core/menu/apps/forecast";
import { buildMenu as geo } from "@/features/desktop/core/menu/apps/geo";
import { buildMenu as help } from "@/features/desktop/core/menu/apps/help";
import { buildMenu as history } from "@/features/desktop/core/menu/apps/history";
import { buildMenu as home } from "@/features/desktop/core/menu/apps/home";
import { buildMenu as lineage } from "@/features/desktop/core/menu/apps/lineage";
import { buildMenu as monitor } from "@/features/desktop/core/menu/apps/monitor";
import { buildMenu as moudir } from "@/features/desktop/core/menu/apps/moudir";
import { buildMenu as parsed } from "@/features/desktop/core/menu/apps/parsed";
import { buildMenu as reconciliation } from "@/features/desktop/core/menu/apps/reconciliation";
import { buildMenu as recycleBin } from "@/features/desktop/core/menu/apps/recycle-bin";
import { buildMenu as reportStudio } from "@/features/desktop/core/menu/apps/report-studio";
import { buildMenu as settings } from "@/features/desktop/core/menu/apps/settings";
import { buildMenu as telecom } from "@/features/desktop/core/menu/apps/telecom";
import { buildMenu as theater } from "@/features/desktop/core/menu/apps/theater";
import { buildMenu as transform } from "@/features/desktop/core/menu/apps/transform";
import { buildMenu as upload } from "@/features/desktop/core/menu/apps/upload";
import { buildMenu as uxInnovations } from "@/features/desktop/core/menu/apps/ux-innovations";
import type {
  AppMenuBuilder,
  MenuContext,
  MenuGroup,
  MenuItem,
} from "@/features/desktop/core/menu/types";
import {
  appLeadingGroup,
  desktopMenuGroups,
  editGroup,
  helpGroup,
  universalFileGroup,
  viewGroup,
  windowGroup,
} from "@/features/desktop/core/menu/universal";

const APP_MENUS: Record<string, AppMenuBuilder> = {
  home,
  moudir,
  commander,
  "eye-tracking": eyeTracking,
  telecom,
  "ai-briefing": aiBriefing,
  "ai-analysis": aiAnalysis,
  "deep-analytics": deepAnalytics,
  forecast,
  geo,
  monitor,
  upload,
  "csv-parser": csvParser,
  folders,
  parsed,
  "data-browser": dataBrowser,
  transform,
  lineage,
  reconciliation,
  history,
  "report-studio": reportStudio,
  theater,
  collaboration,
  "agent-canvas": agentCanvas,
  "ux-innovations": uxInnovations,
  diagnostics,
  help,
  "recycle-bin": recycleBin,
  settings,
};

const STANDARD_IDS = new Set(["app", "file", "edit", "view", "help"]);

/** Run an app builder defensively — a thrown error yields no app groups. */
function safeBuild(builder: AppMenuBuilder, ctx: MenuContext): MenuGroup[] {
  try {
    const groups = builder(ctx);
    return Array.isArray(groups) ? groups : [];
  } catch {
    return [];
  }
}

/** Drop leading/trailing and collapsed consecutive separators. */
function cleanItems(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    const isSep = item.kind === "separator";
    if (isSep && (out.length === 0 || out[out.length - 1].kind === "separator")) continue;
    out.push(item);
  }
  while (out.length && out[out.length - 1].kind === "separator") out.pop();
  return out;
}

/** Prepend an app group's items to a universal base group (with a divider). */
function prepend(appGroup: MenuGroup | undefined, base: MenuGroup): MenuGroup {
  if (!appGroup || appGroup.items.length === 0) return base;
  return {
    ...base,
    items: [...appGroup.items, { kind: "separator", id: `${base.id}-merge-sep` }, ...base.items],
  };
}

/** Final, ordered, non-empty menu groups for the given focused context. */
export function getAppMenuGroups(ctx: MenuContext): MenuGroup[] {
  const groups = ctx.appId ? composeAppGroups(ctx, APP_MENUS[ctx.appId]) : desktopMenuGroups(ctx);

  return groups
    .map((g) => ({ ...g, items: cleanItems(g.items) }))
    .filter((g) => g.items.length > 0);
}

function composeAppGroups(ctx: MenuContext, builder: AppMenuBuilder | undefined): MenuGroup[] {
  const appGroups = builder ? safeBuild(builder, ctx) : [];
  const find = (id: string) => appGroups.find((g) => g.id === id);

  const file = find("file") ?? universalFileGroup(ctx);
  const edit = find("edit") ?? editGroup(ctx);
  const view = prepend(find("view"), viewGroup(ctx));
  const helpMenu = prepend(find("help"), helpGroup(ctx));
  const others = appGroups.filter((g) => !STANDARD_IDS.has(g.id));

  return [appLeadingGroup(ctx), file, edit, view, ...others, windowGroup(ctx), helpMenu];
}
