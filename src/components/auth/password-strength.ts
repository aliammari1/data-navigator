export type PasswordStrength = {
  /** 0 (too short) through 4 (strong). */
  score: number;
  label: string;
  /** Tailwind background class for the strength meter segments. */
  tone: string;
};

const LEVELS: readonly PasswordStrength[] = [
  { score: 0, label: "too short", tone: "bg-slate-500" },
  { score: 1, label: "weak", tone: "bg-rose-400" },
  { score: 2, label: "fair", tone: "bg-amber-400" },
  { score: 3, label: "good", tone: "bg-cyan-400" },
  { score: 4, label: "strong", tone: "bg-emerald-400" },
];

/**
 * Scores a password 0-4 based on length and character-class variety.
 * Pure and deterministic, so it can be unit-tested in isolation from the form.
 */
export function scorePassword(pw: string): PasswordStrength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return LEVELS[Math.min(score, 4)];
}
