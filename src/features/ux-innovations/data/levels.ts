/**
 * XP level system — pure, deterministic level math extracted from the former
 * 2,320-line monolith so it can be unit-tested and imported without pulling in
 * the whole component tree.
 */

import { Award, Gem, Medal, Trophy } from "lucide-react";
import type React from "react";

export type LevelName = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export interface LevelDef {
  name: LevelName;
  min: number;
  max: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const LEVELS: LevelDef[] = [
  { name: "Bronze", min: 0, max: 99, color: "text-amber-700", icon: Medal },
  { name: "Silver", min: 100, max: 499, color: "text-slate-300", icon: Medal },
  { name: "Gold", min: 500, max: 1499, color: "text-yellow-400", icon: Trophy },
  { name: "Platinum", min: 1500, max: 4999, color: "text-cyan-300", icon: Award },
  {
    name: "Diamond",
    min: 5000,
    max: Number.POSITIVE_INFINITY,
    color: "text-violet-300",
    icon: Gem,
  },
];

export interface LevelInfo {
  level: LevelDef;
  next: LevelDef | undefined;
  xpIntoLevel: number;
  xpNeeded: number;
  pct: number;
  xpToNext: number;
}

/**
 * Resolve the current level + progress toward the next tier for a given XP total.
 * Pure function — no side effects, safe to memoize.
 */
export function getLevelInfo(xp: number): LevelInfo {
  const level = LEVELS.find((l) => xp >= l.min && xp <= l.max) ?? LEVELS[0];
  const next = LEVELS[LEVELS.indexOf(level) + 1];
  const xpIntoLevel = xp - level.min;
  const xpNeeded = next ? next.min - level.min : 1;
  const pct = Math.min(100, Math.round((xpIntoLevel / xpNeeded) * 100));
  return { level, next, xpIntoLevel, xpNeeded, pct, xpToNext: next ? next.min - xp : 0 };
}
