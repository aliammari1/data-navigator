/**
 * Atlas tokens (TS mirror of tokens.css).
 *
 * Use as `style={{ color: atlas.text.muted }}` when CSS-variable strings
 * aren't ergonomic. The actual values come from CSS — these are just
 * stable references that survive renames.
 */

export const atlas = {
  surface: {
    bg: "var(--atlas-bg)",
    bgSubtle: "var(--atlas-bg-subtle)",
    surface: "var(--atlas-surface)",
    raised: "var(--atlas-surface-raised)",
  },
  border: {
    default: "var(--atlas-border)",
    strong: "var(--atlas-border-strong)",
  },
  text: {
    primary: "var(--atlas-text)",
    muted: "var(--atlas-text-muted)",
    subtle: "var(--atlas-text-subtle)",
  },
  accent: {
    base: "var(--atlas-accent)",
    hover: "var(--atlas-accent-hover)",
    fg: "var(--atlas-accent-fg)",
    soft: "var(--atlas-accent-soft)",
    border: "var(--atlas-accent-border)",
  },
  semantic: {
    info: "var(--atlas-info)",
    success: "var(--atlas-success)",
    warning: "var(--atlas-warning)",
    danger: "var(--atlas-danger)",
  },
  shadow: {
    s1: "var(--atlas-shadow-1)",
    s2: "var(--atlas-shadow-2)",
    s3: "var(--atlas-shadow-3)",
    s4: "var(--atlas-shadow-4)",
    s5: "var(--atlas-shadow-5)",
    glowAccent: "var(--atlas-glow-accent)",
    glowSuccess: "var(--atlas-glow-success)",
    glowDanger: "var(--atlas-glow-danger)",
  },
  motion: {
    snap: "var(--atlas-ease-snap)",
    soft: "var(--atlas-ease-soft)",
    bounce: "var(--atlas-ease-bounce)",
    d1: "var(--atlas-dur-1)",
    d2: "var(--atlas-dur-2)",
    d3: "var(--atlas-dur-3)",
    d4: "var(--atlas-dur-4)",
    d5: "var(--atlas-dur-5)",
  },
} as const;

export type AtlasSeverity =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";
