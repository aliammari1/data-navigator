"use client";

import { Brain, Check, Cpu, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ModelDownloadPanel } from "@/components/shared/model-download-panel";
import { pickDefaultProvider, useAIRuntimeStore } from "@/platform/ai/provider";
import type { AIModelInfo } from "@/platform/ai/provider";
import { cn } from "@/shared/utils";
import { Section, Toggle } from "../controls";
import { useSettingsStore } from "@/core/stores/settings-store";

/**
 * Active AI model + downloads. Centralizes the model picker that used to only
 * appear once, during Agent Canvas's first-run onboarding wizard — there was
 * no way to change it afterward from any screen. Writes the same
 * `useAIRuntimeStore` every AI-dependent feature reads.
 */
export function AiPanel() {
  const [models, setModels] = useState<AIModelInfo[] | null>(null);
  const [providerLabel, setProviderLabel] = useState("");
  const selected = useAIRuntimeStore((s) => s.model);
  const setModel = useAIRuntimeStore((s) => s.setModel);
  const enableAiCritic = useSettingsStore((s) => s.enableAiCritic);
  const setEnableAiCritic = useSettingsStore((s) => s.setEnableAiCritic);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const provider = await pickDefaultProvider();
      const list = await provider.listModels().catch(() => []);
      if (!alive) return;
      setProviderLabel(provider.label);
      setModels(list);
      if (list.length > 0 && !list.some((m) => m.id === selected)) {
        setModel(list[0].id);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Section title="Active Model" icon={Brain}>
        {providerLabel && (
          <p className="text-xs text-muted-foreground">
            Runtime: <span className="text-foreground">{providerLabel}</span> — runs locally, no
            network required at inference time.
          </p>
        )}
        {models === null ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking available models…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Active AI model">
            {models.map((item) => {
              const active = selected === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setModel(item.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--primary)]"
                      : "border-border bg-muted/40 hover:border-foreground/30",
                  )}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Cpu className="h-3 w-3 text-muted-foreground" />
                      {item.label}
                    </span>
                    {active && <Check className="h-3.5 w-3.5 flex-none text-primary" />}
                  </div>
                  {item.family && (
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {item.family}
                      {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Quality" icon={Brain}>
        <Toggle
          checked={enableAiCritic}
          onChange={setEnableAiCritic}
          label="Extra review pass"
          description="Runs a second, stricter model pass over AI analysis output (slower)"
        />
      </Section>

      <Section title="Offline Models" icon={Cpu}>
        <ModelDownloadPanel />
      </Section>
    </>
  );
}
