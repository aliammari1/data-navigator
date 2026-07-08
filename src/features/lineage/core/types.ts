// ─── Types ─────────────────────────────────────────────────────────────────

export interface LNode {
  id: string;
  name: string;
  type: "source" | "transform" | "output" | "model" | "external";
  subtype: string;
  status: "active" | "stale" | "error" | "pending" | "running";
  rowCount: number;
  colCount: number;
  owner: string;
  description: string;
  quality: number;
  tags: string[];
  lastUpdated: string;
  duration?: string;
  upstreams: string[];
  downstreams: string[];
}

export interface LEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: "full" | "partial" | "streaming";
  transformType?: string;
  rowsTransferred?: number;
}

export interface ColumnLineage {
  sourceNode: string;
  sourceCol: string;
  targetNode: string;
  targetCol: string;
  transform?: string;
}
