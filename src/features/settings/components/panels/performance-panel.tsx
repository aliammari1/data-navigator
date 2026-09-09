"use client";

import { Info, Sliders, Zap } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useSettingsStore } from "@/core/stores/settings-store";
import {
  NumberSetting,
  Section,
  SettingRow,
  SettingSelect,
  SliderSetting,
  Toggle,
} from "../controls";

export function PerformancePanel() {
  const {
    duckdbWorkers,
    maxMemoryMB,
    enableWASMStreaming,
    cacheQueries,
    virtualizeThreshold,
    cacheMode,
  } = useSettingsStore(
    useShallow((s) => ({
      duckdbWorkers: s.performance.duckdbWorkers,
      maxMemoryMB: s.performance.maxMemoryMB,
      enableWASMStreaming: s.performance.enableWASMStreaming,
      cacheQueries: s.performance.cacheQueries,
      virtualizeThreshold: s.performance.virtualizeThreshold,
      cacheMode: s.performance.cacheMode,
    })),
  );
  const setPerformance = useSettingsStore((s) => s.setPerformance);

  return (
    <>
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90">
        <Info className="w-4 h-4 flex-none mt-0.5 text-amber-400" />
        <span>
          Worker-pool and memory limits are read when the DuckDB engine starts. Changes here apply
          on the next reload.
        </span>
      </div>

      <Section title="DuckDB Engine" icon={Zap}>
        <SettingRow
          label="Worker threads"
          description="More threads = faster queries (applies on reload)"
        >
          <SliderSetting
            field="duckdbWorkers"
            value={duckdbWorkers}
            onCommit={(v) => setPerformance({ duckdbWorkers: v })}
            min={1}
            max={8}
            step={1}
            ariaLabel="DuckDB worker threads"
          />
        </SettingRow>
        <SettingRow label="Memory limit">
          <SettingSelect<string>
            value={String(maxMemoryMB)}
            onChange={(v) => setPerformance({ maxMemoryMB: Number(v) })}
            ariaLabel="Memory limit"
            options={[
              { value: "256", label: "256 MB" },
              { value: "512", label: "512 MB" },
              { value: "1024", label: "1 GB" },
              { value: "2048", label: "2 GB" },
              { value: "4096", label: "4 GB" },
            ]}
          />
        </SettingRow>
        <Toggle
          checked={enableWASMStreaming}
          onChange={(v) => setPerformance({ enableWASMStreaming: v })}
          label="WASM streaming instantiation"
          description="Faster DuckDB startup when enabled (web build)"
        />
        <Toggle
          checked={cacheQueries}
          onChange={(v) => setPerformance({ cacheQueries: v })}
          label="Cache query results"
          description="Avoid re-running identical queries"
        />
      </Section>

      <Section title="Rendering" icon={Sliders}>
        <SettingRow
          label="Virtualize tables at"
          description="Tables larger than this switch to virtual scrolling"
        >
          <NumberSetting
            field="virtualizeThreshold"
            value={virtualizeThreshold}
            onCommit={(v) => setPerformance({ virtualizeThreshold: v })}
            suffix="rows"
            className="w-20"
          />
        </SettingRow>
        <SettingRow
          label="Cache profile"
          description="Low memory trims caches more aggressively on constrained machines"
        >
          <SettingSelect<"balanced" | "low-memory">
            value={cacheMode}
            onChange={(v) => setPerformance({ cacheMode: v })}
            ariaLabel="Cache profile"
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "low-memory", label: "Low memory" },
            ]}
          />
        </SettingRow>
      </Section>
    </>
  );
}
