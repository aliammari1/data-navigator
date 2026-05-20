"use client";

/**
 * Domain Lexicon
 * Telecom and business glossary with Tunisian/Arabizi synonyms.
 * Maps colloquial terms to canonical business concepts.
 */

export interface LexiconEntry {
  canonical: string;
  synonyms: string[];
  category: "metric" | "dimension" | "filter" | "action" | "time" | "general";
  description: string;
  exampleQueries: string[];
}

export const DOMAIN_LEXICON: LexiconEntry[] = [
  {
    canonical: "success rate",
    synonyms: [
      "taux najah",
      "taux de succès",
      "نسبة النجاح",
      "taux reussite",
      "najah",
      "success",
      "reussite",
    ],
    category: "metric",
    description: "Percentage of transactions completed successfully",
    exampleQueries: ["taux najah mtaa TTCASH", "success rate by canal"],
  },
  {
    canonical: "revenue",
    synonyms: [
      "flous",
      "montant",
      "amount",
      "chiffre d'affaires",
      "revenu",
      "الإيرادات",
      "فلوس",
      "فلوس",
    ],
    category: "metric",
    description: "Total monetary value of transactions",
    exampleQueries: ["chouf flous mtaa canal hedha", "revenue by day"],
  },
  {
    canonical: "channel",
    synonyms: ["canal", "canaux", "قناة", "mta3", "mtaa"],
    category: "dimension",
    description: "Transaction channel or distribution path",
    exampleQueries: ["compare canals", "revenue par canal"],
  },
  {
    canonical: "TTCASH",
    synonyms: ["tt cash", "ttcash", "تي تي كاش"],
    category: "dimension",
    description: "TT Cash payment channel",
    exampleQueries: ["taux najah mtaa TTCASH"],
  },
  {
    canonical: "failure",
    synonyms: ["echec", "فشل", "erreur", "error", "echec", "failed", "failure"],
    category: "filter",
    description: "Transactions that did not complete successfully",
    exampleQueries: ["show failures", "transactions en echec"],
  },
  {
    canonical: "previous period",
    synonyms: ["li fet", "li fetet", "semaine li fetet", "mois precedent", "periode precedente", "الفترة السابقة"],
    category: "time",
    description: "The period immediately before the current one",
    exampleQueries: ["compare semaine hedhi bel semaine li fetet"],
  },
  {
    canonical: "current period",
    synonyms: ["hedhi", "cette semaine", "ce mois", "periode actuelle", "الفترة الحالية"],
    category: "time",
    description: "The current time period",
    exampleQueries: ["revenue hedhi"],
  },
  {
    canonical: "operator",
    synonyms: ["operateur", "opérateur", "المشغل"],
    category: "dimension",
    description: "Mobile or telecom operator",
    exampleQueries: ["revenue by operator"],
  },
  {
    canonical: "service code",
    synonyms: ["code service", "service", "type", "نوع الخدمة"],
    category: "dimension",
    description: "Service or product code",
    exampleQueries: ["breakdown by service code"],
  },
  {
    canonical: "region",
    synonyms: ["zone", "wilaya", "region", "منطقة", "ولاية"],
    category: "dimension",
    description: "Geographic region or administrative area",
    exampleQueries: ["revenue by region"],
  },
  {
    canonical: "create",
    synonyms: ["a3melli", "a3mel", "créer", "create", "build", "make", "انشاء"],
    category: "action",
    description: "Create or generate something",
    exampleQueries: ["a3melli KPI", "create dashboard"],
  },
  {
    canonical: "show",
    synonyms: ["chouf", "warri", "voir", "show", "display", "afficher", "وريني"],
    category: "action",
    description: "Display or visualize data",
    exampleQueries: ["chouf revenue", "warri taux najah"],
  },
  {
    canonical: "why",
    synonyms: ["3lech", "pourquoi", "why", "علاش", "لماذا"],
    category: "action",
    description: "Request explanation or root cause",
    exampleQueries: ["3lech taux najah ta7?"],
  },
  {
    canonical: "drop",
    synonyms: ["ta7", "baisse", "drop", "decrease", "fall", "هبط", "نقص"],
    category: "general",
    description: "A decrease in value",
    exampleQueries: ["taux najah ta7", "revenue dropped"],
  },
  {
    canonical: "increase",
    synonyms: ["zed", "augmentation", "increase", "rise", "زاد", "زيادة"],
    category: "general",
    description: "An increase in value",
    exampleQueries: ["revenue zed"],
  },
  {
    canonical: "summary",
    synonyms: ["resume", "résumé", "summary", "brief", "ملخص"],
    category: "action",
    description: "Executive summary or brief",
    exampleQueries: ["a3tini resume lel DG"],
  },
  {
    canonical: "dashboard",
    synonyms: ["tableau", "tableau de bord", "dashboard", "vue", "لوحة"],
    category: "action",
    description: "Collection of visualizations",
    exampleQueries: ["create dashboard"],
  },
  {
    canonical: "anomaly",
    synonyms: ["anomalie", "anomaly", "problem", "probleme", "مشكل"],
    category: "general",
    description: "Unusual or problematic pattern",
    exampleQueries: ["find anomalies"],
  },
];

export function findLexiconMatches(text: string): LexiconEntry[] {
  const lower = text.toLowerCase();
  return DOMAIN_LEXICON.filter((entry) => {
    return entry.synonyms.some((syn) => lower.includes(syn.toLowerCase()));
  });
}

export function normalizeWithLexicon(text: string): string {
  let result = text;
  for (const entry of DOMAIN_LEXICON) {
    for (const syn of entry.synonyms) {
      const pattern = new RegExp(`\\b${escapeRegExp(syn)}\\b`, "gi");
      result = result.replace(pattern, entry.canonical);
    }
  }
  return result;
}

export function getCanonical(term: string): string | undefined {
  const lower = term.toLowerCase().trim();
  const entry = DOMAIN_LEXICON.find((e) =>
    e.synonyms.some((s) => s.toLowerCase() === lower),
  );
  return entry?.canonical;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
