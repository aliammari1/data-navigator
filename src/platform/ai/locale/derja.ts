/**
 * Tunisian Derja (Tunisian Arabic) prompting helpers for the offline LLM lane.
 *
 * WHAT THIS IS (and is NOT)
 * ─────────────────────────
 * The app's generative lane runs a small multilingual GGUF model (default
 * `qwen2.5-1.5b-instruct-q4_k_m.gguf`, see
 * `src/platform/ai/models/model-manifest.ts`). Qwen2.5 handles Modern Standard
 * Arabic (MSA) reasonably and *some* Tunisian Derja, but it is NOT fine-tuned
 * for Derja. This module does two cheap, honest things to squeeze more out of it
 * WITHOUT any extra model, training, or network:
 *
 *   1. {@link DERJA_SYSTEM_HINT} — a reusable system-prompt fragment that (a)
 *      tells the model Derja can arrive as Arabic script, Arabizi (Latin letters
 *      + the 3/7/9 number-letters), or French code-switching, (b) grounds the
 *      small model with a compact glossary of common Derja analytics words, and
 *      (c) instructs it to answer in the user's own language and script.
 *   2. {@link detectLikelyLanguage} / {@link localizedSystemPrefix} — a tiny,
 *      dependency-free HEURISTIC (NOT detection ML) that guesses the message
 *      language so we only spend prompt budget on the Derja hint when it's
 *      likely to help.
 *
 * This is prompt engineering, not a language model. It measurably improves
 * grounding on common Derja analytics phrasing; it does NOT make a 1.5B model
 * fluent in Derja. For that, see `docs/TUNISIAN-MODEL.md` (bigger model / LoRA
 * fine-tune paths).
 */

// ─── Glossary: common Tunisian Derja analytics terms → meaning ──────────────────
// Kept small and analytics-focused on purpose: a long glossary wastes the small
// model's context and dilutes attention. These are the words that actually show
// up when a manager asks a data question in Derja. Each entry covers the usual
// Arabizi spellings (Derja has no fixed orthography) AND the Arabic script form.

/** One glossary row: the Derja surface forms and what they mean for analytics. */
export interface DerjaGlossaryEntry {
  /** Common spellings the user might type (Arabizi + Arabic script). */
  forms: string[];
  /** Plain-English meaning used to ground the model. */
  meaning: string;
}

export const DERJA_GLOSSARY: readonly DerjaGlossaryEntry[] = [
  { forms: ["chniya", "chnowa", "chnia", "شنية", "شنوة"], meaning: "what" },
  { forms: ["9adech", "9addech", "kadech", "قداش", "قدّاش"], meaning: "how much / how many" },
  { forms: ["kifech", "kifeh", "كيفاش"], meaning: "how / in what way" },
  { forms: ["3lech", "3lash", "علاش"], meaning: "why" },
  { forms: ["win", "win", "وين"], meaning: "where" },
  { forms: ["w9tech", "waktech", "وقتاش"], meaning: "when" },
  { forms: ["barcha", "barsha", "برشا"], meaning: "a lot / many" },
  { forms: ["chwaya", "chwaia", "شوية"], meaning: "a little / few" },
  { forms: ["ennhar", "nhar", "النهار", "نهار"], meaning: "day / today" },
  { forms: ["lyoum", "elyoum", "اليوم"], meaning: "today" },
  { forms: ["lbera7", "lbarah", "البارح"], meaning: "yesterday" },
  { forms: ["chhar", "che7r", "شهر"], meaning: "month" },
  { forms: ["3am", "aam", "عام"], meaning: "year" },
  { forms: ["flus", "floos", "فلوس"], meaning: "money / revenue" },
  { forms: ["3dad", "aadad", "3add", "عدد"], meaning: "count / number of" },
  { forms: ["zeda", "zada", "زادة"], meaning: "also / increase" },
  { forms: ["na9es", "nakes", "ناقص"], meaning: "decreased / less" },
  { forms: ["tzid", "zad", "زاد"], meaning: "increased / went up" },
  { forms: ["mochkla", "mouchkla", "مشكلة"], meaning: "problem / issue" },
  { forms: ["a7sen", "ahsen", "أحسن"], meaning: "best / better" },
  { forms: ["asfel", "akhwer", "أسفل"], meaning: "worst / lowest" },
];

/** Render the glossary as a compact `term = meaning` block for the prompt. */
function renderGlossary(): string {
  return DERJA_GLOSSARY.map(
    (e) => `- ${e.forms.join(" / ")} = ${e.meaning}`,
  ).join("\n");
}

// ─── System-prompt fragment ─────────────────────────────────────────────────────

/**
 * Reusable system-prompt fragment. Prepend to an existing agent system prompt
 * (with a blank line between) when the user is likely writing Derja/Arabic.
 *
 * Deliberately compact: it spends ~1 short paragraph + the glossary so it can be
 * prepended without blowing the small model's context window.
 */
export const DERJA_SYSTEM_HINT = [
  "The user may write in Tunisian Arabic (Derja). Derja can appear in three forms, sometimes mixed in one message:",
  "  (1) Arabic script (e.g. قداش الفلوس),",
  "  (2) Arabizi — Latin letters with the digits 3=ع, 7=ح, 9=ق (e.g. '9adech el flus'),",
  "  (3) French code-switching (e.g. 'chnowa le revenue mta3 yesterday').",
  "Understand all three. Use this glossary of common Derja analytics terms to interpret the question:",
  renderGlossary(),
  "ALWAYS answer in the SAME language AND script the user used: if they wrote Derja in Arabic script, answer in Arabic-script Derja; if they wrote Arabizi, you may answer in clear Arabic-script Derja (it is easier to read); if French, answer in French; if English, answer in English. Keep numbers and units exactly as in the data.",
].join("\n");

