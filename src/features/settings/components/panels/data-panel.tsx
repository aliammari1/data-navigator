"use client";

import { Database, Globe, Zap } from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useSettingsStore } from "@/core/stores/settings-store";
import {
  NullDisplayField,
  NumberSetting,
  Section,
  SettingRow,
  SettingSelect,
  Toggle,
} from "../controls";

export function DataPanel() {
  const {
    defaultRowLimit,
    nullDisplay,
    numberLocale,
    defaultDateFormat,
    enableQueryHistory,
    autoRefreshInterval,
  } = useSettingsStore(
    useShallow((s) => ({
      defaultRowLimit: s.data.defaultRowLimit,
      nullDisplay: s.data.nullDisplay,
      numberLocale: s.data.numberLocale,
      defaultDateFormat: s.data.defaultDateFormat,
      enableQueryHistory: s.data.enableQueryHistory,
      autoRefreshInterval: s.data.autoRefreshInterval,
    })),
  );
  const setData = useSettingsStore((s) => s.setData);

  return (
    <>
      <Section title="Import & Parsing" icon={Database}>
        <SettingRow
          label="Max rows to load"
          description="Applied as a LIMIT on dataset previews (100 – 1,000,000)"
        >
          <NumberSetting
            field="defaultRowLimit"
            value={defaultRowLimit}
            onCommit={(v) => setData({ defaultRowLimit: v })}
            suffix="rows"
          />
        </SettingRow>
        <SettingRow label="Null display value" description="How NULL values appear in tables">
          <NullDisplayField value={nullDisplay} onCommit={(v) => setData({ nullDisplay: v })} />
        </SettingRow>
      </Section>

      <Section title="Formatting" icon={Globe}>
        <SettingRow label="Number locale">
          <SettingSelect<string>
            value={numberLocale}
            onChange={(v) => setData({ numberLocale: v })}
            ariaLabel="Number locale"
            options={[
              { value: "en-US", label: "English (US)" },
              { value: "en-GB", label: "English (UK)" },
              { value: "de-DE", label: "German (DE)" },
              { value: "fr-FR", label: "French (FR)" },
              { value: "ar-SA", label: "Arabic (SA)" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Date format">
          <SettingSelect<string>
            value={defaultDateFormat}
            onChange={(v) => setData({ defaultDateFormat: v })}
            ariaLabel="Date format"
            options={[
              { value: "MMM d, yyyy", label: "Jan 1, 2025" },
              { value: "yyyy-MM-dd", label: "2025-01-01" },
              { value: "dd/MM/yyyy", label: "01/01/2025" },
              { value: "MM/dd/yyyy", label: "01/01/2025 (US)" },
            ]}
          />
        </SettingRow>
        <Toggle
          checked={enableQueryHistory}
          onChange={(v) => setData({ enableQueryHistory: v })}
          label="Save query history"
          description="Remember past SQL & NL queries"
        />
      </Section>

      <Section title="Auto-refresh" icon={Zap}>
        <SettingRow label="Refresh interval" description="0 = disabled">
          <SettingSelect<string>
            value={String(autoRefreshInterval)}
            onChange={(v) => setData({ autoRefreshInterval: Number(v) })}
            ariaLabel="Auto-refresh interval"
            options={[
              { value: "0", label: "Off" },
              { value: "10", label: "10s" },
              { value: "30", label: "30s" },
              { value: "60", label: "1 min" },
              { value: "300", label: "5 min" },
            ]}
          />
        </SettingRow>
      </Section>
    </>
  );
}
