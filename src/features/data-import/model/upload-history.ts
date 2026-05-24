import type { FileType } from "./types";

export interface UploadHistoryItem {
  id: string;
  name: string;
  rows: number;
  cols: number;
  date: Date;
  size: number;
  type: FileType;
}

export const INITIAL_UPLOAD_HISTORY: UploadHistoryItem[] = [
  {
    id: "h1",
    name: "Q4_Sales_Report.csv",
    rows: 15420,
    cols: 18,
    date: new Date(Date.now() - 86400000),
    size: 2.4 * 1024 * 1024,
    type: "csv",
  },
];
