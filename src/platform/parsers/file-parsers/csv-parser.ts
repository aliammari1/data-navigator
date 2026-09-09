import Papa from "papaparse";
import type { ParsedData } from "@/core/types/file";

export function parseCSV(content: string): ParsedData {
  const result = Papa.parse<Record<string, string>>(content);
  const rows = result.data.filter((row) => Object.values(row).some((v) => v !== ""));
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    id: crypto.randomUUID(),
    fileId: "",
    columns,
    rows,
  };
}
