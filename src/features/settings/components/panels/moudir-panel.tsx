"use client";

/**
 * Settings → Moudir panel.
 *
 * Two settings live here:
 *   - systemPrompt: the prompt fed into every new chat session as the
 *     LlamaChatSession's system context. Overrides the built-in default.
 *   - enableMemory: when true, the renderer asks the chat store to fold
 *     semantic-search hits into the conversation context (future work;
 *     the toggle is wired and persisted now so the contract is stable).
 *
 * Persistence: settings-store (Electron, SQLite settings.db) via the
 * `electronSettings` IPC bridge. Reads on mount, debounced writes on every
 * edit (250ms). The `systemPrompt` field is intentionally large enough for
 * a real persona description but capped at 4 KiB to keep the IPC payload
 * sane.
 */

import { Bot, Code2, Download, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cancelPyodideDownload,
  downloadPyodide,
  getPyodideStatus,
  onPyodideDownloadProgress,
  type PyodideStatus,
} from "@/platform/pyodide/pyodide-client";
import {
  getAppSettingRemote,
  putAppSettingRemote,
} from "@/platform/settings/settings-client";
import { useSettingsStore } from "@/core/stores/settings-store";
import { cn } from "@/shared/utils";
import { Section, Toggle } from "../controls";

const NS = "moudir";
const SYSTEM_PROMPT_KEY = "systemPrompt";
const ENABLE_MEMORY_KEY = "enableMemory";
const DEBOUNCE_MS = 250;
/** 4 KiB caps any one prompt payload — the chat session IPC is happy with
 * multi-KB system contexts but anything bigger is almost certainly paste spam. */
const MAX_PROMPT_CHARS = 4_096;

const DEFAULT_PROMPT =
  "Tu es Moudir, un analyste de données francophone. Tu aides l'utilisateur à explorer, profiler et visualiser ses données tabulaires. Sois concis, factuel, et propose toujours des visualisations pertinentes quand c'est utile.";

interface MoudirPanelProps {
  /** When the parent passes the store getters/setters, the panel participates
   * in the global "Reset defaults" header button. Otherwise it falls back to
   * its own local reset. */
  enableMemory?: boolean;
  setEnableMemory?: (value: boolean) => void;
  enableSandbox?: boolean;
  setEnableSandbox?: (value: boolean) => void;
}

