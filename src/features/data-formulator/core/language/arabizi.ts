"use client";

/**
 * Arabizi Normalizer
 * Converts Arabizi (Latin-script Tunisian Arabic) and mixed-language text
 * into normalized tokens for intent processing.
 */

// Common Arabizi → Arabic character mappings
const ARABIZI_MAP: Record<string, string> = {
  a3: "ع",
  a7: "ح",
  a9: "ق",
  a5: "خ",
  dh: "ذ",
  gh: "غ",
  kh: "خ",
  ch: "ش",
  sh: "ش",
  th: "ث",
  ou: "و",
  ee: "ي",
  aa: "ا",
  ii: "ي",
  oo: "و",
  "3": "ع",
  "7": "ح",
  "9": "ق",
  "5": "خ",
  "2": "ء",
};

// Arabizi word mappings to normalized French/English
const ARABIZI_WORDS: Record<string, string> = {
  chouf: "show",
  choufa: "show",
  a3melli: "create",
  a3mel: "create",
  a3tini: "give me",
  "3lech": "why",
  "3lash": "why",
  ta7: "dropped",
  taht: "down",
  zed: "increased",
  flous: "amount",
  flouss: "amount",
  mtaa: "of",
  mta3: "of",
  hedhi: "this",
  hedha: "this",
  "li fet": "previous",
  "li fetet": "previous",
  jdid: "new",
  klem: "text",
  koul: "all",
  bark: "only",
  barcha: "many",
  sa7it: "correct",
  ghalet: "wrong",
  yezzi: "stop",
  warri: "show",
  resume: "summary",
  sghir: "short",
  kbir: "big",
  nhar: "day",
  semaine: "week",
  mois: "month",
  annee: "year",
  taux: "rate",
  najah: "success",
  reussite: "success",
  echec: "failure",
  canal: "channel",
  canaux: "channels",
  direction: "management",
  dg: "CEO",
};

export interface ArabiziNormalizationResult {
  original: string;
  normalized: string;
  detectedLanguage: "arabizi" | "french" | "english" | "arabic" | "mixed";
  arabiziWordsFound: string[];
  confidence: "high" | "medium" | "low";
}

export function normalizeArabizi(text: string): ArabiziNormalizationResult {
  const original = text;
  const arabiziWordsFound: string[] = [];
  let normalized = text;

  // Normalize Arabizi words
  for (const [word, replacement] of Object.entries(ARABIZI_WORDS)) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    if (pattern.test(normalized)) {
      arabiziWordsFound.push(word);
      normalized = normalized.replace(pattern, replacement);
    }
  }

  // Detect language
  const detectedLanguage = detectLanguage(original, arabiziWordsFound);
  const confidence =
    arabiziWordsFound.length > 2
      ? "high"
      : arabiziWordsFound.length > 0
        ? "medium"
        : "low";

  return {
    original,
    normalized: normalized.trim(),
    detectedLanguage,
    arabiziWordsFound,
    confidence,
  };
}

export function convertArabiziToArabic(text: string): string {
  let result = text;
  for (const [latin, arabic] of Object.entries(ARABIZI_MAP)) {
    const pattern = new RegExp(escapeRegExp(latin), "gi");
    result = result.replace(pattern, arabic);
  }
  return result;
}

function detectLanguage(
  text: string,
  arabiziWords: string[],
): ArabiziNormalizationResult["detectedLanguage"] {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasFrench =
    /\b(le|la|les|de|des|du|un|une|et|ou|pour|par|dans|sur|avec|sans|chez|comme|tres|plus|moins|taux|rate|revenu|chiffre|affaires|canal|vue|tableau|resume|résumé|expliquer|pourquoi|comment|quand|qui|quel|quelle)\b/i.test(
      text,
    );
  const hasEnglish =
    /\b(the|a|an|and|or|for|by|in|on|with|without|at|as|very|more|less|rate|revenue|amount|channel|view|dashboard|summary|explain|why|how|when|who|what|which)\b/i.test(
      text,
    );

  const scores = {
    arabizi: arabiziWords.length * 2,
    french: hasFrench ? 1 : 0,
    english: hasEnglish ? 1 : 0,
    arabic: hasArabic ? 2 : 0,
  };

  const total = scores.arabizi + scores.french + scores.english + scores.arabic;
  if (total === 0) return "mixed";

  // If multiple languages present, return mixed
  const active = Object.entries(scores).filter(([, v]) => v > 0);
  if (active.length > 1) return "mixed";

  return active[0][0] as ArabiziNormalizationResult["detectedLanguage"];
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
