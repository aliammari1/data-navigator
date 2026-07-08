"use client";

/**
 * MapLibreMap
 *
 * The plan's preferred basemap: MapLibre GL (WebGL2) + a self-hosted PMTiles
 * vector basemap (self-hosted glyphs/sprites), fully offline - no CDN, no remote
 * tiles. Region aggregates are rendered as a single native GeoJSON `circle`
 * layer with data-driven radius (volume) and colour (success rate), which scales
 * to thousands of points on the GPU without a per-marker DOM node and without
 * pulling in deck.gl.
 *
 * This component is only mounted when a bundled `/maps/basemap.pmtiles` archive
 * is present (feature-detected by the screen); otherwise the tile-free canvas
 * `OfflineMap` fallback is used, so the route is always offline-correct.
 */

import type { FeatureCollection, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef } from "react";
import type { GeoRegion } from "../hooks/use-geo-data";
import { buildLocalStyle } from "../lib/local-style";
import { ensurePmtilesProtocol } from "../lib/pmtiles-protocol";

ensurePmtilesProtocol();

export interface MapLibreMapProps {
  regions: GeoRegion[];
  selectedRegion: string | null;
  onSelect: (regionName: string | null) => void;
  height?: number;
}

const POINTS_SOURCE = "regions";
const POINTS_LAYER = "region-circles";
const SELECTED_LAYER = "region-selected";
// Sentinel that no real region name equals, so an empty selection matches none.
const NO_MATCH = "\u0000__none__";

/** Data-driven radius: base px + up to 28px by sqrt-normalised volume. */
function radiusExpr(base: number): ExpressionSpecification {
  return ["+", base, ["*", 28, ["get", "weight"]]];
}

/** Red (low) -> amber -> green (high) over the 70-100% success window. */
const COLOR_EXPR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["get", "successRate"],
  70,
  "#dc2626",
  85,
  "#f59e0b",
  100,
  "#16a34a",
];

function selectedFilter(name: string | null): FilterSpecification {
  return ["==", ["get", "name"], name ?? NO_MATCH];
}

function toFeatureCollection(
  regions: GeoRegion[],
  maxTransactions: number,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: regions
      .filter((r) => r.lon !== null && r.lat !== null)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lon as number, r.lat as number] },
        properties: {
          name: r.name,
          transactions: r.transactions,
          revenue: r.revenue,
          successRate: r.successRate,
          rank: r.rank,
          // Normalised 0..1 weight (sqrt scale) for the radius expression.
          weight: maxTransactions > 0 ? Math.sqrt(r.transactions / maxTransactions) : 0,
        },
      })),
  };
}

export function MapLibreMap({ regions, selectedRegion, onSelect, height = 500 }: MapLibreMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const maxTransactions = useMemo(
    () => regions.reduce((m, r) => Math.max(m, r.transactions), 0),
    [regions],
  );
  const data = useMemo(
    () => toFeatureCollection(regions, maxTransactions),
    [regions, maxTransactions],
  );

  const initialCenter = useMemo<[number, number]>(() => {
    const mapped = regions.filter((r) => r.lon !== null && r.lat !== null);
    if (mapped.length === 0) return [9.5375, 33.8869]; // Tunisia center
    const lon = mapped.reduce((s, r) => s + (r.lon as number), 0) / mapped.length;
    const lat = mapped.reduce((s, r) => s + (r.lat as number), 0) / mapped.length;
    return [lon, lat];
  }, [regions]);

  // Build the map exactly once; data + selection sync in the effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildLocalStyle("light"),
      center: initialCenter,
      zoom: 6,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    popupRef.current = popup;

    map.on("load", () => {
      map.addSource(POINTS_SOURCE, { type: "geojson", data });

      map.addLayer({
        id: POINTS_LAYER,
        type: "circle",
        source: POINTS_SOURCE,
        paint: {
          "circle-radius": radiusExpr(5),
          "circle-color": COLOR_EXPR,
          "circle-opacity": 0.8,
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "rgba(15,23,42,0.55)",
        },
      });

      map.addLayer({
        id: SELECTED_LAYER,
        type: "circle",
        source: POINTS_SOURCE,
        filter: selectedFilter(selectedRegion),
        paint: {
          "circle-radius": radiusExpr(8),
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      loadedRef.current = true;

      map.on("mouseenter", POINTS_LAYER, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", POINTS_LAYER, () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("mousemove", POINTS_LAYER, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as {
          name: string;
          transactions: number;
          successRate: number;
        };
        const tx = Number(p.transactions).toLocaleString("fr-FR");
        const rate = Number(p.successRate).toFixed(1);
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font:600 12px system-ui">${p.name}</div>` +
              `<div style="font:11px system-ui;color:#64748b">${tx} tx, ${rate}%</div>`,
          )
          .addTo(map);
      });
      map.on("click", POINTS_LAYER, (e) => {
        const name = (e.features?.[0]?.properties as { name?: string })?.name;
        onSelectRef.current(name ?? null);
      });
      // Click on empty map clears selection.
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: [POINTS_LAYER] });
        if (hits.length === 0) onSelectRef.current(null);
      });
    });

    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Sync data updates onto the live source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource(POINTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(data);
  }, [data]);

  // Sync the selection highlight filter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer(SELECTED_LAYER)) return;
    map.setFilter(SELECTED_LAYER, selectedFilter(selectedRegion));
  }, [selectedRegion]);

  return <div ref={containerRef} style={{ height, width: "100%" }} className="rounded-xl" />;
}
