/**
 * Achievement + category definitions.
 *
 * Hardcoded `progress: {current, max}` constants from the former monolith have
 * been removed: progress is now measured against REAL local telemetry (datasets
 * uploaded, rows processed, activity events) by the rules engine in
 * `../events/rules.ts`. Each progress-bearing achievement declares a `goal`
 * (a named live metric + threshold) instead of a frozen fake value.
 */

import {
  Activity,
  Award,
  BarChart3,
  Brain,
  Clock,
  Compass,
  Cpu,
  Crown,
  Database,
  FileEdit,
  FileOutput,
  FileText,
  Gem,
  Hash,
  Layers,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Moon,
  Network,
  SearchCode,
  Share2,
  Sparkles,
  Star,
  StickyNote,
  Sun,
  Timer,
  TrendingUp,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import type React from "react";

export type CategoryId =
  | "DATA_EXPERT"
  | "ANALYST_PRO"
  | "EXPLORER"
  | "COLLABORATOR"
  | "PERFORMANCE"
  | "ELITE";

/**
 * Named live metrics the rules engine knows how to measure from real app state.
 * Each maps to a deterministic computation over datasets / activity events.
 */
export type MetricId =
  | "datasetsUploaded"
  | "totalRowsProcessed"
  | "datasetsSelected"
  | "transformsRun"
  | "queriesRun"
  | "telecomAnalysesSaved"
  | "screensVisited";

export interface AchievementGoal {
  /** Live metric measured from real telemetry. */
  metric: MetricId;
  /** Threshold at which the achievement unlocks. */
  target: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  xp: number;
  category: CategoryId;
  icon: React.ComponentType<{ className?: string }>;
  secret?: boolean;
  howToUnlock: string[];
  /** When present, progress + auto-unlock are derived from real telemetry. */
  goal?: AchievementGoal;
}

export interface AchievementCategory {
  id: CategoryId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // DATA_EXPERT
  {
    id: "first-upload",
    name: "First Upload",
    description: "Upload your first data file",
    xp: 50,
    category: "DATA_EXPERT",
    icon: Upload,
    howToUnlock: [
      "Open the data import panel",
      "Select a CSV or Excel file",
      "Click Upload to process",
    ],
    goal: { metric: "datasetsUploaded", target: 1 },
  },
  {
    id: "century-club",
    name: "Century Club",
    description: "Process 100+ rows across your datasets",
    xp: 100,
    category: "DATA_EXPERT",
    icon: Hash,
    howToUnlock: ["Load datasets totalling at least 100 rows"],
    goal: { metric: "totalRowsProcessed", target: 100 },
  },
  {
    id: "thousand-rows",
    name: "Thousand Rows",
    description: "Process 1000+ rows",
    xp: 250,
    category: "DATA_EXPERT",
    icon: BarChart3,
    howToUnlock: ["Import datasets totalling 1000 or more rows"],
    goal: { metric: "totalRowsProcessed", target: 1000 },
  },
  {
    id: "data-titan",
    name: "Data Titan",
    description: "Process 10000+ rows",
    xp: 500,
    category: "DATA_EXPERT",
    icon: Zap,
    howToUnlock: ["Import datasets totalling 10 000+ rows"],
    goal: { metric: "totalRowsProcessed", target: 10000 },
  },
  {
    id: "data-librarian",
    name: "Data Librarian",
    description: "Build a library of 5 datasets",
    xp: 150,
    category: "DATA_EXPERT",
    icon: FileText,
    howToUnlock: ["Import 5 distinct datasets into your workspace"],
    goal: { metric: "datasetsUploaded", target: 5 },
  },
  // ANALYST_PRO
  {
    id: "first-insight",
    name: "First Query",
    description: "Run your first query",
    xp: 75,
    category: "ANALYST_PRO",
    icon: Lightbulb,
    howToUnlock: ["Open a loaded dataset", "Run a SQL or natural-language query"],
    goal: { metric: "queriesRun", target: 1 },
  },
  {
    id: "insight-collector",
    name: "Query Collector",
    description: "Run 10 queries",
    xp: 200,
    category: "ANALYST_PRO",
    icon: Sparkles,
    howToUnlock: ["Run queries repeatedly across sessions"],
    goal: { metric: "queriesRun", target: 10 },
  },
  {
    id: "prophet",
    name: "Transformer",
    description: "Run your first data transform",
    xp: 150,
    category: "ANALYST_PRO",
    icon: TrendingUp,
    howToUnlock: ["Open the Transform screen", "Apply any transform step"],
    goal: { metric: "transformsRun", target: 1 },
  },
  {
    id: "anomaly-hunter",
    name: "Telecom Analyst",
    description: "Save your first telecom analysis",
    xp: 125,
    category: "ANALYST_PRO",
    icon: SearchCode,
    howToUnlock: ["Open a telecom report", "Save the analysis"],
    goal: { metric: "telecomAnalysesSaved", target: 1 },
  },
  {
    id: "trend-spotter",
    name: "Pipeline Builder",
    description: "Run 5 data transforms",
    xp: 300,
    category: "ANALYST_PRO",
    icon: Activity,
    howToUnlock: ["Apply 5 transform steps across any datasets"],
    goal: { metric: "transformsRun", target: 5 },
  },
  // EXPLORER
  {
    id: "globe-trotter",
    name: "Globe Trotter",
    description: "Visit 8 dashboard screens",
    xp: 100,
    category: "EXPLORER",
    icon: MapIcon,
    howToUnlock: ["Use the sidebar to navigate to 8 different screens"],
    goal: { metric: "screensVisited", target: 8 },
  },
  {
    id: "report-maker",
    name: "Curator",
    description: "Select a dataset to work with",
    xp: 100,
    category: "EXPLORER",
    icon: FileOutput,
    howToUnlock: ["Pick a dataset from the workspace to make it active"],
    goal: { metric: "datasetsSelected", target: 1 },
  },
  {
    id: "map-explorer",
    name: "Wanderer",
    description: "Visit 4 dashboard screens",
    xp: 125,
    category: "EXPLORER",
    icon: MapPin,
    howToUnlock: ["Navigate to 4 distinct dashboard screens"],
    goal: { metric: "screensVisited", target: 4 },
  },
  {
    id: "cluster-runner",
    name: "Query Runner",
    description: "Run 3 queries",
    xp: 150,
    category: "EXPLORER",
    icon: Network,
    howToUnlock: ["Run a total of 3 queries"],
    goal: { metric: "queriesRun", target: 3 },
  },
  {
    id: "time-traveler",
    name: "Switcher",
    description: "Select 4 different datasets",
    xp: 175,
    category: "EXPLORER",
    icon: Clock,
    howToUnlock: ["Switch the active dataset 4 times"],
    goal: { metric: "datasetsSelected", target: 4 },
  },
  // COLLABORATOR
  {
    id: "note-taker",
    name: "Explorer",
    description: "Visit 2 dashboard screens",
    xp: 50,
    category: "COLLABORATOR",
    icon: StickyNote,
    howToUnlock: ["Navigate to 2 different dashboard screens"],
    goal: { metric: "screensVisited", target: 2 },
  },
  {
    id: "approver",
    name: "Reviewer",
    description: "Save 3 telecom analyses",
    xp: 100,
    category: "COLLABORATOR",
    icon: FileEdit,
    howToUnlock: ["Save 3 telecom report analyses"],
    goal: { metric: "telecomAnalysesSaved", target: 3 },
  },
  {
    id: "share-master",
    name: "Multi-Source",
    description: "Import 3 datasets",
    xp: 125,
    category: "COLLABORATOR",
    icon: Share2,
    howToUnlock: ["Import 3 datasets into your workspace"],
    goal: { metric: "datasetsUploaded", target: 3 },
  },
  {
    id: "team-player",
    name: "Power Selector",
    description: "Select datasets 3 times",
    xp: 200,
    category: "COLLABORATOR",
    icon: UserPlus,
    howToUnlock: ["Activate datasets 3 times"],
    goal: { metric: "datasetsSelected", target: 3 },
  },
  {
    id: "report-author",
    name: "Report Author",
    description: "Save 5 telecom analyses",
    xp: 250,
    category: "COLLABORATOR",
    icon: FileEdit,
    howToUnlock: ["Save 5 telecom report analyses"],
    goal: { metric: "telecomAnalysesSaved", target: 5 },
  },
  // PERFORMANCE
  {
    id: "speed-demon",
    name: "Query Veteran",
    description: "Run 25 queries",
    xp: 150,
    category: "PERFORMANCE",
    icon: Timer,
    howToUnlock: ["Run a total of 25 queries"],
    goal: { metric: "queriesRun", target: 25 },
  },
  {
    id: "memory-saver",
    name: "Transform Veteran",
    description: "Run 10 transforms",
    xp: 125,
    category: "PERFORMANCE",
    icon: Cpu,
    howToUnlock: ["Apply 10 transform steps"],
    goal: { metric: "transformsRun", target: 10 },
  },
  {
    id: "bulk-processor",
    name: "Bulk Processor",
    description: "Import 8 datasets",
    xp: 200,
    category: "PERFORMANCE",
    icon: Layers,
    howToUnlock: ["Import 8 datasets without losing momentum"],
    goal: { metric: "datasetsUploaded", target: 8 },
  },
  {
    id: "night-owl",
    name: "Explorer Pro",
    description: "Visit 12 dashboard screens",
    xp: 75,
    category: "PERFORMANCE",
    icon: Moon,
    howToUnlock: ["Navigate to 12 distinct screens"],
    goal: { metric: "screensVisited", target: 12 },
  },
  {
    id: "early-bird",
    name: "Big Data",
    description: "Process 50000+ rows",
    xp: 75,
    category: "PERFORMANCE",
    icon: Sun,
    howToUnlock: ["Import datasets totalling 50 000+ rows"],
    goal: { metric: "totalRowsProcessed", target: 50000 },
  },
  // ELITE
  {
    id: "data-wizard",
    name: "Data Wizard",
    description: "Unlock all Data Expert badges",
    xp: 1000,
    category: "ELITE",
    secret: true,
    icon: Wand2,
    howToUnlock: ["Unlock every achievement in the Data Expert category"],
  },
  {
    id: "perfect-week",
    name: "Heavy Lifter",
    description: "Process 100000+ rows",
    xp: 750,
    category: "ELITE",
    secret: true,
    icon: Star,
    howToUnlock: ["Import datasets totalling 100 000+ rows"],
    goal: { metric: "totalRowsProcessed", target: 100000 },
  },
  {
    id: "master-analyst",
    name: "Master Analyst",
    description: "Reach Gold level",
    xp: 500,
    category: "ELITE",
    secret: true,
    icon: Award,
    howToUnlock: ["Accumulate 500 XP to reach the Gold tier"],
  },
  {
    id: "report-maestro",
    name: "Query Master",
    description: "Run 50 queries",
    xp: 600,
    category: "ELITE",
    secret: true,
    icon: Trophy,
    howToUnlock: ["Run a total of 50 queries"],
    goal: { metric: "queriesRun", target: 50 },
  },
  {
    id: "legend",
    name: "Legend",
    description: "Reach Diamond level",
    xp: 2000,
    category: "ELITE",
    secret: true,
    icon: Gem,
    howToUnlock: ["Accumulate 5000 XP to reach the Diamond tier"],
  },
];

export const CATEGORIES: AchievementCategory[] = [
  {
    id: "DATA_EXPERT",
    label: "Data Expert",
    icon: Database,
    color: "blue",
    borderColor: "border-blue-700/50",
    bgColor: "bg-blue-950/20",
    textColor: "text-blue-400",
  },
  {
    id: "ANALYST_PRO",
    label: "Analyst Pro",
    icon: Brain,
    color: "purple",
    borderColor: "border-purple-700/50",
    bgColor: "bg-purple-950/20",
    textColor: "text-purple-400",
  },
  {
    id: "EXPLORER",
    label: "Explorer",
    icon: Compass,
    color: "teal",
    borderColor: "border-teal-700/50",
    bgColor: "bg-teal-950/20",
    textColor: "text-teal-400",
  },
  {
    id: "COLLABORATOR",
    label: "Collaborator",
    icon: Users,
    color: "orange",
    borderColor: "border-orange-700/50",
    bgColor: "bg-orange-950/20",
    textColor: "text-orange-400",
  },
  {
    id: "PERFORMANCE",
    label: "Performance",
    icon: Zap,
    color: "yellow",
    borderColor: "border-yellow-700/50",
    bgColor: "bg-yellow-950/20",
    textColor: "text-yellow-400",
  },
  {
    id: "ELITE",
    label: "Elite",
    icon: Crown,
    color: "rose",
    borderColor: "border-rose-700/50",
    bgColor: "bg-rose-950/20",
    textColor: "text-rose-400",
  },
];

export function getCategoryMeta(id: CategoryId): AchievementCategory {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/** Total XP available across all achievements. */
export const MAX_XP = ACHIEVEMENTS.reduce((sum, a) => sum + a.xp, 0);
