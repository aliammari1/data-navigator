import { create } from "zustand";
import type { FileItem, Folder, ParsedData } from "@/core/types/file";

interface FileStore {
  files: FileItem[];
  folders: Folder[];
  currentFolderId: string | null;
  parsedData: ParsedData[];
  uploadProgress: Map<string, number>;
  addFile: (file: FileItem) => void;
  removeFile: (id: string) => void;
  moveFile: (fileId: string, folderId: string | null) => void;
  addFolder: (folder: Folder) => void;
  removeFolder: (id: string) => void;
  setCurrentFolder: (id: string | null) => void;
  addParsedData: (data: ParsedData) => void;
  setUploadProgress: (fileId: string, progress: number) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  files: [
    {
      id: "1",
      name: "Q4 Sales Report.csv",
      size: 245000,
      type: "text/csv",
      folderId: null,
      uploadDate: new Date("2025-01-15"),
      status: "complete",
    },
    {
      id: "2",
      name: "Annual Revenue.xlsx",
      size: 512000,
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      folderId: null,
      uploadDate: new Date("2025-01-20"),
      status: "complete",
    },
    {
      id: "3",
      name: "Marketing Dashboard.png",
      size: 1240000,
      type: "image/png",
      folderId: null,
      uploadDate: new Date("2025-02-01"),
      status: "complete",
    },
  ],
  folders: [
    {
      id: "folder-1",
      name: "Reports",
      parentId: null,
      createdAt: new Date("2025-01-01"),
    },
    {
      id: "folder-2",
      name: "Sales",
      parentId: null,
      createdAt: new Date("2025-01-02"),
    },
    {
      id: "folder-3",
      name: "Marketing",
      parentId: null,
      createdAt: new Date("2025-01-03"),
    },
  ],
  currentFolderId: null,
  parsedData: [],
  uploadProgress: new Map(),
  addFile: (file) => set((state) => ({ files: [...state.files, file] })),
  removeFile: (id) =>
    set((state) => ({ files: state.files.filter((f) => f.id !== id) })),
  moveFile: (fileId, folderId) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === fileId ? { ...f, folderId } : f)),
    })),
  addFolder: (folder) =>
    set((state) => ({ folders: [...state.folders, folder] })),
  removeFolder: (id) =>
    set((state) => ({ folders: state.folders.filter((f) => f.id !== id) })),
  setCurrentFolder: (id) => set({ currentFolderId: id }),
  addParsedData: (data) =>
    set((state) => ({ parsedData: [...state.parsedData, data] })),
  setUploadProgress: (fileId, progress) =>
    set((state) => {
      const newMap = new Map(state.uploadProgress);
      newMap.set(fileId, progress);
      return { uploadProgress: newMap };
    }),
}));
