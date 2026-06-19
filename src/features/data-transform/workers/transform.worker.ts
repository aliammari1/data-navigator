/**
 * Transform worker — offline SQL parse/validate off the main thread (Comlink).
 *
 * The plan (§2.5) moves node-sql-parser AST validation into a Web Worker so the
 * ~150 KB single-dialect parser and its parse work never block the renderer.
 * Mirrors the repo worker idiom (`new Worker(new URL(...))` + Comlink.expose),
 * see src/features/csv-parser/workers/csv.worker.ts.
 *
 * Network-free, DuckDB-free: heavy SQL execution stays in Electron main; this
 * worker only does pure-JS AST validation.
 */

import * as Comlink from "comlink";
import { type SqlValidation, validateFragment, validateSql } from "../engine/validate";

const api = {
  validateSql(sql: string): SqlValidation {
    return validateSql(sql);
  },
  validateFragment(fragment: string, kind: "where" | "projection" | "groupby"): SqlValidation {
    return validateFragment(fragment, kind);
  },
};

export type TransformWorkerApi = typeof api;

Comlink.expose(api);
