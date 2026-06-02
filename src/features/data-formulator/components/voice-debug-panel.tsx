"use client";

/**
 * Voice Debug Panel
 *
 * Diagnostics UI for the voice-agent pipeline.
 *
 * Shows:
 * - Current run state
 * - Worker/model status
 * - Audio/VAD state
 * - Latency metrics
 * - AG-UI timeline
 * - Debug logs
 * - Last transcript / tool call / error
 * - Export/reset controls
 *
 * UI-only component. It reads from voice-debug-store.ts.
 */

import {
  Activity,
  AlertTriangle,
  AudioLines,
  Bot,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock,
  Cpu,
  Download,
  Gauge,
  HardDrive,
  Info,
  Layers3,
  Mic,
  RefreshCcw,
  RotateCcw,
  Route,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  Trash2,
  Volume2,
  Wand2,
  XCircle,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { VoiceTimelineItem } from "@/features/data-formulator/core/voice/voice-agui-events";
import {
  clearVoiceDebugLogs,
  clearVoiceDebugRuns,
  exportVoiceDebugJson,
  getVoiceDebugSnapshot,
  resetVoiceDebugStore,
  subscribeVoiceDebugStore,
  type VoiceDebugAudioState,
  type VoiceDebugLogEntry,
  type VoiceDebugMetric,
  type VoiceDebugModelStatus,
  type VoiceDebugSnapshot,
  type VoiceWorkerStatus,
} from "@/features/data-formulator/core/voice/voice-debug-store";
import { cn } from "@/shared/utils";

interface VoiceDebugPanelProps {
  className?: string;
  compact?: boolean;
  maxLogs?: number;
  onClose?: () => void;
}

type DebugTab = "overview" | "timeline" | "logs" | "models" | "raw";

const TABS: Array<{
  id: DebugTab;
  label: string;
  icon: ReactNode;
}> = [
  {
    id: "overview",
    label: "Overview",
    icon: <Activity className="h-3.5 w-3.5" />,
  },
  {
    id: "timeline",
    label: "Timeline",
    icon: <Route className="h-3.5 w-3.5" />,
  },
  {
    id: "logs",
    label: "Logs",
    icon: <TerminalSquare className="h-3.5 w-3.5" />,
  },
  {
    id: "models",
    label: "Models",
    icon: <HardDrive className="h-3.5 w-3.5" />,
  },
  {
    id: "raw",
    label: "Raw",
    icon: <Bug className="h-3.5 w-3.5" />,
  },
];

function formatMs(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatNumber(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

function formatPercent(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const normalized = value > 1 ? value / 100 : value;

  return `${Math.round(Math.min(1, Math.max(0, normalized)) * 100)}%`;
}

function formatTimestamp(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getStatusTone(
  status?: string,
): "success" | "warning" | "danger" | "neutral" {
  if (!status) return "neutral";

  if (
    status === "ready" ||
    status === "completed" ||
    status === "running" ||
    status === "listening"
  ) {
    return "success";
  }

  if (
    status === "loading" ||
    status === "initializing" ||
    status === "started" ||
    status === "transcribing" ||
    status === "routing" ||
    status === "speaking"
  ) {
    return "warning";
  }

  if (status === "error" || status === "failed") {
    return "danger";
  }

  return "neutral";
}

function getToneClasses(
  tone: "success" | "warning" | "danger" | "neutral",
): string {
  if (tone === "success") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  }

  if (tone === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  }

  if (tone === "danger") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  }

  return "border-white/10 bg-white/5 text-muted-foreground";
}

function getLogSeverityClasses(
  severity: VoiceDebugLogEntry["severity"],
): string {
  if (severity === "error") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  }

  if (severity === "warn") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  }

  if (severity === "info") {
    return "border-cyan-500/25 bg-cyan-500/10 text-cyan-300";
  }

  return "border-white/10 bg-white/5 text-muted-foreground";
}

