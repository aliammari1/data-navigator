# Implementation Brief — Cluster: Offline geospatial stack

> **App shape:** Electron + Next.js 16, fully offline (no runtime network/CDN), medium-end target (4-core, 8GB, **no WebGPU** — WebGL2 only). Next.js runs via `startServer` on `http://localhost:<port>` (see `electron/main.ts:503`), so **`public/` assets are served same-origin over localhost** and relative URLs resolve with zero network. There is **no** `app://` custom protocol in this app.
>
> **Verified on 2026-06-12** against the npm registry + official docs. **Nothing in this cluster is installed yet** (`grep` of `package.json` for maplibre/deck/pmtiles/geoarrow/supercluster/h3 → none). Downstream agents implement directly from this file without re-researching.
>
> **Two hard pre-reads that gate correctness:**
> 1. **`@geoarrow/deck.gl-layers` IS DEPRECATED AND RENAMED.** The plan docs name `@geoarrow/deck.gl-layers` (v0.4) — that npm name is `deprecated` (last real publish 0.3.2). The current package is **`@geoarrow/deck.gl-geoarrow@0.4.1`**. Install the renamed one. (Both repos: `geoarrow/deck.gl-layers` redirects to `geoarrow/deck.gl-geoarrow`.)
> 2. **DuckDB here is NATIVE (`@duckdb/node-api`) in the Electron main process, NOT duckdb-wasm.** `runReadOnlyQuery` (`src/platform/duckdb/duckdb.ts`) returns plain `Record<string,unknown>[]` via `getRowObjectsJS()`. There is **no Arrow output by default**. The GeoArrow zero-copy path depends on the **Arrow IPC bridge defined in the sibling brief `docs/planning/v2/impl-briefs/duckdb-arrow.md`** (build Arrow in main with `apache-arrow.tableToIPC`, ship transferable `ArrayBuffer`, decode renderer-side). Do **not** invent a new Arrow path; reuse that one.

---

## Versions to install (pin these)

| Package | Install name | Version (2026-06-12) | License | Notes |
|---|---|---|---|---|
| maplibre-gl | `maplibre-gl` | `5.24.0` | BSD-3 | WebGL2 renderer. v5 satisfies deck.gl interleaved (`maplibre-gl@>3`). |
| pmtiles | `pmtiles` | `4.4.1` | BSD-3 | `Protocol` class; `addProtocol`. |
| @protomaps/basemaps | `@protomaps/basemaps` | `5.7.2` | BSD-3 / CC0 styles | `layers()` + `namedFlavor()`. |
| deck.gl (scoped) | `@deck.gl/core` `@deck.gl/layers` `@deck.gl/geo-layers` `@deck.gl/mapbox` `@deck.gl/aggregation-layers` | `9.3.4` | MIT | **Scoped, not umbrella `deck.gl`** (bundle). `@deck.gl/mapbox` peers `@luma.gl/core@~9.3.3`. |
| @geoarrow/deck.gl-geoarrow | `@geoarrow/deck.gl-geoarrow` | `0.4.1` | MIT | **Renamed** from `@geoarrow/deck.gl-layers`. Peers `@deck.gl/*@^9.0.0`, `apache-arrow@>=15`, `@math.gl/polygon@^4.1.0`. Deps `@geoarrow/geoarrow-js`, `threads` (spawns its own workers — COEP note below). |
| supercluster | `supercluster` | `8.0.1` | ISC | Run in a worker. Stable/quiet (fine). |
| h3-js | `h3-js` | `4.4.0` | Apache-2.0 | Pure JS (emscripten-transpiled, **no separate .wasm to vendor**). |

Already present (reuse, do not re-add): `apache-arrow@^21`, `comlink@^4.4.2`, `@uwdata/flechette@2.5.0`, `@tanstack/react-virtual`.

Optional: `react-map-gl@^8` (maplibre entrypoint) — only if you want a declarative `<Map>`/`useControl`. The snippets below use **react-map-gl/maplibre** because the existing `OfflineMap.tsx` is already a client component and `useControl` is the cleanest deck.gl mount. If you prefer zero extra deps, the same calls work imperatively in a `useEffect` with a raw `maplibregl.Map` + `map.addControl(overlay)`.

