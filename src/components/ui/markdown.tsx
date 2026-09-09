"use client";

/**
 * Markdown — the app-wide streamed-markdown renderer (system-wide component).
 *
 * Wraps `streamdown` (offline, streaming-safe: it auto-closes incomplete bold /
 * links / code fences as tokens arrive) with the app's typography. Replaces the
 * hand-rolled bold-only prose renderers that predated having streamdown
 * installed (ai-briefing's StreamedProse).
 *
 * Offline hardening: `urlTransform` drops any non-relative URL, so a remote
 * image/link in model output can't fetch off-origin — belt-and-braces over the
 * runtime CSP (which already fails closed). react-markdown's default transform
 * also strips dangerous `javascript:`/`vbscript:` schemes. Shiki code grammars
 * are bundled locally by streamdown; no CDN.
 */

import { memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/shared/utils";

/** Keep only same-origin/relative URLs and safe schemes; drop everything remote. */
function offlineUrlTransform(url: string): string {
  if (/^(https?|ftp|mailto|tel):/i.test(url)) return "";
  // Relative paths, anchors and data-less fragments pass through unchanged.
  return url;
}

export interface MarkdownProps {
  children: string;
  className?: string;
  /** Subtle pulsing caret appended while tokens are still arriving. */
  streaming?: boolean;
}

/**
 * Prose styling via Tailwind utilities on a wrapper (streamdown ships no
 * stylesheet). Tuned to the app's tokens: readable body, tight headings, muted
 * code/quote surfaces, all theme-aware.
 */
const PROSE_CLASS = cn(
  "text-sm leading-relaxed text-foreground",
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:font-heading [&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:font-heading [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-medium",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/50 [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_table]:my-2 [&_table]:w-full [&_table]:text-xs",
  "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
  "[&_td]:border-b [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1",
  "[&_hr]:my-3 [&_hr]:border-border",
);

export const Markdown = memo(function Markdown({
  children,
  className,
  streaming = false,
}: MarkdownProps) {
  return (
    <div className={cn(PROSE_CLASS, className)}>
      <Streamdown urlTransform={offlineUrlTransform}>{children}</Streamdown>
      {streaming && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary/60 align-middle"
        />
      )}
    </div>
  );
});
