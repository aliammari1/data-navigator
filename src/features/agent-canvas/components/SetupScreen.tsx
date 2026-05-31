"use client";

/**
 * SetupScreen — Agent Canvas onboarding.
 *
 * New DuckDB model:
 * - Data loading is path-based through Electron native file dialogs.
 * - Renderer no longer sends File/ArrayBuffer data into DuckDB.
 * - DuckDB main process registers the selected file as a managed dataset.
 * - `onReady(viewName, fileName)` receives the DuckDB view name.
 */

import {
  AlertTriangle,
  Brain,
  CheckCircle,
  ChevronRight,
  Database,
  FolderOpen,
  Loader2,
  Upload,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { loadLLM } from "@/features/agent-canvas/core/llm";
import { MODEL_CATALOG } from "@/features/agent-canvas/core/types";
import { loadUploadPathToDuckDB } from "@/platform/duckdb/upload-to-duckdb";
import { isElectron, openFileDialog } from "@/platform/electron/electron-fs";
import { cn } from "@/shared/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "dataset";
}

function fileExtensionFromPath(filePath: string): string {
  return fileNameFromPath(filePath).split(".").pop()?.toLowerCase() || "csv";
}

function displayNameFromPath(filePath: string): string {
  return (
    fileNameFromPath(filePath)
      .replace(/\.[^.]+$/, "")
      .replace(/\W/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase() || "dataset"
  );
}

function isSupportedDatasetPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".parquet") ||
    lower.endsWith(".pq")
  );
}

function inferDelimiter(filePath: string): string | undefined {
  const ext = fileExtensionFromPath(filePath);

  if (ext === "tsv") return "\t";

  return undefined;
}

// ─── Animated mesh background ────────────────────────────────────────────────

function MeshBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-slate-950 via-slate-900 to-slate-950" />

      <motion.div
        className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-indigo-600/8 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />

      <motion.div
        className="absolute top-1/2 right-1/3 h-64 w-64 rounded-full bg-cyan-600/5 blur-2xl"
        animate={{ x: [0, 20, 0], y: [0, 20, 0] }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(148,163,184,0.05) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  );
}

// ─── Model picker ─────────────────────────────────────────────────────────────

interface ModelPickerProps {
  selected: string;
  onSelect: (id: string) => void;
  onLoaded: () => void;
  onSkip: () => void;
}

function ModelPicker({
  selected,
  onSelect,
  onLoaded,
  onSkip,
}: Readonly<ModelPickerProps>) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError("");
    setStatus("Preparing model…");
    setProgress(0);

    try {
      const traceId = `setup-model-${selected}-${Date.now()}`;

      console.groupCollapsed("[SetupScreen] load model", { traceId, selected });

      await loadLLM({
        modelId: selected,
        dtype: "q4",
        preferredDevice: "auto",
        traceId,
        debug: true,
        onProgress: (rawProgress, text) => {
          const percent = Math.round(rawProgress * 100);

          console.log("[SetupScreen] load progress", {
            traceId,
            selected,
            rawProgress,
            percent,
            text,
          });

          setProgress(percent);
          setStatus(text);
        },
      });

      console.log("[SetupScreen] model loaded", { traceId, selected });
      console.groupEnd();

      setDone(true);
      setTimeout(onLoaded, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Model load failed");
    } finally {
      setLoading(false);
    }
  }, [selected, onLoaded]);

  const model = MODEL_CATALOG.find((item) => item.id === selected);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {MODEL_CATALOG.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (!loading) {
                setDone(false);
                setError("");
                onSelect(item.id);
              }
            }}
            disabled={loading}
            className={cn(
              "rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
              selected === item.id
                ? "border-violet-500 bg-violet-900/20 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                : "border-slate-700 bg-slate-800/40 hover:border-slate-600",
            )}
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-white">
                {item.label}
              </span>

              {item.badge && (
                <span className="shrink-0 rounded border border-violet-700/40 bg-violet-900/60 px-1.5 py-0.5 text-[9px] text-violet-300">
                  {item.badge}
                </span>
              )}
            </div>

            <p className="text-[10px] leading-relaxed text-slate-400">
              {item.description}
            </p>

            <p className="mt-1 text-[10px] text-slate-600">{item.sizeLabel}</p>
          </button>
        ))}
      </div>

      {loading && (
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-slate-500">
            <span>{status}</span>
            <span>{progress}%</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-violet-500"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          <CheckCircle className="h-4 w-4" />
          Model ready.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading || done}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}
          {loading ? "Loading…" : done ? "Loaded" : "Load Model"}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={loading}
          className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:text-white disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      {model && !loading && !done && (
        <p className="text-center text-[10px] text-slate-600">
          First load downloads ~{model.sizeLabel}; later runs use the local
          browser cache.
        </p>
      )}
    </div>
  );
}

// ─── Data picker ──────────────────────────────────────────────────────────────

interface DataPickerProps {
  onLoaded: (viewName: string, fileName: string) => void;
}

