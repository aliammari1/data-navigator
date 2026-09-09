export interface ParsedData {
  id: string;
  fileId: string;
  columns: string[];
  rows: Record<string, unknown>[];
}
