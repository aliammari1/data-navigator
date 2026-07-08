"use client";

/**
 * OfflineMap
 *
 * A fully offline, single-canvas geographic scatter map. It exists to remove the
 * feature's hard offline violation: the old Leaflet `TileLayer` fetched raster
 * basemap tiles from `tile.openstreetmap.org`, which renders blank with no
 * network. This component fetches nothing — it projects lon/lat to pixels with a
 * simple equirectangular projection, draws a graticule for spatial context and
 * renders every region as one canvas circle (sized by volume, coloured by
 * success rate).
 *
 * Because the whole layer is a single `<canvas>`, it scales to thousands of
 * regions without per-marker DOM nodes (the old `CircleMarker`-per-point
 * approach did not). Pan/zoom, hover tooltips and click selection are handled
 * directly on the canvas.
 *
 * The full MapLibre + PMTiles + deck.gl vector basemap from the plan needs
 * uninstalled packages and bundled tile assets and is intentionally out of
 * scope here; this keeps the route correct and offline with installed deps only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoRegion } from "../hooks/use-geo-data";
import { successRateToFill } from "../lib/colors";

export interface OfflineMapProps {
  regions: GeoRegion[];
  selectedRegion: string | null;
  onSelect: (regionName: string | null) => void;
  height?: number;
}

interface Bounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface View {
  /** Pixels per degree of longitude at the current zoom. */
  scale: number;
  /** Top-left longitude / latitude of the viewport. */
  offsetX: number;
  offsetY: number;
}

const PADDING = 36;
const MIN_RADIUS = 5;
const MAX_RADIUS = 34;

function computeBounds(regions: GeoRegion[]): Bounds {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const r of regions) {
    if (r.lon === null || r.lat === null) continue;
    minLon = Math.min(minLon, r.lon);
    maxLon = Math.max(maxLon, r.lon);
    minLat = Math.min(minLat, r.lat);
    maxLat = Math.max(maxLat, r.lat);
  }
  if (!Number.isFinite(minLon)) {
    // Default to Tunisia's extent when nothing is geocoded yet.
    return { minLon: 7.5, maxLon: 11.6, minLat: 30.2, maxLat: 37.6 };
  }
  // Pad the extent slightly so edge markers are not clipped.
  const lonPad = Math.max(0.4, (maxLon - minLon) * 0.12);
  const latPad = Math.max(0.4, (maxLat - minLat) * 0.12);
  return {
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
  };
}

