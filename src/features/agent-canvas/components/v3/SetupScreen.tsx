"use client";
/**
 * SetupScreen — hero with animated mesh bg, model picker with progress bar,
 * large drop zone, demo pills (Telecom/Sales/HR/Ecommerce).
 * No upload needed — demo pills generate inline JSON → DuckDB in 200ms.
 */

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Upload, Zap, ChevronRight, CheckCircle } from "lucide-react";
import { cn } from "@/shared/utils";
import { MODEL_CATALOG } from "@/features/agent-canvas/core/types";
import { loadLLM } from "@/features/agent-canvas/core/llm";
import {
  loadDelimitedCSVFromFile,
  loadJSONFileToDuckDB,
  loadJSONToDuckDB,
} from "@/platform/duckdb/duckdb";
import {
  generateDataset,
  DEMO_PILLS,
} from "@/features/agent-canvas/core/demo-data";
import type { DemoDataset } from "@/features/agent-canvas/core/demo-data";

// ─── Animated mesh background ────────────────────────────────────────────────

function MeshBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      {/* Animated gradient orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-indigo-600/8 blur-3xl"
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />
      <motion.div
        className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full bg-cyan-600/5 blur-2xl"
        animate={{ x: [0, 20, 0], y: [0, 20, 0] }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
      />
      {/* Dot grid */}
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
}: ModelPickerProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    try {
      await loadLLM(selected, (p, t) => {
        setProgress(Math.round(p * 100));
        setStatus(t);
      });
      setDone(true);
      setTimeout(onLoaded, 500);
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [selected, onLoaded]);

  const model = MODEL_CATALOG.find((m) => m.id === selected);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {MODEL_CATALOG.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={cn(
              "p-3 rounded-xl border text-left transition-all",
              selected === m.id
                ? "border-violet-500 bg-violet-900/20 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                : "border-slate-700 bg-slate-800/40 hover:border-slate-600",
            )}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-white">
                {m.label}
              </span>
              {m.badge && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-900/60 text-violet-300 border border-violet-700/40 shrink-0">
                  {m.badge}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {m.description}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">{m.sizeLabel}</p>
          </button>
        ))}
      </div>

      {loading && (
        <div>
          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span>{status}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-violet-500 rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {done && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          Model ready!
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleLoad}
          disabled={loading || done}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Brain className="w-4 h-4" />
          )}
          {loading ? "Loading…" : "Load Model"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
        >
          Skip
        </button>
      </div>

      {model && !loading && !done && (
        <p className="text-[10px] text-slate-600 text-center">
          Will download ~{model.sizeLabel} the first time (cached in browser)
        </p>
      )}
    </div>
  );
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

interface DropZoneProps {
  onLoaded: (tableName: string, fileName: string) => void;
}

function DropZone({ onLoaded }: DropZoneProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setLoading(true);
      setError("");
      setProgress("Reading file…");

      try {
        const tableName = `data_${Date.now()}`;
        const name = file.name.toLowerCase();
        const ext = name.split(".").pop() ?? "";

        if (ext === "csv" || ext === "tsv" || ext === "txt") {
          setProgress("Loading into DuckDB…");
          await loadDelimitedCSVFromFile(
            tableName,
            file,
            ext === "tsv" ? "\t" : ",",
          );
        } else if (ext === "json" || ext === "ndjson") {
          setProgress("Loading JSON into DuckDB…");
          await loadJSONFileToDuckDB(tableName, file);
        } else {
          throw new Error(`Unsupported file type: .${ext}`);
        }

        onLoaded(tableName, file.name);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
        setProgress("");
      }
    },
    [onLoaded],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "application/json": [".json", ".ndjson"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
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
              className="flex flex-col items-center gap-2"
            >
              <div className="w-8 h-8 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
              <p className="text-sm text-slate-400">{progress}</p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-2"
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-2xl border-2 flex items-center justify-center transition-colors",
                  isDragActive
                    ? "border-violet-500 bg-violet-900/20"
                    : "border-slate-700 bg-slate-800",
                )}
              >
                <Upload
                  className={cn(
                    "w-5 h-5",
                    isDragActive ? "text-violet-400" : "text-slate-500",
                  )}
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {isDragActive ? "Drop to load" : "Drop your data file"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  CSV, TSV, JSON, NDJSON — up to 100MB
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}

