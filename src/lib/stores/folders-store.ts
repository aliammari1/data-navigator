import { create } from "zustand";
import { persist } from "zustand/middleware";

// A folder record stored in the catalog (not a dataset, just a container)
export interface CatalogFolder {
  id: string;
  name: string;
  parentId: string | null; // null = top-level under root
  starred: boolean;
  color?: string;
  createdAt: string; // ISO string (serialisable)
}

interface FoldersStore {
  /** User-created folders */
  folders: CatalogFolder[];
  /** Maps datasetId -> folderId (null means "root" / top-level) */
  datasetFolderMap: Record<string, string | null>;
  /** Starred dataset IDs */
  starredDatasets: string[];

  // Folder actions
  addFolder: (folder: Omit<CatalogFolder, "createdAt">) => void;
  removeFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  starFolder: (id: string) => void;
  /** Move a folder to a new parent */
  moveFolder: (id: string, newParentId: string | null) => void;

  // Dataset placement
  moveDataset: (datasetId: string, folderId: string | null) => void;
  removeDatasetFromMap: (datasetId: string) => void;

  // Dataset starring
  starDataset: (datasetId: string) => void;
}

export const useFoldersStore = create<FoldersStore>()(
  persist(
    (set) => ({
      folders: [],
      datasetFolderMap: {},
      starredDatasets: [],

      addFolder: (folder) =>
        set((s) => ({
          folders: [
            ...s.folders,
            { ...folder, createdAt: new Date().toISOString() },
          ],
        })),

      removeFolder: (id) =>
        set((s) => {
          // Collect all descendant folder IDs
          function descendants(fid: string): string[] {
            const children = s.folders.filter((f) => f.parentId === fid);
            return [fid, ...children.flatMap((c) => descendants(c.id))];
          }
          const toRemove = new Set(descendants(id));

          // Move orphaned datasets (those whose folder is removed) to root
          const newMap = { ...s.datasetFolderMap };
          for (const [dsId, fId] of Object.entries(newMap)) {
            if (fId !== null && toRemove.has(fId)) {
              newMap[dsId] = null;
            }
          }
          return {
            folders: s.folders.filter((f) => !toRemove.has(f.id)),
            datasetFolderMap: newMap,
          };
        }),

      renameFolder: (id, name) =>
        set((s) => ({
          folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)),
        })),

      starFolder: (id) =>
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, starred: !f.starred } : f,
          ),
        })),

      moveFolder: (id, newParentId) =>
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, parentId: newParentId } : f,
          ),
        })),

      moveDataset: (datasetId, folderId) =>
        set((s) => ({
          datasetFolderMap: { ...s.datasetFolderMap, [datasetId]: folderId },
        })),

      removeDatasetFromMap: (datasetId) =>
        set((s) => {
          const newMap = { ...s.datasetFolderMap };
          delete newMap[datasetId];
          return { datasetFolderMap: newMap };
        }),

      starDataset: (datasetId) =>
        set((s) => {
          const starred = s.starredDatasets.includes(datasetId)
            ? s.starredDatasets.filter((id) => id !== datasetId)
            : [...s.starredDatasets, datasetId];
          return { starredDatasets: starred };
        }),
    }),
    {
      name: "data-navigator-folders",
    },
  ),
);