export function OfflineMap({ regions, selectedRegion, onSelect, height = 500 }: OfflineMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<{ region: GeoRegion; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);

  const mapped = useMemo(() => regions.filter((r) => r.lon !== null && r.lat !== null), [regions]);
  const bounds = useMemo(() => computeBounds(mapped), [mapped]);

  const maxTransactions = useMemo(
    () => mapped.reduce((m, r) => Math.max(m, r.transactions), 0),
    [mapped],
  );

  // Track container size for a crisp, responsive canvas.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.max(320, rect.width), height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  const view = useMemo<View>(() => {
    const lonSpan = bounds.maxLon - bounds.minLon || 1;
    const latSpan = bounds.maxLat - bounds.minLat || 1;
    const innerW = size.width - PADDING * 2;
    const innerH = size.height - PADDING * 2;
    // Equirectangular fit; keep aspect by taking the limiting dimension.
    const baseScale = Math.min(innerW / lonSpan, innerH / latSpan) * zoom;
    const projectedW = lonSpan * baseScale;
    const projectedH = latSpan * baseScale;
    const offsetX = PADDING + (innerW - projectedW) / 2 + pan.x;
    const offsetY = PADDING + (innerH - projectedH) / 2 + pan.y;
    return { scale: baseScale, offsetX, offsetY };
  }, [bounds, size, zoom, pan]);

  const project = useCallback(
    (lon: number, lat: number): [number, number] => {
      const x = view.offsetX + (lon - bounds.minLon) * view.scale;
      // Latitude grows upward, canvas y grows downward.
      const y = view.offsetY + (bounds.maxLat - lat) * view.scale;
      return [x, y];
    },
    [view, bounds],
  );

  const radiusFor = useCallback(
    (transactions: number): number => {
      if (maxTransactions <= 0) return MIN_RADIUS;
      const t = Math.sqrt(transactions) / Math.sqrt(maxTransactions);
      return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
    },
    [maxTransactions],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    // Background.
    ctx.fillStyle = "rgba(148,163,184,0.06)";
    ctx.fillRect(0, 0, size.width, size.height);

    // Graticule every 1° for spatial reference (fully local, no tiles).
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(100,116,139,0.7)";
    const lonStart = Math.ceil(bounds.minLon);
    for (let lon = lonStart; lon <= bounds.maxLon; lon += 1) {
      const [x] = project(lon, bounds.maxLat);
      ctx.beginPath();
      ctx.moveTo(x, PADDING / 2);
      ctx.lineTo(x, size.height - PADDING / 2);
      ctx.stroke();
      ctx.fillText(`${lon}°E`, x + 2, size.height - PADDING / 2 + 12);
    }
    const latStart = Math.ceil(bounds.minLat);
    for (let lat = latStart; lat <= bounds.maxLat; lat += 1) {
      const [, y] = project(bounds.minLon, lat);
      ctx.beginPath();
      ctx.moveTo(PADDING / 2, y);
      ctx.lineTo(size.width - PADDING / 2, y);
      ctx.stroke();
      ctx.fillText(`${lat}°N`, 2, y - 2);
    }

    // Region markers (single canvas, sorted so large circles sit behind small).
    const ordered = [...mapped].sort((a, b) => b.transactions - a.transactions);
    for (const region of ordered) {
      if (region.lon === null || region.lat === null) continue;
      const [x, y] = project(region.lon, region.lat);
      const r = radiusFor(region.transactions);
      const isSelected = region.name === selectedRegion;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? r + 3 : r, 0, Math.PI * 2);
      ctx.fillStyle = successRateToFill(region.successRate, 0.78);
      ctx.fill();
      ctx.lineWidth = isSelected ? 3 : 1.25;
      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(15,23,42,0.55)";
      ctx.stroke();
    }

    // Labels for the busiest regions only, to avoid clutter.
    ctx.fillStyle = "rgba(15,23,42,0.92)";
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    for (const region of ordered.slice(0, 8)) {
      if (region.lon === null || region.lat === null) continue;
      const [x, y] = project(region.lon, region.lat);
      const r = radiusFor(region.transactions);
      ctx.fillText(region.name, x + r + 3, y + 4);
    }
  }, [mapped, project, radiusFor, selectedRegion, size, bounds]);

  // ── Hit testing ──────────────────────────────────────────────────────────────
  const hitTest = useCallback(
    (px: number, py: number): GeoRegion | null => {
      let best: GeoRegion | null = null;
      let bestDist = Infinity;
      for (const region of mapped) {
        if (region.lon === null || region.lat === null) continue;
        const [x, y] = project(region.lon, region.lat);
        const r = radiusFor(region.transactions);
        const dist = Math.hypot(px - x, py - y);
        if (dist <= r + 2 && dist < bestDist) {
          best = region;
          bestDist = dist;
        }
      }
      return best;
    },
    [mapped, project, radiusFor],
  );

  const toLocal = (e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handleMove = (e: React.MouseEvent) => {
    const [px, py] = toLocal(e);
    if (dragRef.current) {
      const dx = px - dragRef.current.startX;
      const dy = py - dragRef.current.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
      setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
      return;
    }
    const region = hitTest(px, py);
    setHover(region ? { region, x: px, y: py } : null);
  };

  const handleDown = (e: React.MouseEvent) => {
    const [px, py] = toLocal(e);
    dragRef.current = { startX: px, startY: py, panX: pan.x, panY: pan.y, moved: false };
  };

  const handleUp = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      const [px, py] = toLocal(e);
      const region = hitTest(px, py);
      onSelect(region ? region.name : null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => Math.max(0.6, Math.min(8, z * factor)));
  };

  return (
    <div ref={containerRef} className="relative w-full select-none" style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size.width,
          height: size.height,
          cursor: dragRef.current ? "grabbing" : "grab",
        }}
        onMouseMove={handleMove}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        onMouseLeave={() => {
          setHover(null);
          dragRef.current = null;
        }}
        onWheel={handleWheel}
      />

      {/* Zoom controls */}
      <div className="absolute top-3 left-3 flex flex-col gap-1">
        <button
          type="button"
          className="h-7 w-7 rounded-md border border-border bg-background/90 text-sm font-bold shadow-sm hover:bg-muted"
          onClick={() => setZoom((z) => Math.min(8, z * 1.3))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="h-7 w-7 rounded-md border border-border bg-background/90 text-sm font-bold shadow-sm hover:bg-muted"
          onClick={() => setZoom((z) => Math.max(0.6, z / 1.3))}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="h-7 w-7 rounded-md border border-border bg-background/90 text-xs shadow-sm hover:bg-muted"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Reset view"
        >
          ⤢
        </button>
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-border bg-background/95 px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(hover.x + 12, size.width - 160),
            top: Math.max(hover.y - 12, 4),
          }}
        >
          <div className="font-semibold">{hover.region.name}</div>
          <div className="text-muted-foreground">
            {hover.region.transactions.toLocaleString("fr-FR")} tx ·{" "}
            {hover.region.successRate.toFixed(1)}%
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-muted-foreground">
        Offline projection · no external tiles
      </div>
    </div>
  );
}