// ─── Demo pills ───────────────────────────────────────────────────────────────

interface DemoPillsProps {
  onLoaded: (tableName: string, datasetName: string) => void;
}

function DemoPills({ onLoaded }: DemoPillsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handlePill = async (id: DemoDataset, label: string) => {
    setLoading(id);
    try {
      const data = generateDataset(id);
      const tableName = `demo_${id}_${Date.now()}`;
      await loadJSONToDuckDB(tableName, data);
      onLoaded(tableName, `${label}.json`);
    } catch {
      /* ignore */
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {DEMO_PILLS.map((pill) => (
        <button
          key={pill.id}
          type="button"
          onClick={() => handlePill(pill.id, pill.label)}
          disabled={!!loading}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-white",
            "bg-linear-to-r border border-white/10 transition-all hover:scale-105 active:scale-95",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            `bg-linear-to-r ${pill.color}`,
          )}
        >
          {loading === pill.id ? (
            <div className="w-2.5 h-2.5 rounded-full border border-white/40 border-t-white animate-spin" />
          ) : (
            <Zap className="w-2.5 h-2.5" />
          )}
          {pill.label}
        </button>
      ))}
    </div>
  );
}

// ─── Steps indicator ─────────────────────────────────────────────────────────

function StepsIndicator({ currentStep }: { currentStep: 0 | 1 | 2 }) {
  const steps = [
    { label: "Choose Model", desc: "AI reasoning engine" },
    { label: "Load Data", desc: "CSV, JSON or demo" },
    { label: "Build", desc: "Agent runs pipeline" },
  ];

  return (
    <div className="flex items-center gap-4 justify-center mb-8">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border",
              i < currentStep
                ? "bg-emerald-600 border-emerald-500 text-white"
                : i === currentStep
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-500",
            )}
          >
            {i < currentStep ? "✓" : i + 1}
          </div>
          <div
            className={cn(i <= currentStep ? "text-white" : "text-slate-600")}
          >
            <p className="text-[11px] font-semibold leading-none">
              {step.label}
            </p>
            <p className="text-[9px] text-slate-500">{step.desc}</p>
          </div>
          {i < steps.length - 1 && (
            <ChevronRight
              className={cn(
                "w-3 h-3",
                i < currentStep ? "text-emerald-500" : "text-slate-700",
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

  const handleModelReady = () => {
    setModelReady(true);
    setStep(1);
  };
  const handleModelSkip = () => {
    setStep(1);
  };
  const handleLoaded = (tableName: string, fileName: string) => {
    setStep(2);
    onReady(tableName, fileName);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <MeshBackground />

      <div className="relative z-10 w-full max-w-xl mx-auto px-6 py-8">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-8 h-8 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Agent Canvas</h1>
          <p className="text-sm text-slate-400">
            AI-driven agentic dashboard builder · LangGraph · AG-UI · DuckDB
            WASM
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
              className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm"
            >
              <h2 className="text-base font-semibold text-white mb-1">
                Choose AI Model
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Runs 100% in your browser — WebGPU/WASM, no API key.
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
              <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-5 backdrop-blur-sm">
                <h2 className="text-base font-semibold text-white mb-1">
                  Load Data
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  {modelReady ? "Model loaded ✓ — " : "Rule-based mode — "}
                  Drop any CSV, TSV, JSON or NDJSON file, or use a demo dataset.
                </p>
                <DropZone onLoaded={handleLoaded} />
              </div>

              <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 backdrop-blur-sm">
                <p className="text-xs text-slate-500 text-center mb-3">
                  Or try a demo dataset
                </p>
                <DemoPills onLoaded={handleLoaded} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
