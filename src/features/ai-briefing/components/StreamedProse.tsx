"use client";

/**
 * Lightweight streamed-prose renderer.
 *
 * The plan calls for `streamdown`, but that package is not installed in this
 * project, so we render streamed markdown-ish text with a small, dependency-free
 * component instead. It:
 *  - splits on blank lines into paragraphs,
 *  - renders inline **bold** segments,
 *  - tolerates incomplete markup that appears mid-stream,
 *  - and is memoized so unchanged content does not re-render per token.
 */

import { memo, useMemo } from "react";
import { cn } from "@/shared/utils";

interface StreamedProseProps {
  text: string;
  className?: string;
  /** Subtle pulsing caret while tokens are still arriving. */
  streaming?: boolean;
}

const BOLD_SPLIT = /(\*\*[^*]+\*\*)/g;

function renderInline(segment: string, keyPrefix: string) {
  const parts = segment.split(BOLD_SPLIT).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export const StreamedProse = memo(function StreamedProse({
  text,
  className,
  streaming = false,
}: StreamedProseProps) {
  const paragraphs = useMemo(() => {
    return text
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [text]);

  if (paragraphs.length === 0) {
    return streaming ? (
      <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-primary/60 align-middle" />
    ) : null;
  }

  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {paragraphs.map((para, i) => {
        const isHeading = /^#{1,6}\s/.test(para);
        const headingText = para.replace(/^#{1,6}\s/, "");
        const isLast = i === paragraphs.length - 1;
        if (isHeading) {
          return (
            <p key={i} className="font-semibold text-foreground">
              {renderInline(headingText, `h-${i}`)}
            </p>
          );
        }
        return (
          <p key={i}>
            {renderInline(para, `p-${i}`)}
            {streaming && isLast && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary/60 align-middle" />
            )}
          </p>
        );
      })}
    </div>
  );
});
