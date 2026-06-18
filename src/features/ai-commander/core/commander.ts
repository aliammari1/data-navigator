"use client";

import { ImageIcon, LayoutDashboard, LayoutGrid, type LucideIcon, Sparkles } from "lucide-react";
import { z } from "zod";
import { LAUNCHER_APPS } from "@/features/desktop/core/app-registry";

/**
 * The AI Commander turns a natural-language (typed or spoken) instruction into a
 * single structured desktop action. This is the "agentic OS" layer: instead of
 * hunting through menus, the manager tells the app what they want and the local
 * LLM decides which window to open, what to ask the data agent, or how to change
 * the workspace. Strictly grammar-constrained (no free-form tool calling) so it
 * runs reliably on the 1.5B on-device model.
 */

export const WALLPAPER_IDS = ["dawn", "paper", "dusk", "ink"] as const;

export const CommanderResultSchema = z.object({
  action: z.object({
    kind: z
      .enum(["open_app", "ask_data", "set_wallpaper", "arrange", "close_all", "none"])
      .describe("The single action to perform."),
    /** Required when kind === "open_app": the app id to open. */
    appId: z.string().optional().describe("App id, only for open_app."),
    /** Required when kind === "ask_data": the analytical question to send to Moudir. */
    query: z.string().optional().describe("The data question, only for ask_data."),
    /** Required when kind === "set_wallpaper". */
    wallpaper: z.enum(WALLPAPER_IDS).optional().describe("Wallpaper id, only for set_wallpaper."),
  }),
  reply: z
    .string()
    .describe(
      "A short friendly confirmation sentence in the user's language. NOT the action name — a real sentence, e.g. 'J'ouvre le rapport télécom.'",
    ),
});

export type CommanderResult = z.infer<typeof CommanderResultSchema>;

export function buildCommanderSystemPrompt(): string {
  const apps = LAUNCHER_APPS.map((a) => `- ${a.id}: ${a.title} (${a.blurb})`).join("\n");
  return [
    "You are the Commander, the navigator of a local-first telecom analytics desktop app.",
    "You translate ONE user instruction into ONE structured action. Reply in the user's language (French by default; support English and Tunisian Derja).",
    "",
    "Decide the single best action:",
    '- "open_app": open a feature window. Set appId to one of the app ids below.',
    '- "ask_data": the user asked an analytical/data question about their transactions. Put a clear, self-contained question in `query` (this is sent to the Moudir data agent which writes SQL + charts).',
    '- "set_wallpaper": change the desktop background. Set wallpaper to dawn|paper|dusk|ink.',
    '- "arrange": tidy / cascade the open windows.',
    '- "close_all": close every open window.',
    '- "none": small talk or unclear — just reply, take no action.',
    "",
    "Available apps (appId: title):",
    apps,
    "",
    "Rules: prefer ask_data for any question about numbers, trends, channels, errors, regions, days, forecasts. Prefer open_app when the user names a tool/screen. Keep `reply` short and confirm what you did.",
  ].join("\n");
}

/** Human-readable French names for each wallpaper id (used in action labels). */
export const WALLPAPER_LABELS: Record<(typeof WALLPAPER_IDS)[number], string> = {
  dawn: "Aube",
  paper: "Papier",
  dusk: "Crépuscule",
  ink: "Encre",
};

/**
 * The Commander's headline capabilities, surfaced as tiles on the empty state so
 * its OS-level powers are discoverable instead of hidden behind a blank prompt.
 * Each `example` is a real instruction that is sent verbatim when the tile is
 * tapped. `hue` matches the desktop's per-domain accent convention.
 */
export interface CommanderCapability {
  id: string;
  title: string;
  hint: string;
  example: string;
  icon: LucideIcon;
  hue: number;
}

export const COMMANDER_CAPABILITIES: CommanderCapability[] = [
  {
    id: "open",
    title: "Ouvrir une app",
    hint: "Lancez n'importe quel outil du bureau",
    example: "Ouvre le rapport télécom",
    icon: LayoutGrid,
    hue: 152,
  },
  {
    id: "ask",
    title: "Interroger vos données",
    hint: "Posez une question, Moudir y répond",
    example: "Quels canaux ont le plus d'erreurs aujourd'hui ?",
    icon: Sparkles,
    hue: 268,
  },
  {
    id: "scene",
    title: "Changer l'ambiance",
    hint: "Adaptez le fond du bureau",
    example: "Mets le fond sur crépuscule",
    icon: ImageIcon,
    hue: 36,
  },
  {
    id: "organize",
    title: "Organiser le bureau",
    hint: "Rangez ou fermez les fenêtres",
    example: "Range les fenêtres ouvertes",
    icon: LayoutDashboard,
    hue: 200,
  },
];

/** Resolve a possibly-fuzzy appId from the model to a real registry id. */
export function resolveAppId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const id = raw.trim().toLowerCase();
  const exact = LAUNCHER_APPS.find((a) => a.id === id);
  if (exact) return exact.id;
  // Fuzzy: title/blurb contains, or id contains.
  const byTitle = LAUNCHER_APPS.find(
    (a) => a.title.toLowerCase().includes(id) || id.includes(a.id),
  );
  return byTitle?.id;
}
