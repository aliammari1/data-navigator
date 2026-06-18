/**
 * Shared layout types for layout.worker. Kept in the worker subsystem dir (NOT
 * src/shared) to avoid collisions with sibling agents. Feature code maps its own
 * geo models onto these neutral shapes.
 */

// ─── Geo hexbin aggregation ─────────────────────────────────────────────────

export interface GeoPoint {
  /** Longitude, latitude. */
  lng: number;
  lat: number;
  /** Optional payload carried through aggregation. */
  id?: string | number;
  weight?: number;
}

export interface HexBin {
  /** H3 cell index (hex string). */
  cell: string;
  /** Hexagon boundary as [lat, lng] ring (h3 default order). */
  boundary: [number, number][];
  /** Aggregated value (sum of weights / count). */
  value: number;
  count: number;
}
