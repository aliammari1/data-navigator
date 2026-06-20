"use client";

/**
 * GeoMap
 *
 * Chooses the offline-correct basemap at runtime:
 *  - if a bundled `/maps/basemap.pmtiles` archive is present, lazy-load and
 *    render the MapLibre GL + PMTiles vector basemap (the plan's preferred
 *    stack), keeping maplibre/pmtiles out of the route chunk until needed;
 *  - otherwise fall back to the tile-free canvas `OfflineMap`.
 *
 * Both paths are 100% offline (no CDN, no remote tiles); the fallback simply
 * trades the vector basemap for a graticule projection when no tiles are
 * vendored yet. The probe never blocks first paint — it renders the canvas map
 * immediately and upgrades to MapLibre once detection resolves.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { GeoRegion } from "../hooks/use-geo-data";
import { hasBundledBasemap } from "../lib/pmtiles-protocol";
import { OfflineMap } from "./OfflineMap";

const MapLibreMap = dynamic(() => import("./MapLibreMap").then((m) => m.MapLibreMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center text-sm text-muted-foreground">
      Loading vector map…
    </div>
  ),
});

export interface GeoMapProps {
  regions: GeoRegion[];
  selectedRegion: string | null;
  onSelect: (regionName: string | null) => void;
  height?: number;
}

export function GeoMap(props: GeoMapProps) {
  const [useVector, setUseVector] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hasBundledBasemap().then((present) => {
      if (!cancelled) setUseVector(present);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Until the probe resolves (and whenever no tiles are vendored) use the
  // tile-free canvas map so the route is always offline and never blank.
  if (useVector) return <MapLibreMap {...props} />;
  return <OfflineMap {...props} />;
}