Install command:
```bash
npm i maplibre-gl@5.24.0 pmtiles@4.4.1 @protomaps/basemaps@5.7.2 \
  @deck.gl/core@9.3.4 @deck.gl/layers@9.3.4 @deck.gl/geo-layers@9.3.4 \
  @deck.gl/mapbox@9.3.4 @deck.gl/aggregation-layers@9.3.4 \
  @geoarrow/deck.gl-geoarrow@0.4.1 supercluster@8.0.1 h3-js@4.4.0
# optional: npm i react-map-gl@8
```

---

## Global offline gotcha (read once, applies to the whole cluster)

The renderer is **cross-origin isolated**: `electron/security.ts` sets `COOP: same-origin` + **`COEP: require-corp`** + `CORP: same-origin` unconditionally (`onHeadersReceived`, `main.ts:526`). Consequences:
- **Every** subresource MapLibre fetches (tiles via pmtiles range reads, glyphs `.pbf`, sprite `.png`/`.json`) and **every** worker script (`supercluster`, `@geoarrow/.../threads`) must be **same-origin** (they are — all from `localhost` `public/`). No CORS dance needed, but **do not** point any URL at `protomaps.github.io` or any CDN — COEP would block it AND it violates offline.
- SharedArrayBuffer is available (good for `threads`/wasm), so nothing to enable.
- The map itself does **not** require COI; it works regardless. This is purely an asset-origin constraint.

**The #1 silent offline failure:** if you only self-host tiles but leave `glyphs`/`sprite` pointing at `https://protomaps.github.io/...`, the map renders **with no text labels and no icons** and (under COEP) the requests are blocked. You MUST self-host glyphs + sprites. Verify with DevTools "Offline" + assert zero non-`localhost` requests.

**Self-hosted asset layout (all under `public/`, served at `/maps/...`):**
```
public/maps/basemap.pmtiles                         # region extract (go-pmtiles/tippecanoe, build-time)
public/maps/fonts/<FontStack>/<range>.pbf           # from protomaps/basemaps-assets — stacks: "Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"
public/maps/sprites/light.json                      # from basemaps-assets sprites (spreet output)
public/maps/sprites/light.png
public/maps/sprites/light@2x.json
public/maps/sprites/light@2x.png
```
Get fonts/sprites from `github.com/protomaps/basemaps-assets` (font stacks under `fonts/`, sprites under `sprites/v3` or `sprites/v4` depending on assets version — copy the actual files, **drop the `/v4` path segment** when you self-host or keep it, just make the style `sprite` URL match the on-disk path). Build the `.pmtiles` extract at build time only (never runtime): `pmtiles extract planet.pmtiles public/maps/basemap.pmtiles --bbox=7.5,30.2,11.6,37.6` (Tunisia) or `tippecanoe -o ... -zg --drop-densest-as-needed input.geojson`.

---

## 1. pmtiles — protocol singleton

**Install once per app lifecycle.** `protocol.add()` is **NOT** needed when the source URL uses the `pmtiles://` prefix (MapLibre derives min/maxzoom automatically).

`src/features/geo-analysis/lib/pmtiles-protocol.ts`:
```ts
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let installed = false;

/** Idempotent. Call once before the first <Map> mounts. */
export function ensurePmtilesProtocol(): void {
  if (installed) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  installed = true;
}
```
Source URL form (in the style): `"url": "pmtiles:///maps/basemap.pmtiles"` — the leading `/` resolves to `http://localhost:<port>/maps/basemap.pmtiles`, a same-origin range-read target. (Three slashes: `pmtiles://` + `/maps/...`.)

---

## 2. @protomaps/basemaps — local style builder

`layers(sourceName, flavor, options)`: `sourceName: string`, `flavor` from `namedFlavor("light"|"dark"|"white"|"black"|"grayscale")`, `options: { lang?: string; labelsOnly?: boolean }`. The source name MUST match the key in `style.sources`.

`src/features/geo-analysis/lib/local-style.ts`:
```ts
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export function buildLocalStyle(theme: "light" | "dark" = "light"): StyleSpecification {
  return {
    version: 8,
    // SELF-HOSTED — relative, same-origin. NEVER protomaps.github.io.
    glyphs: "/maps/fonts/{fontstack}/{range}.pbf",
    sprite: `/maps/sprites/${theme}`,            // resolves to /maps/sprites/light.json + .png
    sources: {
      protomaps: {
        type: "vector",
        url: "pmtiles:///maps/basemap.pmtiles",
      },
    },
    layers: layers("protomaps", namedFlavor(theme), { lang: "en" }),
  };
}
```

