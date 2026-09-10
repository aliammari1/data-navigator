"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import { useAI } from "@/platform/ai/provider";

/**
 * AI-assisted catalog organization.
 *
 * Asks the platform provider registry (`useAI().generateStructured`) to group
 * the currently-ungrouped datasets into named folders. Output is grammar-valid
 * JSON **by construction** (GBNF grammar derived from the Zod schema), so there
 * is no regex/parseJSON repair loop and no direct web-llm dependency — the
 * llamacpp adapter runs offline on CPU in the Electron main process.
 *
 * The suggestion is grounded only in real catalog metadata (dataset name,
 * format, tags, row/column counts) — never fabricated numbers.
 */

const OrganizePlanSchema = z.object({
  groups: z
    .array(
      z.object({
        folderName: z
          .string()
          .min(1)
          .max(40)
          .describe("Short, human-friendly folder name (Title Case)"),
        datasetIds: z
          .array(z.string())
          .min(1)
          .describe("IDs of datasets that belong in this folder"),
      }),
    )
    .max(12)
    .describe("Proposed folders grouping the supplied ungrouped datasets"),
});

export type OrganizePlan = z.infer<typeof OrganizePlanSchema>;

export interface AutoOrganizeState {
  running: boolean;
  error: string | null;
  lastPlan: OrganizePlan | null;
  appliedCount: number;
}

interface OrganizeCandidate {
  id: string;
  name: string;
  format: string;
  tags: string[];
  rowCount: number;
  colCount: number;
}

export function useAutoOrganize() {
  const ai = useAI();
  const datasets = useDataStore((s) => s.datasets);
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);
  const addFolder = useFoldersStore((s) => s.addFolder);
  const moveDataset = useFoldersStore((s) => s.moveDataset);

  const [state, setState] = useState<AutoOrganizeState>({
    running: false,
    error: null,
    lastPlan: null,
    appliedCount: 0,
  });

  const organize = useCallback(async (): Promise<OrganizePlan | null> => {
    // Only datasets not already filed under a folder are candidates.
    const candidates: OrganizeCandidate[] = datasets
      .filter((ds) => !datasetFolderMap[ds.id])
      .map((ds) => ({
        id: ds.id,
        name: ds.name,
        format: ds.format,
        tags: ds.tags,
        rowCount: ds.rowCount,
        colCount: ds.colCount,
      }));

    if (candidates.length === 0) {
      setState((s) => ({
        ...s,
        error: "All datasets are already organized into folders.",
      }));
      return null;
    }

    setState((s) => ({ ...s, running: true, error: null }));

    const validIds = new Set(candidates.map((c) => c.id));
    const summary = candidates
      .map(
        (c) =>
          `- id=${c.id} | "${c.name}" | ${c.format} | ` +
          `${c.rowCount.toLocaleString()} rows × ${c.colCount} cols` +
          (c.tags.length > 0 ? ` | tags: ${c.tags.join(", ")}` : ""),
      )
      .join("\n");

    try {
      const plan = await ai.generateStructured(
        {
          system:
            "You are a data-catalog librarian. Group the supplied datasets into " +
            "a small number of coherent folders by topic, source, or theme. Use " +
            "only the dataset IDs provided, assign each dataset to at most one " +
            "folder, and prefer 3-8 folders. Respond ONLY with the requested JSON.",
          prompt:
            `Ungrouped datasets:\n${summary}\n\n` +
            "Propose folder groupings. Each group needs a concise folderName and " +
            "the list of datasetIds it contains. Skip datasets that do not fit.",
          temperature: 0,
        },
        OrganizePlanSchema,
      );

      // Defensively filter to IDs we actually offered (the grammar constrains
      // structure, not value membership).
      const cleaned: OrganizePlan = {
        groups: plan.groups
          .map((g) => ({
            folderName: g.folderName.trim(),
            datasetIds: [...new Set(g.datasetIds)].filter((id) => validIds.has(id)),
          }))
          .filter((g) => g.folderName.length > 0 && g.datasetIds.length > 0),
      };

      setState((s) => ({ ...s, running: false, lastPlan: cleaned }));
      return cleaned;
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        error: err instanceof Error ? err.message : "AI organization failed.",
      }));
      return null;
    }
  }, [ai, datasets, datasetFolderMap]);

  const applyPlan = useCallback(
    (plan: OrganizePlan) => {
      let applied = 0;
      const assigned = new Set<string>();
      for (const group of plan.groups) {
        const folderId = `folder-ai-${Date.now()}-${Math.round(performance.now())}-${applied}`;
        addFolder({
          id: folderId,
          name: group.folderName,
          parentId: null,
          starred: false,
          color: "#6366f1",
        });
        for (const dsId of group.datasetIds) {
          if (assigned.has(dsId)) continue;
          assigned.add(dsId);
          moveDataset(dsId, folderId);
          applied++;
        }
      }
      setState((s) => ({ ...s, appliedCount: applied, lastPlan: null }));
      return applied;
    },
    [addFolder, moveDataset],
  );

  return {
    ...state,
    progress: ai.progress,
    organize,
    applyPlan,
  };
}
