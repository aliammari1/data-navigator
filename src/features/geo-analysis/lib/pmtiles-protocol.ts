"use client";

/**
 * PMTiles protocol singleton for MapLibre GL.
 *
 * Registers the `pmtiles://` protocol exactly once per app lifecycle so MapLibre
 * can range-read a single bundled tile archive (`/maps/basemap.pmtiles`) over
 * same-origin localhost with zero network. `protocol.add()` is not needed when
 * the style source URL uses the `pmtiles://` prefix — MapLibre derives the
 * min/max zoom from the archive header automatically.
 */

import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let installed = false;

/** Idempotent. Call once before the first MapLibre map mounts. */
export function ensurePmtilesProtocol(): void {
  if (installed) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  installed = true;
}

/** Same-origin URL of the bundled basemap archive (served from public/). */
export const BASEMAP_PMTILES_URL = "/maps/basemap.pmtiles";

/**
 * Feature-detect whether the bundled basemap archive is present. When it is
 * absent (no tiles vendored yet) the screen falls back to the tile-free canvas
 * map so the route is always offline-correct. Never throws; a network/120-style
 * error simply resolves to `false`.
 */
export async function hasBundledBasemap(): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  try {
    // Range read of the first byte: cheap, and PMTiles is range-served anyway.
    const res = await fetch(BASEMAP_PMTILES_URL, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}