---

## 3. maplibre-gl + deck.gl interleaved overlay (the map component)

`@deck.gl/mapbox`'s `MapboxOverlay` is an `IControl` — works identically on MapLibre. **`interleaved: true`** renders deck layers into MapLibre's own WebGL2 context (correct depth ordering, use `beforeId` to place under labels). Requires `maplibre-gl@>3` (we ship v5 ✓).

`src/features/geo-analysis/components/GeoMap.tsx`:
```tsx
"use client";
import { useMemo } from "react";
import Map, { useControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { StyleSpecification } from "maplibre-gl";
import { ensurePmtilesProtocol } from "../lib/pmtiles-protocol";
import { buildLocalStyle } from "../lib/local-style";

ensurePmtilesProtocol(); // module-scope, runs once

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props); // push new layers each render
  return null;
}

export interface RegionPoint { name: string; lon: number; lat: number; transactions: number; successRate: number; }

export function GeoMap({ regions, onSelect }: { regions: RegionPoint[]; onSelect: (r: RegionPoint) => void }) {
  const style = useMemo(() => buildLocalStyle("light") as StyleSpecification, []);
  const layers = useMemo(() => [
    new ScatterplotLayer<RegionPoint>({
      id: "regions",
      data: regions,
      pickable: true,
      radiusUnits: "pixels",
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => Math.max(4, Math.sqrt(d.transactions) / 6),
      getFillColor: (d) => successColorRGBA(d.successRate),
      onClick: ({ object }) => object && onSelect(object as RegionPoint),
      parameters: { depthTest: false },        // perf on integrated GPU
      updateTriggers: { getFillColor: [regions], getRadius: [regions] },
      beforeId: undefined,                      // set to a label layer id to interleave under labels
    }),
  ], [regions, onSelect]);

  return (
    <Map
      initialViewState={{ longitude: 9.5375, latitude: 33.8869, zoom: 6.2 }}
      mapStyle={style}
      style={{ height: 500, width: "100%" }}
    >
      <DeckOverlay interleaved layers={layers} />
    </Map>
  );
}

function successColorRGBA(rate: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, (rate - 70) / 30));
  return [Math.round(255 * (1 - t)), Math.round(180 * t), 60, 200];
}
```
**Raw (no react-map-gl) equivalent** if you skip the wrapper: `const map = new maplibregl.Map({ container, style: buildLocalStyle() }); await map.once("load"); const overlay = new MapboxOverlay({ interleaved: true, layers }); map.addControl(overlay);` and `overlay.setProps({ layers })` on data change.

**Wire-in:** replace the existing canvas `src/features/geo-analysis/components/OfflineMap.tsx` usage in `src/features/geo-analysis/screens/GeoAnalysisScreen.tsx` with `<GeoMap>`. Keep `OfflineMap.tsx` as the no-asset fallback when `public/maps/basemap.pmtiles` is absent (feature-detect via a HEAD/`fetch` of the pmtiles, or a build flag).

---

## 4. supercluster — in a Comlink worker

Run in a worker (CPU work janks the 4-core main thread). Mirror the existing pattern in `src/features/parsed-data/worker/useProfileWorker.ts` (`new Worker(new URL(...), {type:"module"})` + `Comlink.wrap`). `getClusters(bbox, zoom)` bbox order is **`[westLng, southLat, eastLng, northLat]`**, zoom is an integer.

`src/features/geo-analysis/workers/cluster.worker.ts`:
```ts
import * as Comlink from "comlink";
import Supercluster from "supercluster";
import type { Feature, Point } from "geojson";

let index: Supercluster | null = null;

const api = {
  load(points: Feature<Point>[]) {
    index = new Supercluster({ radius: 60, maxZoom: 16, minPoints: 2 }).load(points);
  },
  getClusters(bbox: [number, number, number, number], zoom: number) {
    return index ? index.getClusters(bbox, Math.round(zoom)) : [];
  },
  expansionZoom(clusterId: number) {
    return index ? index.getClusterExpansionZoom(clusterId) : 0;
  },
};
export type ClusterApi = typeof api;
Comlink.expose(api);
```
Client (place in `src/features/geo-analysis/workers/useClusterWorker.ts`): wrap, call `load(features)` once, then on MapLibre `moveend` (debounced) call `getClusters(map.getBounds().toArray().flat() as [number,number,number,number], map.getZoom())` and feed the small returned set into a deck `ScatterplotLayer`/`TextLayer`. Properties from `index` options `map`/`reduce` can aggregate metrics per cluster.

