"use client";

import { useEffect, useState } from "react";
import { isElectron } from "@/platform/electron/electron-fs";

export interface EngineInfo {
  /** Short label suitable for the sidebar subtitle. */
  label: string;
  /** Stable engine key for conditional UI. */
  engine: "native" | "wasm";
}

const WASM_INFO: EngineInfo = { label: "DuckDB WASM", engine: "wasm" };
const NATIVE_INFO: EngineInfo = { label: "DuckDB native", engine: "native" };

function resolveEngineInfo(): EngineInfo {
  return isElectron() ? NATIVE_INFO : WASM_INFO;
}

/**
 * Reports the DuckDB engine actually resolved at runtime so the shell never
 * mislabels the native `@duckdb/node-api` main-process engine (Electron) as the
 * browser WASM path.
 *
 * Detection depends on the Electron preload bridges (`window.electronDuckDB`),
 * which are only present after hydration, so we resolve to the WASM default on
 * the server / first paint and refine on mount to avoid a hydration mismatch.
 */
export function useEngineInfo(): EngineInfo {
  const [info, setInfo] = useState<EngineInfo>(WASM_INFO);

  useEffect(() => {
    setInfo(resolveEngineInfo());
  }, []);

  return info;
}
