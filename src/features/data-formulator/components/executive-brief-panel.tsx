"use client";

import { ClipboardCopy, Download, FileText, Mic } from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/utils";

export interface BriefProps {
  title: string;
  audience: string;
  durationSeconds: number;
  keyPoints: string[];
  recommendations: string[];
  risks: string[];
  nextSteps: string[];
  tone: "formal" | "casual" | "technical";
}

export function ExecutiveBriefPanel({ brief }: { brief?: BriefProps }) {
  const [copied, setCopied] = useState(false);

  if (!brief) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-xs text-muted-foreground">
          No briefing generated yet. Ask for an executive brief from the command bar.
        </p>
      </div>
    );
  }

  const markdown = generateBriefMarkdown(brief);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-500/10">
          <FileText className="h-4 w-4 text-indigo-300" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{brief.title}</h2>
          <p className="text-xs text-muted-foreground">
            {brief.audience} · {brief.durationSeconds}s · {brief.tone}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={() => {
            const blob = new Blob([markdown], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${brief.title.replace(/\s+/g, "_")}.md`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
      </div>

      <Section title="Key Points" items={brief.keyPoints} />
      <Section title="Recommendations" items={brief.recommendations} />
      <Section title="Risks" items={brief.risks} tone="warning" />
      <Section title="Next Steps" items={brief.nextSteps} tone="success" />
    </div>
  );
}

function Section({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "warning" | "success";
}) {
  if (items.length === 0) return null;

  const borderColor =
    tone === "warning" ? "border-amber-500/15" : tone === "success" ? "border-emerald-500/15" : "border-white/10";
  const bgColor =
    tone === "warning" ? "bg-amber-500/5" : tone === "success" ? "bg-emerald-500/5" : "bg-white/3";

  return (
    <div className={cn("rounded-lg border p-3", borderColor, bgColor)}>
      <div className="mb-2 text-[11px] font-semibold text-foreground">{title}</div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
            <span className="mt-1 block h-1 w-1 shrink-0 rounded-full bg-current opacity-40" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function generateBriefMarkdown(brief: BriefProps): string {
  return `# ${brief.title}

**Audience:** ${brief.audience}  
**Duration:** ${brief.durationSeconds}s  
**Tone:** ${brief.tone}

## Key Points
${brief.keyPoints.map((p) => `- ${p}`).join("\n")}

## Recommendations
${brief.recommendations.map((p) => `- ${p}`).join("\n")}

## Risks
${brief.risks.map((p) => `- ${p}`).join("\n")}

## Next Steps
${brief.nextSteps.map((p) => `- ${p}`).join("\n")}
`;
}
