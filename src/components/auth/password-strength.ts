import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";

export type PasswordStrength = {
  /** 0 (too short) through 4 (strong). */
  score: number;
  label: string;
  /** Tailwind background class for the strength meter segments. */
  tone: string;
  warning?: string | null;
  suggestions?: string[];
};

const LEVELS: readonly PasswordStrength[] = [
  { score: 0, label: "too short", tone: "bg-slate-500" },
  { score: 1, label: "weak", tone: "bg-rose-400" },
  { score: 2, label: "fair", tone: "bg-amber-400" },
  { score: 3, label: "good", tone: "bg-cyan-400" },
  { score: 4, label: "strong", tone: "bg-emerald-400" },
];

const zxcvbn = new ZxcvbnFactory({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
});

/**
 * Scores a password 0-4 based on zxcvbn entropy estimation and character heuristics.
 * Returns score, label, tone, and contextual feedback (warning + suggestions).
 */
export function scorePassword(pw: string): PasswordStrength {
  if (!pw || pw.length < 8) {
    return {
      score: 0,
      label: "too short",
      tone: "bg-slate-500",
      warning: null,
      suggestions: ["Password must be at least 8 characters."],
    };
  }

  const result = zxcvbn.check(pw);
  let calcScore = result.score;
  const hasMixed = /[A-Z]/.test(pw) && /[a-z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);

  if (calcScore === 0) {
    calcScore = 1;
  } else if (calcScore === 1 && hasMixed && hasDigit) {
    calcScore = 3;
  } else if (calcScore === 3 && pw.length >= 12 && hasMixed && hasDigit && hasSymbol) {
    calcScore = 4;
  }

  const level = LEVELS[Math.min(calcScore, 4)];
  return {
    ...level,
    warning: result.feedback.warning || null,
    suggestions: result.feedback.suggestions || [],
  };
}