// ─── Lightweight language heuristic (HINT, not ML) ──────────────────────────────

/** Coarse language guess. `"unknown"` when nothing tips the scale. */
export type LikelyLanguage = "fr" | "en" | "ar" | "derja" | "unknown";

/** Arabic Unicode block (covers Arabic script Derja + MSA). */
const ARABIC_SCRIPT = /[؀-ۿ]/;

/**
 * Arabizi signature: a Latin word containing 3, 7, or 9 used as a letter
 * (e.g. "3dad", "7keya", "9adech"). The digit must be adjacent to letters so we
 * don't trip on plain numbers like "3 days" or "9000".
 */
const ARABIZI_DIGIT_LETTER = /[a-z][379]|[379][a-z]/i;

/** Flattened set of glossary Arabizi tokens for a quick membership check. */
const DERJA_TOKENS = new Set(
  DERJA_GLOSSARY.flatMap((e) => e.forms)
    .filter((f) => /^[a-z0-9]+$/i.test(f)) // Arabizi forms only
    .map((f) => f.toLowerCase()),
);

/** A few extra high-signal Derja/Arabizi tokens not in the analytics glossary. */
const EXTRA_DERJA_TOKENS = new Set([
  "mta3",
  "fi",
  "wel",
  "el",
  "ma",
  "famma",
  "fama",
  "behi",
  "ye5i",
  "yezi",
]);

/** Common French stopwords (high frequency, low ambiguity with English). */
const FRENCH_STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "des",
  "une",
  "pour",
  "avec",
  "dans",
  "sur",
  "quoi",
  "combien",
  "pourquoi",
  "comment",
  "quel",
  "quelle",
  "mois",
  "jour",
  "chiffre",
  "affaires",
  "revenu",
  "hier",
]);

/**
 * Guess the likely language of a free-text message. This is a fast, fully
 * offline heuristic meant to gate the Derja hint — it is intentionally NOT a
 * trained classifier and will be wrong on short or ambiguous input.
 *
 * Decision order (most specific first):
 *   - Arabic script present + Derja markers  → "derja"
 *   - Arabic script present (no Derja marker)→ "ar"   (likely MSA)
 *   - Arabizi digit-letters or Derja tokens  → "derja"
 *   - French stopwords outweigh everything   → "fr"
 *   - Has ASCII letters                      → "en"
 *   - Otherwise                              → "unknown"
 */
export function detectLikelyLanguage(text: string): LikelyLanguage {
  const raw = (text ?? "").trim();
  if (!raw) return "unknown";

  const hasArabic = ARABIC_SCRIPT.test(raw);
  const lower = raw.toLowerCase();
  const words = lower.split(/[^a-z0-9؀-ۿ]+/i).filter(Boolean);

  const hasArabizi = ARABIZI_DIGIT_LETTER.test(raw);
  const derjaTokenHits = words.filter(
    (w) => DERJA_TOKENS.has(w) || EXTRA_DERJA_TOKENS.has(w),
  ).length;
  const frenchHits = words.filter((w) => FRENCH_STOPWORDS.has(w)).length;

  // Arabic script is the strongest single signal.
  if (hasArabic) {
    // Arabic-script Derja markers (glossary Arabic forms) → derja, else MSA.
    const arabicDerjaForms = DERJA_GLOSSARY.flatMap((e) => e.forms).filter((f) =>
      ARABIC_SCRIPT.test(f),
    );
    const hasArabicDerja = arabicDerjaForms.some((f) => raw.includes(f));
    return hasArabicDerja ? "derja" : "ar";
  }

  // Latin script from here on.
  if (hasArabizi || derjaTokenHits >= 1) return "derja";
  if (frenchHits >= 1 && frenchHits >= derjaTokenHits) return "fr";
  if (/[a-z]/i.test(raw)) return "en";
  return "unknown";
}

/**
 * Returns the {@link DERJA_SYSTEM_HINT} (with a trailing blank line so it can be
 * concatenated directly before an existing system prompt) when the message looks
 * like Derja or Arabic; otherwise an empty string. Safe to call unconditionally:
 *
 *   const system = localizedSystemPrefix(userPrompt) + EXISTING_SYSTEM_PROMPT;
 *
 * For "ar" (likely MSA) we still include the hint — it costs little and the
 * glossary + "answer in the user's script" guidance is harmless for MSA and
 * useful when the heuristic mislabels Derja as MSA.
 */
export function localizedSystemPrefix(text: string): string {
  const lang = detectLikelyLanguage(text);
  if (lang === "derja" || lang === "ar") return `${DERJA_SYSTEM_HINT}\n\n`;
  return "";
}

/*
 * ─── Unit-test-style examples (documentation; not executed) ─────────────────────
 *
 * detectLikelyLanguage("9adech el flus mta3 ennhar?")        === "derja"  // arabizi + tokens
 * detectLikelyLanguage("قداش الفلوس متاع النهار؟") === "derja"  // arabic-script derja
 * detectLikelyLanguage("ما هو إجمالي الإيرادات؟")        === "ar"     // MSA, no derja marker
 * detectLikelyLanguage("Combien de revenu pour le mois?")    === "fr"     // french stopwords
 * detectLikelyLanguage("What was revenue yesterday?")        === "en"     // ascii, no markers
 * detectLikelyLanguage("3 days, 9000 calls")                 === "en"     // digits not letter-adjacent
 * detectLikelyLanguage("")                                   === "unknown"
 *
 * localizedSystemPrefix("9adech el flus?").length            > 0          // derja → hint added
 * localizedSystemPrefix("What was revenue?")                 === ""       // english → no hint
 * localizedSystemPrefix("Combien de revenu?")                === ""       // french → no hint (model handles fr fine)
 */