function DataPicker({ onLoaded }: Readonly<DataPickerProps>) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const openDataset = useCallback(async () => {
    if (!isElectron()) {
      setError("Local dataset loading requires the Electron desktop app.");
      return;
    }

    setLoading(true);
    setError("");
    setHint("");
    setProgress("Opening file picker…");

    try {
      const selected = await openFileDialog({
        title: "Select dataset file",
        properties: ["openFile"],
        filters: [
          {
            name: "Data files",
            extensions: ["csv", "tsv", "txt", "parquet", "pq"],
          },
          {
            name: "Delimited files",
            extensions: ["csv", "tsv", "txt"],
          },
          {
            name: "Parquet files",
            extensions: ["parquet", "pq"],
          },
        ],
      });

      const filePath = selected[0];

      if (!filePath) {
        setProgress("");
        return;
      }

      if (!isSupportedDatasetPath(filePath)) {
        throw new Error(
          "Unsupported file type. Use CSV, TSV, TXT, or Parquet.",
        );
      }

      const fileName = fileNameFromPath(filePath);
      const fileExtension = fileExtensionFromPath(filePath);
      const displayName = displayNameFromPath(filePath);

      setProgress("Registering dataset in DuckDB…");

      const loaded = await loadUploadPathToDuckDB(filePath, {
        tableName: `agent_canvas_${Date.now()}`,
        displayName,
        fileExtension,
        hasHeader: true,
        delimiter: inferDelimiter(filePath),
        previewLimit: 100,
      });

      setProgress("Dataset ready.");
      onLoaded(loaded.tableName, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [onLoaded]);

  const onDrop = useCallback(() => {
    setHint(
      "Use the native file picker so DuckDB can access a trusted local filesystem path.",
    );
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv", ".tsv", ".txt"],
      "application/vnd.apache.parquet": [".parquet", ".pq"],
    },
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-8 text-center transition-all",
          isDragActive
            ? "border-violet-500 bg-violet-900/10"
            : "border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/20",
        )}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
                <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">
                  Loading dataset
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{progress}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-2xl border-2 transition-colors",
                  isDragActive
                    ? "border-violet-500 bg-violet-900/20"
                    : "border-slate-700 bg-slate-800",
                )}
              >
                <Database
                  className={cn(
                    "h-6 w-6",
                    isDragActive ? "text-violet-400" : "text-slate-500",
                  )}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-white">
                  Load a local dataset
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  CSV, TSV, TXT, or Parquet · processed locally by DuckDB
                </p>
              </div>

              <button
                type="button"
                onClick={openDataset}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                <FolderOpen className="h-4 w-4" />
                Select dataset file
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hint && (
        <p className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-center text-xs text-blue-300">
          {hint}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Steps indicator ─────────────────────────────────────────────────────────

function StepsIndicator({ currentStep }: Readonly<{ currentStep: 0 | 1 | 2 }>) {
  const steps = [
    { label: "Choose Model", desc: "AI reasoning engine" },
    { label: "Load Data", desc: "Local DuckDB dataset" },
    { label: "Build", desc: "Agent runs pipeline" },
  ];

  return (
    <div className="mb-8 flex items-center justify-center gap-4">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold",
              index < currentStep
                ? "border-emerald-500 bg-emerald-600 text-white"
                : index === currentStep
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-700 bg-slate-800 text-slate-500",
            )}
          >
            {index < currentStep ? "✓" : index + 1}
          </div>

          <div
            className={cn(
              index <= currentStep ? "text-white" : "text-slate-600",
            )}
          >
            <p className="text-[11px] leading-none font-semibold">
              {step.label}
            </p>
            <p className="text-[9px] text-slate-500">{step.desc}</p>
          </div>

          {index < steps.length - 1 && (
            <ChevronRight
              className={cn(
                "h-3 w-3",
                index < currentStep ? "text-emerald-500" : "text-slate-700",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main SetupScreen ─────────────────────────────────────────────────────────

interface Props {
  onReady: (tableName: string, fileName: string) => void;
  model: string;
  onModelChange: (id: string) => void;
}

export function SetupScreen({ onReady, model, onModelChange }: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [modelReady, setModelReady] = useState(false);

  const handleModelReady = useCallback(() => {
    setModelReady(true);
    setStep(1);
  }, []);

  const handleModelSkip = useCallback(() => {
    setStep(1);
  }, []);

  const handleLoaded = useCallback(
    (viewName: string, fileName: string) => {
      setStep(2);
      onReady(viewName, fileName);
    },
    [onReady],
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <MeshBackground />

      <div className="relative z-10 mx-auto w-full max-w-xl px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-600/20">
            <Brain className="h-8 w-8 text-violet-400" />
          </div>

          <h1 className="mb-1 text-2xl font-bold text-white">Agent Canvas</h1>

          <p className="text-sm text-slate-400">
            AI-driven dashboard builder · local models · native DuckDB datasets
          </p>
        </motion.div>

        <StepsIndicator currentStep={step} />

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="model"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-5 backdrop-blur-sm"
            >
              <h2 className="mb-1 text-base font-semibold text-white">
                Choose AI Model
              </h2>

              <p className="mb-4 text-xs text-slate-400">
                Runs locally using WebGPU/WASM. You can also skip and use the
                rule-based pipeline.
              </p>

              <ModelPicker
                selected={model}
                onSelect={onModelChange}
                onLoaded={handleModelReady}
                onSkip={handleModelSkip}
              />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="data"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-5 backdrop-blur-sm">
                <h2 className="mb-1 text-base font-semibold text-white">
                  Load Data
                </h2>

                <p className="mb-4 text-xs text-slate-400">
                  {modelReady ? "Model loaded ✓ — " : "Rule-based mode — "}
                  choose a local file and register it as a DuckDB dataset.
                </p>

                <DataPicker onLoaded={handleLoaded} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