function getTimelineIcon(icon: VoiceTimelineItem["icon"]): ReactNode {
  switch (icon) {
    case "mic":
      return <Mic className="h-3.5 w-3.5" />;
    case "audio":
      return <AudioLines className="h-3.5 w-3.5" />;
    case "text":
      return <Clipboard className="h-3.5 w-3.5" />;
    case "route":
      return <Route className="h-3.5 w-3.5" />;
    case "tool":
      return <Wand2 className="h-3.5 w-3.5" />;
    case "assistant":
      return <Bot className="h-3.5 w-3.5" />;
    case "speaker":
      return <Volume2 className="h-3.5 w-3.5" />;
    case "model":
      return <HardDrive className="h-3.5 w-3.5" />;
    case "error":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "debug":
    default:
      return <Bug className="h-3.5 w-3.5" />;
  }
}

function getTimelineTone(status: VoiceTimelineItem["status"]): string {
  if (status === "done") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "active") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  }

  if (status === "error") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  }

  if (status === "cancelled") {
    return "border-zinc-500/25 bg-zinc-500/10 text-zinc-300";
  }

  return "border-white/10 bg-white/5 text-muted-foreground";
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VoiceDebugPanel({
  className,
  compact = false,
  maxLogs = 120,
  onClose,
}: VoiceDebugPanelProps) {
  const [snapshot, setSnapshot] = useState<VoiceDebugSnapshot>(() =>
    getVoiceDebugSnapshot(),
  );
  const [activeTab, setActiveTab] = useState<DebugTab>("overview");
  const [query, setQuery] = useState("");
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedRaw, setExpandedRaw] = useState(false);

  useEffect(() => {
    return subscribeVoiceDebugStore(setSnapshot);
  }, []);

  const logs = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const entries = snapshot.logs.slice(-maxLogs).reverse();

    if (!trimmedQuery) return entries;

    return entries.filter((entry) => {
      const haystack = [
        entry.kind,
        entry.severity,
        entry.label,
        entry.message,
        entry.runId,
        stringifySafe(entry.data),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(trimmedQuery);
    });
  }, [maxLogs, query, snapshot.logs]);

  const metrics = useMemo(
    () =>
      Object.values(snapshot.metrics).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [snapshot.metrics],
  );

  const workers = useMemo(
    () => Object.values(snapshot.workers),
    [snapshot.workers],
  );

  const models = useMemo(
    () => Object.entries(snapshot.models),
    [snapshot.models],
  );

  const currentTimeline = useMemo(() => {
    if (!snapshot.currentRun?.runId) return [];
    return snapshot.runs[snapshot.currentRun.runId]?.timeline ?? [];
  }, [snapshot.currentRun?.runId, snapshot.runs]);

  const rawSnapshot = useMemo(() => stringifySafe(snapshot), [snapshot]);

  const handleExport = useCallback(() => {
    downloadTextFile(`voice-debug-${Date.now()}.json`, exportVoiceDebugJson());
  }, []);

  const toggleLog = useCallback((id: string) => {
    setExpandedLogIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-background/95 p-3 text-left shadow-2xl backdrop-blur-xl",
        compact && "max-h-[75vh] overflow-y-auto",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Bug className="h-4 w-4 text-emerald-300" />
            Voice debug panel
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <StatusBadge
              label={snapshot.enabled ? "enabled" : "disabled"}
              tone={snapshot.enabled ? "success" : "neutral"}
            />
            <StatusBadge label={snapshot.debugLevel} tone="neutral" />
            <StatusBadge
              label={snapshot.currentRun?.status ?? "no active run"}
              tone={getStatusTone(snapshot.currentRun?.status)}
            />
            <span>Updated {formatTimestamp(snapshot.updatedAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setSnapshot(getVoiceDebugSnapshot())}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <RefreshCcw className="h-3 w-3" />
            Refresh
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
            onClick={() => {
              clearVoiceDebugLogs();
              setExpandedLogIds(new Set());
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
            Logs
          </button>

          <button
            type="button"
            onClick={() => clearVoiceDebugRuns()}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Runs
          </button>

          <button
            type="button"
            onClick={() => resetVoiceDebugStore()}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300 transition-colors hover:bg-rose-500/20"
          >
            <XCircle className="h-3 w-3" />
            Reset
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              aria-label="Close voice debug panel"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors",
              activeTab === tab.id
                ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Section
            icon={<Activity className="h-3.5 w-3.5" />}
            title="Current run"
          >
            <CurrentRunView snapshot={snapshot} />
          </Section>

          <Section icon={<Mic className="h-3.5 w-3.5" />} title="Audio state">
            <AudioStateView audio={snapshot.audio} />
          </Section>

          <Section icon={<Cpu className="h-3.5 w-3.5" />} title="Workers">
            <WorkersView workers={workers} />
          </Section>

          <Section
            icon={<Gauge className="h-3.5 w-3.5" />}
            title="Latency metrics"
          >
            <MetricsView metrics={metrics} />
          </Section>

          <Section
            icon={<Clipboard className="h-3.5 w-3.5" />}
            title="Last transcript"
          >
            <TextBlock
              emptyLabel="No transcript captured yet."
              value={
                snapshot.currentRun?.editedTranscript ??
                snapshot.currentRun?.transcript ??
                snapshot.lastTranscript
              }
            />
          </Section>

          <Section
            icon={<Wand2 className="h-3.5 w-3.5" />}
            title="Last tool call"
          >
            <ToolCallView
              toolCall={
                snapshot.currentRun?.toolCall ?? snapshot.lastToolCall ?? null
              }
            />
          </Section>

          {snapshot.lastError && (
            <div className="lg:col-span-2">
              <Section
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                title="Last error"
              >
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-xs leading-relaxed text-rose-200">
                  {snapshot.lastError}
                </div>
              </Section>
            </div>
          )}
        </div>
      )}

      {activeTab === "timeline" && (
        <Section
          icon={<Route className="h-3.5 w-3.5" />}
          title="Voice timeline"
        >
          <TimelineView timeline={currentTimeline} />
        </Section>
      )}

      {activeTab === "logs" && (
        <Section
          icon={<TerminalSquare className="h-3.5 w-3.5" />}
          title="Debug logs"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search logs..."
                className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-2 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-emerald-500/35"
              />
            </div>

            <StatusBadge label={`${logs.length} logs`} tone="neutral" />
          </div>

          <LogsView
            logs={logs}
            expandedLogIds={expandedLogIds}
            onToggleLog={toggleLog}
          />
        </Section>
      )}

      {activeTab === "models" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Section
            icon={<HardDrive className="h-3.5 w-3.5" />}
            title="Model status"
          >
            <ModelsView models={models} />
          </Section>

          <Section icon={<Layers3 className="h-3.5 w-3.5" />} title="Runs">
            <RunsView snapshot={snapshot} />
          </Section>
        </div>
      )}

      {activeTab === "raw" && (
        <Section icon={<Bug className="h-3.5 w-3.5" />} title="Raw snapshot">
          <button
            type="button"
            onClick={() => setExpandedRaw((value) => !value)}
            className="mb-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            {expandedRaw ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {expandedRaw ? "Collapse" : "Expand"} raw JSON
          </button>

          <pre
            className={cn(
              "overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-[10px] leading-relaxed text-foreground",
              expandedRaw ? "max-h-[70vh]" : "max-h-96",
            )}
          >
            {rawSnapshot}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-emerald-300">
          {icon}
        </div>
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
        getToneClasses(tone),
      )}
    >
      {label}
    </span>
  );
}

