import { motion } from "motion/react";
import type { ColProfile } from "@/features/parsed-data/model/types";
import {
  qualityColor,
  typeColor,
  typeIcon,
} from "@/features/parsed-data/model/profile-format";
// ─── Sub-components ────────────────────────────────────────────────────────

export function QualityRing({
  score,
  size = 48,
}: {
  score: number;
  size?: number;
}) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score);
  const color = qualityColor(score);
  return (
    <svg
      width={size}
      height={size}
      className="-rotate-90"
      role="img"
      aria-label="Quality score"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={5}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </svg>
  );
}

export function MiniBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max === 0 ? 0 : (value / max) * 100;
  return (
    <div className="h-1.5 bg-accent rounded-full overflow-hidden w-full">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
    </div>
  );
}

export function ColCard({
  profile,
  selected,
  onClick,
}: {
  profile: ColProfile;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = typeIcon(profile.type);
  const overallScore =
    (profile.completeness + profile.uniqueness * 0.5 + profile.validity * 0.5) /
    2;

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        selected
          ? "bg-primary/15 border-primary/40 shadow-lg shadow-primary/10"
          : "bg-card border-border hover:border-border hover:bg-muted"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`p-1.5 rounded-lg flex-shrink-0 ${typeColor(profile.type)}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {profile.name}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${typeColor(profile.type)}`}
            >
              {profile.type}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span>{(profile.completeness * 100).toFixed(0)}% complete</span>
            <span>{profile.distinctCount.toLocaleString()} distinct</span>
          </div>
          <div className="mt-1.5">
            <MiniBar
              value={overallScore}
              max={1}
              color={qualityColor(overallScore)}
            />
          </div>
        </div>
        <div className="flex-shrink-0">
          <QualityRing score={overallScore} size={32} />
        </div>
      </div>
    </motion.button>
  );
}

export function StatGrid({
  items,
}: {
  items: { label: string; value: string; highlight?: boolean }[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="bg-muted rounded-lg p-2.5">
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div
            className={`text-sm font-mono font-bold mt-0.5 ${item.highlight ? "text-yellow-400" : "text-foreground"}`}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
