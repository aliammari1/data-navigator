"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CatalogFolder,
  useFoldersStore,
} from "@/core/stores/folders-store";
import { queryKeys } from "./keys";

// ─── Folders ─────────────────────────────────────────────────────────────────

/**
 * Hook to get all catalog folders.
 */
export function useFolders(parentId?: string | null) {
  const folders = useFoldersStore((s) => s.folders);

  return useQuery({
    queryKey: queryKeys.folders.list(parentId),
    queryFn: () => {
      if (parentId === undefined) return folders;
      return folders.filter((f) => f.parentId === parentId);
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get all folders flattened (for search, etc.).
 */
export function useAllFolders() {
  const folders = useFoldersStore((s) => s.folders);

  return useQuery({
    queryKey: queryKeys.folders.lists(),
    queryFn: () => folders,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get a single folder by ID.
 */
export function useFolder(id: string | null) {
  const folders = useFoldersStore((s) => s.folders);

  return useQuery({
    queryKey: id ? queryKeys.folders.detail(id) : ["folders", "null"],
    queryFn: () => (id ? (folders.find((f) => f.id === id) ?? null) : null),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ─── Dataset Folder Map ──────────────────────────────────────────────────────

/**
 * Hook to get the dataset-to-folder mapping.
 */
export function useDatasetFolderMap() {
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);

  return useQuery({
    queryKey: queryKeys.folders.datasetMap(),
    queryFn: () => datasetFolderMap,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get the folder ID for a specific dataset.
 */
export function useDatasetFolder(datasetId: string | null) {
  const datasetFolderMap = useFoldersStore((s) => s.datasetFolderMap);

  return useQuery({
    queryKey: ["folders", "dataset", datasetId],
    queryFn: () => (datasetId ? (datasetFolderMap[datasetId] ?? null) : null),
    enabled: !!datasetId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ─── Starred Datasets ────────────────────────────────────────────────────────

/**
 * Hook to get starred datasets.
 */
export function useStarredDatasets() {
  const starredDatasets = useFoldersStore((s) => s.starredDatasets);

  return useQuery({
    queryKey: queryKeys.folders.starred(),
    queryFn: () => starredDatasets,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Add a folder.
 */
export function useAddFolder() {
  const queryClient = useQueryClient();
  const addFolder = useFoldersStore((s) => s.addFolder);

  return useMutation({
    mutationFn: async (folder: Omit<CatalogFolder, "createdAt">) => {
      addFolder(folder);
      return folder;
    },
    onSuccess: (folder) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.list(folder.parentId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.lists() });
    },
  });
}

/**
 * Remove a folder (and its descendants).
 */
export function useRemoveFolder() {
  const queryClient = useQueryClient();
  const removeFolder = useFoldersStore((s) => s.removeFolder);

  return useMutation({
    mutationFn: async (id: string) => {
      removeFolder(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.datasetMap(),
      });
    },
  });
}

/**
 * Rename a folder.
 */
export function useRenameFolder() {
  const queryClient = useQueryClient();
  const renameFolder = useFoldersStore((s) => s.renameFolder);

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      renameFolder(id, name);
      return { id, name };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() });
    },
  });
}

/**
 * Star/unstar a folder.
 */
export function useStarFolder() {
  const queryClient = useQueryClient();
  const starFolder = useFoldersStore((s) => s.starFolder);

  return useMutation({
    mutationFn: async (id: string) => {
      starFolder(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() });
    },
  });
}

/**
 * Move a folder to a new parent.
 */
export function useMoveFolder() {
  const queryClient = useQueryClient();
  const moveFolder = useFoldersStore((s) => s.moveFolder);

  return useMutation({
    mutationFn: async ({
      id,
      newParentId,
    }: {
      id: string;
      newParentId: string | null;
    }) => {
      moveFolder(id, newParentId);
      return { id, newParentId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() });
    },
  });
}

/**
 * Move a dataset to a folder.
 */
export function useMoveDatasetToFolder() {
  const queryClient = useQueryClient();
  const moveDataset = useFoldersStore((s) => s.moveDataset);

  return useMutation({
    mutationFn: async ({
      datasetId,
      folderId,
    }: {
      datasetId: string;
      folderId: string | null;
    }) => {
      moveDataset(datasetId, folderId);
      return { datasetId, folderId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.datasetMap(),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() });
    },
  });
}

/**
 * Remove a dataset from the folder map.
 */
export function useRemoveDatasetFromMap() {
  const queryClient = useQueryClient();
  const removeDatasetFromMap = useFoldersStore((s) => s.removeDatasetFromMap);

  return useMutation({
    mutationFn: async (datasetId: string) => {
      removeDatasetFromMap(datasetId);
      return datasetId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.datasetMap(),
      });
    },
  });
}

/**
 * Star/unstar a dataset.
 */
export function useStarDataset() {
  const queryClient = useQueryClient();
  const starDataset = useFoldersStore((s) => s.starDataset);

  return useMutation({
    mutationFn: async (datasetId: string) => {
      starDataset(datasetId);
      return datasetId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folders.starred(),
      });
    },
  });
}
