export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  folderId: string | null;
  uploadDate: Date;
  status: "pending" | "complete" | "error";
  content?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
}

export interface ParsedData {
  id: string;
  fileId: string;
  columns: string[];
  rows: Record<string, unknown>[];
}