function CurrentRunView({ snapshot }: { snapshot: VoiceDebugSnapshot }) {
  const run = snapshot.currentRun;

  if (!run) {
    return (
      <EmptyState
        icon={<Activity className="h-4 w-4" />}
        label="No active voice run"
        description="Start a voice command to see live run diagnostics."
      />
    );
  }

  return (
    <div className="space-y-2">
      <KeyValue label="Run ID" value={run.runId} mono />
      <KeyValue
        label="Status"
        value={
          <StatusBadge label={run.status} tone={getStatusTone(run.status)} />
        }
      />
      <KeyValue label="Started" value={formatTimestamp(run.startedAt)} />
      <KeyValue label="Updated" value={formatTimestamp(run.updatedAt)} />
      {run.completedAt && (
        <KeyValue label="Completed" value={formatTimestamp(run.completedAt)} />
      )}
      {run.command && (
        <>
          <KeyValue label="Intent" value={run.command.intent} />
          <KeyValue
            label="Confidence"
            value={formatPercent(run.command.confidence)}
          />
        </>
      )}
      {run.error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-[11px] leading-relaxed text-rose-200">
          {run.error}
        </div>
      )}
    </div>
  );
}

function AudioStateView({ audio }: { audio: VoiceDebugAudioState }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniMetric
          label="Listening"
          value={audio.isListening ? "yes" : "no"}
          tone={audio.isListening ? "success" : "neutral"}
        />
        <MiniMetric
          label="Speaking"
          value={audio.isSpeaking ? "yes" : "no"}
          tone={audio.isSpeaking ? "success" : "neutral"}
        />
        <MiniMetric
          label="VAD"
          value={audio.vadActive ? "active" : "idle"}
          tone={audio.vadActive ? "success" : "neutral"}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Audio level</span>
          <span>{formatPercent(audio.audioLevel)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all"
            style={{
              width: `${Math.min(100, Math.max(0, audio.audioLevel * 100))}%`,
            }}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <KeyValue
          label="Device"
          value={audio.inputDeviceLabel ?? audio.inputDeviceId ?? "default"}
        />
        <KeyValue
          label="Sample rate"
          value={audio.sampleRate ? `${audio.sampleRate}Hz` : "—"}
        />
        <KeyValue
          label="Speech duration"
          value={formatMs(audio.speechDurationMs)}
        />
        <KeyValue
          label="Silence duration"
          value={formatMs(audio.silenceDurationMs)}
        />
        <KeyValue
          label="Last audio"
          value={formatMs(audio.lastAudioDurationMs)}
        />
        <KeyValue
          label="RMS / Peak"
          value={`${formatNumber(audio.lastRms)} / ${formatNumber(audio.lastPeak)}`}
        />
      </div>
    </div>
  );
}

