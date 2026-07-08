"use client";

/**
 * StreamedProse — thin adapter over the app-wide {@link Markdown} renderer.
 *
 * Was a hand-rolled bold-only parser written when `streamdown` wasn't yet a
 * dependency; now that the shared `@/components/ui/markdown` component exists
 * (streamdown-backed, offline-safe, full markdown), this keeps the original
 * `{ text, streaming, className }` API so its call sites upgrade to real
 * markdown rendering with no changes.
 */

import { Markdown } from "@/components/ui/markdown";

interface StreamedProseProps {
  text: string;
  className?: string;
  /** Subtle pulsing caret while tokens are still arriving. */
  streaming?: boolean;
}

export function StreamedProse({ text, className, streaming = false }: StreamedProseProps) {
  if (!text && !streaming) return null;
  return (
    <Markdown className={className} streaming={streaming}>
      {text}
    </Markdown>
  );
}
