"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useFileStore } from "@/core/stores/file-store";
import type { FileItem, Folder, ParsedData } from "@/core/types/file";
import { queryKeys } from "./keys";

// ─── Files ───────────────────────────────────────────────────────────────────

/**
 * Hook to get all files with optional folder filtering.
 */
export function useFiles(folderId?: string | null) {
  const files = useFileStore((s) => s.files);

  return useQuery({
    queryKey: queryKeys.files.list(folderId),
    queryFn: () => {
      if (folderId === undefined) return files;
      return files.filter((f) => f.folderId === folderId);
    },
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get a single file by ID.
 */
export function useFile(id: string | null) {
  const files = useFileStore((s) => s.files);

  return useQuery({
    queryKey: id ? queryKeys.files.detail(id) : ["files", "null"],
    queryFn: () => (id ? files.find((f) => f.id === id) ?? null : null),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ─── Folders ─────────────────────────────────────────────────────────────────

/**
 * Hook to get all folders.
 */
export function useFileFolders(parentId?: string | null) {
  const folders = useFileStore((s) => s.folders);

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
 * Hook to get the current folder ID.
 */
export function useCurrentFolderId() {
  return useFileStore((s) => s.currentFolderId);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Add a file with React Query mutation.
 */
export function useAddFile() {
  const queryClient = useQueryClient();
  const addFile = useFileStore((s) => s.addFile);

  return useMutation({
    mutationFn: async (file: FileItem) => {
      addFile(file);
      return file;
    },
    onSuccess: (file) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.list(file.folderId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.lists() });
    },
  });
}

/**
 * Remove a file.
 */
export function useRemoveFile() {
  const queryClient = useQueryClient();
  const removeFile = useFileStore((s) => s.removeFile);

  return useMutation({
    mutationFn: async (id: string) => {
      removeFile(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all() });
    },
  });
}

/**
 * Move a file to a different folder.
 */
export function useMoveFile() {
  const queryClient = useQueryClient();
  const moveFile = useFileStore((s) => s.moveFile);

  return useMutation({
    mutationFn: async ({
      fileId,
      folderId,
    }: {
      fileId: string;
      folderId: string | null;
    }) => {
      moveFile(fileId, folderId);
      return { fileId, folderId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all() });
    },
  });
}

/**
 * Add a folder.
 */
export function useAddFileFolder() {
  const queryClient = useQueryClient();
  const addFolder = useFileStore((s) => s.addFolder);

  return useMutation({
    mutationFn: async (folder: Folder) => {
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
 * Remove a folder.
 */
export function useRemoveFileFolder() {
  const queryClient = useQueryClient();
  const removeFolder = useFileStore((s) => s.removeFolder);

  return useMutation({
    mutationFn: async (id: string) => {
      removeFolder(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all() });
    },
  });
}

/**
 * Set the current folder.
 */
export function useSetCurrentFolder() {
  const queryClient = useQueryClient();
  const setCurrentFolder = useFileStore((s) => s.setCurrentFolder);

  return useMutation({
    mutationFn: async (id: string | null) => {
      setCurrentFolder(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.files.all() });
    },
  });
}

// ─── Parsed Data ─────────────────────────────────────────────────────────────

/**
 * Hook to get parsed data.
 */
export function useParsedData() {
  const parsedData = useFileStore((s) => s.parsedData);

  return useQuery({
    queryKey: ["files", "parsedData"],
    queryFn: () => parsedData,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Add parsed data.
 */
export function useAddParsedData() {
  const queryClient = useQueryClient();
  const addParsedData = useFileStore((s) => s.addParsedData);

  return useMutation({
    mutationFn: async (data: ParsedData) => {
      addParsedData(data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files", "parsedData"] });
    },
  });
}

// ─── Upload Progress ─────────────────────────────────────────────────────────

/**
 * Hook to track upload progress for a specific file.
 */
export function useUploadProgress(fileId: string) {
  const uploadProgress = useFileStore((s) => s.uploadProgress);

  return useQuery({
    queryKey: queryKeys.files.uploadProgress(fileId),
    queryFn: () => uploadProgress.get(fileId) ?? 0,
    staleTime: 0, // Real-time updates
    refetchInterval: 500, // Poll every 500ms during upload
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

/**
 * Set upload progress.
 */
export function useSetUploadProgress() {
  const queryClient = useQueryClient();
  const setUploadProgress = useFileStore((s) => s.setUploadProgress);

  return useMutation({
    mutationFn: async ({
      fileId,
      progress,
    }: {
      fileId: string;
      progress: number;
    }) => {
      setUploadProgress(fileId, progress);
      return { fileId, progress };
    },
    onSuccess: ({ fileId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.files.uploadProgress(fileId),
      });
    },
  });
}