---

## 5. h3-js — analytical hexbin density (pure JS, no wasm asset)

Named imports; pure JS (nothing to vendor). **Coordinate order trap:** `latLngToCell(lat, lng, res)` takes **lat first**; `cellToBoundary(h3, false)` returns **`[lat, lng]`** pairs, `cellToBoundary(h3, true)` returns **`[lng, lat]`** (GeoJSON order). deck.gl `H3HexagonLayer` takes the **h3 index string directly** via `getHexagon` (do the boundary conversion internally — do NOT pre-convert).

Prefer binning in **DuckDB SQL** (off main thread), use h3-js only for cell→boundary on the few visible cells if you ever render polygons yourself:
```ts
import { latLngToCell, cellToBoundary, cellToLatLng, gridDisk } from "h3-js";
const cell = latLngToCell(33.8869, 9.5375, 6);   // (lat, lng, res) -> H3Index string
const ring = gridDisk(cell, 1);                  // neighbors
// deck.gl density layer — pass the h3 index, not geometry:
import { H3HexagonLayer } from "@deck.gl/geo-layers";
new H3HexagonLayer({ id: "density", data: hexRows /* {h3, n}[] */,
  getHexagon: (d) => d.h3, getFillColor: (d) => rampColor(d.n),
  extruded: false, pickable: true, radiusUnits: "pixels" });
```
SQL side (DuckDB `h3` ext is **not** guaranteed offline — see pitfall): compute cells in SQL if the ext is bundled, else compute `latLngToCell` in the worker over rows. Group-by gives ~thousands of cells → cheap layer.

---

## 6. @geoarrow/deck.gl-geoarrow — zero-copy Arrow → GPU (P3, 1M+ points)

**Only for large raw-point datasets.** Depends on the **Arrow IPC bridge from `docs/planning/v2/impl-briefs/duckdb-arrow.md`**: DuckDB main process builds Arrow with `apache-arrow.tableToIPC(table,'stream')`, ships the transferable `ArrayBuffer`; renderer decodes with `apache-arrow.tableFromIPC` (use `apache-arrow` here, **not** flechette, because the layer needs real `apache-arrow` `Table`/`RecordBatch`/`Data` objects).

API: `data` is an Arrow **`RecordBatch`** (use `table.batches[0]`, or iterate batches into multiple layers); accessors take Arrow `Data` columns directly via `recordBatch.getChild("col")!`. Geometry column must be **GeoArrow point encoding** (FixedSizeList<2> of x,y), conventionally named `"geometry"`.

```ts
import * as arrow from "apache-arrow";
import { GeoArrowScatterplotLayer } from "@geoarrow/deck.gl-geoarrow";

const table = arrow.tableFromIPC(arrowBufFromDuckDB); // ArrayBuffer over IPC, uncompressed
const batch = table.batches[0];
new GeoArrowScatterplotLayer({
  id: "pts",
  data: batch,
  getPosition: batch.getChild("geometry")!,   // GeoArrow point column
  getRadius: 2,
  radiusUnits: "pixels",
  getFillColor: batch.getChild("colors") ?? [255, 120, 0, 180],
});
```
**Hard requirements:** (a) Arrow IPC **must be uncompressed** — Arrow JS cannot read internally-compressed IPC. When building in main, do **not** enable IPC compression. (b) The point column must exist as a real GeoArrow geometry column; in DuckDB produce two `DOUBLE` columns (lon,lat) and assemble a `FixedSizeList[2]` `Float64`/`Float32` vector with `apache-arrow` in main, or emit a `FixedSizeList` directly. (c) `threads` dep spawns workers — fine under COEP (same-origin), no action needed. Keep a plain-`ScatterplotLayer`-with-binary-attributes fallback (`getPosition: {value: Float32Array, size: 2}`) so a pre-1.0 dep can never block the route.

---

## Where each piece is wired (file map)

