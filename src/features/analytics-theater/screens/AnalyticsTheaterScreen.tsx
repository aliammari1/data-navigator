"use client";

import { Download, FileText, Loader2, Save, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAI } from "@/platform/ai/provider";
import { warmExportWorker } from "@/platform/viz";
import { SceneEmptyState } from "../components/scene-states";
import { TheaterPresenter } from "../components/TheaterPresenter";
import { narrateScenes } from "../lib/narrate";
import { exportTheater } from "../lib/scene-export";
import { useActiveDataset } from "../lib/use-active-dataset";
import { defaultTheater, SCENE_DEFINITIONS, type Theater } from "../model/scene";
import { listTheaters, saveTheater } from "../model/theater-db";
import { SCENE_COMPONENTS } from "../scenes/registry";

type ViewMode = "explore" | "present";

export function AnalyticsTheaterScreen() {
  const { datasetId, name, view, rowCount, roles, ready } = useActiveDataset();
  const ai = useAI();

  const [theater, setTheater] = useState<Theater | null>(null);
  const [mode, setMode] = useState<ViewMode>("explore");
  const [activeScene, setActiveScene] = useState(SCENE_DEFINITIONS[0].kind);
  const [busy, setBusy] = useState<null | "narrate" | "save" | "pptx" | "pdf">(null);
  const [status, setStatus] = useState<string | null>(null);

  // Warm the export worker once so the first export does not pay a cold-start.
  useEffect(() => {
    warmExportWorker();
  }, []);

  // Build / restore the authored theater whenever the active dataset changes.
  useEffect(() => {
    let cancelled = false;
    if (!datasetId) {
      setTheater(null);
      return;
    }
    void (async () => {
      const saved = await listTheaters(datasetId);
      if (cancelled) return;
      setTheater(saved[0] ?? defaultTheater(datasetId, name ?? "Untitled dataset"));
    })();
    return () => {
      cancelled = true;
    };
  }, [datasetId, name]);

  const scenes = theater?.scenes ?? [];

  const currentScene = useMemo(
    () => scenes.find((s) => s.kind === activeScene) ?? scenes[0],
    [scenes, activeScene],
  );

  async function handleNarrate() {
    if (!theater) return;
    setBusy("narrate");
    setStatus("Generating narration with the local model…");
    try {
      const map = await narrateScenes(
        {
          datasetName: name ?? "dataset",
          rowCount,
          dateColumn: roles.date?.name ?? null,
          measureColumn: roles.measure?.name ?? null,
          categoryColumn: roles.category?.name ?? null,
          textColumn: roles.text?.name ?? null,
          sceneKinds: theater.scenes.map((s) => s.kind),
        },
        { generateStructured: ai.generateStructured },
      );
      setTheater((prev) =>
        prev
          ? {
              ...prev,
              scenes: prev.scenes.map((s) => (map[s.kind] ? { ...s, narration: map[s.kind] } : s)),
              updatedAt: Date.now(),
            }
          : prev,
      );
      setStatus("Narration updated.");
    } catch (err) {
      setStatus(
        `Narration unavailable (${err instanceof Error ? err.message : "no model"}). Keeping defaults.`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!theater) return;
    setBusy("save");
    try {
      await saveTheater(theater);
      setStatus("Theater saved offline.");
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleExport(kind: "pptx" | "pdf") {
    if (!theater || !view) return;
    setBusy(kind);
    setStatus(`Building ${kind.toUpperCase()} offline…`);
    try {
      const res = await exportTheater({
        name: theater.name,
        scenes: theater.scenes,
        view,
        roles,
        kind,
      });
      setStatus(
        res.saved
          ? `Exported ${kind.toUpperCase()}${res.path ? ` → ${res.path}` : ""}.`
          : "Export cancelled.",
      );
    } catch (err) {
      setStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Visual Analytics Theater
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A scrollytelling presentation over your active dataset — every chart is a live DuckDB
            aggregation, fully offline.
          </p>
        </div>

        {theater && (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={mode}
              onChange={(e) => setMode(e.target.value as ViewMode)}
              className="h-9 w-36"
              aria-label="View mode"
            >
              <NativeSelectOption value="explore">Explore</NativeSelectOption>
              <NativeSelectOption value="present">Present</NativeSelectOption>
            </NativeSelect>
            <Button size="sm" variant="outline" onClick={handleNarrate} disabled={busy !== null}>
              {busy === "narrate" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Narrate
            </Button>
            <Button size="sm" variant="outline" onClick={handleSave} disabled={busy !== null}>
              {busy === "save" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("pptx")}
              disabled={busy !== null}
            >
              {busy === "pptx" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              PPTX
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport("pdf")}
              disabled={busy !== null}
            >
              {busy === "pdf" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              PDF
            </Button>
          </div>
        )}
      </div>

      {status && (
        <p className="rounded-md border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground">
          {status}
        </p>
      )}

      {!ready || !theater ? (
        <SceneEmptyState
          title="No active dataset"
          description="Import or select a dataset to stage it in the analytics theater. Every scene is driven by your real data via DuckDB."
        />
      ) : mode === "present" ? (
        <TheaterPresenter scenes={scenes} />
      ) : (
        <Tabs value={activeScene} onValueChange={(v) => setActiveScene(v as typeof activeScene)}>
          <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/60 p-1">
            {SCENE_DEFINITIONS.map((def) => (
              <TabsTrigger key={def.kind} value={def.kind} className="text-xs sm:text-sm">
                {def.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {currentScene && (
            <p className="mt-1 text-sm text-muted-foreground">{currentScene.narration}</p>
          )}

          {SCENE_DEFINITIONS.map((def) => {
            const Scene = SCENE_COMPONENTS[def.kind];
            return (
              <TabsContent key={def.kind} value={def.kind}>
                {/* Only the active tab's scene chunk is mounted/parsed. */}
                {activeScene === def.kind ? <Scene /> : null}
              </TabsContent>
            );
          })}
        </Tabs>
      )}
    </div>
  );
}