function WorkersView({ workers }: { workers: VoiceWorkerStatus[] }) {
  if (workers.length === 0) {
    return (
      <EmptyState
        icon={<Cpu className="h-4 w-4" />}
        label="No workers"
        description="Worker statuses will appear after voice initializes."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {workers.map((worker) => (
        <div
          key={worker.name}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <WorkerIcon name={worker.name} />
              <div>
                <div className="text-xs font-semibold text-foreground">
                  {worker.name.toUpperCase()}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {worker.detail ?? "No detail"}
                </div>
              </div>
            </div>

            <StatusBadge
              label={worker.status}
              tone={getStatusTone(worker.status)}
            />
          </div>

          {(worker.model ||
            typeof worker.progress === "number" ||
            worker.error) && (
            <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
              {worker.model && <div>Model: {worker.model}</div>}
              {typeof worker.progress === "number" && (
                <div>
                  Progress:{" "}
                  <span className="text-foreground">
                    {Math.round(worker.progress)}%
                  </span>
                </div>
              )}
              {worker.error && (
                <div className="text-rose-300">Error: {worker.error}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WorkerIcon({ name }: { name: VoiceWorkerStatus["name"] }) {
  if (name === "vad") return <Mic className="h-3.5 w-3.5 text-emerald-300" />;
  if (name === "stt")
    return <Clipboard className="h-3.5 w-3.5 text-cyan-300" />;
  if (name === "router")
    return <Route className="h-3.5 w-3.5 text-violet-300" />;
  return <Volume2 className="h-3.5 w-3.5 text-amber-300" />;
}

function MetricsView({ metrics }: { metrics: VoiceDebugMetric[] }) {
  if (metrics.length === 0) {
    return (
      <EmptyState
        icon={<Gauge className="h-4 w-4" />}
        label="No metrics yet"
        description="Latency and counters appear after a voice run."
      />
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {metrics.map((metric) => (
        <MiniMetric
          key={metric.key}
          label={metric.label}
          value={`${formatNumber(metric.value)}${metric.unit === "ms" ? "ms" : metric.unit === "percent" ? "%" : ""}`}
          tone="neutral"
        />
      ))}
    </div>
  );
}

function TimelineView({ timeline }: { timeline: VoiceTimelineItem[] }) {
  if (timeline.length === 0) {
    return (
      <EmptyState
        icon={<Route className="h-4 w-4" />}
        label="No timeline yet"
        description="AG-UI-style events will appear here during a voice run."
      />
    );
  }

  return (
    <div className="space-y-2">
      {timeline.map((item, index) => (
        <div key={item.id} className="flex gap-2">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl border",
                getTimelineTone(item.status),
              )}
            >
              {getTimelineIcon(item.icon)}
            </div>
            {index < timeline.length - 1 && (
              <div className="my-1 h-full min-h-4 w-px bg-white/10" />
            )}
          </div>

          <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  {item.label}
                </div>
                {item.detail && (
                  <div className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-muted-foreground">
                    {item.detail}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge
                  label={item.status}
                  tone={
                    item.status === "done"
                      ? "success"
                      : item.status === "active"
                        ? "warning"
                        : item.status === "error"
                          ? "danger"
                          : "neutral"
                  }
                />
                <span className="text-[9px] text-muted-foreground">
                  {formatTimestamp(item.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsView({
  logs,
  expandedLogIds,
  onToggleLog,
}: {
  logs: VoiceDebugLogEntry[];
  expandedLogIds: Set<string>;
  onToggleLog: (id: string) => void;
}) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<TerminalSquare className="h-4 w-4" />}
        label="No logs"
        description="No debug logs match your current filter."
      />
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const expanded = expandedLogIds.has(log.id);
        const hasData = typeof log.data !== "undefined";

        return (
          <div
            key={log.id}
            className="rounded-xl border border-white/10 bg-white/[0.03]"
          >
            <button
              type="button"
              onClick={() => onToggleLog(log.id)}
              className="flex w-full items-start gap-2 p-2 text-left"
            >
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                  getLogSeverityClasses(log.severity),
                )}
              >
                {log.severity === "error" ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : log.severity === "warn" ? (
                  <ShieldAlert className="h-3.5 w-3.5" />
                ) : log.severity === "info" ? (
                  <Info className="h-3.5 w-3.5" />
                ) : (
                  <Bug className="h-3.5 w-3.5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    {log.label}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px]",
                      getLogSeverityClasses(log.severity),
                    )}
                  >
                    {log.severity}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-muted-foreground">
                    {log.kind}
                  </span>
                </div>

                {log.message && (
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                    {log.message}
                  </div>
                )}

                <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-muted-foreground">
                  <span>{formatTimestamp(log.timestamp)}</span>
                  {log.runId && <span>run: {log.runId}</span>}
                </div>
              </div>

              {hasData && (
                <div className="mt-1 shrink-0 text-muted-foreground">
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </div>
              )}
            </button>

            {expanded && hasData && (
              <div className="border-t border-white/10 p-2">
                <pre className="max-h-80 overflow-auto rounded-lg bg-black/30 p-2 text-[10px] leading-relaxed text-foreground">
                  {stringifySafe(log.data)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModelsView({
  models,
}: {
  models: Array<[string, VoiceDebugModelStatus]>;
}) {
  if (models.length === 0) {
    return (
      <EmptyState
        icon={<HardDrive className="h-4 w-4" />}
        label="No model status"
        description="Model readiness appears after STT/TTS/VAD initialization."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {models.map(([key, model]) => (
        <div
          key={key}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-emerald-300" />
                <div className="truncate text-xs font-semibold text-foreground">
                  {model.label}
                </div>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {model.kind} · {model.engine ?? "engine"} ·{" "}
                {model.runtime ?? "runtime"}
              </div>
            </div>

            <StatusBadge
              label={
                model.error
                  ? "error"
                  : model.ready
                    ? "ready"
                    : model.loading
                      ? "loading"
                      : model.cached
                        ? "cached"
                        : "unknown"
              }
              tone={
                model.error
                  ? "danger"
                  : model.ready
                    ? "success"
                    : model.loading
                      ? "warning"
                      : "neutral"
              }
            />
          </div>

          <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
            {model.modelId && <div>Model ID: {model.modelId}</div>}
            {typeof model.progress === "number" && (
              <div>
                Progress:{" "}
                <span className="text-foreground">
                  {Math.round(model.progress)}%
                </span>
              </div>
            )}
            {model.error && <div className="text-rose-300">{model.error}</div>}
            <div>Updated: {formatTimestamp(model.updatedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunsView({ snapshot }: { snapshot: VoiceDebugSnapshot }) {
  const runs = snapshot.runOrder
    .slice()
    .reverse()
    .map((runId) => snapshot.runs[runId])
    .filter(Boolean);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={<Layers3 className="h-4 w-4" />}
        label="No stored runs"
        description="Completed voice runs will appear here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div
          key={run.runId}
          className={cn(
            "rounded-xl border p-2",
            run.runId === snapshot.currentRun?.runId
              ? "border-emerald-500/25 bg-emerald-500/10"
              : "border-white/10 bg-white/[0.03]",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">
                {run.runId}
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {formatTimestamp(run.startedAt)} · {run.events.length} events ·{" "}
                {run.timeline.length} steps
              </div>
            </div>

            <StatusBadge label={run.status} tone={getStatusTone(run.status)} />
          </div>

          {(run.transcript || run.editedTranscript) && (
            <div className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
              “{run.editedTranscript ?? run.transcript}”
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ToolCallView({
  toolCall,
}: {
  toolCall: VoiceDebugSnapshot["lastToolCall"] | null;
}) {
  if (!toolCall) {
    return (
      <EmptyState
        icon={<Wand2 className="h-4 w-4" />}
        label="No tool call yet"
        description="Route a voice command to see tool details."
      />
    );
  }

  return (
    <div className="space-y-2">
      <KeyValue label="Tool" value={toolCall.toolName} />
      <KeyValue label="Display" value={toolCall.displayName} />
      <KeyValue
        label="Safety"
        value={
          <StatusBadge
            label={toolCall.requiresConfirmation ? "confirm" : "read-only"}
            tone={toolCall.requiresConfirmation ? "warning" : "success"}
          />
        }
      />
      <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/30 p-2 text-[10px] leading-relaxed text-foreground">
        {stringifySafe(toolCall.args)}
      </pre>
    </div>
  );
}

function TextBlock({
  value,
  emptyLabel,
}: {
  value?: string;
  emptyLabel: string;
}) {
  if (!value) {
    return (
      <EmptyState icon={<Clipboard className="h-4 w-4" />} label={emptyLabel} />
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs leading-relaxed text-foreground">
      “{value}”
    </div>
  );
}

function KeyValue({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "max-w-[70%] break-words text-right text-[11px] text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <div className={cn("rounded-xl border p-2", getToneClasses(tone))}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({
  icon,
  label,
  description,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground">
        {icon}
      </div>
      <div className="mt-2 text-xs font-semibold text-foreground">{label}</div>
      {description && (
        <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
          {description}
        </div>
      )}
    </div>
  );
}