| Concern | Path | New/edit |
|---|---|---|
| pmtiles protocol singleton | `src/features/geo-analysis/lib/pmtiles-protocol.ts` | new |
| local style builder | `src/features/geo-analysis/lib/local-style.ts` | new |
| MapLibre+deck map | `src/features/geo-analysis/components/GeoMap.tsx` | new (replaces `OfflineMap.tsx` as primary; keep latter as fallback) |
| screen wiring | `src/features/geo-analysis/screens/GeoAnalysisScreen.tsx` | edit (swap OfflineMap→GeoMap) |
| supercluster worker | `src/features/geo-analysis/workers/cluster.worker.ts` | new |
| cluster worker client | `src/features/geo-analysis/workers/useClusterWorker.ts` | new |
| h3 hexbin SQL/derive | `src/features/geo-analysis/lib/geo-sql.ts` (+ worker) | edit |
| DuckDB rollup hook | `src/features/geo-analysis/hooks/use-geo-data.ts` | edit (already DuckDB-wired; add Arrow path for P3 only) |
| Arrow IPC bridge (P3) | Electron main `electron/duckdb-service.ts` + `src/platform/duckdb/duckdb.ts` | per `impl-briefs/duckdb-arrow.md` |
| self-hosted assets | `public/maps/{basemap.pmtiles,fonts/**,sprites/**}` | new (build-time) |
| COOP/COEP (already set) | `electron/security.ts` | none — already correct |

Worker note: workers in `new Worker(new URL("./x.worker.ts", import.meta.url), {type:"module"})` form are bundled by Next/Turbopack; this app also keeps prebuilt workers in `public/workers/` for some paths — follow the `useProfileWorker.ts` import-URL pattern (it bundles correctly) rather than hand-copying to `public/`.

---

## Pitfalls checklist (do not skip)

1. **`@geoarrow/deck.gl-layers` is the WRONG (deprecated) name** → install `@geoarrow/deck.gl-geoarrow@0.4.1`.
2. **Glyphs/sprites must be self-hosted** or the map loses all labels/icons AND COEP blocks the CDN. Point `glyphs`/`sprite` at `/maps/...`, never `protomaps.github.io`.
3. **No CDN anywhere.** The official deck.gl/protomaps examples use `basemaps.cartocdn.com` / `example.com` style URLs and `protomaps.github.io` glyphs — replace ALL with local `/maps/...`.
4. **`addProtocol("pmtiles", ...)` exactly once** (module scope or root `useEffect`), never per-map; `protocol.add()` is unnecessary with `pmtiles://` source URLs.
5. **Import scoped `@deck.gl/*` packages**, not the umbrella `deck.gl`, or you pull the whole monorepo (~400kB+ vs ~250kB).
6. **deck.gl is WebGL2-first; do NOT touch WebGPU.** It's not production-ready in v9.3 and the target has no WebGPU. The shipping path is WebGL2 (universal in Electron Chromium).
7. **h3 coordinate order:** `latLngToCell(lat, lng, res)` is lat-first; `cellToBoundary` default is `[lat,lng]`, `formatAsGeoJson=true` is `[lng,lat]`. Pass the **index string** to `H3HexagonLayer.getHexagon`, not coordinates.
8. **supercluster bbox is `[W,S,E,N]`**; `map.getBounds().toArray().flat()` yields exactly that — but verify, MapLibre returns `[[W,S],[E,N]]`.
9. **GeoArrow needs UNCOMPRESSED Arrow IPC** and real `apache-arrow` objects (not flechette); reuse the `duckdb-arrow.md` bridge, don't add the DuckDB `arrow` community extension (network = forbidden).
10. **DuckDB `h3`/`spatial` extensions install over the network by default** (`INSTALL ... FROM community`) → **forbidden offline**. Either bundle the extension binary for offline `LOAD`, or compute H3 cell IDs with `h3-js` in the worker instead of in SQL. Confirm before relying on SQL-side H3.
11. **Lazy-load the whole geo route** (`next/dynamic`, `ssr:false`) so maplibre/deck land in the route chunk, not the shared bundle; gate `@geoarrow/*` behind the P3 large-data flag.
12. **`pickable: true` allocates per-point id buffers** — disable on giant (>500k) layers unless picking is needed; cap `getRadius` small on integrated GPUs.

## Offline verification (definition of done)

DevTools → Network → **Offline**, load the geo route: map paints, **labels and icons render**, points/clusters show, and **zero requests leave `localhost`** (filter Network by anything not `localhost`/`127.0.0.1` → must be empty). Automate with a Playwright run that forces offline and asserts no non-local request fires.
