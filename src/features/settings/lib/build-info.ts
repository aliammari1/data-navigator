/**
 * Bundled build / version info for the About panel.
 *
 * The previous About tab hard-coded version strings ("DuckDB WASM 1.33.1",
 * "Framer Motion 11", "v2.0.0") inline in the screen — they silently drift and
 * lie offline. There is no network to query and (in this feature's scope) no
 * build script to generate a JSON, so this module is the single bundled source
 * of truth: the values are sourced from `package.json` at author time and the
 * commit is the one the build was cut from. When a build step is added later it
 * can overwrite `BUILD_INFO` (or generate `src/generated/build-info.json` and
 * re-export it here) without touching any consumer.
 *
 * Zero runtime network — pure constant + cheap derivations.
 */

export interface BuildInfo {
  /** App version from package.json. */
  version: string;
  /** Short git commit the build was produced from. */
  commit: string;
  /** Query engine (native DuckDB on Electron, WASM on web). */
  duckdb: string;
  /** Charting engine. */
  echarts: string;
  /** Animation engine. */
  motion: string;
  /** App framework. */
  next: string;
  /** UI runtime. */
  react: string;
  /** Local AI / embeddings runtime. */
  transformers: string;
  /** Map engine. */
  maplibre: string;
  /** Auth layer. */
  betterAuth: string;
  license: string;
}

/**
 * Mirrors the relevant `package.json` ranges (stripped of the `^`/`~` range
 * prefix) plus the build commit. Keep in sync with `package.json` when bumping
 * a headline dependency; everything else reads from here.
 */
export const BUILD_INFO: BuildInfo = {
  version: "0.1.1",
  commit: "250657a",
  duckdb: "@duckdb/node-api 1.5.4-r.1",
  echarts: "6.1.0",
  motion: "12.42.2",
  next: "16.2.10",
  react: "19.2.7",
  transformers: "@huggingface/transformers 4.2.0",
  maplibre: "maplibre-gl 5.24.0",
  betterAuth: "1.6.23",
  license: "MIT",
};

/** The runtime/platform label shown in the header (native vs web build). */
export function runtimeLabel(): string {
  // Electron exposes `process.versions.electron` to the renderer preload bridge;
  // fall back to a generic web label offline. We probe defensively so this is
  // safe in SSR and the browser build alike.
  const electron = typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent ?? "");
  return electron ? "Electron desktop (native DuckDB)" : "Web (DuckDB WASM)";
}
