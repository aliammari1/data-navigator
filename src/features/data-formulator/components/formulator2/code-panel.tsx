"use client";

/**
 * NodeCodePanel — DF's #1 trust affordance: the generated code behind the
 * focused derived node, always visible (never behind a toggle).
 *
 * Shows the engine badge (`--ai` tint — this is an AI-derived surface), the
 * verbatim code in a scrollable mono block with a copy button, and the natural
 * language instruction that produced it as a quoted line. Renders nothing for
 * original tables — there is no generated code to verify.
 */

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFormFocusedTable } from "../../store/formulator-store";

const COPY_FEEDBACK_MS = 2000;

function CopyCodeButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label="Copier le code"
      className="text-muted-foreground"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check className="text-primary" /> : <Copy />}
      {copied ? "Copié" : "Copier"}
    </Button>
  );
}

export function NodeCodePanel() {
  const focused = useFormFocusedTable();

  if (focused?.kind !== "derived" || !focused.code) return null;

  return (
    <section
      aria-label="Code généré"
      className="flex w-full flex-col gap-2 rounded-xl border border-ai/30 bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-ai/30 bg-ai/10 text-ai">
            {focused.engine === "python" ? "Python" : "SQL"}
          </Badge>
          <span className="text-xs font-medium text-muted-foreground">Code généré</span>
        </div>
        <CopyCodeButton text={focused.code} />
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs text-foreground">
        {focused.code}
      </pre>
      {focused.instruction ? (
        <p className="text-xs text-muted-foreground italic">« {focused.instruction} »</p>
      ) : null}
    </section>
  );
}
