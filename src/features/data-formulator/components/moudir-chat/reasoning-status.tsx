"use client";

/**
 * ReasoningStatus — the honest "still working" line for a streaming assistant
 * turn whose prose hasn't started yet.
 *
 * No spinner-as-entertainment. It's a single shimmering line that tells the
 * truth about what Moudir is doing right now: "Moudir réfléchit…" by default, or
 * "Exécution : <outil>" when the latest activity is a tool call. It auto-hides
 * the instant real content begins streaming (the bubble takes over from there).
 *
 * The shimmer is a token-based gradient sweep over the text — restrained, and
 * disabled under prefers-reduced-motion (falls back to a static muted line).
 */

import type { ChatMessage } from "../../store/moudir-chat-store";
import { useMotionOn } from "../moudir/moudir-kit";
import { toolLabel } from "./tool-chip";

const SHIMMER_KEYFRAMES = `@keyframes moudir-reasoning-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}`;

/** Derive the honest status label from the message's latest activity. */
function statusLabel(message: ChatMessage): string {
  const lastPart = message.parts[message.parts.length - 1];
  if (lastPart?.kind === "tool") return `Exécution : ${toolLabel(lastPart.name)}`;
  return "Moudir réfléchit…";
}

export function ReasoningStatus({ message }: { message: ChatMessage }) {
  const motionOn = useMotionOn();

  // Only meaningful while streaming AND before any prose has arrived.
  if (message.status !== "streaming") return null;
  if (message.content.trim().length > 0) return null;

  const label = statusLabel(message);

  if (!motionOn) {
    return (
      <p
        className="py-0.5 text-sm font-medium text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {label}
      </p>
    );
  }

  return (
    <p className="py-0.5 text-sm font-medium" role="status" aria-live="polite">
      <style>{SHIMMER_KEYFRAMES}</style>
      <span
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, hsl(var(--muted-foreground) / 0.55) 0%, hsl(var(--muted-foreground) / 0.55) 35%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground) / 0.55) 65%, hsl(var(--muted-foreground) / 0.55) 100%)",
          backgroundSize: "200% 100%",
          animation: "moudir-reasoning-shimmer 2s linear infinite",
        }}
      >
        {label}
      </span>
    </p>
  );
}
