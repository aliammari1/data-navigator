"use client";

import { useMemo, useState } from "react";
import { ChevronsDown, ChevronsUp } from "lucide-react";

type WordDiffProps = {
  before: string;
  after: string;
  ariaLabel: string;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderToken(op: number, token: string): string {
  const safe = escapeHtml(token);
  if (op === 0) return `<span>${safe}</span>`;
  if (op === 1)
    return `<span class="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-400/15 rounded px-0.5">${safe}</span>`;
  return `<span class="bg-rose-500/15 text-rose-700 dark:text-rose-300 dark:bg-rose-400/15 line-through rounded px-0.5">${safe}</span>`;
}

/** Plain character diff, used when texts are too large for token mapping. */
function charDiffHtml(
  dmp: { diff_main(a: string, b: string): [number, string][]; diff_cleanupSemantic(d: [number, string][]): void },
  before: string,
  after: string,
): string {
  const diffs = dmp.diff_main(before, after);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, text]) => renderToken(op, text)).join("");
}

function wordDiffHtml(before: string, after: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { diff_match_patch } = require("diff-match-patch");
  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = 0.5;
  const tokenPattern = /(\s+|[A-Za-zÀ-ÖØ-öø-ÿ\u0100-\u017F'`-]+|\d+|[^\s\w])/g;
  const tokenize = (text: string) =>
    text.match(tokenPattern) ?? text.split(/(\s+)/);
  const tokenMap = new Map<string, number>();
  const tokens: string[] = [];
  for (const t of [before, after]) {
    for (const tok of tokenize(t)) {
      if (!tokenMap.has(tok)) {
        tokenMap.set(tok, tokens.length);
        tokens.push(tok);
      }
    }
  }
  // diff_main only accepts strings. Map each unique token to one BMP char
  // (the documented word-diff recipe); beyond that, diff raw characters.
  if (tokens.length > 60000) return charDiffHtml(dmp, before, after);
  const encode = (text: string) =>
    tokenize(text)
      .map((tok) => String.fromCharCode(tokenMap.get(tok) ?? 0))
      .join("");
  const diffs: [number, string][] = dmp.diff_main(encode(before), encode(after));
  dmp.diff_cleanupSemantic(diffs);
  return diffs
    .map(([op, encoded]) => {
      let out = "";
      for (let k = 0; k < encoded.length; k += 1) {
        out += renderToken(op, tokens[encoded.charCodeAt(k)] ?? "");
      }
      return out;
    })
    .join("");
}

export function WordDiff({ before, after, ariaLabel }: WordDiffProps) {
  const html = useMemo(() => wordDiffHtml(before, after), [before, after]);
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 rounded-md border border-dashed border-ai/30 bg-muted/30 p-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ai/30"
        aria-label={ariaLabel}
      >
        {open ? <ChevronsUp className="size-3" /> : <ChevronsDown className="size-3" />}
        <span>{open ? "Masquer les changements" : "Voir les changements"}</span>
      </button>
      {open ? (
        <div
          aria-label={ariaLabel}
          aria-live="polite"
          className="mt-2 whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </div>
  );
}