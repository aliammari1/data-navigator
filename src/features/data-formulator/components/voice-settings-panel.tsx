"use client";

/**
 * Voice Settings Panel
 *
 * Full UI for the library-powered voice-agent stack:
 * - VAD / interaction mode
 * - microphone device
 * - STT model/runtime
 * - transcript review/tool preview behavior
 * - TTS engine/runtime/voice/playback
 * - model readiness/cache check
 * - debug controls
 * - presets/reset/import/export
 */

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  Gauge,
  HardDrive,
  Headphones,
  Languages,
  Mic,
  RefreshCcw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Volume2,
  Wand2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVoiceModelCacheBadge,
  getVoiceOfflineReadinessReport,
  refreshVoiceModelCache,
  type VoiceOfflineReadinessReport,
} from "@/features/data-formulator/core/voice/voice-model-cache";
import {
  getEnabledSttEngines,
  getEnabledTtsEngines,
  getModelDisplaySummary,
  KOKORO_VOICES,
  mapLanguageHintToDisplayLabel,
  type SpeakMode,
  STT_MODELS,
  type SttEngine,
  TTS_MODELS,
  type TtsEngine,
  VOICE_RUNTIMES,
  type VoiceLanguageHint,
  type VoiceRuntime,
} from "@/features/data-formulator/core/voice/voice-model-registry";
import {
  applyVoiceSettingsPreset,
  exportVoiceSettingsFromDatabase,
  exportVoiceSettings,
  getTranscriptBehavior,
  getVadThresholdsFromSensitivity,
  getVoiceOutputMode,
  getVoiceSettingsSummary,
  importVoiceSettings,
  hydrateVoiceSettingsFromDatabase,
  loadVoiceSettings,
  resetVoiceSettings,
  subscribeVoiceSettings,
  updateVoiceSettings,
  VOICE_SETTINGS_PRESETS,
  type VoiceDebugLevel,
  type VoiceMode,
  type VoiceSettings,
  validateVoiceSettings,
} from "@/features/data-formulator/core/voice/voice-settings";
import {
  listVoiceInputDevices,
  requestVoiceMicrophonePermission,
  type VoiceVadDeviceInfo,
} from "@/features/data-formulator/core/voice/voice-vad-service";
import { cn } from "@/shared/utils";

interface VoiceSettingsPanelProps {
  className?: string;
  compact?: boolean;
  onClose?: () => void;
}

const VOICE_MODES: Array<{
  value: VoiceMode;
  label: string;
  description: string;
}> = [
  {
    value: "hold-to-talk",
    label: "Hold",
    description: "Press and hold the mic. Release to finish.",
  },
  {
    value: "push-to-talk",
    label: "Push",
    description: "Tap once to start, tap again to stop.",
  },
  {
    value: "auto-vad",
    label: "Auto",
    description: "Tap once. VAD ends the turn after speech.",
  },
];

const LANGUAGE_OPTIONS: Array<{
  value: VoiceLanguageHint;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Auto",
    description: "Let the STT/router infer the language.",
  },
  {
    value: "ar-TN",
    label: "Tounsi",
    description: "Tunisian Arabic / Arabizi voice commands.",
  },
  {
    value: "ar",
    label: "Arabic",
    description: "Arabic voice commands.",
  },
  {
    value: "fr",
    label: "French",
    description: "French voice commands.",
  },
  {
    value: "en",
    label: "English",
    description: "English voice commands.",
  },
];

const SPEAK_MODES: Array<{
  value: SpeakMode;
  label: string;
  description: string;
}> = [
  {
    value: "off",
    label: "Off",
    description: "Text only, no voice output.",
  },
  {
    value: "summary",
    label: "Summary",
    description: "Speak a short confirmation/summary.",
  },
  {
    value: "full",
    label: "Full",
    description: "Speak the full assistant answer.",
  },
];

