"use client";

/**
 * Renders a chat message's content as a mixed sequence of prose (via
 * Streamdown) and executable code blocks (via CodeBlockCard).
 *
 * Why not just pass the raw markdown to Streamdown?
 *   Streamdown would render ` ```js-run ` as a plain code block. The model
 *   is taught (via the Moudir system prompt) to emit two special languages —
 *   `js-run` and `python-run` — that the chat should treat as executable
 *   cards. We extract those blocks first, render them as cards, and feed
 *   everything else to Streamdown unchanged.
 *
 * Streaming note: `extractCodeBlocks` is forgiving on partial input. An
 * unclosed fence (e.g. mid-stream) stays as prose; the moment the closing
 * fence arrives, the block jumps into the card slot. No visual glitch.
 */

import { Streamdown } from "streamdown";
import { InteractiveTableChart } from "./interactive-table-chart";
import { CodeBlockCard } from "./sandbox/code-block";
import { extractCodeBlocks } from "./sandbox/parse-code-blocks";

interface MessageContentProps {
  content: string;
  enabled: boolean;
  proseClassName: string;
  streaming?: boolean;
}

export function MessageContent({
  content,
  enabled,
  proseClassName,
  streaming,
}: MessageContentProps) {
  const segments = extractCodeBlocks(content);
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind === "code") {
          return <CodeBlockCard key={`code-${i}`} block={segment.block} enabled={enabled} />;
        }
        if (segment.text.length === 0) return null;
        return (
          <div key={`text-${i}`}>
            <Streamdown
              className={proseClassName}
              components={{
                table: InteractiveTableChart,
              }}
            >
              {segment.text}
            </Streamdown>
            {streaming && i === segments.length - 1 ? (
              <span
                className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse rounded-full bg-ai align-middle"
                aria-hidden="true"
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
