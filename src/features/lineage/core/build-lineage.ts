import type { Dataset, DataTransform, SavedChart } from "@/core/stores/data-store";
import type {
  CachedAnalyticsMeta,
  CachedTelecomSourceFileMeta,
} from "@/features/telecom/lib/analytics-cache";
import type { DailyStat } from "@/features/telecom/lib/daily-stats-cache";
import { parseProjectionLineage } from "./sql-lineage";
import type { ColumnLineage, LEdge, LNode } from "./types";

// Serializable input shape passed across the worker boundary.
export interface BuildLineageInput {
  datasets: Dataset[];
  transforms: DataTransform[];
  savedCharts: SavedChart[];
  telecomSources: CachedTelecomSourceFileMeta[];
  telecomAnalytics: CachedAnalyticsMeta[];
  dailyStats: DailyStat[];
  loadedTableNames: string[];
}
function nodeId(prefix: string, value: string): string {
  return `${prefix}_${value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80)}`;
}

function timeAgo(value: string | number): string {
  const ts = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(ts)) return "unknown";
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function columnLineageKey(cl: ColumnLineage): string {
  return `${cl.sourceNode}:${cl.sourceCol}->${cl.targetNode}:${cl.targetCol}:${cl.transform ?? "pass"}`;
}

function datasetStatus(ds: Dataset, loadedTableNames: string[]): LNode["status"] {
  if (loadedTableNames.includes(ds.tableName)) return "active";
  return Date.now() - new Date(ds.updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000
    ? "stale"
    : "pending";
}

export function buildRealLineage({
  datasets,
  transforms,
  savedCharts,
  telecomSources,
  telecomAnalytics,
  dailyStats,
  loadedTableNames,
}: BuildLineageInput): {
  nodes: LNode[];
  edges: LEdge[];
  columnLineage: ColumnLineage[];
} {
  const nodes = new Map<string, LNode>();
  const edges = new Map<string, LEdge>();
  const columnLineage: ColumnLineage[] = [];

  // Index datasets once so parent lookups are O(1) instead of O(n) find scans.
  const datasetById = new Map<string, Dataset>();
  for (const ds of datasets) datasetById.set(ds.id, ds);

  const addNode = (node: LNode) => nodes.set(node.id, node);
  const addEdge = (edge: LEdge) => {
    edges.set(edge.id, edge);
  };

  for (const ds of datasets) {
    const id = nodeId("dataset", ds.id);
    const upstreams: string[] = [];
    const downstreams: string[] = [];

    if (ds.parentId) upstreams.push(nodeId("dataset", ds.parentId));

    addNode({
      id,
      name: ds.name,
      type: ds.source === "transform" || ds.parentId ? "transform" : "source",
      subtype: `${ds.source.toUpperCase()} ${ds.format.toUpperCase()}`,
      status: datasetStatus(ds, loadedTableNames),
      rowCount: ds.rowCount,
      colCount: ds.colCount,
      owner: "workspace",
      description: ds.description || `DuckDB table ${ds.tableName}`,
      quality: ds.qualityScore / 100,
      tags: ds.tags.length > 0 ? ds.tags : [ds.format, ds.source],
      lastUpdated: timeAgo(ds.updatedAt),
      duration: ds.transformSql ? "SQL transform" : undefined,
      upstreams,
      downstreams,
    });

    if (ds.parentId) {
      addEdge({
        id: `edge_${ds.parentId}_${ds.id}`,
        source: nodeId("dataset", ds.parentId),
        target: id,
        label: "transform",
        type: "full",
        transformType: "SQL",
        rowsTransferred: ds.rowCount,
      });

      const parent = datasetById.get(ds.parentId);
      const parentColumns = new Set(parent?.columns.map((candidate) => candidate.name) ?? []);
      const parentNode = nodeId("dataset", ds.parentId);

      // Prefer REAL column lineage derived from the dataset's own transform SQL.
      // Falls back to name-equality matching only when the SQL cannot be parsed
      // (e.g. SELECT *, set operations, CTEs) so we never emit wrong lineage.
      const projection = ds.transformSql ? parseProjectionLineage(ds.transformSql) : null;

      if (projection) {
        for (const proj of projection) {
          const sources = proj.sourceCols.length > 0 ? proj.sourceCols : [proj.targetCol];
          for (const sourceCol of sources) {
            columnLineage.push({
              sourceNode: parentNode,
              sourceCol: sourceCol,
              targetNode: id,
              targetCol: proj.targetCol,
              transform: proj.transform,
            });
          }
        }
      } else {
        for (const col of ds.columns.slice(0, 40)) {
          columnLineage.push({
            sourceNode: parentNode,
            sourceCol: parentColumns.has(col.name) ? col.name : "*",
            targetNode: id,
            targetCol: col.name,
            transform: ds.transformSql ? "SQL projection" : undefined,
          });
        }
      }
    }
  }

  for (const transform of transforms) {
    const input = nodeId("dataset", transform.inputDatasetId);
    const output = nodeId("dataset", transform.outputDatasetId);
    addEdge({
      id: nodeId("transform_edge", transform.id),
      source: input,
      target: output,
      label: transform.type,
      type: transform.type === "sample" ? "partial" : "full",
      transformType: transform.type,
    });
  }

  for (const chart of savedCharts) {
    const id = nodeId("chart", chart.id);
    const source = nodeId("dataset", chart.datasetId);
    addNode({
      id,
      name: chart.title,
      type: "output",
      subtype: `${chart.type} chart`,
      status: "active",
      rowCount: 0,
      colCount: 0,
      owner: "workspace",
      description: "Saved visualization generated from a dataset.",
      quality: 1,
      tags: ["chart", chart.type],
      lastUpdated: timeAgo(chart.createdAt),
      upstreams: [source],
      downstreams: [],
    });
    addEdge({
      id: nodeId("chart_edge", chart.id),
      source,
      target: id,
      label: "visualizes",
      type: "partial",
    });
  }

  for (const source of telecomSources) {
    const id = nodeId("telecom_source", source.key);
    addNode({
      id,
      name: source.fileName,
      type: "source",
      subtype: "Telecom source file",
      status: "active",
      rowCount: 0,
      colCount: 0,
      owner: "telecom",
      description: `${(source.size / 1024 / 1024).toFixed(2)} MB cached source file in IndexedDB.`,
      quality: 1,
      tags: ["telecom", "source", source.type || "file"],
      lastUpdated: timeAgo(source.savedAt),
      upstreams: [],
      downstreams: [],
    });
  }

  for (const entry of telecomAnalytics) {
    const id = nodeId("telecom_analytics", entry.key);
    const source = nodeId("telecom_source", entry.key);
    addNode({
      id,
      name: `Analytics · ${entry.fileName}`,
      type: "model",
      subtype: "Telecom KPI rollup",
      status: "active",
      rowCount: entry.totalTransactions,
      colCount: 0,
      owner: "telecom",
      description: "Cached KPI, channel, hourly, status, error, operator and region analytics.",
      quality: Math.max(0, Math.min(1, entry.successRate / 100)),
      tags: ["telecom", "analytics", "kpi"],
      lastUpdated: timeAgo(entry.savedAt),
      upstreams: telecomSources.some((sourceMeta) => sourceMeta.key === entry.key) ? [source] : [],
      downstreams: [],
    });
    if (telecomSources.some((sourceMeta) => sourceMeta.key === entry.key)) {
      addEdge({
        id: nodeId("telecom_analytics_edge", entry.key),
        source,
        target: id,
        label: "aggregates",
        type: "full",
        rowsTransferred: entry.totalTransactions,
      });
    }
  }

  for (const stat of dailyStats) {
    const id = nodeId("telecom_day", stat.day);
    const upstreams = stat.lineage.map((lineage) => nodeId("telecom_source", lineage.fileKey));
    addNode({
      id,
      name: `Telecom daily snapshot · ${stat.day}`,
      type: "output",
      subtype: "Daily snapshot",
      status: "active",
      rowCount: stat.total,
      colCount: 0,
      owner: "telecom",
      description: `${stat.lineage.length} source file(s), ${stat.successRate.toFixed(1)}% success rate.`,
      quality: Math.max(0, Math.min(1, stat.successRate / 100)),
      tags: ["telecom", "daily", "snapshot"],
      lastUpdated: timeAgo(stat.computedAt),
      upstreams,
      downstreams: [],
    });
    for (const lineage of stat.lineage) {
      const source = nodeId("telecom_source", lineage.fileKey);
      addEdge({
        id: nodeId("telecom_day_edge", `${lineage.fileKey}_${stat.day}`),
        source,
        target: id,
        label: "contributes",
        type: "partial",
        rowsTransferred: lineage.rows,
      });
    }
  }

  const nodeList = [...nodes.values()];
  for (const node of nodeList) {
    node.upstreams = [...new Set(node.upstreams.filter((id) => nodes.has(id)))];
    node.downstreams = [
      ...new Set(
        [...edges.values()]
          .filter((edge) => edge.source === node.id && nodes.has(edge.target))
          .map((edge) => edge.target),
      ),
    ];
  }

  return {
    nodes: nodeList,
    edges: [...edges.values()].filter((edge) => nodes.has(edge.source) && nodes.has(edge.target)),
    columnLineage,
  };
}

// Layout now lives in `./elk-layout.ts` (ELK layered DAG, worker-side). The old
// dagre `computeLayout` was removed per the v2 plan (dagre is deprecated and was
// the installed-but-unused layout dep). Node dimensions are re-exported there.
