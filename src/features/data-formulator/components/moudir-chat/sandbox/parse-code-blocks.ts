/**
 * Markdown code-fence extraction for the in-chat sandbox.
 *
 * Walks the input character-by-character looking for fenced code blocks of
 * language `js-run` or `python-run`. Other languages (`js`, `python`, ````,
 * etc.) are dropped — the model is taught the two `*-run` languages only
 * via the system prompt (DEFAULT_SYSTEM_PROMPT). Inline code (single backticks)
 * is never executable.
 *
 * Returns a flat list of segments so the renderer can interleave prose and
 * blocks without a second pass over the message.
 */

import type { CodeBlock, CodeBlockKind } from "./types";

export type Segment = { kind: "text"; text: string } | { kind: "code"; block: CodeBlock };

const RUN_LANGS: ReadonlySet<CodeBlockKind> = new Set(["js-run", "python-run"]);

const FENCE_RE = /^[ \t]{0,3}(```+|~~~+)\s*([A-Za-z0-9_-]*)\s*$/;

export function extractCodeBlocks(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  let textBuffer: string[] = [];

  const flushText = (): void => {
    if (textBuffer.length === 0) return;
    segments.push({ kind: "text", text: textBuffer.join("\n") });
    textBuffer = [];
  };

  while (i < lines.length) {
    const open = lines[i] ?? "";
    const m = FENCE_RE.exec(open);
    if (!m || !RUN_LANGS.has(m[2] as CodeBlockKind)) {
      textBuffer.push(open);
      i += 1;
      continue;
    }
    const lang = m[2] as CodeBlockKind;
    const fence = m[1] ?? "";
    const codeStart = i + 1;
    let codeEnd = codeStart;
    while (codeEnd < lines.length) {
      const candidate = lines[codeEnd] ?? "";
      if (candidate.trimEnd() === fence.trimEnd()) break;
      codeEnd += 1;
    }
    const source = lines.slice(codeStart, codeEnd).join("\n");
    flushText();
    segments.push({ kind: "code", block: { kind: lang, source } });
    i = codeEnd + 1;
  }

  flushText();
  return segments;
}
