/**
 * Citations parser — extract [kind] label lines from the assistant's content.
 *
 * The model is taught in DEFAULT_SYSTEM_PROMPT to emit a "Sources" section at
 * the end of its turn:
 *
 *   [table] transactions
 *   [dataset] telecom_report
 *   [column] amount (transactions)
 *   [query] SELECT COUNT(*) FROM transactions
 *
 * This module parses those lines into structured CitationPart entries and
 * also returns the cleaned content (citation lines stripped) for rendering.
 * Streaming-safe: a partial line at the very end is dropped — the next token
 * either completes it or moves on.
 */

import type { CitationPart } from "../../store/moudir-chat-store";

const CITATION_RE = /^[ \t]*\[(table|dataset|column|query)\][ \t]+(.+)$/i;

/**
 * A bare "Sources" heading left behind after its lines are stripped is noise,
 * so it is dropped too. Matches `Sources`, `## Sources`, `**Sources :**`, etc.
 */
const SOURCES_HEADING_RE = /^#{0,6}\s*\**\s*sources\s*\**\s*:?\s*\**$/i;

/** Identity of a citation, for de-duplicating repeated lines. */
function citationKey(citation: CitationPart): string {
  return `${citation.sourceKind}|${citation.label}|${citation.query ?? ""}`;
}

export interface CitationsParseResult {
  /** Source content with the citation lines removed. */
  cleanContent: string;
  /** Citations in the order they were emitted. */
  citations: CitationPart[];
}

/** Strip a single citation line `[kind] label` into its parts. */
function lineToCitation(line: string): CitationPart | null {
  const m = CITATION_RE.exec(line);
  if (!m) return null;
  const sourceKind = m[1].toLowerCase() as CitationPart["sourceKind"];
  const rest = m[2].trim();
  if (sourceKind === "query") {
    const query = rest;
    const label = query.length > 60 ? `${query.slice(0, 60)}…` : query;
    return { kind: "citation", sourceKind, label, query };
  }
  const parenMatch = rest.match(/^([^(]+?)\s*\(("([^"]+)"|([^)]+))\)\s*$/);
  if (parenMatch) {
    const label = parenMatch[1].trim();
    const detail = parenMatch[3] ?? parenMatch[4] ?? "";
    return { kind: "citation", sourceKind, label, detail };
  }
  return { kind: "citation", sourceKind, label: rest };
}

export function parseCitations(content: string): CitationsParseResult {
  if (!content) return { cleanContent: "", citations: [] };
  const lines = content.split("\n");
  const kept: string[] = [];
  const citations: CitationPart[] = [];
  const seen = new Set<string>();

  // Single indexed pass. The previous implementation recorded positions with
  // `lines.indexOf(line)`, which returns the FIRST match — so two identical
  // citation lines (e.g. `[table] transactions` emitted twice) collapsed onto
  // the same index and the reverse splice deleted a line of real prose
  // instead. Building `kept` directly removes both that bug and the O(n²) scan.
  for (const line of lines) {
    const citation = lineToCitation(line);
    if (!citation) {
      kept.push(line);
      continue;
    }
    // The line is always stripped from the prose, even when it's a duplicate;
    // only the chip list is de-duplicated (first occurrence wins).
    const key = citationKey(citation);
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push(citation);
  }

  if (citations.length === 0) {
    return { cleanContent: content, citations: [] };
  }

  // Drop the now-empty "Sources" heading, plus any trailing rule/blank lines it
  // was sitting under, so the prose doesn't end with a dangling header.
  while (kept.length > 0) {
    const last = kept[kept.length - 1].trim();
    if (last === "" || last === "---" || SOURCES_HEADING_RE.test(last)) {
      kept.pop();
      continue;
    }
    break;
  }

  return { cleanContent: kept.join("\n").trimEnd(), citations };
}