const DEBUG_LEVELS: Array<{
  value: VoiceDebugLevel;
  label: string;
  description: string;
}> = [
  {
    value: "off",
    label: "Off",
    description: "No debug logging.",
  },
  {
    value: "errors",
    label: "Errors",
    description: "Only store errors.",
  },
  {
    value: "normal",
    label: "Normal",
    description: "Useful lifecycle logs.",
  },
  {
    value: "verbose",
    label: "Verbose",
    description: "Detailed VAD/model/event logs.",
  },
];

function formatMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function settingCardClass(active: boolean): string {
  return cn(
    "rounded-xl border p-2.5 text-left transition-colors",
    active
      ? "border-emerald-500/30 bg-emerald-500/15"
      : "border-white/10 bg-white/5 hover:bg-white/10",
  );
}

function settingCardTitleClass(active: boolean): string {
  return cn(
    "text-[11px] font-semibold",
    active ? "text-emerald-300" : "text-foreground",
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-emerald-300">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">{title}</div>
          {description && (
            <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

function FieldLabel({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {value && <span className="text-foreground">{value}</span>}
    </div>
  );
}

export function VoiceSettingsPanel({
  className,
  compact = false,
  onClose,
}: VoiceSettingsPanelProps) {
  const [settings, setSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings(),
  );
  const [devices, setDevices] = useState<VoiceVadDeviceInfo[]>([]);
  const [readiness, setReadiness] =
    useState<VoiceOfflineReadinessReport | null>(() =>
      getVoiceOfflineReadinessReport(),
    );
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [devicePermissionPending, setDevicePermissionPending] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const importTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const validation = useMemo(() => validateVoiceSettings(settings), [settings]);
  const cacheBadge = useMemo(() => getVoiceModelCacheBadge(), [readiness]);
  const vadThresholds = useMemo(
    () => getVadThresholdsFromSensitivity(settings),
    [settings],
  );
  const enabledSttEngines = useMemo(() => getEnabledSttEngines(), []);
  const enabledTtsEngines = useMemo(() => getEnabledTtsEngines(), []);
  const outputMode = useMemo(() => getVoiceOutputMode(settings), [settings]);
  const transcriptBehavior = useMemo(
    () => getTranscriptBehavior(settings),
    [settings],
  );

  const commit = useCallback((patch: Partial<VoiceSettings>) => {
    const next = updateVoiceSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const refreshDevices = useCallback(async () => {
    const nextDevices = await listVoiceInputDevices();
    setDevices(nextDevices);
  }, []);

  const requestMicAndRefresh = useCallback(async () => {
    setDevicePermissionPending(true);

    try {
      await requestVoiceMicrophonePermission();
      await refreshDevices();
    } finally {
      setDevicePermissionPending(false);
    }
  }, [refreshDevices]);

  const checkReadiness = useCallback(async () => {
    setCheckingReadiness(true);

    try {
      const report = await refreshVoiceModelCache({
        sttEngine: settings.sttEngine,
        ttsEngine: settings.ttsEngine,
        includeAllModels: false,
        inspectCacheStorage: true,
      });
      setReadiness(report);
    } finally {
      setCheckingReadiness(false);
    }
  }, [settings.sttEngine, settings.ttsEngine]);

  const handleReset = useCallback(() => {
    const next = resetVoiceSettings();
    setSettings(next);
  }, []);

  const handleExport = useCallback(async () => {
    const json = await exportVoiceSettingsFromDatabase().catch(() =>
      exportVoiceSettings(),
    );

    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // Clipboard can be blocked; fallback to showing import/export textarea.
      setImportText(json);
      setShowImport(true);
    }
  }, []);

  const handleImport = useCallback(() => {
    if (!importText.trim()) return;

    const next = importVoiceSettings(importText);
    setSettings(next);
    setShowImport(false);
    setImportText("");
  }, [importText]);

  useEffect(() => {
    void hydrateVoiceSettingsFromDatabase();

    const unsubscribe = subscribeVoiceSettings((event) => {
      setSettings(event.settings);
    });

    refreshDevices().catch(() => {});

    return unsubscribe;
  }, [refreshDevices]);

  useEffect(() => {
    if (showImport) {
      requestAnimationFrame(() => {
        importTextareaRef.current?.focus();
      });
    }
  }, [showImport]);

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-background/95 p-3 text-left shadow-2xl backdrop-blur-xl",
        compact ? "max-h-[70vh] overflow-y-auto" : "space-y-3",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-emerald-300" />
            Voice settings
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {getVoiceSettingsSummary(settings)}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={checkReadiness}
            disabled={checkingReadiness}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-50"
          >
            {checkingReadiness ? (
              <RefreshCcw className="h-3 w-3 animate-spin" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            Check
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Download className="h-3 w-3" />
            Export
          </button>

          <button
            type="button"
            onClick={() => setShowImport((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Upload className="h-3 w-3" />
            Import
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              aria-label="Close voice settings"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showImport && (
        <div className="mb-3 rounded-2xl border border-white/10 bg-black/20 p-3">
          <FieldLabel label="Import / export JSON" />
          <textarea
            ref={importTextareaRef}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="Paste exported voice settings JSON here..."
            className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-emerald-500/35"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowImport(false);
                setImportText("");
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/25 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25"
            >
              <Save className="h-3 w-3" />
              Import settings
            </button>
          </div>
        </div>
      )}

      <div
        className={cn("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-2")}
      >
        <Section
          icon={<Wand2 className="h-3.5 w-3.5" />}
          title="Presets"
          description="Quickly switch between safe review, fast commands, hands-free, debug, and text-only."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {VOICE_SETTINGS_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSettings(applyVoiceSettingsPreset(preset.id))}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-left transition-colors hover:bg-white/10"
              >
                <div className="text-[11px] font-semibold text-foreground">
                  {preset.label}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </Section>

        <Section
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          title="Readiness"
          description="Checks local VAD assets and browser/model cache status."
        >
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div
                  className={cn(
                    "text-xs font-semibold",
                    cacheBadge.tone === "success"
                      ? "text-emerald-300"
                      : cacheBadge.tone === "danger"
                        ? "text-rose-300"
                        : cacheBadge.tone === "warning"
                          ? "text-amber-300"
                          : "text-muted-foreground",
                  )}
                >
                  {cacheBadge.label}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  Offline readiness score: {cacheBadge.score}%
                </div>
              </div>

              {cacheBadge.tone === "success" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-300" />
              )}
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  cacheBadge.tone === "success"
                    ? "bg-emerald-400"
                    : cacheBadge.tone === "danger"
                      ? "bg-rose-400"
                      : "bg-amber-400",
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, cacheBadge.score))}%`,
                }}
              />
            </div>

            {readiness && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div>
                  Required assets:{" "}
                  <span className="text-foreground">
                    {readiness.summary.requiredAssetsReady}/
                    {readiness.summary.requiredAssetsTotal}
                  </span>
                </div>
                <div>
                  Models:{" "}
                  <span className="text-foreground">
                    {readiness.summary.modelsReady}/
                    {readiness.summary.modelsTotal}
                  </span>
                </div>
              </div>
            )}

            {readiness?.missingRequiredAssets.length ? (
              <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-[10px] text-rose-200">
                Missing:{" "}
                {readiness.missingRequiredAssets
                  .map((asset) => asset.path)
                  .join(", ")}
              </div>
            ) : null}
          </div>
        </Section>

        <Section
          icon={<Mic className="h-3.5 w-3.5" />}
          title="Input and VAD"
          description="Controls how the user starts/stops speaking and how sensitive VAD should be."
        >
          <div className="space-y-3">
            <div>
              <FieldLabel label="Interaction mode" />
              <div className="grid grid-cols-3 gap-1.5">
                {VOICE_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    title={mode.description}
                    onClick={() => commit({ mode: mode.value })}
                    className={settingCardClass(settings.mode === mode.value)}
                  >
                    <div
                      className={settingCardTitleClass(
                        settings.mode === mode.value,
                      )}
                    >
                      {mode.label}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                      {mode.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel
                label="VAD sensitivity"
                value={formatPercent(settings.vadSensitivity)}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.vadSensitivity}
                onChange={(event) =>
                  commit({ vadSensitivity: Number(event.target.value) })
                }
                className="w-full"
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                Positive threshold:{" "}
                <span className="text-foreground">
                  {vadThresholds.positiveSpeechThreshold}
                </span>{" "}
                · Negative threshold:{" "}
                <span className="text-foreground">
                  {vadThresholds.negativeSpeechThreshold}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <FieldLabel
                  label="Minimum speech"
                  value={formatMs(settings.minSpeechMs)}
                />
                <input
                  type="range"
                  min={150}
                  max={3000}
                  step={50}
                  value={settings.minSpeechMs}
                  onChange={(event) =>
                    commit({ minSpeechMs: Number(event.target.value) })
                  }
                  className="w-full"
                />
              </label>

              <label>
                <FieldLabel
                  label="Silence timeout"
                  value={formatMs(settings.silenceTimeoutMs)}
                />
                <input
                  type="range"
                  min={250}
                  max={10000}
                  step={100}
                  value={settings.silenceTimeoutMs}
                  onChange={(event) =>
                    commit({ silenceTimeoutMs: Number(event.target.value) })
                  }
                  className="w-full"
                />
              </label>

              <label>
                <FieldLabel
                  label="Max recording"
                  value={formatMs(settings.maxRecordingMs)}
                />
                <input
                  type="range"
                  min={3000}
                  max={120000}
                  step={1000}
                  value={settings.maxRecordingMs}
                  onChange={(event) =>
                    commit({ maxRecordingMs: Number(event.target.value) })
                  }
                  className="w-full"
                />
              </label>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <FieldLabel label="Microphone device" />
                <button
                  type="button"
                  onClick={requestMicAndRefresh}
                  disabled={devicePermissionPending}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-50"
                >
                  <Headphones className="h-3 w-3" />
                  {devicePermissionPending ? "Requesting..." : "Refresh"}
                </button>
              </div>

              <select
                value={settings.inputDeviceId ?? ""}
                onChange={(event) =>
                  commit({
                    inputDeviceId: event.target.value || null,
                  })
                }
                className="w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-foreground outline-none focus:border-emerald-500/35"
              >
                <option value="">Default microphone</option>
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <ToggleRow
                label="VAD enabled"
                description="Use speech segmentation."
                checked={settings.vadEnabled}
                onChange={(checked) => commit({ vadEnabled: checked })}
              />
              <ToggleRow
                label="Barge-in"
                description="Interrupt TTS by speaking."
                checked={settings.bargeInEnabled}
                onChange={(checked) => commit({ bargeInEnabled: checked })}
              />
              <ToggleRow
                label="VAD frames"
                description="Verbose frame events."
                checked={settings.emitVadFrameEvents}
                onChange={(checked) => commit({ emitVadFrameEvents: checked })}
              />
            </div>
          </div>
        </Section>

        <Section
          icon={<Languages className="h-3.5 w-3.5" />}
          title="Language"
          description="A hint for STT and command routing. Auto is safest for mixed speech."
        >
          <div className="grid grid-cols-5 gap-1.5">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.description}
                onClick={() => commit({ languageHint: option.value })}
                className={settingCardClass(
                  settings.languageHint === option.value,
                )}
              >
                <div
                  className={settingCardTitleClass(
                    settings.languageHint === option.value,
                  )}
                >
                  {option.label}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-2 text-[10px] text-muted-foreground">
            Current:{" "}
            <span className="text-foreground">
              {mapLanguageHintToDisplayLabel(settings.languageHint)}
            </span>
          </div>
        </Section>

        <Section
          icon={<Sparkles className="h-3.5 w-3.5" />}
          title="Speech-to-text"
          description="Local Whisper model and inference runtime."
        >
          <div className="space-y-3">
            <div>
              <FieldLabel label="STT model" />
              <div className="grid gap-1.5 sm:grid-cols-3">
                {enabledSttEngines.map((engine) => {
                  const model = STT_MODELS[engine];
                  const active = settings.sttEngine === engine;

                  return (
                    <button
                      key={engine}
                      type="button"
                      onClick={() => commit({ sttEngine: engine })}
                      className={settingCardClass(active)}
                    >
                      <div className={settingCardTitleClass(active)}>
                        {model.shortLabel}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                        {getModelDisplaySummary(model)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <RuntimeSelector
              label="STT runtime"
              value={settings.sttRuntime}
              onChange={(runtime) => commit({ sttRuntime: runtime })}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="Preload STT"
                description="Load STT model at startup."
                checked={settings.preloadSttModel}
                onChange={(checked) => commit({ preloadSttModel: checked })}
              />
              <ToggleRow
                label="Remote/cache models"
                description="Allow browser/HF cache."
                checked={settings.allowRemoteSttModels}
                onChange={(checked) =>
                  commit({ allowRemoteSttModels: checked })
                }
              />
            </div>

            <label>
              <FieldLabel label="Local STT model path" />
              <input
                type="text"
                value={settings.localSttModelPath ?? ""}
                onChange={(event) =>
                  commit({
                    localSttModelPath: event.target.value.trim() || null,
                  })
                }
                placeholder="/models/stt/"
                className="w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-emerald-500/35"
              />
            </label>
          </div>
        </Section>

        <Section
          icon={<Bot className="h-3.5 w-3.5" />}
          title="Transcript and tools"
          description="Controls what happens after speech is transcribed."
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-[10px] text-muted-foreground">
              Transcript behavior:{" "}
              <span className="text-foreground">{transcriptBehavior}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="Transcript review"
                description="Edit text before routing."
                checked={settings.showTranscript}
                onChange={(checked) =>
                  commit({
                    showTranscript: checked,
                    autoSubmit: checked ? false : settings.autoSubmit,
                  })
                }
              />
              <ToggleRow
                label="Auto-submit"
                description="Route transcript instantly."
                checked={settings.autoSubmit}
                onChange={(checked) =>
                  commit({
                    autoSubmit: checked,
                    showTranscript: checked ? false : settings.showTranscript,
                  })
                }
              />
              <ToggleRow
                label="Save history"
                description="Store local transcript logs."
                checked={settings.saveTranscriptHistory}
                onChange={(checked) =>
                  commit({ saveTranscriptHistory: checked })
                }
              />
              <ToggleRow
                label="Tool preview"
                description="Show intent/tool args."
                checked={settings.showToolPreview}
                onChange={(checked) => commit({ showToolPreview: checked })}
              />
              <ToggleRow
                label="Confirm tools"
                description="Ask before mutating actions."
                checked={settings.requireToolConfirmation}
                onChange={(checked) =>
                  commit({ requireToolConfirmation: checked })
                }
              />
              <ToggleRow
                label="Journey timeline"
                description="Show AG-UI-style steps."
                checked={settings.showJourney}
                onChange={(checked) => commit({ showJourney: checked })}
              />
            </div>
          </div>
        </Section>

        <Section
          icon={<Volume2 className="h-3.5 w-3.5" />}
          title="Voice output"
          description="Local TTS with Kokoro/Piper and playback behavior."
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-[10px] text-muted-foreground">
              Output mode: <span className="text-foreground">{outputMode}</span>
            </div>

            <div>
              <FieldLabel label="TTS engine" />
              <div className="grid gap-1.5 sm:grid-cols-3">
                {enabledTtsEngines.map((engine) => {
                  const model = TTS_MODELS[engine];
                  const active = settings.ttsEngine === engine;

                  return (
                    <button
                      key={engine}
                      type="button"
                      onClick={() =>
                        commit({
                          ttsEngine: engine,
                          speakMode:
                            engine === "off"
                              ? "off"
                              : settings.speakMode === "off"
                                ? "summary"
                                : settings.speakMode,
                          autoPlayTts:
                            engine === "off" ? false : settings.autoPlayTts,
                        })
                      }
                      className={settingCardClass(active)}
                    >
                      <div className={settingCardTitleClass(active)}>
                        {model.shortLabel}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                        {model.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <RuntimeSelector
              label="TTS runtime"
              value={settings.ttsRuntime}
              onChange={(runtime) => commit({ ttsRuntime: runtime })}
            />

            <div>
              <FieldLabel label="Speak mode" />
              <div className="grid grid-cols-3 gap-1.5">
                {SPEAK_MODES.map((mode) => {
                  const active = settings.speakMode === mode.value;

                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() =>
                        commit({
                          speakMode: mode.value,
                          ttsEngine:
                            mode.value === "off"
                              ? "off"
                              : settings.ttsEngine === "off"
                                ? "kokoro"
                                : settings.ttsEngine,
                          autoPlayTts:
                            mode.value === "off" ? false : settings.autoPlayTts,
                        })
                      }
                      className={settingCardClass(active)}
                    >
                      <div className={settingCardTitleClass(active)}>
                        {mode.label}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                        {mode.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <FieldLabel label="Kokoro voice" />
                <select
                  value={settings.ttsVoice}
                  onChange={(event) => commit({ ttsVoice: event.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-foreground outline-none focus:border-emerald-500/35"
                >
                  {KOKORO_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label} · {voice.style}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <FieldLabel
                  label="TTS speed"
                  value={`${settings.ttsSpeed.toFixed(2)}x`}
                />
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={settings.ttsSpeed}
                  onChange={(event) =>
                    commit({ ttsSpeed: Number(event.target.value) })
                  }
                  className="w-full"
                />
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="Auto-play TTS"
                description="Play voice when generated."
                checked={settings.autoPlayTts}
                onChange={(checked) => commit({ autoPlayTts: checked })}
                disabled={settings.ttsEngine === "off"}
              />
              <ToggleRow
                label="Preload TTS"
                description="Load TTS model early."
                checked={settings.preloadTtsModel}
                onChange={(checked) => commit({ preloadTtsModel: checked })}
                disabled={settings.ttsEngine === "off"}
              />
            </div>

            <label>
              <FieldLabel label="Local TTS model path" />
              <input
                type="text"
                value={settings.localTtsModelPath ?? ""}
                onChange={(event) =>
                  commit({
                    localTtsModelPath: event.target.value.trim() || null,
                  })
                }
                placeholder="/models/tts/"
                className="w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-emerald-500/35"
              />
            </label>
          </div>
        </Section>

        <Section
          icon={<Gauge className="h-3.5 w-3.5" />}
          title="Debug"
          description="Controls diagnostics, latency tracking, and verbose event logs."
        >
          <div className="space-y-3">
            <ToggleRow
              label="Debug enabled"
              description="Capture voice pipeline diagnostics."
              checked={settings.debugEnabled}
              onChange={(checked) => commit({ debugEnabled: checked })}
            />

            <div>
              <FieldLabel label="Debug level" />
              <div className="grid grid-cols-4 gap-1.5">
                {DEBUG_LEVELS.map((level) => {
                  const active = settings.debugLevel === level.value;

                  return (
                    <button
                      key={level.value}
                      type="button"
                      title={level.description}
                      onClick={() => commit({ debugLevel: level.value })}
                      className={settingCardClass(active)}
                    >
                      <div className={settingCardTitleClass(active)}>
                        {level.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-[10px] text-muted-foreground">
              Verbose VAD frame events are controlled in the Input and VAD
              section. Use them only while debugging.
            </div>
          </div>
        </Section>
      </div>

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Settings validation
          </div>

          <div className="space-y-1 text-[10px] text-amber-100">
            {validation.errors.map((error) => (
              <div key={error}>Error: {error}</div>
            ))}
            {validation.warnings.map((warning) => (
              <div key={warning}>Warning: {warning}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RuntimeSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: VoiceRuntime;
  onChange: (runtime: VoiceRuntime) => void;
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(VOICE_RUNTIMES) as VoiceRuntime[]).map((runtime) => {
          const active = value === runtime;
          const info = VOICE_RUNTIMES[runtime];

          return (
            <button
              key={runtime}
              type="button"
              title={info.description}
              onClick={() => onChange(runtime)}
              className={settingCardClass(active)}
            >
              <div className={settingCardTitleClass(active)}>{info.label}</div>
              <div className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted-foreground">
                {info.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5",
        disabled && "opacity-50",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-[9px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>

      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-emerald-500"
      />
    </label>
  );
}
