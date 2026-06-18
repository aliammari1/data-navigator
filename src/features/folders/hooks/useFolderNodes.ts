import { useMemo } from "react";
import { useDataStore } from "@/core/stores/data-store";
import { useFoldersStore } from "@/core/stores/folders-store";
import type { FSNode, NodeType } from "../types";

const ROOT_ID = "root";

/**
 * Builds the flat `FSNode[]` for the catalog from the real Zustand stores:
 * a synthetic root, the persisted folder catalog, and the live dataset list.
 * No mock data — everything is sourced from `useDataStore`/`useFoldersStore`.
 */
export function useFolderNodes(): FSNode[] {
  const datasets = useDataStore((s) => s.datasets);
  const catalogFolders = useFoldersStore((s) => s.folders);
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);
  const starredDatasets = useFoldersStore((s) => s.starredDatasets);

  return useMemo((): FSNode[] => {
    const root: FSNode = {
      id: ROOT_ID,
      name: "My Datasets",
      type: "folder",
      parentId: null,
      size: 0,
      createdAt: new Date(0),
      updatedAt: new Date(),
      tags: [],
      starred: false,
      color: "#1E40AF",
    };

    const folderNodes: FSNode[] = catalogFolders.map((f) => ({
      id: f.id,
      name: f.name,
      type: "folder" as NodeType,
      parentId: f.parentId ?? ROOT_ID,
      size: 0,
      createdAt: new Date(f.createdAt),
      updatedAt: new Date(f.createdAt),
      tags: [],
      starred: f.starred,
      color: f.color,
    }));

    const starredSet = new Set(starredDatasets);
    const fileNodes: FSNode[] = datasets.map((ds) => ({
      id: ds.id,
      name: ds.name,
      type: ds.format as NodeType,
      parentId: datasetFolderMap[ds.id] ?? ROOT_ID,
      size: ds.sizeBytes,
      rowCount: ds.rowCount,
      colCount: ds.colCount,
      createdAt: new Date(ds.createdAt),
      updatedAt: new Date(ds.updatedAt),
      tags: ds.tags,
      starred: starredSet.has(ds.id),
      quality: ds.qualityScore / 100,
      description: ds.description,
    }));

    return [root, ...folderNodes, ...fileNodes];
  }, [datasets, catalogFolders, datasetFolderMap, starredDatasets]);
}
