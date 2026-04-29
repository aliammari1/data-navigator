/**
 * F20 — @huggingface/transformers: Semantic Error Classification
 * Groups free-text REMARK / error_code values into semantic categories.
 * Runs entirely in-browser via ONNX/WASM — no API key, no data leaves device.
 *
 * Model: Xenova/nli-deberta-v3-xsmall (~47MB, cached after first download).
 * Falls back to keyword-based classification when model is unavailable.
 */

"use client";

export type ErrorCategory =
  | "fraud"
  | "technical"
  | "insufficient_funds"
  | "invalid_data"
  | "timeout"
  | "authorization"
  | "other";

export interface SemanticErrorGroup {
  category: ErrorCategory;
  label: string;
  count: number;
  codes: string[];
}

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  fraud: "Fraude / Sécurité",
  technical: "Erreur technique",
  insufficient_funds: "Fonds insuffisants",
  invalid_data: "Données invalides",
  timeout: "Délai expiré",
  authorization: "Autorisation refusée",
  other: "Autre",
};

const NLI_LABELS: ErrorCategory[] = [
  "fraud",
  "technical",
  "insufficient_funds",
  "invalid_data",
  "timeout",
  "authorization",
  "other",
];

const NLI_HYPOTHESIS_LABELS = [
  "fraud or security issue",
  "technical error or system failure",
  "insufficient funds or balance",
  "invalid data or format error",
  "timeout or network delay",
  "authorization or permission denied",
  "other error",
];

// ─── Keyword Fallback ─────────────────────────────────────────────────────────

const KEYWORD_MAP: Array<{ patterns: RegExp; category: ErrorCategory }> = [
  { patterns: /fraud|suspect|block|blacklist|stolen|scam/i, category: "fraud" },
  { patterns: /timeout|time.?out|expire|delay|network|connect/i, category: "timeout" },
  { patterns: /fund|balanc|solde|insuffi|credit|amount/i, category: "insufficient_funds" },
  { patterns: /invalid|format|parse|malform|corrupt|wrong/i, category: "invalid_data" },
  { patterns: /auth|permission|denied|unauthor|access|privilege/i, category: "authorization" },
  { patterns: /system|server|internal|exception|crash|error|fail/i, category: "technical" },
];

function keywordClassify(text: string): ErrorCategory {
  for (const { patterns, category } of KEYWORD_MAP) {
    if (patterns.test(text)) return category;
  }
  return "other";
}

// ─── HuggingFace Pipeline (lazy) ─────────────────────────────────────────────

let _pipelinePromise: Promise<unknown> | null = null;

async function getNLIPipeline(): Promise<unknown | null> {
  if (_pipelinePromise) return _pipelinePromise;
  _pipelinePromise = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Use local cache (browser cache / OPFS via transformers.js cache)
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      const classifier = await pipeline(
        "zero-shot-classification",
        "Xenova/nli-deberta-v3-xsmall",
        { progress_callback: undefined },
      );
      return classifier;
    } catch (err) {
      console.warn("[nlp] HuggingFace pipeline init failed:", err);
      return null;
    }
  })();
  return _pipelinePromise;
}

// ─── Classification ───────────────────────────────────────────────────────────

async function classifyOne(
  // biome-ignore lint/suspicious/noExplicitAny: pipeline type is complex
  classifier: any,
  text: string,
): Promise<ErrorCategory> {
  try {
    const result = await classifier(text, NLI_HYPOTHESIS_LABELS, {
      multi_label: false,
    });
    const topIdx = result.scores.indexOf(Math.max(...result.scores));
    return NLI_LABELS[topIdx] ?? "other";
  } catch {
    return keywordClassify(text);
  }
}

export interface ErrorRow {
  error_code: string;
  error_message: string;
  count: number;
  canal: string;
}

/**
 * Groups error rows into semantic categories.
 * Uses HuggingFace zero-shot classifier when available, keyword fallback otherwise.
 * @param errors — raw error rows from DuckDB
 * @param onProgress — optional callback called with fraction 0→1
 */
export async function groupErrorsSemantically(
  errors: ErrorRow[],
  onProgress?: (fraction: number) => void,
): Promise<SemanticErrorGroup[]> {
  if (errors.length === 0) return [];

  const classifier = await getNLIPipeline();
  const groups: Map<ErrorCategory, { count: number; codes: Set<string> }> = new Map();

  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    const text = [err.error_code, err.error_message].filter(Boolean).join(" — ");
    const category = classifier
      ? await classifyOne(classifier, text)
      : keywordClassify(text);

    const existing = groups.get(category) ?? { count: 0, codes: new Set() };
    existing.count += err.count;
    existing.codes.add(err.error_code);
    groups.set(category, existing);

    onProgress?.((i + 1) / errors.length);
  }

  return Array.from(groups.entries())
    .map(([category, { count, codes }]) => ({
      category,
      label: CATEGORY_LABELS[category],
      count,
      codes: Array.from(codes),
    }))
    .sort((a, b) => b.count - a.count);
}

export { CATEGORY_LABELS };
