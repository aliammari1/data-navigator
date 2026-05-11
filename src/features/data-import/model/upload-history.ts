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
  {
    id: "h2",
    name: "Customer_Data.xlsx",
    rows: 8341,
    cols: 24,
    date: new Date(Date.now() - 172800000),
    size: 1.8 * 1024 * 1024,
    type: "xlsx",
  },
  {
    id: "h3",
    name: "analytics_events.json",
    rows: 42890,
    cols: 12,
    date: new Date(Date.now() - 259200000),
    size: 8.1 * 1024 * 1024,
    type: "json",
  },
];
