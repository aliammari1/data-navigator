/// <reference lib="webworker" />

/**
 * layout.worker — geospatial aggregation OFF the main thread.
 *
 * Engine:
 *  - h3-js for analytical hexbin aggregation (geo region aggregates).
 *
 * Comlink proxy name (renderer): `layout` (see layout-client.ts).
 *
 * Methods:
 *  - hexbin(points, resolution)      H3 hexbin aggregation
 *
 * Offline: pure JS (h3-js is pure JS). No wasm, no network.
 *
 * NOTE: the ELK layered-DAG (`layoutGraph`) and supercluster point-clustering
 * surfaces were removed as dead code — lineage ships its own
 * `src/features/lineage/core/elk-layout.ts`.
 */

import * as Comlink from "comlink";
import { cellToBoundary, latLngToCell } from "h3-js";
import type { GeoPoint, HexBin } from "./layout-types";

// ─── Geo: H3 hexbin aggregation ─────────────────────────────────────────────

function hexbin(points: GeoPoint[], resolution = 7): HexBin[] {
  const bins = new Map<string, { value: number; count: number }>();
  for (const p of points) {
    const cell = latLngToCell(p.lat, p.lng, resolution);
    const entry = bins.get(cell) ?? { value: 0, count: 0 };
    entry.value += p.weight ?? 1;
    entry.count += 1;
    bins.set(cell, entry);
  }
  const out: HexBin[] = [];
  for (const [cell, { value, count }] of bins) {
    out.push({
      cell,
      boundary: cellToBoundary(cell) as [number, number][],
      value,
      count,
    });
  }
  return out;
}

// ─── Comlink exposure ───────────────────────────────────────────────────────

const api = {
  hexbin,
};

export type LayoutWorkerApi = typeof api;

Comlink.expose(api);