export function MoudirPanel(props: MoudirPanelProps = {}) {
  const storeEnableMemory = useSettingsStore((s) => s.enableMoudirMemory);
  const storeSetEnableMemory = useSettingsStore((s) => s.setEnableMoudirMemory);
  const storeEnableSandbox = useSettingsStore((s) => s.enableMoudirSandbox);
  const storeSetEnableSandbox = useSettingsStore((s) => s.setEnableMoudirSandbox);

  const enableMemory = props.enableMemory ?? storeEnableMemory;
  const setEnableMemory = props.setEnableMemory ?? storeSetEnableMemory;
  const enableSandbox = props.enableSandbox ?? storeEnableSandbox;
  const setEnableSandbox = props.setEnableSandbox ?? storeSetEnableSandbox;

  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [draft, setDraft] = useState<string>(DEFAULT_PROMPT);
  const [hydrated, setHydrated] = useState(false);
  const [count, setCount] = useState(Math.min(DEFAULT_PROMPT.length, MAX_PROMPT_CHARS));
  const promptId = useId();
  const writeTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [promptSetting, memorySetting] = await Promise.all([
        getAppSettingRemote<string>(NS, SYSTEM_PROMPT_KEY),
        getAppSettingRemote<boolean>(NS, ENABLE_MEMORY_KEY),
      ]);
      if (!alive) return;
      const nextPrompt = typeof promptSetting.value === "string" ? promptSetting.value : DEFAULT_PROMPT;
      const nextMemory = typeof memorySetting.value === "boolean" ? memorySetting.value : false;
      setPrompt(nextPrompt);
      setDraft(nextPrompt);
      setCount(Math.min(nextPrompt.length, MAX_PROMPT_CHARS));
      setEnableMemory(nextMemory);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [setEnableMemory]);

  useEffect(() => {
    if (!hydrated) return;
    if (draft === prompt) return;
    if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      void putAppSettingRemote(NS, SYSTEM_PROMPT_KEY, draft).then(() => {
        setPrompt(draft);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (writeTimer.current !== null) window.clearTimeout(writeTimer.current);
    };
  }, [draft, prompt, hydrated]);

  const reset = () => {
    setDraft(DEFAULT_PROMPT);
    setPrompt(DEFAULT_PROMPT);
    setCount(DEFAULT_PROMPT.length);
    void putAppSettingRemote(NS, SYSTEM_PROMPT_KEY, DEFAULT_PROMPT).then(() => {
      toast.success("Prompt Moudir réinitialisé");
    });
  };

  const handleChange = (value: string) => {
    const clamped = value.slice(0, MAX_PROMPT_CHARS);
    setDraft(clamped);
    setCount(clamped.length);
  };

  const handleMemoryChange = (next: boolean) => {
    setEnableMemory(next);
    void putAppSettingRemote(NS, ENABLE_MEMORY_KEY, next).then(() => {
      toast.success(next ? "Mémoire Moudir activée" : "Mémoire Moudir désactivée");
    });
  };

  const handleSandboxChange = (next: boolean) => {
    setEnableSandbox(next);
    void putAppSettingRemote(NS, "enableSandbox", next).then(() => {
      toast.success(next ? "Sandbox Moudir activé" : "Sandbox Moudir désactivé");
    });
  };

  return (
    <>
      <Section title="Personnalité" icon={Bot}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <label htmlFor={promptId} className="text-sm text-foreground block">
                Prompt système
              </label>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Envoyé en tête de chaque nouvelle conversation. Décrit le rôle, le ton et les
                contraintes de Moudir.
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Réinitialiser le prompt par défaut"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Défaut
            </button>
          </div>
          <textarea
            id={promptId}
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            rows={6}
            spellCheck={false}
            aria-label="Prompt système Moudir"
            className={cn(
              "w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground",
              "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
              "font-mono leading-relaxed",
            )}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {count.toLocaleString("fr-FR")} / {MAX_PROMPT_CHARS.toLocaleString("fr-FR")} caractères
            </span>
            {draft !== prompt ? (
              <span className="text-amber-500">Sauvegarde…</span>
            ) : (
              <span className="text-emerald-500">Sauvegardé</span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Mémoire & recherche" icon={Sparkles}>
        <Toggle
          checked={enableMemory}
          onChange={handleMemoryChange}
          label="Activer la mémoire sémantique"
          description="Moudir retrouve les conversations et tours passés pertinents via cosine sur embeddings (vecteurs 384-dim, all-MiniLM-L6-v2)."
        />
        <p className="text-[11px] text-muted-foreground">
          L'index sémantique est reconstruit à la volée — utilisez le bouton « Réindexer » de
          l'onglet Stockage pour forcer une passe complète sur l'historique.
        </p>
      </Section>

      <Section title="Sandbox de code" icon={Code2}>
        <Toggle
          checked={enableSandbox}
          onChange={handleSandboxChange}
          label="Activer l'exécution de code inline"
          description="Moudir peut émettre des blocs ```js-run / ```python-run exécutables dans la conversation. Le JavaScript tourne dans un iframe sandboxed (sandbox=allow-scripts, opaque origin) — 100% offline, zéro dépendance réseau."
        />
        <p className="text-[11px] text-muted-foreground">
          Python (```python-run) s'appuie sur Pyodide — opt-in, téléchargeable à la demande
          depuis cet écran (~10 Mo, premier téléchargement). Sans Pyodide, les blocs Python
          sont affichés en lecture seule.
        </p>
        <PyodideDownloadCard />
      </Section>
    </>
  );
}

function PyodideDownloadCard() {
  const [status, setStatus] = useState<PyodideStatus | null>(null);
  const [phase, setPhase] = useState<"loading" | "idle" | "downloading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ file: string; received: number; total: number } | null>(null);
  const [uninstalling, setUninstalling] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPyodideStatus().then((s) => {
      if (!alive || !s) {
        setPhase("idle");
        return;
      }
      setStatus(s);
      setPhase(s.ready ? "ready" : s.downloading ? "downloading" : "idle");
    });
    const unsubscribe = onPyodideDownloadProgress((p) => setProgress(p));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const onDownload = async () => {
    setPhase("downloading");
    setError(null);
    setProgress(null);
    try {
      const next = await downloadPyodide();
      if (next?.ready) {
        setStatus(next);
        setPhase("ready");
        toast.success("Pyodide installé — Python sandbox prêt.");
      } else {
        setPhase("error");
        setError("Téléchargement incomplet — fichiers manquants.");
      }
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCancel = () => {
    void cancelPyodideDownload();
    setPhase("idle");
    setProgress(null);
  };

  const onUninstall = async () => {
    if (!status) return;
    setUninstalling(true);
    try {
      setError(
        "Pour supprimer Pyodide, fermez l'app et effacez le dossier <userData>/pyodide.",
      );
    } finally {
      setUninstalling(false);
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Pyodide runtime
        </span>
        <span className="text-[10px] text-amber-700 dark:text-amber-300">
          {phase === "ready"
            ? `Prêt · v${status?.version ?? "0.26.2"}`
            : phase === "downloading"
              ? pct !== null
                ? `Téléchargement ${pct}%`
                : "Téléchargement…"
              : phase === "loading"
                ? "Vérification…"
                : phase === "error"
                  ? "Erreur"
                  : "Non installé"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {phase === "loading" ? (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            Vérification de l'installation…
          </span>
        ) : phase === "ready" ? (
          <>
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Le runtime Python (CPython 3.12 + stdlib) est installé localement. Les
              blocs ```python-run exécutent dans un iframe sandboxed.
            </span>
            <button
              type="button"
              onClick={onUninstall}
              disabled={uninstalling}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-1 text-[10px] text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
            >
              <Trash2 className="h-3 w-3" />
              Désinstaller
            </button>
          </>
        ) : phase === "downloading" ? (
          <div className="flex flex-1 items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-amber-500/20"
              role="progressbar"
              aria-valuenow={pct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${pct ?? 0}%` }}
              />
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              Annuler
            </button>
          </div>
        ) : phase === "error" ? (
          <div className="flex flex-1 items-center gap-2">
            <span className="text-[11px] text-amber-700 dark:text-amber-300">{error}</span>
            <button
              type="button"
              onClick={onDownload}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2 py-1 text-[10px] text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
          >
            <Download className="h-3 w-3" />
            Télécharger Pyodide (~10 Mo)
          </button>
        )}
      </div>
      {progress && phase === "downloading" ? (
        <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
          {progress.file} — {(progress.received / 1048576).toFixed(1)} Mo
          {progress.total > 0
            ? ` / ${(progress.total / 1048576).toFixed(1)} Mo`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
